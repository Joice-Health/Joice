/**
 * LOCAL-ONLY vault prep — run on a workstation BEFORE anything is uploaded or
 * ingested. Ingestion sends content to AWS (Titan embeddings), so PII cleanup
 * happens here first. The scan/redact steps themselves call AWS Comprehend
 * Medical (HIPAA-eligible under the AWS BAA — make sure the BAA is accepted in
 * AWS Artifact before running them on real clinical notes).
 *
 *   bun apps/api/scripts/prep-vault.ts <vault-dir> <output-dir> [--scan-phi | --redact]
 *
 * 1. Collects every .md file, skipping Obsidian internals (.obsidian/, .trash/).
 * 2. Dedupes exact duplicates (sha256) and flags near-duplicates (hash of
 *    whitespace/case-normalized text) for a human to pick between.
 * 3. --scan-phi: DetectPHI on each file, report findings only (files copied as-is).
 *    --redact:   DetectPHI + AUTOMATIC redaction — every detected span becomes a
 *    readable token ([name], [date], [phone], …), applied end-to-start with a
 *    recall-leaning confidence threshold, plus a local regex pass for
 *    emails/phones/SSN shapes. Files that are mostly PHI (case files, not
 *    reference notes) are flagged to exclude rather than swiss-cheese.
 * 4. Writes the (redacted) set to <output-dir> (folder structure preserved —
 *    the S3 key becomes the citation source path) and phi-report.md next to it.
 *
 * The human step doesn't disappear — it changes from "edit PII out by hand" to
 * "spot-check the redactions in the report + skim high-density files". The
 * report contains the ORIGINAL flagged text (that's what review needs), so it
 * must never leave the workstation — don't upload or ingest phi-report.md.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  ComprehendMedicalClient,
  DetectPHICommand,
  type Entity,
} from '@aws-sdk/client-comprehendmedical';

const [vaultDir, outputDir] = process.argv.slice(2);
const redact = process.argv.includes('--redact');
const scanPhi = redact || process.argv.includes('--scan-phi');
if (!vaultDir || !outputDir) {
  console.error(
    'Usage: bun apps/api/scripts/prep-vault.ts <vault-dir> <output-dir> [--scan-phi | --redact]',
  );
  process.exit(1);
}

const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git']);
const SEGMENT_CHARS = 20_000;
/** Recall-leaning: over-redacting costs a little quality; under-redacting leaks. */
const REDACT_MIN_SCORE = 0.35;
/** Entities per 1,000 chars above which a file is probably a case file, not reference notes. */
const HIGH_DENSITY = 8;

/** Comprehend Medical PHI types → readable inline tokens. */
const TOKEN_BY_TYPE: Record<string, string> = {
  NAME: '[name]',
  DATE: '[date]',
  AGE: '[age]',
  PHONE_OR_FAX: '[phone]',
  EMAIL: '[email]',
  ID: '[id]',
  URL: '[url]',
  ADDRESS: '[address]',
  PROFESSION: '[profession]',
};

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...walk(join(dir, entry.name)));
    } else if (entry.name.endsWith('.md')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const normalized = (text: string) => sha256(text.toLowerCase().replace(/\s+/g, ' ').trim());

/** Belt-and-suspenders after Comprehend: formats a model can miss, caught locally. */
function regexRedact(text: string): { text: string; hits: number } {
  let hits = 0;
  const sub = (pattern: RegExp, token: string) => {
    text = text.replace(pattern, () => {
      hits++;
      return token;
    });
  };
  sub(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  sub(/\b\d{3}-\d{2}-\d{4}\b/g, '[id]'); // SSN shape
  sub(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]');
  return { text, hits };
}

/** Replace detected spans with tokens, end → start so offsets stay valid. */
function redactSegment(segment: string, entities: Entity[]): string {
  const spans = entities
    .filter(
      (e) =>
        (e.Score ?? 0) >= REDACT_MIN_SCORE &&
        e.BeginOffset !== undefined &&
        e.EndOffset !== undefined,
    )
    .sort((a, b) => b.BeginOffset! - a.BeginOffset!);
  let out = segment;
  for (const e of spans) {
    const token = TOKEN_BY_TYPE[e.Type ?? ''] ?? '[redacted]';
    out = out.slice(0, e.BeginOffset!) + token + out.slice(e.EndOffset!);
  }
  return out;
}

interface VaultFile {
  path: string;
  relPath: string;
  content: string;
}

const files: VaultFile[] = walk(vaultDir).map((path) => ({
  path,
  relPath: relative(vaultDir, path),
  content: readFileSync(path, 'utf8'),
}));
console.log(`Found ${files.length} markdown files in ${vaultDir}`);

// Exact dedupe: keep the first path per content hash.
const byExactHash = new Map<string, VaultFile>();
const exactDuplicates: string[] = [];
for (const file of files) {
  const hash = sha256(file.content);
  if (byExactHash.has(hash)) exactDuplicates.push(`${file.relPath} (duplicate of ${byExactHash.get(hash)!.relPath})`);
  else byExactHash.set(hash, file);
}

// Near-duplicate flags: same text modulo whitespace/case — a human picks.
const byNormalizedHash = new Map<string, VaultFile>();
const nearDuplicates: string[] = [];
for (const file of byExactHash.values()) {
  const hash = normalized(file.content);
  if (byNormalizedHash.has(hash)) nearDuplicates.push(`${file.relPath} ≈ ${byNormalizedHash.get(hash)!.relPath}`);
  else byNormalizedHash.set(hash, file);
}

const kept = [...byExactHash.values()];

// PHI scan / redaction: Comprehend Medical DetectPHI, 20k-char segments.
const phiFindings: string[] = [];
const densityWarnings: string[] = [];
const output = new Map<string, string>(); // relPath → content to write
let totalEntities = 0;
let totalRegexHits = 0;

if (scanPhi) {
  const comprehend = new ComprehendMedicalClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  for (const [index, file] of kept.entries()) {
    const findings: string[] = [];
    const redactedSegments: string[] = [];
    let entityCount = 0;

    for (let offset = 0; offset < file.content.length; offset += SEGMENT_CHARS) {
      const segment = file.content.slice(offset, offset + SEGMENT_CHARS);
      const result = await comprehend.send(new DetectPHICommand({ Text: segment }));
      const entities = (result.Entities ?? []).filter((e) => (e.Score ?? 0) >= REDACT_MIN_SCORE);
      entityCount += entities.length;
      for (const entity of entities) {
        findings.push(
          `  - \`${TOKEN_BY_TYPE[entity.Type ?? ''] ?? '[redacted]'}\` ← "${entity.Text}" (${(entity.Score ?? 0).toFixed(2)})`,
        );
      }
      redactedSegments.push(redact ? redactSegment(segment, entities) : segment);
    }

    let content = redactedSegments.join('');
    if (redact) {
      const swept = regexRedact(content);
      content = swept.text;
      totalRegexHits += swept.hits;
    }
    output.set(file.relPath, content);
    totalEntities += entityCount;

    const density = entityCount / Math.max(1, file.content.length / 1000);
    if (density > HIGH_DENSITY) {
      densityWarnings.push(
        `- **${file.relPath}** — ${entityCount} PHI spans (${density.toFixed(1)}/1k chars). Reads like a patient case file; redaction will gut it. **Consider deleting it from the output instead.**`,
      );
    }
    if (findings.length > 0) phiFindings.push(`### ${file.relPath}\n${findings.join('\n')}`);
    console.log(
      `${entityCount > 0 ? '⚠' : '·'} (${index + 1}/${kept.length}) ${file.relPath}` +
        (entityCount > 0 ? ` — ${entityCount} PHI span${entityCount === 1 ? '' : 's'}${redact ? ' redacted' : ''}` : ''),
    );
  }
} else {
  for (const file of kept) output.set(file.relPath, file.content);
}

mkdirSync(outputDir, { recursive: true });
for (const file of kept) {
  // Folder structure is preserved — the S3 key becomes the citation source path.
  const target = join(outputDir, file.relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output.get(file.relPath) ?? file.content);
}

const report = [
  '# Vault prep report',
  `Files scanned: ${files.length} · kept: ${kept.length} · exact duplicates dropped: ${exactDuplicates.length}` +
    (scanPhi ? ` · PHI spans detected: ${totalEntities}` : '') +
    (redact ? ` · auto-redacted (+${totalRegexHits} regex catches)` : ''),
  '',
  exactDuplicates.length ? `## Exact duplicates (dropped)\n${exactDuplicates.map((d) => `- ${d}`).join('\n')}` : '',
  nearDuplicates.length ? `## Near-duplicates (KEPT — pick one manually)\n${nearDuplicates.map((d) => `- ${d}`).join('\n')}` : '',
  densityWarnings.length
    ? `## 🚨 High PHI density — probably case files, not reference notes\n${densityWarnings.join('\n')}`
    : '',
  scanPhi
    ? phiFindings.length
      ? redact
        ? `## Redactions applied — spot-check these (token ← original)\n${phiFindings.join('\n\n')}`
        : `## ⚠ Possible PHI — review every file below before uploading\n${phiFindings.join('\n\n')}`
      : '## PHI scan: no entities flagged'
    : '## PHI scan: SKIPPED (re-run with --scan-phi or --redact)',
  '',
  redact
    ? '> Redacted copies were written to the output dir. Spot-check the list above for false positives (e.g. a peptide name read as a person), skim any high-density files, and delete case files entirely. THIS REPORT CONTAINS THE ORIGINAL PII — never upload or ingest phi-report.md.'
    : '> Do not upload until flagged files are fixed or removed.',
].filter(Boolean).join('\n\n');

writeFileSync(join(outputDir, 'phi-report.md'), report);
console.log(
  `✅ ${kept.length} files written to ${outputDir}${redact ? ' (auto-redacted)' : ''}; review ${join(outputDir, 'phi-report.md')} before ingesting`,
);
