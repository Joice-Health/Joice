/**
 * Typed funnel events, pushed to the GTM dataLayer (loaded in app/layout.tsx).
 *
 * The union below IS the taxonomy — add events here, so what we measure stays
 * greppable and reviewable in one place.
 *
 * Hard rule: never push message text, answers, emails, or names. GTM ships
 * data to third parties and sits OUTSIDE the compliance boundary that keeps
 * chat content on BAA-covered services (docs/rag/07-compliance.md). Counts,
 * booleans, enum-ish labels only.
 */
export type AnalyticsEvent =
  | { event: 'chat_started' }
  | { event: 'chat_question_asked'; viaVoice: boolean; exchangeIndex: number }
  | { event: 'chat_answer_completed'; hadCitations: boolean }
  | { event: 'capture_started' }
  | { event: 'capture_field_submitted'; field: string }
  | { event: 'capture_skipped'; field: string }
  | {
      event: 'conversion_cta_shown';
      trigger: 'buying_signal' | 'capture_complete' | 'exchange_threshold';
    }
  | { event: 'conversion_cta_clicked' }
  | { event: 'handoff_viewed' }
  // Intake (/get-started). Question keys and outcomes only; never a value, a
  // name, an email or a state code.
  | { event: 'onboarding_started'; carriedOver: boolean }
  | { event: 'onboarding_resumed' }
  | { event: 'onboarding_step_viewed'; questionKey: string }
  | { event: 'onboarding_step_answered'; questionKey: string }
  | { event: 'onboarding_step_skipped'; questionKey: string }
  | { event: 'onboarding_back' }
  | { event: 'onboarding_gate_hit'; outcome: 'stop_age' | 'notify_state' | 'closed_state' }
  | { event: 'onboarding_notify_submitted' }
  | { event: 'onboarding_completed' }
  | { event: 'onboarding_restarted' }
  | { event: 'onboarding_registration_started' }
  | { event: 'onboarding_registration_completed' };

export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  const w = window as { dataLayer?: unknown[] };
  w.dataLayer?.push(event);
}
