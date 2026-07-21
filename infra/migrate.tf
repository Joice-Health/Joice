# One-off migration task.
#
# Migrations used to run in each service's container CMD. That already raced
# whenever `desired_count` went above 1, and became untenable with two services
# booting against the same database. CI now runs this task to completion and
# checks its exit code *before* updating either service, so exactly one process
# applies a migration and neither service ever starts against a schema that
# failed to migrate.
#
# Uses the api image purely because it contains the workspace; the migration
# runner is `packages/db`, which belongs to neither service.

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/ecs/${var.project}-migrate"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.project}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_execution.arn
  # No task role: this needs the database and nothing else. The execution role
  # reads the connection string from Secrets Manager before the container runs.
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
      essential = true
      command   = ["bun", "packages/db/src/migrate.ts"]
      environment = [
        { name = "NODE_ENV", value = "production" },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.migrate.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "migrate"
        }
      }
    }
  ])
}
