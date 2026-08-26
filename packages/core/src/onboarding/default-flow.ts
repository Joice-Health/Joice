import type { FlowDefinitionInput } from './schemas';

/**
 * The v1 intake flow as code. Seeded into `onboarding_flow_versions` as
 * version 1 (published) by migration, so `/get-started` works before the admin
 * editor exists, and asserted against the seed in tests so the two cannot
 * drift. Marketing and personal tiers only; health questions arrive as locked
 * rows once the PHI keys are turned (docs/onboarding/00-plan.md section 3.9).
 *
 * Copy rules: plain, no em dashes, explain why we ask, never promise email.
 */
export const DEFAULT_INTAKE_FLOW = {
  schemaVersion: 1,
  key: 'intake',
  sections: [
    {
      key: 'eligibility',
      title: 'Two quick things first',
      intro:
        'We can only work with licensed clinicians and pharmacies in the states we serve, and Joice is for adults. This takes ten seconds.',
      locked: true,
      questions: ['us_state', 'date_of_birth'],
      gates: [
        {
          key: 'min_age',
          when: { trait: 'age', op: 'lt', value: { setting: 'onboarding.minimumAge' } },
          outcome: 'stop',
          reason: 'age',
          copyKey: 'gate.under_age',
        },
        {
          key: 'state_notify',
          when: { trait: 'state_status', op: 'eq', value: 'notify' },
          outcome: 'notify',
          reason: 'state',
          copyKey: 'gate.state_notify',
        },
        {
          key: 'state_closed',
          when: { trait: 'state_status', op: 'eq', value: 'closed' },
          outcome: 'closed',
          reason: 'state',
          copyKey: 'gate.state_closed',
        },
      ],
    },
    {
      key: 'goal',
      title: 'What brings you here?',
      questions: ['goal', 'goal_note'],
    },
    {
      key: 'weight',
      title: 'Weight and metabolic',
      showIf: { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
      questions: ['weight_tried', 'weight_timeline'],
    },
    {
      key: 'about',
      title: 'About you',
      questions: ['peptide_experience', 'first_name'],
    },
    {
      key: 'consent',
      title: 'Before you create your account',
      locked: true,
      questions: ['consent_terms', 'consent_marketing'],
    },
  ],
  questions: {
    us_state: {
      key: 'us_state',
      trait: 'us_state',
      type: 'us_state',
      required: true,
      locked: true,
      copy: {
        label: 'Which state do you live in?',
        help: 'Clinician licensing and pharmacy shipping are state by state. Your state decides what we can offer you.',
      },
    },
    date_of_birth: {
      key: 'date_of_birth',
      trait: 'date_of_birth',
      type: 'date',
      required: true,
      locked: true,
      copy: {
        label: 'When were you born?',
        help: 'You need to be 18 or older. We keep your date of birth only if you continue.',
      },
      constraints: { minDate: '1900-01-01' },
    },
    goal: {
      key: 'goal',
      trait: 'goal',
      type: 'single_select',
      required: true,
      copy: { label: 'What would you change first?' },
      options: [
        { value: 'weight-metabolic', label: 'Weight and metabolic' },
        { value: 'body-comp-recovery', label: 'Body comp and recovery' },
        { value: 'beauty-skin', label: 'Beauty and skin' },
        { value: 'energy', label: 'Energy' },
        { value: 'stress-sleep', label: 'Stress and sleep' },
        { value: 'not-sure', label: 'Not sure yet' },
      ],
    },
    goal_note: {
      key: 'goal_note',
      trait: 'goal_note',
      type: 'text',
      required: false,
      showIf: { trait: 'goal', op: 'eq', value: 'not-sure' },
      copy: {
        label: 'Tell us in your own words',
        help: 'One line is plenty. A clinician reads this, not a form.',
        placeholder: 'I would like more energy in the afternoons and better sleep',
      },
      constraints: { maxLength: 300 },
    },
    weight_tried: {
      key: 'weight_tried',
      trait: 'weight_approaches_tried',
      type: 'multi_select',
      required: true,
      copy: { label: 'What have you tried so far?', help: 'Pick everything that applies.' },
      options: [
        { value: 'diet', label: 'Diet changes' },
        { value: 'training', label: 'Training' },
        { value: 'coaching', label: 'Coaching or a program' },
        { value: 'medication', label: 'Medication' },
        { value: 'none', label: 'Nothing yet' },
      ],
    },
    weight_timeline: {
      key: 'weight_timeline',
      trait: 'goal_timeline',
      type: 'single_select',
      required: true,
      copy: { label: 'What timeline feels right?' },
      options: [
        { value: '3mo', label: 'The next three months' },
        { value: '6mo', label: 'About six months' },
        { value: '12mo', label: 'A year' },
        { value: 'no_rush', label: 'No rush, done properly' },
      ],
    },
    peptide_experience: {
      key: 'peptide_experience',
      trait: 'peptide_experience',
      type: 'single_select',
      required: true,
      copy: { label: 'Peptides so far?' },
      options: [
        { value: 'none', label: 'New to them' },
        { value: 'some', label: 'Tried some' },
        { value: 'regular', label: 'Use them regularly' },
      ],
    },
    first_name: {
      key: 'first_name',
      trait: 'first_name',
      type: 'text',
      required: true,
      copy: { label: 'What should we call you?', placeholder: 'First name' },
      constraints: { maxLength: 80 },
    },
    consent_terms: {
      key: 'consent_terms',
      trait: 'consent_terms',
      type: 'boolean',
      required: true,
      locked: true,
      copy: {
        label: 'I agree to the Terms and the Privacy Policy',
        help: 'Your answers are stored so a clinician can review them with you. Nothing here is shared for marketing.',
      },
    },
    consent_marketing: {
      key: 'consent_marketing',
      trait: 'consent_marketing',
      type: 'boolean',
      required: false,
      locked: true,
      copy: { label: 'Email me about Joice', help: 'Occasional, and easy to stop.' },
    },
  },
  segmentRules: [
    {
      segment: 'weight-newcomer',
      priority: 20,
      when: {
        all: [
          { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
          { trait: 'peptide_experience', op: 'eq', value: 'none' },
        ],
      },
    },
    {
      segment: 'weight-experienced',
      priority: 20,
      when: {
        all: [
          { trait: 'goal', op: 'eq', value: 'weight-metabolic' },
          { trait: 'peptide_experience', op: 'in', value: ['some', 'regular'] },
        ],
      },
    },
    { segment: 'recovery', priority: 10, when: { trait: 'goal', op: 'eq', value: 'body-comp-recovery' } },
    { segment: 'skin', priority: 10, when: { trait: 'goal', op: 'eq', value: 'beauty-skin' } },
    { segment: 'energy', priority: 10, when: { trait: 'goal', op: 'eq', value: 'energy' } },
    { segment: 'sleep-first', priority: 10, when: { trait: 'goal', op: 'eq', value: 'stress-sleep' } },
    { segment: 'explorer', priority: 0, when: { trait: 'goal', op: 'eq', value: 'not-sure' } },
  ],
  copy: {
    'intro.title': 'Tell us where you are.',
    'intro.body':
      'A few questions, then a licensed clinician takes it from there. You can stop at any point and pick up where you left off.',
    'intro.carried.title': 'Hi {first_name}. Two quick things first.',
    'intro.carried.body':
      'We carried over what you told the companion. Change anything that is not right.',
    'resume.note': 'Picking up where you left off.',
    'gate.under_age.title': 'Joice is for adults 18 and over.',
    'gate.under_age.body':
      'Thanks for your interest. We have not kept anything you entered.',
    'gate.state_notify.title': 'We are not in {state_name} yet.',
    'gate.state_notify.body':
      'Clinician licensing and pharmacy coverage open state by state. Leave your email and we will let you know the day {state_name} opens. In the meantime the research and the companion are yours.',
    'gate.state_notify.cta': 'Tell me when {state_name} opens +',
    'gate.state_notify.done': 'Noted. We will let you know the day {state_name} opens.',
    'gate.state_closed.title': 'We cannot serve {state_name} right now.',
    'gate.state_closed.body':
      'That is about licensing, not about you. The research and the companion are still yours to use.',
  },
  completion: {
    title: 'That is everything we need for now.',
    body: 'Create your account to save your answers. A licensed clinician reviews them, then we prepare your starting point and walk you through it.',
    cta: 'Create your account +',
  },
} as const satisfies FlowDefinitionInput;
