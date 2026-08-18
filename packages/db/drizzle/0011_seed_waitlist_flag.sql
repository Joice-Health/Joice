-- Seed the flag that gates the public waitlist so it shows up in /admin/flags
-- from the first deploy. Seeded ON to preserve what is live today: turning the
-- waitlist off is a toggle in the admin console, not a deploy.
-- Idempotent: an existing row (already toggled by an admin) is left alone.
INSERT INTO "feature_flags" ("key", "description", "enabled")
VALUES (
  'waitlist',
  'Public waitlist: the /waitlist page, joining, referral links and the signup counter. Off sends visitors to "Something special is coming".',
  true
)
ON CONFLICT ("key") DO NOTHING;
