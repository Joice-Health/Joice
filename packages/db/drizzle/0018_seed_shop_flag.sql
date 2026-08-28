-- Seed the `shop` flag ON: the public certification storefront (/home, /shop,
-- /shop/[id], /checkout) must be visible to auditors from the first deploy.
-- Off: those pages redirect to /waitlist; the permanent /terms /privacy /faq
-- pages are unaffected. Toggling it off in /admin/flags is the post-audit kill
-- switch. Idempotent: a row an admin has already toggled is left alone.
INSERT INTO "feature_flags" ("key", "description", "enabled")
VALUES (
  'shop',
  'Public certification storefront: /home, /shop, /shop/[id], /checkout. Off: those pages redirect to /waitlist. The permanent /terms /privacy /faq pages ignore it.',
  true
)
ON CONFLICT ("key") DO NOTHING;
