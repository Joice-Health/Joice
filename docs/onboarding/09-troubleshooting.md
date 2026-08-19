# 09. Troubleshooting the intake

Symptom → cause → fix, for the flow, the admin surface and local dev. The
request id in an api error (`X-Request-Id`, echoed in error bodies) is the
key that finds the stack trace in the logs.

| Symptom | Cause | Fix |
|---|---|---|
| `/get-started` shows the companion lead summary, not the flow | The `onboarding` flag is off (or was just turned on: two ~30s caches sit between the toggle and the page) | `/admin/flags` → `onboarding` on; wait up to a minute |
| Every `/api/onboarding/*` call answers 404 `Intake isn't open yet.` | Same flag, api side | Same fix |
| The flow loads but every answer 401s or the session resets per request | The cookie is not being sent: cross-origin dev without credentials | The api client sends `credentials: 'include'` and the api's CORS allows it; if you bypassed the hooks with raw `fetch`, add `credentials: 'include'` |
| Answering a question returns 400 `not_eligible` | The question is not the current step (a second tab moved the session, or a stale UI) | Reload; the server state wins by design |
| 409 `gated` on answer or back | The session ended at a gate; gates are terminal | Start over (the button on the gate screen) |
| Notify returns 409 `not_gated` | The session is not sitting on a notify gate | Only the "not in your state yet" screen can submit it |
| Publish returns 422 | The validator refused; the body carries the report | Read the report in the editor; each line names the path |
| Publish says `phi_locked` | The draft asks a health-tier trait without both PHI keys | That is the point; see `07-compliance.md` |
| A state opened in admin but visitors still gate | Service-area map cache (~30s) plus the settings cache | Wait a minute |
| `/welcome` says "verify your email" | Clerk email verification pending; claims need a verified address | Verify, then reload |
| `/welcome` offers "Start your intake +" after sign-up | The intake was in another browser (the cookie is the link), or none exists | Finish an intake in this browser; it claims on the next visit |
| Rolled-back deploy refuses the published flow (`unreadable`) | The definition's `schemaVersion` is newer than the running build | Roll the flow back to a version that build wrote, or redeploy forward |
| Local: a container reports a syntax error at a line that looks fine | Stale Docker Desktop mount (truncated file) | `cp f /tmp/x && rm f && cp /tmp/x f`, then restart the service (root CLAUDE.md) |
| Local: `Cannot find module '@joice/utils'` (or any new package) | The dev image predates the package; anonymous volumes shadow node_modules | `docker compose build <svc> && docker compose up -d --no-deps --renew-anon-volumes --no-build <svc>` |
| Local: admin calls 401 | Placeholder Clerk keys | Real dev keys in `.env`, restart api and web |
| Funnel shows zeroes for a version | Events are per pinned version; sessions may sit on an older one | Pick the version the sessions actually ran |
