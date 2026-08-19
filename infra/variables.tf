variable "project" {
  description = "Project slug used to name/tag all resources."
  type        = string
  default     = "joice"
}

variable "region" {
  description = "AWS region for all resources (CloudFront certs need us-east-1 later anyway)."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.0.0.0/16"
}

# ---- Compute ----

variable "cpu_architecture" {
  description = "Fargate CPU architecture. X86_64 matches default GitHub runners; switch to ARM64 (+ arm runner in the workflow) for ~20% cheaper Fargate."
  type        = string
  default     = "X86_64"
  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "task_cpu" {
  description = "CPU units per task (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory (MiB) per task."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Baseline task count per service."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Autoscaling ceiling per service."
  type        = number
  default     = 4
}

variable "image_tag" {
  description = "Image tag the task definitions reference. CI pushes :latest and :<sha>, then forces a new deployment."
  type        = string
  default     = "latest"
}

# ---- Database ----

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS storage (GB, gp3)."
  type        = number
  default     = 20
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot on destroy. Leave true only while there is no data you care about."
  type        = bool
  default     = true
}

# ---- CI/CD ----

variable "github_repository" {
  description = "GitHub repo (owner/name) allowed to assume the deploy role via OIDC. Empty disables the OIDC role. GitHub appends immutable IDs to the OIDC sub claim for this repo (see `gh api /repos/<owner>/<name>/actions/oidc/customization/sub`), so the IDs must be part of the value — a plain owner/name never matches."
  type        = string
  default     = "Joice-Health@305843096/Joice@1293584206"
}

# ---- Team preview gate ----

variable "team_password" {
  description = "Shared password for the pre-launch main site (/team). Set in terraform.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

variable "site_launched" {
  description = "true opens the main site to everyone (removes the team gate)."
  type        = bool
  default     = false
}

# ---- Clerk (admin auth) ----

variable "clerk_publishable_key" {
  description = "Clerk publishable key (pk_...). Also set as the CLERK_PUBLISHABLE_KEY GitHub repo variable for the web image build."
  type        = string
  default     = ""
}

variable "clerk_jwt_key" {
  description = "Clerk instance JWT public key (PEM; Dashboard -> API keys -> JWT public key). Public, not a secret: lets the brain verify member session tokens networklessly without holding the Clerk secret."
  type        = string
  default     = ""
}

variable "clerk_secret_key" {
  description = "Clerk secret key (sk_...). Set in terraform.tfvars (gitignored); stored in Secrets Manager for the ECS tasks."
  type        = string
  sensitive   = true
  default     = ""
}

# ---- Klaviyo (waitlist marketing sync) ----

variable "klaviyo_api_key" {
  description = "Klaviyo private API key (pk_...). Set in terraform.tfvars (gitignored); stored in Secrets Manager for the api task. Empty disables the sync."
  type        = string
  sensitive   = true
  default     = ""
}

variable "klaviyo_list_id" {
  description = "Klaviyo List ID of the master email-consent list (6-char code in the list URL; not a secret). Every consent-capturing surface subscribes to this one list — see docs/marketing/01-klaviyo.md. Empty disables the sync."
  type        = string
  default     = ""
}

# ---- RAG ----

variable "rag_model" {
  description = "Bedrock model ID for the peptide chatbot (cross-region inference profile)."
  type        = string
  default     = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}

variable "polly_voice_id" {
  description = "Polly neural voice for spoken chatbot answers."
  type        = string
  default     = "Ruth"
}

# ---- Domains ----

variable "domain_name" {
  description = "Canonical domain the site is served on."
  type        = string
  default     = "joicehealth.com"
}

variable "redirect_domains" {
  description = "Domains that 301-redirect (apex + www) to the canonical domain."
  type        = list(string)
  default     = ["joice.health"]
}

variable "brain_retention_days" {
  description = "Delete chat threads idle longer than this (retention.tf). Only meaningful once persist_conversations is true."
  type        = number
  default     = 90
}

variable "persist_conversations" {
  description = <<-EOT
    Store member chat threads in Postgres. Leave false until the
    conversation-persistence gate in docs/rag/07-compliance.md is cleared —
    retention policy, erasure path, AI-services opt-out and member auth.
  EOT
  type        = bool
  default     = false
}
