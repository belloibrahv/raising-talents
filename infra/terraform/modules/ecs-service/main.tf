data "aws_region" "current" {}

locals {
  has_load_balancer = var.load_balancer != null
  environment       = [for key in sort(keys(var.environment)) : { name = key, value = var.environment[key] }]
  secrets           = [for key in sort(keys(var.secrets)) : { name = key, valueFrom = var.secrets[key] }]
  # Secret references may point at one JSON key (arn:key::). IAM needs the bare secret ARN.
  secret_arns = distinct([for reference in values(var.secrets) : join(":", slice(split(":", reference), 0, 7))])
}

resource "aws_cloudwatch_log_group" "this" {
  #checkov:skip=CKV_AWS_338:Retention is a variable per environment; production sets 365 days
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

# ---------- Roles ----------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Used by ECS itself to pull the image, read this service's secrets and write logs.
resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  count = length(local.secret_arns) > 0 ? 1 : 0
  statement {
    sid       = "ReadOnlyThisServicesSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.secret_arns
  }
  statement {
    sid       = "DecryptSecrets"
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  count  = length(local.secret_arns) > 0 ? 1 : 0
  name   = "read-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets[0].json
}

# Used by the application code. Starts empty; each service adds only what it calls.
resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy" "task" {
  count  = var.task_policy_json == null ? 0 : 1
  name   = "application"
  role   = aws_iam_role.task.id
  policy = var.task_policy_json
}

# ---------- Network ----------

resource "aws_security_group" "this" {
  name        = var.name
  description = "Tasks of ${var.name}"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "from_load_balancer" {
  count                        = local.has_load_balancer ? 1 : 0
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = var.load_balancer.security_group_id
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  description                  = "From the load balancer only"
}

# Outbound is limited to what the application needs: HTTPS for AWS APIs, Sentry,
# Grafana and the breached-password check; Postgres and Valkey inside the VPC.
resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS to AWS and third-party APIs"
}

resource "aws_vpc_security_group_egress_rule" "in_vpc" {
  for_each          = toset(["5432", "6379"])
  security_group_id = aws_security_group.this.id
  cidr_ipv4         = var.vpc_cidr_block
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  description       = each.value == "5432" ? "Postgres" : "Valkey"
}

# ---------- Task definition ----------

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([{
    name      = "app"
    image     = var.image
    essential = true
    command   = var.command
    user      = "65532"

    portMappings = var.container_port == null ? [] : [{ containerPort = var.container_port, protocol = "tcp" }]
    environment  = local.environment
    secrets      = local.secrets

    # Only /tmp is writable. Anything else the process tries to write is a bug or an attack.
    readonlyRootFilesystem = true
    mountPoints            = [{ sourceVolume = "tmp", containerPath = "/tmp", readOnly = false }]

    # An init process forwards SIGTERM so the graceful shutdown code runs on every deploy.
    linuxParameters = { initProcessEnabled = true }
    stopTimeout     = 30

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.this.name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "app"
        mode                  = "non-blocking"
        max-buffer-size       = "25m"
      }
    }
  }])
}

# ---------- Service ----------

resource "aws_ecs_service" "this" {
  count                   = var.create_service ? 1 : 0
  name                    = var.name
  cluster                 = var.cluster_arn
  task_definition         = aws_ecs_task_definition.this.arn
  desired_count           = var.desired_count
  platform_version        = "LATEST"
  enable_execute_command  = var.enable_execute_command
  propagate_tags          = "SERVICE"
  enable_ecs_managed_tags = true

  capacity_provider_strategy {
    capacity_provider = var.capacity_provider
    weight            = 1
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.this.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = local.has_load_balancer ? [var.load_balancer] : []
    content {
      target_group_arn = load_balancer.value.target_group_arn
      container_name   = "app"
      container_port   = var.container_port
    }
  }

  health_check_grace_period_seconds = local.has_load_balancer ? 30 : null

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # The deploy pipeline rolls out new images and autoscaling sets the count.
  # Terraform owns everything else about the service.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_appautoscaling_target" "this" {
  count              = var.create_service && var.max_count > var.min_count ? 1 : 0
  service_namespace  = "ecs"
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.this[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.min_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  count              = length(aws_appautoscaling_target.this)
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = "ecs"
  resource_id        = aws_appautoscaling_target.this[0].resource_id
  scalable_dimension = aws_appautoscaling_target.this[0].scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.cpu_target_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
