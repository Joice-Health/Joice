import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createAuditService } from '../admin/audit-service';
import { validateCondition } from '../rules/validate';
import { DEFAULT_PROTOCOL_RULES } from './default-rules';
import { evaluateProtocolRules } from './evaluate';
import { createProtocolRulesService, ProtocolRulesInvalidError } from './protocol-rules-service';
import { protocolRulesSchema } from './schemas';

function stubDb(selects: unknown[][], returning: unknown[][] = []) {
  const log: Array<{ op: string; args: unknown[] }> = [];
  const make = (op: string, args: unknown[]): Record<string, unknown> => {
    log.push({ op, args });
    const resolveTo = op === 'select' ? () => selects.shift() ?? [] : () => returning.shift() ?? [{ id: 'row' }];
    const chain: Record<string, unknown> = {};
    const step = (name: string) => (...a: unknown[]) => {
      log.push({ op: `${op}.${name}`, args: a });
      return chain;
    };
    for (const name of ['from', 'where', 'limit', 'values', 'set', 'returning', 'onConflictDoUpdate']) chain[name] = step(name);
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolveTo()).then(onOk, onErr);
    return chain;
  };
  const db = {
    select: (...a: unknown[]) => make('select', a),
    insert: (t: unknown) => make('insert', [t]),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db: db as unknown as Database, log };
}

const actor = { clerkUserId: 'user_admin', email: 'admin@joice.test' };

describe('the example rule set', () => {
  test('parses and references only registered traits with valid operators', () => {
    const parsed = protocolRulesSchema.parse(DEFAULT_PROTOCOL_RULES);
    for (const rule of parsed) {
      expect(validateCondition(rule.when, { customTypes: {} })).toEqual([]);
    }
  });
});

describe('evaluateProtocolRules', () => {
  test('returns every match ranked by priority, with a why-trace each', () => {
    const matches = evaluateProtocolRules(DEFAULT_PROTOCOL_RULES, {
      goal: 'weight-metabolic',
      peptide_experience: 'some',
      bmi: 31.4,
    });
    expect(matches.map((m) => m.protocolKey)).toEqual(['weight-clinical-priority', 'weight-experienced']);
    expect(matches[0]!.requiresClinician).toBe(true);
    expect(matches[0]!.why).toBeDefined();
  });

  test('no traits, no matches, no error', () => {
    expect(evaluateProtocolRules(DEFAULT_PROTOCOL_RULES, {})).toEqual([]);
  });

  test('a persona without the health trait still matches the marketing rules', () => {
    const matches = evaluateProtocolRules(DEFAULT_PROTOCOL_RULES, {
      goal: 'weight-metabolic',
      peptide_experience: 'none',
    });
    expect(matches.map((m) => m.protocolKey)).toEqual(['weight-newcomer']);
  });
});

describe('protocol rules service', () => {
  test('an empty or invalid row falls back to the example set', async () => {
    const { db } = stubDb([[], [{ value: { rules: 'garbage' } }]]);
    const svc = createProtocolRulesService(db, createAuditService(db), { cacheTtlMs: 0 });
    expect(await svc.get()).toEqual(DEFAULT_PROTOCOL_RULES);
    expect(await svc.get()).toEqual(DEFAULT_PROTOCOL_RULES);
  });

  test('save refuses bad rules, and nothing is written', async () => {
    const { db, log } = stubDb([[]]);
    const svc = createProtocolRulesService(db, createAuditService(db));
    // An unknown trait dies at the schema (traitRefSchema refuses it)...
    const unknownTrait = [
      {
        protocolKey: 'bad-rule',
        label: 'Bad',
        when: { trait: 'not_a_trait', op: 'eq' as const, value: 'x' },
        priority: 1,
        requiresClinician: true as const,
      },
    ];
    await expect(svc.save(unknownTrait, actor)).rejects.toThrow();
    // ...and a type-invalid operator dies at the condition validator.
    const badOp = [
      {
        protocolKey: 'bad-op',
        label: 'Bad op',
        when: { trait: 'goal', op: 'gt' as const, value: 'energy' },
        priority: 1,
        requiresClinician: true as const,
      },
    ];
    await expect(svc.save(badOp, actor)).rejects.toBeInstanceOf(ProtocolRulesInvalidError);
    expect(log.filter((l) => l.op === 'insert')).toEqual([]);
  });

  test('save writes the row and audits protocols.rules_saved with before and after', async () => {
    const { db, log } = stubDb([[]]);
    const svc = createProtocolRulesService(db, createAuditService(db), { cacheTtlMs: 0 });
    const rules = [DEFAULT_PROTOCOL_RULES[3]!];
    const saved = await svc.save(rules, actor);
    expect(saved).toEqual(rules);
    const audit = log
      .filter((l) => l.op === 'insert.values')
      .map((l) => l.args[0] as Record<string, unknown>)
      .find((v) => v.action === 'protocols.rules_saved');
    expect(audit).toMatchObject({
      entityType: 'protocol_rules',
      entityId: 'protocol_rules',
      before: DEFAULT_PROTOCOL_RULES,
      after: rules,
    });
  });
});
