/**
 * The care areas: the one vocabulary for "what someone is here for", shared by
 * the site's explore pages, the companion's capture, the intake's goal
 * question and the profile's `goal` trait. There is deliberately no area
 * without a protocol behind it (no "cognition"), so nothing can route a person
 * toward something Joice cannot deliver. Adding an area is a product decision:
 * update this list and every surface follows.
 */
export const CARE_AREAS = [
  { slug: 'weight-metabolic', label: 'Weight & metabolic' },
  { slug: 'body-comp-recovery', label: 'Body comp / recovery' },
  { slug: 'beauty-skin', label: 'Beauty / skin' },
  { slug: 'energy', label: 'Energy' },
  { slug: 'stress-sleep', label: 'Stress & sleep' },
] as const;

export type CareAreaSlug = (typeof CARE_AREAS)[number]['slug'];

export const CARE_AREA_SLUGS = CARE_AREAS.map((a) => a.slug) as unknown as readonly [
  CareAreaSlug,
  ...CareAreaSlug[],
];

/** `not-sure` is a first-class answer: an undecided visitor is still a lead. */
export const GOAL_UNSURE = 'not-sure' as const;

/** Every acceptable goal value: a real care area, or an honest "not sure". */
export const GOAL_VALUES = [...CARE_AREA_SLUGS, GOAL_UNSURE] as const;
export type GoalValue = (typeof GOAL_VALUES)[number];

/** Plain-prose labels for goals where the ampersand voice does not fit. */
export const GOAL_LABELS: Readonly<Record<GoalValue, string>> = {
  'weight-metabolic': 'Weight and metabolic',
  'body-comp-recovery': 'Body comp and recovery',
  'beauty-skin': 'Beauty and skin',
  energy: 'Energy',
  'stress-sleep': 'Stress and sleep',
  [GOAL_UNSURE]: 'Not sure yet',
};

/** The display label for a care-area slug, or the slug itself (never throws in copy). */
export function careAreaLabel(slug: string): string {
  return CARE_AREAS.find((a) => a.slug === slug)?.label ?? slug;
}
