# Joice AWS Infrastructure

Terraform for the production deployment: CloudFront → ALB → ECS Fargate (web + api) with
RDS Postgres 17. One origin for everything — CloudFront routes `/api/*` to the API service
and the rest to the web service, so there is no CORS and the web image bakes
`NEXT_PUBLIC_API_URL=""` (relative, same-origin requests).

```
Browser ─► CloudFront (TLS, edge cache for /_next/static + *.mp4)
             ├── default  ─► ALB ─► ECS web (Next.js :3000)
             └── /api/*   ─► ALB ─► ECS api (Hono :4000; migrations run as a one-off task)
                                     └─► RDS Postgres 17 (private subnets, encrypted, TLS forced)
```

Cost: ~$50–55/mo baseline (no NAT Gateway — tasks run in public subnets with
SG-only ingress from the ALB; RDS is in private subnets with no internet path).

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
- **Origin lock:** hitting the ALB directly returns 403 (secret `X-Origin-Verify`
  header is injected by CloudFront; ALB SG also only admits CloudFront IPs).
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

## Before-PHI checklist (HIPAA hardening for Phase 1)

Phase 0 stores marketing data only (email + referral attribution) — not PHI.
Already baked in: encrypted RDS storage, forced TLS to the DB (`rds.force_ssl` +
`sslmode=require`), 7-day backups, deletion protection, HIPAA-eligible services only,
salted IP hashes (never raw IPs). Before handling any health data:

- [ ] Confirm scope with counsel; sign the **AWS BAA** in AWS Artifact
- [ ] **Custom domain + ACM on the ALB**, CloudFront origin `https-only`
      (removes the one plaintext hop: CloudFront → ALB is HTTP today because
      bare ALB DNS names can't carry an ACM cert)
- [ ] Move tasks to **private subnets** + NAT Gateway or VPC endpoints (~+$30/mo)
- [ ] **CloudTrail** (all regions), **VPC flow logs**, ALB + CloudFront access logs to S3
- [ ] RDS **Multi-AZ**, longer backup retention, consider KMS CMKs over AWS-managed keys
- [ ] App-level: audit logging, access controls, session management for any PHI surfaces

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
