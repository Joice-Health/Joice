# Audit trail (Before-PHI checklist): CloudTrail, VPC flow logs, ALB and
# CloudFront access logs. Two buckets because their constraints differ:
#
#   logs        - delivery target for ALB / flow / CloudFront logs. SSE-S3 is
#                 forced here: ALB log delivery does not support SSE-KMS.
#                 Operational forensics, expired after a year.
#   cloudtrail  - the compliance record, on its own customer-managed KMS key
#                 (greenfield, so the CMK decision applies), kept 6 years to
#                 match the HIPAA documentation-retention horizon.

# ---- Delivery-logs bucket (ALB + VPC flow logs + CloudFront) ----

resource "aws_s3_bucket" "logs" {
  bucket = "${var.project}-logs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # ALB log delivery cannot write SSE-KMS objects
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  # Tiny gzip/parquet objects sit below the 128KB IA sweet spot, so no storage
  # class transitions: just expire after a year.
  rule {
    id     = "expire"
    status = "Enabled"

    filter {}

    expiration {
      days = 365
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ELB's log-delivery principal in us-east-1 is the legacy per-region ELB
# account (the logdelivery.elasticloadbalancing.amazonaws.com service principal
# only exists in post-2022 regions).
data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ALBAccessLogs"
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.main.arn }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Sid       = "LogDeliveryWrite"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource = [
          "${aws_s3_bucket.logs.arn}/vpc-flow/AWSLogs/${data.aws_caller_identity.current.account_id}/*",
          "${aws_s3_bucket.logs.arn}/cloudfront/*",
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"      = "bucket-owner-full-control"
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid       = "LogDeliveryCheck"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = ["s3:GetBucketAcl", "s3:ListBucket"]
        Resource  = aws_s3_bucket.logs.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

# ---- VPC flow logs ----

# S3 over CloudWatch Logs deliberately: this is a write-mostly compliance
# archive queried rarely (Athena when needed), and S3 delivery is roughly a
# tenth of CloudWatch ingest cost. Parquet + hourly partitions keep those
# Athena scans cheap.
resource "aws_flow_log" "main" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = "${aws_s3_bucket.logs.arn}/vpc-flow/"

  destination_options {
    file_format        = "parquet"
    per_hour_partition = true
  }

  tags = { Name = "${var.project}-flow-logs" }
}

# ---- CloudFront access logs (standard logging v2) ----

# v2 vended-log delivery instead of the legacy logging_config block: legacy
# delivery needs bucket ACLs enabled (deprecated machinery); v2 needs none and
# touches nothing on the distribution itself. us-east-1 only, which is this
# stack's region.

resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  name         = "${var.project}-cloudfront-access"
  log_type     = "ACCESS_LOGS"
  resource_arn = aws_cloudfront_distribution.main.arn
}

resource "aws_cloudwatch_log_delivery_destination" "cloudfront_s3" {
  name          = "${var.project}-cloudfront-s3"
  output_format = "parquet"

  delivery_destination_configuration {
    destination_resource_arn = aws_s3_bucket.logs.arn
  }
}

resource "aws_cloudwatch_log_delivery" "cloudfront" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront_s3.arn

  s3_delivery_configuration {
    suffix_path                 = "cloudfront/{DistributionId}"
    enable_hive_compatible_path = false
  }

  depends_on = [aws_s3_bucket_policy.logs]
}

# ---- CloudTrail (management events, all regions) ----

locals {
  # Built as a string, not a reference: the bucket policy needs the trail ARN
  # before the trail exists (bucket -> policy -> trail), and referencing the
  # trail resource would make that a cycle.
  cloudtrail_arn = "arn:aws:cloudtrail:${var.region}:${data.aws_caller_identity.current.account_id}:trail/${var.project}-trail"
}

resource "aws_kms_key" "cloudtrail" {
  description         = "${var.project} CloudTrail logs"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudTrailEncrypt"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:GenerateDataKey*"
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceArn" = local.cloudtrail_arn }
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${data.aws_caller_identity.current.account_id}:trail/*"
          }
        }
      },
      {
        Sid       = "CloudTrailDescribe"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "cloudtrail" {
  name          = "alias/${var.project}-cloudtrail"
  target_key_id = aws_kms_key.cloudtrail.key_id
}

resource "aws_s3_bucket" "cloudtrail" {
  bucket = "${var.project}-cloudtrail-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.cloudtrail.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  # 6 years: the HIPAA documentation-retention horizon.
  rule {
    id     = "retain-6y"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }

    expiration {
      days = 2192
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail.arn
        Condition = {
          StringEquals = { "aws:SourceArn" = local.cloudtrail_arn }
        }
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = local.cloudtrail_arn
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.cloudtrail.arn, "${aws_s3_bucket.cloudtrail.arn}/*"]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

# Management events only: the first trail's management events are free, and
# data events (S3 object-level) can be added when a PHI surface actually
# writes objects members touch.
resource "aws_cloudtrail" "main" {
  name                          = "${var.project}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail.arn

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}
