# Onboarding retention: a nightly scheduled ECS task that abandons idle intake
# sessions and purges unclaimed ones past the TTL, with their answers,
# observations and projected profiles (apps/api/scripts/onboarding-retention.ts;
# policy in docs/onboarding/07-compliance.md). Registered sessions never expire.
#
# Mirrors retention.tf (the brain's sweep): the api image ships the script, the
# api task SG admits it to RDS, and the task role is bare. ENABLED from day one,
# unlike the brain's: intake sessions exist as soon as the onboarding flag is
# on, and a sweep of an empty table is free. First run after an apply is worth
# watching with ONBOARDING_RETENTION_DRY_RUN=true via a manual run-task.

resource "aws_cloudwatch_log_group" "onboarding_retention" {
  name              = "/ecs/${var.project}-onboarding-retention"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "onboarding_retention" {
  family                   = "${var.project}-onboarding-retention"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.retention_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "onboarding-retention"
      image     = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
      essential = true
      command   = ["bun", "apps/api/scripts/onboarding-retention.ts"]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "ONBOARDING_SESSION_IDLE_DAYS", value = tostring(var.onboarding_session_idle_days) },
        { name = "ONBOARDING_SESSION_TTL_DAYS", value = tostring(var.onboarding_session_ttl_days) },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.onboarding_retention.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "onboarding-retention"
        }
      }
    }
  ])
}

resource "aws_iam_role_policy" "onboarding_retention_scheduler" {
  name = "run-onboarding-retention-task"
  role = aws_iam_role.retention_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = aws_ecs_task_definition.onboarding_retention.arn
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn }
        }
      },
      {
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [aws_iam_role.task_execution.arn, aws_iam_role.retention_task.arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      }
    ]
  })
}

resource "aws_scheduler_schedule" "onboarding_retention" {
  name  = "${var.project}-onboarding-retention-daily"
  state = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  # 04:40 UTC daily, offset from the brain's 04:10 sweep so the two never contend.
  schedule_expression = "cron(40 4 * * ? *)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.retention_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.onboarding_retention.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = aws_subnet.app[*].id
        security_groups  = [aws_security_group.api.id]
        assign_public_ip = false
      }
    }
  }
}
