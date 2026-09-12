/**
 * Ports — what the brain needs from the rest of the platform, expressed as
 * interfaces it owns.
 *
 * This is the discipline that keeps the brain a service rather than a
 * distributed monolith. It must never import another domain's tables: it
 * declares the shape of what it needs, and an adapter is injected at the edge.
 * Member context and observations are HTTP adapters to the api, the catalogue
 * is an HTTP adapter over the CarePortals public API, and the cart is still a
 * stub until on-site ordering is a product decision. Adapters live in
 * apps/brain/src/ports and are injected in services.ts; nothing in the domain
 * changes when one goes live — that is the point of the seam.
 *
 * Deliberately narrow. A port should describe the *question the brain asks*
 * ("what has this member been prescribed?"), not hand back a table row, or the
 * boundary erodes into shared database access wearing an interface.
 */

/** Someone asking a question. Anonymous until member accounts ship. */
export interface Requester {
  /** Set once the member is signed in. */
  memberId: string | null;
  /**
   * Stable per browser session, so an anonymous conversation hangs together and
   * can be attached to a member the day they sign up.
   */
  sessionId: string;
}

/** What the brain knows about a member when answering them. */
export interface MemberContext {
  /** Preferred name, for addressing them naturally. */
  firstName: string | null;
  /** The care area they said they are here for, as a readable label. */
  goalLabel: string | null;
  /** The derived segment (e.g. weight-newcomer), for tone, never for advice. */
  segment: string | null;
  /**
   * Marketing/personal-tier intake facts as short readable lines ("Timeline:
   * About six months"). The api decides what may cross; health-tier facts
   * never do until the PHI keys are on.
   */
  traitsSummary: string[];
  /** Products they've actually ordered — grounds "how do I take mine?". */
  orders: MemberOrder[];
  /** Protocols a clinician has assigned them. */
  protocols: MemberProtocol[];
  /**
   * Active subscription, per the platform (CarePortals through the api's
   * SubscriptionPort). Lifts a user to the subscriber tier; false whenever
   * the platform cannot say, so a lookup failure can only lower access.
   */
  subscribed: boolean;
}

export interface MemberOrder {
  id: string;
  productName: string;
  orderedAt: Date;
  status: string;
}

export interface MemberProtocol {
  id: string;
  name: string;
  /** Free text as written by the clinician. */
  instructions: string;
  startedAt: Date;
}

/** Identity, orders and protocols. Owned by the platform, read by the brain. */
export interface MemberContextPort {
  forMember(memberId: string): Promise<MemberContext>;
}

/**
 * The brain observed something about a member (a goal set in chat, an
 * enum-only interest signal). Written to the platform's profile through the
 * api; fire-and-forget on the brain side, never on the answer path's critical
 * line. Nothing free-text crosses: values are vocabulary tokens.
 */
export interface ObservationSinkPort {
  record(input: {
    memberId: string;
    observations: Array<{ trait: string; value: unknown; confidence?: number }>;
  }): Promise<void>;
}

/**
 * A product the brain can talk about and card: the curated identity (slug,
 * name, approved copy) merged with live commerce facts. Price is optional on
 * purpose: a curated entry whose live row is dark has no trustworthy price
 * and is never carded, only mentioned as unavailable. Prices are DOLLARS.
 */
export interface CatalogItem {
  /** The CarePortals `_id` of the sellable variant. */
  id: string;
  name: string;
  /** The /shop/[slug] key; also how chat cards join back to the curation. */
  slug: string;
  /** The curated dose line or the live subLabel. */
  subLabel?: string;
  /** One approved line on what it is; the model may speak it verbatim. */
  description?: string;
  /** Primary care area slug (the @joice/utils vocabulary). */
  careArea?: string;
  price?: number;
  currency?: string;
  isSubscription?: boolean;
  available: boolean;
}

export interface CatalogPort {
  /** Local match over the curated shelf; the literal query 'all' browses it. */
  search(query: string, limit: number): Promise<CatalogItem[]>;
}

/**
 * The write path, and the only port that changes state. Adding to a cart must
 * stay an explicit, confirmed action — a model deciding to put something in
 * someone's basket is a different risk class from a model answering a question,
 * so the interface takes a `confirmedByMember` flag rather than trusting intent
 * inferred from the conversation.
 */
export interface CartPort {
  addItem(input: {
    requester: Requester;
    catalogItemId: string;
    quantity: number;
    confirmedByMember: true;
  }): Promise<{ cartId: string }>;
}

/** Everything the brain needs injected. Stubs below cover what doesn't exist yet. */
export const emptyMemberContext: MemberContext = {
  firstName: null,
  goalLabel: null,
  segment: null,
  traitsSummary: [],
  orders: [],
  protocols: [],
  subscribed: false,
};

export interface BrainPorts {
  memberContext: MemberContextPort;
  observations: ObservationSinkPort;
  catalog: CatalogPort;
  cart: CartPort;
}

/** No member data exists yet — an empty context, not a failure. */
export const emptyMemberContextPort: MemberContextPort = {
  async forMember() {
    return emptyMemberContext;
  },
};

/** Records nothing; the default until the platform adapter is wired. */
export const noopObservationSinkPort: ObservationSinkPort = {
  async record() {},
};

/** No catalogue wired (tests, eval). Returning nothing is honest. */
export const emptyCatalogPort: CatalogPort = {
  async search() {
    return [];
  },
};

/**
 * No commerce yet. Throws rather than silently succeeding — a caller that
 * believes it added something to a cart must not be told it worked.
 */
export const unavailableCartPort: CartPort = {
  async addItem() {
    throw new Error('Cart is not available yet — no commerce backend is wired up.');
  },
};

export const stubPorts: BrainPorts = {
  memberContext: emptyMemberContextPort,
  observations: noopObservationSinkPort,
  catalog: emptyCatalogPort,
  cart: unavailableCartPort,
};

/**
 * Syncing a captured lead to the marketing platform. Fire-and-forget by
 * contract: implementations must never throw into a request path, and callers
 * must never await one inside a response. The brain knows nothing about
 * Attentive; the adapter at the edge (apps/brain/src/ports) does.
 *
 * Deliberately NOT the waitlist. The waitlist and the brain are separate
 * funnels that never touch; the marketing platform deduping profiles by email
 * is the only place they meet.
 */
export interface LeadSyncPort {
  upsertLead(lead: {
    email: string;
    /** E.164, once a surface collects one (none does yet). */
    phone?: string | null;
    name?: string | null;
    /** Care-area slug, when given. */
    goal?: string | null;
    /** capturing → exploring → ready → converted. */
    status: string;
  }): Promise<void>;
  /**
   * The erasure half: unsubscribe this address from every channel and ask the
   * platform to delete the person. Called by the profile erasure path:
   * deleting a lead locally while the marketing platform keeps messaging them
   * is not erasure.
   */
  suppressLead(email: string): Promise<void>;
}

/** Marketing sync disabled — local dev and tests. */
export const noopLeadSyncPort: LeadSyncPort = {
  async upsertLead() {},
  async suppressLead() {},
};

/** Who changed a setting. Recorded on every audited brain mutation. */
export interface SettingsActor {
  clerkUserId: string;
  email?: string;
}

/**
 * Writing to the platform's audit log. The brain doesn't own that table and
 * never reads it — it only needs to record that an admin changed the
 * assistant's behavior, which is a compliance requirement rather than a brain
 * feature. `tx` is the caller's transaction, passed through opaquely so the
 * audit row commits atomically with the change it describes.
 */
export interface AuditPort {
  record(
    entry: {
      actorClerkUserId: string;
      actorEmail?: string;
      action: string;
      entityType: string;
      entityId?: string;
      before?: unknown;
      after?: unknown;
    },
    tx?: unknown,
  ): Promise<void>;
}

/** Audit writes disabled — for tests and any context with no admin actor. */
export const noopAuditPort: AuditPort = {
  async record() {},
};
