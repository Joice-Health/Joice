output "site_url" {
  description = "Canonical public site URL (set as CLOUDFRONT_URL repo variable for CI)."
  value       = local.canonical_url
}

output "cloudfront_url" {
  description = "CloudFront default domain (still works; redirects to the canonical domain)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "nameservers" {
  description = "Set these NS records at each domain's registrar."
  value       = { for zone, z in aws_route53_zone.main : zone => z.name_servers }
}

output "alb_dns" {
  description = "ALB DNS (direct requests return 403 by design — origin lock)."
  value       = aws_lb.main.dns_name
}

output "ecr_web" {
  description = "Web image repository URL."
  value       = aws_ecr_repository.app["web"].repository_url
}

output "ecr_api" {
  description = "API image repository URL."
  value       = aws_ecr_repository.app["api"].repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_web" {
  value = aws_ecs_service.web.name
}

output "ecs_service_api" {
  value = aws_ecs_service.api.name
}

output "gh_actions_role_arn" {
  description = "IAM role for GitHub Actions OIDC (empty if github_repository not set)."
  value       = var.github_repository != "" ? aws_iam_role.github_actions[0].arn : ""
}

output "db_endpoint" {
  description = "RDS endpoint (private; reachable only from API tasks)."
  value       = aws_db_instance.main.endpoint
}

output "notes_bucket" {
  description = "S3 bucket for the RAG source notes (upload target for the approved vault)."
  value       = aws_s3_bucket.notes.bucket
}

output "labs_bucket" {
  description = "S3 bucket for member lab uploads (PHI; consumed by the story 5.3 upload scaffold)."
  value       = aws_s3_bucket.labs.bucket
}

output "ingest_run_task_command" {
  description = "Paste-ready command to run the one-off RAG ingestion task."
  value       = "aws ecs run-task --cluster ${aws_ecs_cluster.main.name} --task-definition ${aws_ecs_task_definition.ingest.family} --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[${join(",", aws_subnet.app[*].id)}],securityGroups=[${aws_security_group.brain.id}],assignPublicIp=DISABLED}'"
}

# The eval reuses the BRAIN task definition (it needs full Bedrock access and
# the database, exactly what that task role has) with a command override.
# Results land in the /ecs/joice-brain log group: aws logs tail /ecs/joice-brain --since 15m
output "eval_retrieval_run_task_command" {
  description = "Paste-ready command for the cheap retrieval-only eval (Titan embeddings, cents)."
  value       = "aws ecs run-task --cluster ${aws_ecs_cluster.main.name} --task-definition ${aws_ecs_task_definition.brain.family} --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[${join(",", aws_subnet.app[*].id)}],securityGroups=[${aws_security_group.brain.id}],assignPublicIp=DISABLED}' --overrides '{\"containerOverrides\":[{\"name\":\"brain\",\"command\":[\"bun\",\"apps/brain/scripts/eval.ts\"]}]}'"
}

output "eval_full_tools_run_task_command" {
  description = "Paste-ready command for the full eval through the tool loop (real model answers, still cents)."
  value       = "aws ecs run-task --cluster ${aws_ecs_cluster.main.name} --task-definition ${aws_ecs_task_definition.brain.family} --launch-type FARGATE --network-configuration 'awsvpcConfiguration={subnets=[${join(",", aws_subnet.app[*].id)}],securityGroups=[${aws_security_group.brain.id}],assignPublicIp=DISABLED}' --overrides '{\"containerOverrides\":[{\"name\":\"brain\",\"command\":[\"bun\",\"apps/brain/scripts/eval.ts\",\"--full\",\"--tools\"]}]}'"
}

output "github_repo_variables" {
  description = "Paste-ready list of GitHub repo Variables for the deploy workflow."
  value       = <<-EOT
    AWS_REGION=${var.region}
    AWS_ROLE_ARN=${var.github_repository != "" ? aws_iam_role.github_actions[0].arn : "<set github_repository and re-apply>"}
    CLOUDFRONT_URL=${local.canonical_url}
    ECR_WEB=${aws_ecr_repository.app["web"].repository_url}
    ECR_API=${aws_ecr_repository.app["api"].repository_url}
    ECR_BRAIN=${aws_ecr_repository.app["brain"].repository_url}
    ECS_CLUSTER=${aws_ecs_cluster.main.name}
    ECS_SERVICE_WEB=${aws_ecs_service.web.name}
    ECS_SERVICE_API=${aws_ecs_service.api.name}
    ECS_SERVICE_BRAIN=${aws_ecs_service.brain.name}
    ECS_TASK_MIGRATE=${aws_ecs_task_definition.migrate.family}
    SUBNET_IDS=${join(",", aws_subnet.app[*].id)}
    BRAIN_SG_ID=${aws_security_group.brain.id}
    CLERK_PUBLISHABLE_KEY=${var.clerk_publishable_key != "" ? var.clerk_publishable_key : "<set clerk_publishable_key and re-apply>"}
  EOT
}

output "alerts_topic_arn" {
  description = "SNS topic alarms publish to. Empty until alert_email is set — see README § Alerting."
  value       = local.alerting ? aws_sns_topic.alerts[0].arn : ""
}
