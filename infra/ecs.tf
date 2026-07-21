# ECS cluster + two Fargate services. Tasks live in public subnets with public
# IPs (no NAT by design); their SGs accept traffic only from the ALB. The API
# container's CMD runs Drizzle migrations before serving (see apps/api/Dockerfile).

resource "aws_ecs_cluster" "main" {
  name = var.project

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project}-web"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}-api"
  retention_in_days = 30
}

# ---- Security groups ----

resource "aws_security_group" "web" {
  name        = "${var.project}-web-tasks"
  description = "Web tasks - ingress from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Next.js from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "api" {
  name        = "${var.project}-api-tasks"
  description = "API tasks - ingress from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Hono from ALB"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# ---- Task definitions ----

resource "random_password" "ip_hash_salt" {
  length  = 32
  special = false
}


resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.app["web"].repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = 3000, protocol = "tcp" }
      ]
      # NEXT_PUBLIC_* are inlined at image build time by CI; only server-side env here.
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "HOSTNAME", value = "0.0.0.0" },
        # Team preview gate — runtime-only, so rotating/flipping = apply, no rebuild.
        { name = "TEAM_PASSWORD", value = var.team_password },
        { name = "SITE_LAUNCHED", value = tostring(var.site_launched) },
        # Server components can't fetch the browser-relative API URL; go via CloudFront.
        { name = "API_URL_INTERNAL", value = local.canonical_url },
      ]
      secrets = [
        # Clerk session verification in middleware/server components (admin auth).
        { name = "CLERK_SECRET_KEY", valueFrom = aws_secretsmanager_secret.clerk_secret_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.web.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = 4000, protocol = "tcp" }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "4000" },
        # Same-origin in prod (CloudFront routes /api/*), so CORS never triggers;
        # set it anyway so any cross-origin caller is scoped to the real site.
        { name = "WEB_ORIGIN", value = local.canonical_url },
        { name = "IP_HASH_SALT", value = random_password.ip_hash_salt.result },
        # CloudFront appends the viewer address, then the ALB appends CloudFront's
        # edge — rate limiting trusts only these trailing hops.
        { name = "TRUSTED_PROXY_HOPS", value = "2" },
        { name = "CLERK_PUBLISHABLE_KEY", value = var.clerk_publishable_key },
        # The admin console edits the brain's settings, so it resolves them
        # against the same defaults the brain does. This service has no Bedrock
        # permissions and never calls a model — see iam.tf.
        { name = "RAG_MODEL", value = var.rag_model },
        { name = "BEDROCK_REGION", value = var.region },
        { name = "POLLY_VOICE_ID", value = var.polly_voice_id },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "CLERK_SECRET_KEY", valueFrom = aws_secretsmanager_secret.clerk_secret_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])
}

# ---- Services ----

resource "aws_ecs_service" "web" {
  name            = "${var.project}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true # no NAT; SG restricts ingress to the ALB
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # CI drives deployments by pushing :latest and forcing a new deployment.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.web]
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.api]
}

# ---- Autoscaling (target-tracking on CPU) ----

resource "aws_appautoscaling_target" "services" {
  for_each = {
    web   = aws_ecs_service.web.name
    api   = aws_ecs_service.api.name
    brain = aws_ecs_service.brain.name
  }

  max_capacity       = var.max_count
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${each.value}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = aws_appautoscaling_target.services

  name               = "${var.project}-${each.key}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = each.value.resource_id
  scalable_dimension = each.value.scalable_dimension
  service_namespace  = each.value.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
