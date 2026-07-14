/**
 * LOCAL-ONLY vault prep — run on a workstation BEFORE anything is uploaded.
 * Nothing may leave the laptop until this has run and a human has reviewed the
 * report: the S3 upload itself transmits content, so PHI review happens here.
 *
 *   bun apps/api/scripts/prep-vault.ts <vault-dir> <output-dir> [--scan-phi]
 *
 * 1. Collects every .md file, skipping Obsidian internals (.obsidian/, .trash/).
 * 2. Dedupes exact duplicates (sha256) and flags near-duplicates (hash of
 *    whitespace/case-normalized text) for a human to pick between.
 * 3. With --scan-phi (needs AWS creds; Comprehend Medical is HIPAA-eligible):
 *    runs DetectPHI on each file and reports flagged spans (names, dates, ids).
 * 4. Copies the deduped set to <output-dir> (folder structure preserved — the
 *    S3 key becomes the citation source path) and writes phi-report.md next to
 *    it. Review + fix flagged files, THEN upload:
 *
 *   aws s3 sync <output-dir>/ s3://joice-notes-<account>/ --exclude "*" --include "*.md"
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  ComprehendMedicalClient,
  DetectPHICommand,
} from '@aws-sdk/client-comprehendmedical';

const [vaultDir, outputDir] = process.argv.slice(2);
const scanPhi = process.argv.includes('--scan-phi');
if (!vaultDir || !outputDir) {
  console.error('Usage: bun apps/api/scripts/prep-vault.ts <vault-dir> <output-dir> [--scan-phi]');
  process.exit(1);
}

const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git']);

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

// PHI scan (optional): Comprehend Medical DetectPHI, 20k-char segments.
const phiFindings: string[] = [];
if (scanPhi) {
  const comprehend = new ComprehendMedicalClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  for (const file of kept) {
    const findings: string[] = [];
    for (let offset = 0; offset < file.content.length; offset += 20_000) {
      const segment = file.content.slice(offset, offset + 20_000);
      const result = await comprehend.send(new DetectPHICommand({ Text: segment }));
      for (const entity of result.Entities ?? []) {
        if ((entity.Score ?? 0) < 0.5) continue;
        findings.push(`  - [${entity.Type}] "${entity.Text}" (score ${(entity.Score ?? 0).toFixed(2)})`);
      }
    }
    if (findings.length > 0) phiFindings.push(`### ${file.relPath}\n${findings.join('\n')}`);
    process.stdout.write('.');
  }
  console.log();
}

mkdirSync(outputDir, { recursive: true });
for (const file of kept) {
  // Folder structure is preserved — the S3 key becomes the citation source path.
  const target = join(outputDir, file.relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

const report = [
  '# Vault prep report',
  `Files scanned: ${files.length} · kept: ${kept.length} · exact duplicates dropped: ${exactDuplicates.length}`,
  '',
  exactDuplicates.length ? `## Exact duplicates (dropped)\n${exactDuplicates.map((d) => `- ${d}`).join('\n')}` : '',
  nearDuplicates.length ? `## Near-duplicates (KEPT — pick one manually)\n${nearDuplicates.map((d) => `- ${d}`).join('\n')}` : '',
  scanPhi
    ? phiFindings.length
      ? `## ⚠ Possible PHI — review every file below before uploading\n${phiFindings.join('\n\n')}`
      : '## PHI scan: no entities flagged'
    : '## PHI scan: SKIPPED (re-run with --scan-phi, or review manually)',
  '',
  '> Do not upload until flagged files are fixed or removed.',
].filter(Boolean).join('\n\n');

writeFileSync(join(outputDir, 'phi-report.md'), report);
console.log(`✅ ${kept.length} files written to ${outputDir}; review ${join(outputDir, 'phi-report.md')} before uploading`);
