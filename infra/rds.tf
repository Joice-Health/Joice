# Postgres 17 on RDS. HIPAA-ready posture baked in from day one (encryption at
# rest can't be retrofitted without a snapshot-restore migration): storage
# encrypted, TLS forced, 7-day backups, deletion protection.

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-rds"
  description = "RDS Postgres - ingress from the API tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from API tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_parameter_group" "main" {
  name   = "${var.project}-pg17"
  family = "postgres17"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "random_password" "db" {
  length  = 32
  special = false # keep the DATABASE_URL free of characters needing escaping
}

resource "aws_db_instance" "main" {
  identifier     = "${var.project}-db"
  engine         = "postgres"
  engine_version = "17"
  instance_class = var.db_instance_class

  db_name  = var.project
  username = var.project
  password = random_password.db.result

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  publicly_accessible    = false
  multi_az               = false # flip for Phase 1 / PHI

  backup_retention_period   = 7
  delete_automated_backups  = true
  deletion_protection       = true
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${var.project}-db-final"

  auto_minor_version_upgrade = true
  apply_immediately          = true
}

# Full connection string as a single secret so the ECS task definition can map
# it straight to the DATABASE_URL env var the app already expects.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project}/database-url"
  recovery_window_in_days = 0 # allow clean re-creates during Phase 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = format(
    "postgresql://%s:%s@%s/%s?sslmode=require",
    aws_db_instance.main.username,
    random_password.db.result,
    aws_db_instance.main.endpoint, # host:port
    aws_db_instance.main.db_name,
  )
}
