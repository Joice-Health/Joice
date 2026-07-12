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
  description = "GitHub repo (owner/name) allowed to assume the deploy role via OIDC. Empty disables the OIDC role."
  type        = string
  default     = "Joicehealth/Joice"
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
