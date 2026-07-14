# One-off RAG ingestion task: reads the notes bucket, chunks + embeds (Bedrock
# Titan) and writes note_chunks rows. No service, no schedule — run manually
# with the paste-ready command in `terraform output ingest_run_task_command`
# (reuses the api tasks SG so RDS admits it).
# Reuses the api image — the monorepo is already in it; only the command differs.
# Idempotent: unchanged files are skipped, so re-running after a failure is safe.

resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/ecs/${var.project}-ingest"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "ingest" {
  family                   = "${var.project}-ingest"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.ingestion_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "ingest"
      image     = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
      essential = true
      command   = ["sh", "-c", "bun apps/api/scripts/ingest.ts"]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "NOTES_BUCKET", value = aws_s3_bucket.notes.bucket },
        { name = "BEDROCK_REGION", value = var.region },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ingest.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ingest"
        }
      }
    }
  ])
}
