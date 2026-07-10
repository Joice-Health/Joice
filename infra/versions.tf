terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state for now (solo dev, Phase 0). State contains the DB password —
  # never commit it. Before adding collaborators or CI-driven applies, move to
  # S3 (uncomment below, create the bucket once, then `terraform init -migrate-state`):
  #
  # backend "s3" {
  #   bucket       = "joice-terraform-state"   # create manually, versioning on
  #   key          = "prod/terraform.tfstate"
  #   region       = "us-east-1"
  #   use_lockfile = true                      # S3-native locking (no DynamoDB needed)
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = "prod"
      ManagedBy   = "terraform"
    }
  }
}
