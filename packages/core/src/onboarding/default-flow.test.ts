import { describe, expect, test } from 'bun:test';
import { DEFAULT_INTAKE_FLOW } from './default-flow';
import { canonicalJson, logicHash, validateFlowDefinition } from './validate-flow';

/**
 * DEFAULT_INTAKE_FLOW is frozen with migration 0015: the seed carries the same
 * JSON, and this test keeps the two equal. Content changes after launch are
 * admin publishes, not edits here; if the default must change (a new seed for
 * a fresh environment), add a new seed migration rather than editing 0015.
 */
const SEED = new URL('../../../db/drizzle/0015_seed_onboarding_intake_flow.sql', import.meta.url);

describe('the seeded intake flow', () => {
  test('is exactly DEFAULT_INTAKE_FLOW, canonicalised, with its logic hash', async () => {
    const sql = await Bun.file(SEED).text();
    const jsonMatch = /'(\{.*\})'::jsonb/s.exec(sql);
    const hashMatch = /::jsonb,\s*'([0-9a-f]{64})'/s.exec(sql);
    expect(jsonMatch).not.toBeNull();
    expect(hashMatch).not.toBeNull();
    const seeded = JSON.parse(jsonMatch![1]!.replace(/''/g, "'")) as unknown;

    const report = validateFlowDefinition(DEFAULT_INTAKE_FLOW, { phiEnabled: false });
    if (!report.ok) throw new Error(JSON.stringify(report.errors));
    expect(canonicalJson(seeded)).toBe(canonicalJson(report.definition));
    expect(hashMatch![1]).toBe(await logicHash(report.definition));

    // The seed must itself validate on this build.
    expect(validateFlowDefinition(seeded, { phiEnabled: false }).ok).toBe(true);
  });
});
