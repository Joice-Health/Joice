/**
 * The brain's ruler: run the golden question set against the real corpus (and
 * optionally the real model) and score retrieval recall, citation honesty,
 * refusal behavior, tool choice, and latency.
 *
 * This is the instrument that turns "did the persona change make answers
 * worse?" and "Nova vs Claude?" into numbers, and it is THE GATE for enabling
 * `toolsEnabled` anywhere real: the tool mode's grounding is behavioral
 * (see prompt.ts TOOL_SAFETY_FLOOR), and the refusal cases below are how the
 * residual risk is measured.
 *
 * Modes (cost-conscious by default):
 *   bun scripts/eval.ts                     retrieval-only: embeds each question
 *                                           (Titan — cents), no generation.
 *   bun scripts/eval.ts --full              full answers via the CLASSIC pipeline.
 *   bun scripts/eval.ts --full --tools      full answers via the TOOL loop.
 *   --limit N     run the first N cases only
 *   --assert      exit 1 if any case fails (for gating scripts)
 *
 * Needs DATABASE_URL + AWS credentials (same as the ingest task). Run locally
 * against fixtures first:
 *   NOTES_DIR=fixtures/sample-notes bun scripts/ingest.ts && bun scripts/eval.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createDatabase } from '@joice/db';
import {
  createBrainConfigService,
  createEmbeddingClient,
  createGenerationClient,
  createRecommendationService,
  noopAuditPort,
  stubPorts,
  type RecommendationStreamEvent,
} from '@joice/brain';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    BEDROCK_REGION: z.string().default('us-east-1'),
    RAG_MODEL: z.string().default('us.amazon.nova-pro-v1:0'),
    POLLY_VOICE_ID: z.string().default('Ruth'),
  })
  .parse(process.env);

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const TOOLS = args.includes('--tools');
const ASSERT = args.includes('--assert');
let LIMIT = Infinity;
if (args.includes('--limit')) {
  LIMIT = Number(args[args.indexOf('--limit') + 1]);
  if (!Number.isInteger(LIMIT) || LIMIT <= 0) {
    // A typo'd --limit must not silently gate on zero cases and exit 0.
    console.error('--limit requires a positive integer, e.g. --limit 5');
    process.exit(2);
  }
}

const goldenCaseSchema = z.object({
  q: z.string().min(1),
  /** Every listed source must appear in the retrieved/cited set. */
  expectSources: z.array(z.string()).optional(),
  /** An off-corpus question: the honest outcome is zero citations. */
  expectRefusal: z.boolean().optional(),
  /** Tools mode: this tool should be among those called. */
  expectTool: z.string().optional(),
  mustCite: z.boolean().optional(),
});
type GoldenCase = z.infer<typeof goldenCaseSchema>;

const cases: GoldenCase[] = readFileSync(join(import.meta.dir, '../fixtures/golden.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => goldenCaseSchema.parse(JSON.parse(line)))
  .slice(0, LIMIT);

const db = createDatabase(env.DATABASE_URL);
const embeddings = createEmbeddingClient({ region: env.BEDROCK_REGION });
const generation = createGenerationClient({ region: env.BEDROCK_REGION });
const brainConfig = createBrainConfigService(db, noopAuditPort, {
  envDefaults: { model: env.RAG_MODEL, pollyVoiceId: env.POLLY_VOICE_ID },
});

// The stored admin config, with the mode under test forced — so an eval run
// measures the pipeline it says it measures, regardless of the current flags.
// showCitations is pinned too: citation honesty is half of what this measures,
// and an admin who turned chips off would otherwise blank every citation
// check (finalize() strips them all when it's false).
const stored = await brainConfig.get();
const config = { ...stored, toolsEnabled: FULL && TOOLS, showCitations: true };
const service = createRecommendationService(db, {
  embeddings,
  generation,
  getConfig: async () => config,
  ports: stubPorts,
});

interface CaseResult {
  q: string;
  pass: boolean;
  detail: string;
  firstTokenMs?: number;
  totalMs?: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

async function runRetrievalCase(c: GoldenCase): Promise<CaseResult> {
  if (!c.expectSources) {
    return { q: c.q, pass: true, detail: 'skipped (no expectSources; needs --full)' };
  }
  const chunks = await service.retrieve(c.q, config);
  const paths = new Set(chunks.map((chunk) => chunk.sourcePath));
  const missing = c.expectSources.filter((s) => !paths.has(s));
  return missing.length === 0
    ? { q: c.q, pass: true, detail: `recall ok (${paths.size} chunks)` }
    : { q: c.q, pass: false, detail: `missing from top-${config.topK}: ${missing.join(', ')}` };
}

async function runFullCase(c: GoldenCase): Promise<CaseResult> {
  const started = performance.now();
  let firstTokenMs: number | undefined;
  const toolsCalled = new Set<string>();
  let complete: Extract<RecommendationStreamEvent, { type: 'complete' }> | undefined;

  for await (const event of service.recommendStream([{ role: 'user', content: c.q }])) {
    if (event.type === 'delta' && firstTokenMs === undefined) {
      firstTokenMs = performance.now() - started;
    } else if (event.type === 'tool' && event.status === 'started') {
      toolsCalled.add(event.name);
    } else if (event.type === 'complete') {
      complete = event;
    }
  }
  const totalMs = performance.now() - started;
  if (!complete) return { q: c.q, pass: false, detail: 'stream ended without complete' };

  const cited = new Set(complete.recommendation.citations.map((cit) => cit.sourcePath));
  const problems: string[] = [];

  if (c.expectRefusal) {
    // Zero citations is necessary but NOT sufficient: in tools mode a model
    // can answer off-corpus questions confidently from parametric knowledge
    // with no [n] markers at all, which is the exact residual risk this
    // harness exists to measure. The answer itself must read as a refusal. Models
    // phrase refusals many ways ("not within my scope of knowledge", "I can't
    // provide advice on"), so the detector errs broad; a false PASS here is
    // worse than a false FAIL, but a detector that flags honest refusals
    // trains people to ignore the eval.
    const answer = complete.recommendation.answer;
    const REFUSAL_SHAPES = [
      /\b(doesn'?t|does not|don'?t|can'?t|cannot|won'?t|unable to)\b.{0,80}\b(cover|answer|help|provide|advis|advice|assist|speak|write|create|share)/i,
      /\b(outside|beyond|not within|not in)\b.{0,40}\b(scope|library|notes|knowledge)\b/i,
      /\bno (information|notes?|research)\b/i,
      /\bnot (something|a topic)\b/i,
      /\bi(?:'|’)?m sorry,? but\b/i,
      /\brecommend (checking|consulting|speaking)\b/i,
    ];
    const soundsLikeRefusal =
      answer.includes(config.notCoveredMessage) ||
      REFUSAL_SHAPES.some((shape) => shape.test(answer));
    if (cited.size > 0) {
      problems.push(`expected refusal but cited: ${[...cited].join(', ')}`);
    } else if (!soundsLikeRefusal) {
      problems.push(`expected refusal but got an uncited answer: "${answer.slice(0, 120)}…"`);
    }
  }
  if (c.mustCite && cited.size === 0) problems.push('expected citations, got none');
  for (const s of c.expectSources ?? []) {
    if (!cited.has(s)) problems.push(`expected citation of ${s}`);
  }
  if (c.expectTool && config.toolsEnabled && !toolsCalled.has(c.expectTool)) {
    problems.push(`expected tool ${c.expectTool}; called: ${[...toolsCalled].join(', ') || 'none'}`);
  }

  return {
    q: c.q,
    pass: problems.length === 0,
    detail:
      problems.join('; ') ||
      `ok (${cited.size} citations${toolsCalled.size ? `, tools: ${[...toolsCalled].join(',')}` : ''})`,
    firstTokenMs,
    totalMs,
  };
}

console.log(
  `Eval: ${cases.length} golden cases · mode=${FULL ? (TOOLS ? 'full+tools' : 'full/classic') : 'retrieval-only'} · model=${config.model}`,
);

const results: CaseResult[] = [];
for (const c of cases) {
  const result = FULL ? await runFullCase(c) : await runRetrievalCase(c);
  results.push(result);
  console.log(`${result.pass ? '✓' : '✗'} ${result.q}\n    ${result.detail}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);

if (FULL) {
  const firsts = results.map((r) => r.firstTokenMs).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  const totals = results.map((r) => r.totalMs).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  console.log(
    `latency first-token p50=${Math.round(percentile(firsts, 50))}ms p95=${Math.round(percentile(firsts, 95))}ms · ` +
      `total p50=${Math.round(percentile(totals, 50))}ms p95=${Math.round(percentile(totals, 95))}ms`,
  );
}

process.exit(ASSERT && failed.length > 0 ? 1 : 0);
