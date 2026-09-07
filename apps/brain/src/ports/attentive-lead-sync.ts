import { AttentiveRequestError, type AttentiveClient } from '@joice/marketing';
import type { LeadSyncPort } from '@joice/brain';

/**
 * Companion → Attentive, and nothing else. Attributes only, never a
 * subscription: the visitor gave an email to personalize the conversation,
 * not marketing consent. Deliberately no name either: Attentive's name fields
 * are last-writer-wins, and a chat-collected name must never clobber a
 * form-collected one (docs/marketing/01-attentive.md, namespace policy); the
 * name lives on the lead row and in /admin/leads. The waitlist is a separate
 * funnel this port must never touch; Attentive deduping people by email is
 * the only place the two ever meet.
 */
export function createAttentiveLeadSync(client: AttentiveClient): LeadSyncPort {
  return {
    async upsertLead(lead) {
      await client.upsertProfile({
        user: { email: lead.email, ...(lead.phone ? { phone: lead.phone } : {}) },
        // lead_* is the brain's attribute prefix under the namespace policy.
        properties: {
          lead_source: 'companion',
          lead_status: lead.status,
          ...(lead.goal ? { lead_goal: lead.goal } : {}),
        },
      });
    },

    /**
     * Erasure in two steps: unsubscribe from every channel (sends stop now),
     * then a privacy delete request (the person is gone within thirty days).
     * A 404 on either means Attentive never had this person, which must not
     * wedge their own erasure; anything else propagates so the caller's
     * transaction rolls back and the deletion stays retryable.
     */
    async suppressLead(email) {
      await tolerateMissing(() => client.unsubscribe({ email }));
      await tolerateMissing(() => client.requestDeletion({ email }, 'Joice erasure request'));
    },
  };
}

async function tolerateMissing(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof AttentiveRequestError && error.status === 404) return;
    throw error;
  }
}
