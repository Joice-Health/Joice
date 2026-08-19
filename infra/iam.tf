# ---- ECS roles ----

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: what the ECS agent needs to start containers.
resource "aws_iam_role" "task_execution" {
  name               = "${var.project}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "read-app-secrets"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.clerk_secret_key.arn,
          aws_secretsmanager_secret.internal_api_token.arn,
          aws_secretsmanager_secret.klaviyo_api_key.arn,
        ]
      }
    ]
  })
}

# Task role: what the app itself can do at runtime.
resource "aws_iam_role" "task" {
  name               = "${var.project}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# ---- Brain task role ----
#
# Bedrock, Transcribe and Polly used to hang off the api task role, back when
# the chatbot ran inside the api service. They are here now and NOT there, which
# is the least-privilege win from splitting the services: a bug in the waitlist
# or admin console can no longer reach a model, and the brain can't touch Clerk
# secrets. Moving them is a deliberate removal, not an oversight — if a chat
# call starts failing with AccessDenied after this applies, it is running on the
# wrong task role.
resource "aws_iam_role" "brain_task" {
  name               = "${var.project}-brain-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# The brain embeds member questions (Titan) and generates answers, both via
# Bedrock so the whole AI path stays under the AWS BAA.
resource "aws_iam_role_policy" "brain_bedrock" {
  name = "invoke-bedrock-models"
  role = aws_iam_role.brain_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ]
        Resource = [
          # Claude is invoked via cross-region inference profiles (us.anthropic.*),
          # which fan out to foundation models in sibling regions — hence bedrock:*.
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-*",
          "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/*",
          "arn:aws:bedrock:${var.region}::foundation-model/amazon.titan-embed-text-v2:0",
        ]
      }
    ]
  })
}

# Voice: the brain transcribes member questions (Transcribe streaming) and
# speaks answers (Polly) — both HIPAA-eligible, audio processed in memory only.
# Neither action supports useful resource-level scoping.
resource "aws_iam_role_policy" "brain_voice" {
  name = "voice-transcribe-polly"
  role = aws_iam_role.brain_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "transcribe:StartStreamTranscription",
          "polly:SynthesizeSpeech",
        ]
        Resource = "*"
      }
    ]
  })
}

# Ingestion task role: reads the notes bucket, embeds chunks via Titan. No Claude.
resource "aws_iam_role" "ingestion_task" {
  name               = "${var.project}-ingestion-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy" "ingestion_task" {
  name = "read-notes-embed"
  role = aws_iam_role.ingestion_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.notes.arn]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${aws_s3_bucket.notes.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = ["arn:aws:bedrock:${var.region}::foundation-model/amazon.titan-embed-text-v2:0"]
      },
    ]
  })
}

# ---- GitHub Actions OIDC deploy role ----

resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_repository != "" ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"] # ignored by AWS for GitHub but required by the API
}

data "aws_iam_policy_document" "github_assume" {
  count = var.github_repository != "" ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count = var.github_repository != "" ? 1 : 0

  name               = "${var.project}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
}

resource "aws_iam_role_policy" "github_actions" {
  count = var.github_repository != "" ? 1 : 0

  name = "deploy"
  role = aws_iam_role.github_actions[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      },
      {
        Sid    = "EcsDeploy"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
        ]
        Resource = [
          aws_ecs_service.web.id,
          aws_ecs_service.api.id,
          aws_ecs_service.brain.id,
        ]
      },
      # Migrations are now a one-off task CI runs and waits on before deploying,
      # rather than a step in each container's CMD. RunTask is scoped to that
      # task definition only; DescribeTasks can't be resource-scoped usefully.
      {
        Sid      = "EcsRunMigrations"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "${aws_ecs_task_definition.migrate.arn_without_revision}:*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn }
        }
      },
      {
        Sid      = "EcsWatchTasks"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTasks"]
        Resource = "*"
        Condition = {
          ArnEquals = { "ecs:cluster" = aws_ecs_cluster.main.arn }
        }
      },
      # RunTask launches a task that assumes the execution role to pull the
      # image and read the DB secret — passing it is a separate permission.
      {
        Sid      = "PassExecutionRole"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.task_execution.arn]
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
    ]
  })
}
