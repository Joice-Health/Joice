import { describe, expect, test } from 'bun:test';
import { buildMemberSuffix } from './prompt';

describe('buildMemberSuffix', () => {
  test('renders name, goal, segment and the summary lines, capped', () => {
    const suffix = buildMemberSuffix({
      firstName: 'Sam',
      goalLabel: 'Energy',
      segment: 'energy',
      traitsSummary: Array.from({ length: 12 }, (_, i) => `Fact ${i + 1}: yes`),
    })!;
    expect(suffix).toContain('personalisation only');
    expect(suffix).toContain('- Name: Sam');
    expect(suffix).toContain('- Here for: Energy');
    expect(suffix).toContain('- Fact 8: yes');
    expect(suffix).not.toContain('Fact 9');
  });

  test('nothing known means no suffix at all', () => {
    expect(buildMemberSuffix({ firstName: null, goalLabel: null, segment: null, traitsSummary: [] })).toBeUndefined();
  });
});
