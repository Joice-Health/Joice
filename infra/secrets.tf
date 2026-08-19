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

# Klaviyo private API key for the api task's waitlist marketing sync.
resource "aws_secretsmanager_secret" "klaviyo_api_key" {
  name                    = "${var.project}/klaviyo-api-key"
  recovery_window_in_days = 0 # allow clean re-creates during Phase 0
}

resource "aws_secretsmanager_secret_version" "klaviyo_api_key" {
  secret_id     = aws_secretsmanager_secret.klaviyo_api_key.id
  secret_string = var.klaviyo_api_key
}
