# VPC endpoints (Before-PHI checklist). Two deliberate picks, not a full set:
#
#   S3 gateway  - free, and carries the heaviest flows: ECR image layers (stored
#                 in S3) plus the notes/labs buckets. On the public route table
#                 too, so image pulls skip the internet path even today.
#   Bedrock     - keeps the AI data path (member questions, note chunks) on the
#                 AWS backbone instead of traversing the NAT and public internet;
#                 docs/rag/07-compliance.md names this as a PHI requirement.
#                 Cross-region inference profiles (us.anthropic.*) enter here
#                 and fan out on the backbone.
#
# ECR-api/dkr, CloudWatch Logs, Secrets Manager, Transcribe and Polly endpoints
# are consciously skipped: the NAT covers them (TLS, AWS-API traffic) and the
# four interface endpoints would add ~$29/mo for marginal gain. Revisit if NAT
# data charges grow.

resource "aws_security_group" "vpc_endpoints" {
  name        = "${var.project}-vpc-endpoints"
  description = "Interface endpoints - HTTPS from inside the VPC"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from the VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.app.id, aws_route_table.public.id]

  tags = { Name = "${var.project}-s3" }
}

# private_dns_enabled flips bedrock-runtime resolution VPC-wide the moment this
# exists - safe even for tasks still in public subnets, because their source
# IPs are inside var.vpc_cidr and the endpoint SG admits them.
resource "aws_vpc_endpoint" "bedrock_runtime" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.bedrock-runtime"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.app[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = { Name = "${var.project}-bedrock-runtime" }
}
