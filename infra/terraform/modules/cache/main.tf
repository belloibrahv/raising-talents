# A fresh token is generated only when auth_token_version changes. It is sent to
# ElastiCache and Secrets Manager through write-only arguments and never stored in state.
ephemeral "aws_secretsmanager_random_password" "auth_token" {
  password_length     = 64
  exclude_punctuation = true
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "this" {
  name        = "${var.name}-valkey"
  description = "Valkey, reachable only from the application security groups"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "from_clients" {
  for_each                     = var.client_security_group_ids
  security_group_id            = aws_security_group.this.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "Valkey from ${each.key}"
}

resource "aws_cloudwatch_log_group" "slow_log" {
  #checkov:skip=CKV_AWS_338:Retention is a variable per environment; a year of slow logs adds cost without use
  name              = "/aws/elasticache/${var.name}/slow-log"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn
}

resource "aws_elasticache_replication_group" "this" {
  #checkov:skip=CKV_AWS_31:Transit encryption is required and the auth token is set through auth_token_wo, which this check does not read
  #checkov:skip=CKV2_AWS_50:Failover follows node_count: staging runs one node, production sets two or more
  replication_group_id = var.name
  description          = "Rate limits, queues and realtime presence for ${var.name}"
  engine               = "valkey"
  engine_version       = var.engine_version
  node_type            = var.node_type
  port                 = 6379

  num_cache_clusters         = var.node_count
  automatic_failover_enabled = var.node_count > 1
  multi_az_enabled           = var.node_count > 1

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.this.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"
  auth_token_wo              = ephemeral.aws_secretsmanager_random_password.auth_token.random_password
  auth_token_wo_version      = var.auth_token_version

  snapshot_retention_limit   = var.snapshot_retention_days
  snapshot_window            = "00:00-01:00"
  maintenance_window         = "sun:03:30-sun:04:30"
  auto_minor_version_upgrade = true
  apply_immediately          = false

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }
}

resource "aws_secretsmanager_secret" "url" {
  #checkov:skip=CKV2_AWS_57:Rotated by raising auth_token_version, which updates ElastiCache and this secret together
  name                    = "${var.name}/redis-url"
  description             = "REDIS_URL for the API and worker, including the auth token"
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "url" {
  secret_id                = aws_secretsmanager_secret.url.id
  secret_string_wo         = "rediss://:${ephemeral.aws_secretsmanager_random_password.auth_token.random_password}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  secret_string_wo_version = var.auth_token_version
}
