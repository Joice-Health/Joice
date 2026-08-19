# 08. Running the intake locally

Everything below assumes the compose stack from the root `CLAUDE.md`
(`docker compose up`; Postgres on 5433, api on 4000, web on 3000).

## 1. Migrate and open the flag

Migrations 0012 to 0015 create the tables and seed the two flags (off), the 51
service areas (`notify`) and the `intake` flow (version 1, published). The
compose `migrate` service applies them; by hand:

```bash
cd packages/db && DATABASE_URL=postgresql://joice:joice@localhost:5433/joice bunx drizzle-kit migrate
```

Turn the flag on in `/admin/flags` (the api caches flags ~30s, the web page
~30s more) or straight in SQL for a quick run:

```sql
update feature_flags set enabled = true where key = 'onboarding';
update service_areas set status = 'open' where state_code = 'CA';   -- every state seeds as notify
```

New workspace package? The dev images install dependencies at build time and
shadow `node_modules` with anonymous volumes, so a new package (like
`@joice/utils`) or a new dependency needs
`docker compose build <service> && docker compose up -d --no-deps --renew-anon-volumes --no-build <service>`.

## 2. Click through

Log in at `/team` (the team password from `.env`), then `/get-started`. Try:
California + an adult date of birth + "Weight and metabolic" (the weight
section appears); New York (a notify gate; the email is prefilled if you gave
one to the companion on `/ask`); a 2012 date of birth (the stop); reload
mid-way (resume); Start over on a gate.

## 3. Drive the API with curl

```bash
API=http://localhost:4000/api/onboarding; J=/tmp/j
post() { curl -s -b $J -c $J -H 'content-type: application/json' -X POST "$API$1" -d "$2"; }

curl -s -c $J $API/session | jq '.step.question.key, .progress'
post /session/answer '{"questionKey":"us_state","value":"CA"}' | jq '.step.question.key'
post /session/answer '{"questionKey":"date_of_birth","value":"1990-06-15"}' | jq '.step.question.key'
post /session/answer '{"questionKey":"goal","value":"energy"}' | jq '.progress'
post /session/back '{}' | jq '.step.question.key'
post /session/restart '{"carryOver":{"firstName":"Sam","goal":"stress-sleep"}}' | jq '.copy'
post /session/answer '{"questionKey":"us_state","value":"NY"}' >/dev/null
post /session/answer '{"questionKey":"date_of_birth","value":"1990-06-15"}' | jq '.step.gate'
post /session/notify '{"email":"you@example.com"}' | jq '.step.gate.notifySubmitted'
```

Error shapes: `{ "error", "code", "questionKey" }` with 404 (`no_session`), 409
(`gated`, `not_gated`) or 400 (`invalid_value`, `not_eligible`, `required`,
`unknown_question`). With the flag off every route answers 404
`{ "error": "Intake isn't open yet." }`.

## 4. Look at the data

```sql
select status, answers, gate_outcome from onboarding_sessions order by created_at desc limit 3;
select trait, value, source, question_key from profile_observations order by observed_at desc limit 10;
select segment, traits from profiles order by updated_at desc limit 1;
select event, question_key, outcome from onboarding_events order by occurred_at desc limit 20;
select email, state_code from service_area_requests;
```

A minor's session shows `status = gated_age`, `answers = {}` and no
`date_of_birth` observation; the brain's `brain_profiles` row for that cookie is
gone.

## 5. Tests

```bash
cd packages/core && bun test                 # engine matrix, validator, services on fakes
cd apps/api && bun test                      # cookie middleware, feature gate, client ip
bun run check                                # everything, before claiming work done
```

## 6. Reset

`POST /api/onboarding/session/restart` abandons the current session (answers
purged) and starts a new one; clearing the `joice_onboarding_session` cookie
starts from nothing. Put the flag back off when you are done if you do not
want `/get-started` to show the flow to the team preview.
