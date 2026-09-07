# Clerk secret key for the web and api tasks, mirroring the database-url pattern
# in rds.tf: one Secrets Manager secret mapped straight to the env var the apps
# expect (CLERK_SECRET_KEY).

resource "aws_secretsmanager_secret" "clerk_secret_key" {
  name                    = "${var.project}/clerk-secret-key"
  recovery_window_in_days = 0 # allow clean re-creates during Phase 0
}

resource "aws_secretsmanager_secret_version" "clerk_secret_key" {
  secret_id     = aws_secretsmanager_secret.clerk_secret_key.id
  secret_string = var.clerk_secret_key
}

# Bearer token for /api/internal/* — the brain reading member profiles from the
# api. One random value shared by both tasks; rotation is an apply.
resource "random_password" "internal_api_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "internal_api_token" {
  name                    = "${var.project}/internal-api-token"
  recovery_window_in_days = 0 # allow clean re-creates during Phase 0
}

resource "aws_secretsmanager_secret_version" "internal_api_token" {
  secret_id     = aws_secretsmanager_secret.internal_api_token.id
  secret_string = random_password.internal_api_token.result
}

# Attentive private-app API key: the api's marketing sync and the brain's lead sync.
resource "aws_secretsmanager_secret" "attentive_api_key" {
  name                    = "${var.project}/attentive-api-key"
  recovery_window_in_days = 0 # allow clean re-creates during Phase 0
}

resource "aws_secretsmanager_secret_version" "attentive_api_key" {
  secret_id     = aws_secretsmanager_secret.attentive_api_key.id
  secret_string = var.attentive_api_key
}

# Signing key of the Attentive consent webhook, verified by the api task.
resource "aws_secretsmanager_secret" "attentive_webhook_secret" {
  name                    = "${var.project}/attentive-webhook-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "attentive_webhook_secret" {
  secret_id     = aws_secretsmanager_secret.attentive_webhook_secret.id
  secret_string = var.attentive_webhook_secret
}

# CarePortals CRM service-user password for the api task's subscriber lookups.
resource "aws_secretsmanager_secret" "careportals_crm_password" {
  name                    = "${var.project}/careportals-crm-password"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "careportals_crm_password" {
  secret_id     = aws_secretsmanager_secret.careportals_crm_password.id
  secret_string = var.careportals_crm_password
}
