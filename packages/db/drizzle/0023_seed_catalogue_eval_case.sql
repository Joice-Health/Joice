-- The product tool's benchmark coverage (epic 285): a pricing-and-ordering
-- question that verifies the model reaches for search_catalogue, alongside
-- the existing "What products does Joice sell?" case. Idempotent per the
-- 0017 pattern: question text is the case's identity.
INSERT INTO "eval_cases" ("question", "expect_sources", "expect_refusal", "expect_tool", "must_cite")
VALUES
  ('How much does glutathione cost, and can I order it?', NULL, false, 'search_catalogue', false)
ON CONFLICT ("question") DO NOTHING;
