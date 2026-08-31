/**
 * What the platform needs to know from commerce about a member: whether they
 * hold an active subscription. Commerce lives in CarePortals, so the real
 * adapter is an HTTP client on the api service; this port keeps the domain
 * runtime-agnostic and the answer injectable.
 *
 * The contract is deliberately pessimistic: false on any doubt (missing
 * credentials, network failure, unknown email), because the answer lifts a
 * member to the subscriber audience tier and a guess must never widen access.
 */
export interface SubscriptionPort {
  isSubscribed(email: string): Promise<boolean>;
}

/** The default until commerce credentials exist: nobody is a subscriber. */
export const noopSubscriptionPort: SubscriptionPort = {
  isSubscribed: async () => false,
};
