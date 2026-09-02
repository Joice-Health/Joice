-- Seed the `commerce` flag ON: the production shop (everything under /shop:
-- catalogue, category and product pages, cart, checkout) sits behind the team gate
-- until launch, so the flag being on exposes nothing to the public; it exists
-- as the emergency kill switch, independent of the certification storefront's
-- `shop` flag so either surface can be retired without touching the other.
-- Off: those pages redirect to /waitlist. Idempotent: a row an admin has
-- already toggled is left alone.
INSERT INTO "feature_flags" ("key", "description", "enabled")
VALUES (
  'commerce',
  'Production shop: everything under /shop (catalogue, category and product pages, cart, checkout). Off: those pages redirect to /waitlist. Independent of the certification storefront''s shop flag.',
  true
)
ON CONFLICT ("key") DO NOTHING;
