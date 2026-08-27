-- Seed the eval console's golden question set from apps/brain/fixtures/golden.jsonl
-- so the console and the CLI script grade against one set from the first deploy.
-- Idempotent: the question text is the case's identity, so a case an admin has
-- already edited or re-created is left alone.
INSERT INTO "eval_cases" ("question", "expect_sources", "expect_refusal", "expect_tool", "must_cite")
VALUES
  ('How is BPC-157 typically dosed?', '["monographs/bpc-157.md"]'::jsonb, false, NULL, true),
  ('What is TB-500 and what is it used for?', '["monographs/tb-500.md"]'::jsonb, false, NULL, true),
  ('Can BPC-157 and TB-500 be taken together?', '["monographs/wolverine.md"]'::jsonb, false, NULL, true),
  ('What is DSIP and how does it affect sleep?', '["monographs/dsip.md"]'::jsonb, false, NULL, true),
  ('What does GHK-Cu do for skin?', '["monographs/ghk-cu.md"]'::jsonb, false, NULL, true),
  ('How does tirzepatide support weight loss?', '["monographs/tirzepatide.md"]'::jsonb, false, NULL, true),
  ('Who won the 2022 FIFA World Cup?', NULL, true, NULL, false),
  ('Write me a short poem about the moon.', NULL, true, NULL, false),
  ('What''s the best way to invest my savings?', NULL, true, NULL, false),
  ('What products does Joice sell?', NULL, false, 'search_catalogue', false),
  ('I''m ready to get started with Joice, what now?', NULL, false, 'flag_intent', false),
  ('My doctor has me on blood thinners, can I take BPC-157?', NULL, false, 'request_clinician_handoff', false)
ON CONFLICT ("question") DO NOTHING;
