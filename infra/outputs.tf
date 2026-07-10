output "cloudfront_url" {
  description = "Public site URL (set as CLOUDFRONT_URL repo variable for CI)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
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

output "github_repo_variables" {
  description = "Paste-ready list of GitHub repo Variables for the deploy workflow."
  value       = <<-EOT
    AWS_REGION=${var.region}
    AWS_ROLE_ARN=${var.github_repository != "" ? aws_iam_role.github_actions[0].arn : "<set github_repository and re-apply>"}
    CLOUDFRONT_URL=https://${aws_cloudfront_distribution.main.domain_name}
    ECR_WEB=${aws_ecr_repository.app["web"].repository_url}
    ECR_API=${aws_ecr_repository.app["api"].repository_url}
    ECS_CLUSTER=${aws_ecs_cluster.main.name}
    ECS_SERVICE_WEB=${aws_ecs_service.web.name}
    ECS_SERVICE_API=${aws_ecs_service.api.name}
  EOT
}
