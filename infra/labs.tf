# PHI labs bucket (Before-PHI checklist; story 5.3's upload scaffold consumes
# it). Member-uploaded lab results and concern documents: PHI the moment they
# exist, so the bucket starts locked down harder than the notes bucket - its
# own customer-managed KMS key, versioning, TLS-only access.
#
# No IAM grants here on purpose: the repo pattern adds bucket permissions with
# the consuming task (the ingestion role landed with ingest.tf), so the
# presigned-upload route's grant arrives with story 5.3.

resource "aws_kms_key" "labs" {
  description         = "${var.project} member lab uploads (PHI)"
  enable_key_rotation = true
}

resource "aws_kms_alias" "labs" {
  name          = "alias/${var.project}-labs"
  target_key_id = aws_kms_key.labs.key_id
}

resource "aws_s3_bucket" "labs" {
  bucket = "${var.project}-labs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "labs" {
  bucket = aws_s3_bucket.labs.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "labs" {
  bucket = aws_s3_bucket.labs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.labs.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "labs" {
  bucket = aws_s3_bucket.labs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "labs" {
  bucket = aws_s3_bucket.labs.id

  # No expiration on current versions: lab documents are medical records, and
  # deletion is an application decision, never a lifecycle rule. The noncurrent
  # expiry is the right-to-delete backstop - an app-level delete leaves a
  # noncurrent version behind, and 90 days later it is truly gone, with a
  # mistake-recovery window in between.
  rule {
    id     = "noncurrent-and-mpu"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "labs" {
  bucket = aws_s3_bucket.labs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.labs.arn, "${aws_s3_bucket.labs.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

# The api task's grant, arriving with story 5.3's consuming route as the file
# header promised: presigned PUTs (the browser uploads directly; the api never
# reads the objects back today, so no GetObject until a consumer exists) plus
# the KMS grant S3 needs to encrypt with the labs key on the api's behalf.
resource "aws_iam_role_policy" "api_labs_upload" {
  name = "labs-presigned-upload"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${aws_s3_bucket.labs.arn}/labs/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.labs.arn]
      },
    ]
  })
}
