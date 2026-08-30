# Joice AWS Infrastructure

Terraform for the production deployment: CloudFront → ALB → ECS Fargate (web + api) with
RDS Postgres 17. One origin for everything — CloudFront routes `/api/*` to the API service
and the rest to the web service, so there is no CORS and the web image bakes
`NEXT_PUBLIC_API_URL=""` (relative, same-origin requests).

```
Browser ─► CloudFront (TLS, edge cache for /_next/static + *.mp4)
             ├── default  ─► ALB (HTTPS origin) ─► ECS web (Next.js :3000)
             └── /api/*   ─► ALB (HTTPS origin) ─► ECS api (Hono :4000; migrations run as a one-off task)
                                                    └─► RDS Postgres 17 (private subnets, encrypted, TLS forced, Multi-AZ)
```

Cost: ~$110–125/mo baseline. The Before-PHI hardening added the NAT Gateway
(~$32/mo + data), the Bedrock interface endpoint (~$15/mo) and RDS Multi-AZ
(~$15/mo) on top of the original ~$50–55. Tasks run in the app subnets with no
public IPs (egress via the NAT); the ALB and NAT sit in the public subnets;
RDS keeps its own private subnets with no internet path.

## Bootstrap (one-time)

```bash
cd infra
terraform init
terraform apply -var 'github_repository=YOUR_ORG/YOUR_REPO'
```

ECS services will flap briefly until first images are pushed — expected; the
deployment circuit breaker tolerates it.

Then wire CI: copy the printed `github_repo_variables` output into
GitHub → repo → Settings → Secrets and variables → Actions → **Variables**
(14 variables: `AWS_REGION`, `AWS_ROLE_ARN`, `CLOUDFRONT_URL`, `ECR_WEB`, `ECR_API`,
`ECR_BRAIN`, `ECS_CLUSTER`, `ECS_SERVICE_WEB`, `ECS_SERVICE_API`, `ECS_SERVICE_BRAIN`,
`ECS_TASK_MIGRATE`, `SUBNET_IDS`, `BRAIN_SG_ID`, `CLERK_PUBLISHABLE_KEY`; the list in
`outputs.tf` is authoritative).

Push to `main` (or run the **Deploy to AWS** workflow manually with `scope=all`); it
builds the images, pushes to ECR, runs the migrate task, and rolls the services with
zero downtime. How the pipeline decides what to build and roll is documented in
`CLAUDE.md` → Deployment.

## Alerting (`alarms.tf`)

Off by default. Set `alert_email` in `terraform.tfvars` and apply; everything in
`alarms.tf` is `count`-gated on that variable, so an empty value creates nothing.

```hcl
alert_email = "you@example.com"
```

```bash
terraform plan -out=alarms.plan   # expect: 1 SNS topic, 1 subscription, 3 alarms
terraform apply alarms.plan
```

**Then confirm the subscription** — AWS emails a link, and until it's clicked the
subscription sits in `PendingConfirmation` and delivers nothing. Verify with:

```bash
aws sns list-subscriptions-by-topic \
  --topic-arn "$(terraform output -raw alerts_topic_arn)" \
  --query 'Subscriptions[].[Protocol,Endpoint,SubscriptionArn]' --output table
```

| Alarm | Fires when | What it means |
|---|---|---|
| `joice-api-5xx` | >5 target 5xx in 5 min | The app is throwing. Grab a `reqId` from `/ecs/joice-api` and search the log group for it |
| `joice-api-unhealthy-tasks` | any unhealthy target for 2 min | Tasks fail `/health` — the app is broken *or* it can't reach RDS. Two periods so a rolling deploy's drain doesn't page |
| `joice-rds-free-storage` | free storage <20% | Growing RDS storage is rate-limited, so this has to fire with room to act, not at 0 |

Each also sends an OK notification, so a resolved incident closes itself out.

## Day-2 notes

- **Deploys:** every push to `main`, **gated on CI** — `.github/workflows/ci.yml`
  (type-check, lint, test) is called by `deploy.yml` as a `needs:` dependency, so
  a red check cannot ship. The api image never type-checks during its own build,
  so this gate is the only thing catching a type error. Only the apps a commit
  affects are built and rolled; see `CLAUDE.md` → Deployment for the rules and
  for how to force a full deploy (`scope=all`).
- **Which build is live:** `GET /health` reports `sha` (baked in as `BUILD_SHA`
  at image build time) alongside a real database probe. A 503 there is a task
  that cannot serve, which is what lets the ECS circuit breaker roll back. With
  per-app deploys that sha is the commit that last changed the service; the
  release as a whole is the `:<sha>` tag every repo carries.
- **Images** are tagged `:latest` + `:<sha>` (unchanged images are retagged with
  the new sha too); task definitions point at `:latest` and CI forces a new
  deployment. On a failed rollout CI puts `:latest` back on the previous release.
  (Phase-1 upgrade: pin-by-digest task definition renders.)
- **State is local** (`terraform.tfstate`, gitignored, contains the DB password).
  Before collaborators/CI applies: create a versioned S3 bucket, uncomment the
  backend block in `versions.tf`, `terraform init -migrate-state`.
- **Scaling:** target-tracking on CPU (70%), min `desired_count` (1) → max `max_count` (4)
  per service. RDS `db.t4g.micro` is fine for the one-table waitlist; scale the
  instance class before a launch spike.
- **Origin lock:** hitting the ALB directly (including `origin.joicehealth.com`,
  the HTTPS origin hostname) returns 403 — the secret `X-Origin-Verify` header
  is injected by CloudFront, and the ALB SG only admits CloudFront IPs.
- **Fargate arch:** `cpu_architecture=X86_64` matches default GitHub runners.
  Flip to `ARM64` (+ `runs-on: ubuntu-24.04-arm` and `platforms: linux/arm64`
  in the workflow) for ~20% cheaper compute.

## Domains

Canonical: **joicehealth.com** (`domain_name` variable). Redirects: **joice.health**
(`redirect_domains`) — apex + www of every domain 301 to the canonical via a CloudFront
Function that preserves path and query string (`?ref=` attribution survives). Route53
zones + the multi-SAN ACM cert + validation and alias records are all in `dns.tf`.

**Cutover runbook:**
1. `terraform apply` — creates the zones and cert, then **waits on cert validation**.
2. While it waits: `terraform output nameservers` → set those NS at each domain's
   registrar. Validation completes once the NS cutover propagates (minutes to hours;
   re-run apply if it times out).
3. Update the GitHub repo variable `CLOUDFRONT_URL=https://joicehealth.com` and run
   the deploy workflow manually with `scope=all` so share links/QRs bake the real
   domain (nothing in git changed, so a plain re-run would not rebuild web).
4. Optional: transfer the domain registrations themselves to Route53 (console →
   Route53 → Registered domains → Transfer). Not required — NS delegation is enough —
   and not manageable from Terraform.

Old `*.cloudfront.net` links keep working: they 301 to the canonical domain.

## Member accounts (Clerk) and onboarding retention

Before production sign-ups: enable public sign-ups + email verification in the
Clerk dashboard, and set `clerk_jwt_key` in `terraform.tfvars` (Dashboard ->
API keys -> JWT public key, PEM; public, not a secret) so the brain can verify
member tokens networklessly; the brain task deliberately cannot read the
Clerk secret. There is **no webhook**: the member record is created by the api
on the member's first authenticated call after sign-up.

`onboarding-retention.tf` runs the intake sweep nightly (04:40 UTC) on the api
image: idle sessions abandoned after `onboarding_session_idle_days` (30),
unclaimed ones purged after `onboarding_session_ttl_days` (90; counsel
confirms). First run after an apply is worth a manual dry-run
(`ONBOARDING_RETENTION_DRY_RUN=true` via `aws ecs run-task`).

## Before-PHI checklist (HIPAA hardening for Phase 1)

Phase 0 stores marketing data only (email + referral attribution) — not PHI.
Already baked in: encrypted RDS storage, forced TLS to the DB (`rds.force_ssl` +
`sslmode=require`), 35-day backups, deletion protection, HIPAA-eligible services only,
salted IP hashes (never raw IPs). Before handling any health data (tick each box
with the date it was **applied**, not merged):

- [x] Confirm scope with counsel; sign the **AWS BAA** in AWS Artifact — signed 2026-08-27
- [x] **Custom domain + ACM on the ALB**, CloudFront origin `https-only`
      (`origin.joicehealth.com` in `dns.tf` + the :443 listener in `alb.tf`
      remove the one plaintext hop) — applied and verified 2026-08-27; the
      deprecated :80 listener awaits its cleanup change
- [x] Move tasks to **app subnets** (no public IPs) + NAT Gateway + S3/Bedrock
      VPC endpoints (`vpc.tf`, `endpoints.tf`) — applied and verified
      2026-08-27, incl. CI's migrate task running privately
- [x] **CloudTrail** (all regions, CMK, 6y), **VPC flow logs**, ALB + CloudFront
      access logs to S3 (`audit.tf`) — applied 2026-08-27, delivery confirmed
      for all four log streams
- [x] RDS **Multi-AZ**, 35-day backups — applied 2026-08-27. KMS CMKs: adopted
      for greenfield (labs, CloudTrail); the RDS CMK is consciously deferred —
      it needs a snapshot-restore migration (see `rds.tf`)
- [ ] App-level: audit logging, access controls, session management for any PHI
      surfaces (chat audit logging + member auth on the chat routes — the
      chat-before-members workstream in `docs/rag/07-compliance.md`)

Onboarding's health tier hangs off this checklist (docs/onboarding/07-compliance.md):

- Health-tier traits unlock behind **two keys**: `phi_ready` (Terraform variable
  → api task env `PHI_READY`; set it in `terraform.tfvars` only after every box
  above is ticked) **and** the `onboarding_health` feature flag (`/admin/flags`).
  Publishing a flow version that asks a health-tier trait fails `phi_locked`
  until both are on.
- Member lab uploads land in the dedicated PHI bucket (`labs.tf`, CMK-encrypted,
  versioned); the upload scaffold is story 5.3.

### Before-PHI apply order

Everything is in code on one branch; apply **from the branch, before merging** —
merging changes `scripts/ci`, which triggers a full deploy whose migrate task
already expects the app subnets. Sequence:

0. One-time console prep: raise the VPC quota **"Inbound or outbound rules per
   security group"** to 120 (the CloudFront prefix list weighs 55; the :80+:443
   pair exceeds the default 60). Note: Service Quotas can show APPROVED while
   EC2 still enforces the old limit for up to ~30 minutes; if the apply fails
   at the security group right after approval, wait and re-run. Syntax-check
   any edit with `terraform init -backend=false && terraform validate`.
1. `terraform apply` — everything lands in one apply; the ordering that matters
   is encoded as `depends_on` (HTTPS listener rules before the CloudFront
   origin flip; NAT route before the services move; log-bucket policy before
   ALB access logs). Cert validation takes minutes (zone already live);
   the CloudFront update blocks until fully propagated; services roll with the
   circuit breaker. Schedule it off-peak: the RDS Multi-AZ conversion runs in
   the background with a brief I/O pause.
2. Verify: site up through CloudFront (`curl https://joicehealth.com/health`;
   the api's `/health` is root-level and only the ALB target group reaches it,
   so there is no `/api/health`); chat answers (Bedrock via the endpoint);
   `aws ecs describe-services` shows all rollouts COMPLETED and
   `describe-network-interfaces` shows no public IPs on the task ENIs;
   `curl https://origin.joicehealth.com/` **times out** from anywhere but
   CloudFront (the SG admits only CloudFront's origin-facing IPs; the 403
   fixed-response is what CloudFront itself would see without the header).
3. Update the GitHub repo variable `SUBNET_IDS` to the app subnet ids (the
   `github_repo_variables` output prints the new value), then merge the PR and
   let the triggered full deploy prove CI's migrate path works privately.
4. After ~15 min, confirm logs are landing: `alb/`, `vpc-flow/`, `cloudfront/`
   prefixes in the logs bucket and the CloudTrail bucket's `AWSLogs/`.
5. Tick the boxes above with dates. Follow-up change once HTTPS is verified:
   delete the deprecated :80 listener, its rules and the :80 SG ingress
   (marked DEPRECATED in `alb.tf`/`brain.tf`).

## Team preview gate

The main site (everything except `/waitlist` and `/team`) is hidden behind a shared
password until launch — Next.js middleware redirects the public to `/waitlist`. Team
members log in at **/team**.

- Set the password once in `infra/terraform.tfvars` (gitignored):
  `team_password = "…"` → `terraform apply` (rolls the web service; no rebuild).
- Rotate: change the value, apply — every issued cookie is invalidated.
- **Launch:** set `site_launched = true`, apply. The gate disappears; all URLs are
  already final.

## Teardown

```bash
terraform destroy
```

`deletion_protection` on RDS blocks destroy — set it false and apply first if you
really mean it. ECR repos force-delete (images included).

## Labs uploads (story 5.3)

`labs.tf` holds the PHI labs bucket (own KMS key, versioning, TLS-only) and,
since the consuming route landed, the api task-role grant (`s3:PutObject` on
`labs/*` plus the KMS encrypt grant) and the `LABS_BUCKET` env on the api task
(`ecs.tf`). One `terraform apply` turns it on; with the env empty or the PHI
keys off, `/api/me/labs` answers 404 and nothing is reachable.

## Service Connect (story 4.7)

`service-connect.tf`: the `joice.local` namespace, the api exposed privately
as `http://api:4000`, and the brain admitted into the api's security group.
The same apply sets `INTERNAL_EDGE_BLOCKED=true` on the api task, after which
`/api/internal/*` refuses anything that arrived through CloudFront, token or
not. Rollback: `API_URL_INTERNAL` back to the canonical URL and the flag off,
one apply.
