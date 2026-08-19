-- Seed the two onboarding flags so they show up in /admin/flags from the first
-- deploy. Both OFF: `onboarding` opens /get-started and the public
-- /api/onboarding/* endpoints; `onboarding_health` is one of the two PHI keys
-- (the other is the PHI_READY env on the api task, set by Terraform) that let
-- a flow version asking health-tier traits be published. Idempotent: rows an
-- admin has already toggled are left alone.
INSERT INTO "feature_flags" ("key", "description", "enabled")
VALUES
  (
    'onboarding',
    'Intake on /get-started and the public /api/onboarding/* endpoints. Off: the page shows the companion lead summary and the API answers 404.',
    false
  ),
  (
    'onboarding_health',
    'PHI key 2 of 2: allows publishing a flow version that asks health-tier traits. Has no effect unless PHI_READY is also set on the api (Terraform), after the Before-PHI checklist.',
    false
  )
ON CONFLICT ("key") DO NOTHING;
