# The brain service: chat, voice, and the notes it answers from.
#
# A second Fargate service behind the same ALB. CloudFront needs no change —
# `/api/*` already forwards to the ALB with the AllViewer origin request policy
# (which is what makes the voice WebSocket work), and a listener rule at higher
# priority than the api rule peels `/api/brain/*` off to this service.
#
# Everything the brain needs from AWS (Bedrock, Transcribe, Polly) lives on its
# own task role — see iam.tf, where those permissions are simultaneously removed
# from the api role. That least-privilege split is the main security payoff of
# running it separately.

resource "aws_cloudwatch_log_group" "brain" {
  name              = "/ecs/${var.project}-brain"
  retention_in_days = 30
}

resource "aws_security_group" "brain" {
  name        = "${var.project}-brain-tasks"
  description = "Brain tasks - ingress from ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Hono from ALB"
    from_port       = 4100
    to_port         = 4100
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

resource "aws_lb_target_group" "brain" {
  name        = "${var.project}-brain"
  port        = 4100
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Voice sockets are long-lived; give an answer in flight time to finish
  # rather than cutting a member off mid-sentence on every deploy.
  deregistration_delay = 30
}

# Priority 5 — must be LOWER than the api rule's 10, because rules are evaluated
# in priority order and `/api/*` would otherwise match `/api/brain/*` first and
# send every chat request to the api service.
resource "aws_lb_listener_rule" "brain" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 5

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }

  condition {
    path_pattern {
      values = ["/api/brain/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.brain.arn
  }
}

resource "aws_ecs_task_definition" "brain" {
  family                   = "${var.project}-brain"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.brain_task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "brain"
      image     = "${aws_ecr_repository.app["brain"].repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        { containerPort = 4100, protocol = "tcp" }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "4100" },
        # Same-origin in prod, so CORS never triggers for HTTP — but the voice
        # WebSocket checks this list itself, and browsers don't preflight an
        # upgrade. This is the only thing standing in front of that socket.
        { name = "WEB_ORIGIN", value = local.canonical_url },
        # CloudFront appends the viewer address, then the ALB appends
        # CloudFront's edge — rate limiting trusts only these trailing hops.
        { name = "TRUSTED_PROXY_HOPS", value = "2" },
        { name = "RAG_MODEL", value = var.rag_model },
        { name = "BEDROCK_REGION", value = var.region },
        { name = "POLLY_VOICE_ID", value = var.polly_voice_id },
        # Storing member questions crosses the Phase-0 "marketing data only"
        # line — see docs/rag/07-compliance.md § conversation-persistence gate.
        # Do not flip this to "true" before that section's checklist is settled.
        { name = "BRAIN_PERSIST_CONVERSATIONS", value = tostring(var.persist_conversations) },
        # Recognise a signed-in member's bearer token (the companion claim on
        # sign-up) with networkless verification: the public JWT key, never the
        # Clerk secret, which this task deliberately cannot read (iam.tf).
        { name = "CLERK_PUBLISHABLE_KEY", value = var.clerk_publishable_key },
        { name = "CLERK_JWT_KEY", value = var.clerk_jwt_key },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        # Companion lead sync (profile import only — no list subscription; the
        # visitor gave an email to personalize the chat, not marketing consent).
        { name = "KLAVIYO_API_KEY", valueFrom = aws_secretsmanager_secret.klaviyo_api_key.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.brain.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "brain"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "brain" {
  name            = "${var.project}-brain"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.brain.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.brain.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.brain.arn
    container_name   = "brain"
    container_port   = 4100
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # CI drives deployments by pushing :latest and forcing a new deployment.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.brain]
}
