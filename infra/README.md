# Joice AWS Infrastructure

Terraform for the production deployment: CloudFront → ALB → ECS Fargate (web + api) with
RDS Postgres 17. One origin for everything — CloudFront routes `/api/*` to the API service
and the rest to the web service, so there is no CORS and the web image bakes
`NEXT_PUBLIC_API_URL=""` (relative, same-origin requests).

```
Browser ─► CloudFront (TLS, edge cache for /_next/static + *.mp4)
             ├── default  ─► ALB ─► ECS web (Next.js :3000)
             └── /api/*   ─► ALB ─► ECS api (Hono :4000, migrates on boot)
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
(8 variables: `AWS_REGION`, `AWS_ROLE_ARN`, `CLOUDFRONT_URL`, `ECR_WEB`, `ECR_API`,
`ECS_CLUSTER`, `ECS_SERVICE_WEB`, `ECS_SERVICE_API`).

Push to `main` (or run the **Deploy to AWS** workflow manually) — it builds both
images, pushes to ECR, and rolls the services with zero downtime.

## Day-2 notes

- **Deploys:** every push to `main`. Images are tagged `:latest` + `:<sha>`;
  task definitions point at `:latest` and CI forces a new deployment.
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

## Custom domain (later)

1. Get an ACM cert **in us-east-1** for the domain (DNS validation).
2. In `cloudfront.tf`: set `aliases`, swap `viewer_certificate` to the cert ARN
   with `minimum_protocol_version = "TLSv1.2_2021"`.
3. Point DNS (ALIAS/CNAME) at the CloudFront domain.
4. Rebuild web with `NEXT_PUBLIC_APP_URL=https://yourdomain` (update the GitHub
   variable) so share links/QRs use the real domain.

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

## Teardown

```bash
terraform destroy
```

`deletion_protection` on RDS blocks destroy — set it false and apply first if you
really mean it. ECR repos force-delete (images included).
