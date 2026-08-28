# Conversation retention: a scheduled ECS task that deletes chat threads idle
# longer than the retention window (messages cascade). A Before-PHI checklist
# item built ahead of need — the schedule is DISABLED until conversation
# persistence itself is on (var.persist_conversations), because until then
# there is nothing to expire.
#
# Reuses the brain image (the script ships with it) and the brain tasks SG so
# RDS admits it. The task role is deliberately bare: retention needs the
# database and nothing else from AWS.

resource "aws_cloudwatch_log_group" "retention" {
  name              = "/ecs/${var.project}-retention"
  retention_in_days = 30
}

resource "aws_iam_role" "retention_task" {
  name = "${var.project}-retention-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  # No policies attached: DATABASE_URL is injected by the execution role; the
  # task itself talks to nothing in AWS.
}

resource "aws_ecs_task_definition" "retention" {
  family                   = "${var.project}-retention"
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
      name      = "retention"
      image     = "${aws_ecr_repository.app["brain"].repository_url}:${var.image_tag}"
      essential = true
      command   = ["bun", "apps/brain/scripts/retention.ts"]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "BRAIN_RETENTION_DAYS", value = tostring(var.brain_retention_days) },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.retention.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "retention"
        }
      }
    }
  ])
}

# EventBridge Scheduler needs its own role to launch the task.
resource "aws_iam_role" "retention_scheduler" {
  name = "${var.project}-retention-scheduler"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      # Confused-deputy guard AWS recommends for EventBridge Scheduler.
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
      }
    }]
  })
}

resource "aws_iam_role_policy" "retention_scheduler" {
  name = "run-retention-task"
  role = aws_iam_role.retention_scheduler.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "ecs:RunTask"
        # Revision-pinned on purpose: the schedule target below references the
        # same attribute, so terraform updates both together on every revision.
        Resource = aws_ecs_task_definition.retention.arn
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

resource "aws_scheduler_schedule" "retention" {
  name = "${var.project}-retention-daily"
  # Always on, deliberately: a nightly run against an empty table is free, and
  # gating on persist_conversations would stop the sweeper at exactly the
  # moment persistence gets turned OFF — orphaning whatever accumulated. The
  # only prerequisite is the brain image containing retention.ts (merge + CI
  # build before the first apply of this file).
  state = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  # 04:10 UTC daily — quiet hours for a US-hours audience.
  schedule_expression = "cron(10 4 * * ? *)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.retention_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.retention.arn
      launch_type         = "FARGATE"

      network_configuration {
        subnets          = aws_subnet.app[*].id
        security_groups  = [aws_security_group.brain.id]
        assign_public_ip = false
      }
    }
  }
}
