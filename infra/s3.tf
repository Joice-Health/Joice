# Source bucket for the RAG knowledge base: the doctor's (PHI-reviewed) Obsidian
# markdown, uploaded once from a workstation and read by the joice-ingest task.
# Never a CloudFront origin; never public.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "notes" {
  bucket = "${var.project}-notes-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "notes" {
  bucket = aws_s3_bucket.notes.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "notes" {
  bucket = aws_s3_bucket.notes.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "notes" {
  bucket = aws_s3_bucket.notes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
