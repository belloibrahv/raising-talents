resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = var.kms_key_arn
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  actions = [aws_sns_topic.alerts.arn]
  alarms = {
    api-5xx = {
      description = "The API answered with server errors. Runbook: docs/runbooks (check Sentry first)."
      namespace   = "AWS/ApplicationELB"
      metric      = "HTTPCode_Target_5XX_Count"
      statistic   = "Sum"
      threshold   = var.api_5xx_per_5_minutes
      comparison  = "GreaterThanThreshold"
      period      = 300
      evaluations = 1
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      missing     = "notBreaching"
    }
    api-slow = {
      description = "API p95 latency is above 1 second, twice the design's budget."
      namespace   = "AWS/ApplicationELB"
      metric      = "TargetResponseTime"
      statistic   = null
      extended    = "p95"
      threshold   = 1
      comparison  = "GreaterThanThreshold"
      period      = 300
      evaluations = 2
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      missing     = "notBreaching"
    }
    api-unhealthy = {
      description = "An API task is failing its readiness check (Postgres or Valkey unreachable)."
      namespace   = "AWS/ApplicationELB"
      metric      = "UnHealthyHostCount"
      statistic   = "Maximum"
      threshold   = 0
      comparison  = "GreaterThanThreshold"
      period      = 60
      evaluations = 5
      dimensions  = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      missing     = "breaching"
    }
    database-cpu = {
      description = "Postgres CPU above 80 percent for 15 minutes."
      namespace   = "AWS/RDS"
      metric      = "CPUUtilization"
      statistic   = "Average"
      threshold   = 80
      comparison  = "GreaterThanThreshold"
      period      = 300
      evaluations = 3
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      missing     = "notBreaching"
    }
    database-storage = {
      description = "Postgres has less than 5 GB free. Storage autoscaling may be at its limit."
      namespace   = "AWS/RDS"
      metric      = "FreeStorageSpace"
      statistic   = "Minimum"
      threshold   = 5368709120
      comparison  = "LessThanThreshold"
      period      = 300
      evaluations = 1
      dimensions  = { DBInstanceIdentifier = var.db_instance_identifier }
      missing     = "notBreaching"
    }
    cache-memory = {
      description = "Valkey memory above 80 percent. Rate limiting and queues need headroom."
      namespace   = "AWS/ElastiCache"
      metric      = "DatabaseMemoryUsagePercentage"
      statistic   = "Maximum"
      threshold   = 80
      comparison  = "GreaterThanThreshold"
      period      = 300
      evaluations = 2
      dimensions  = { ReplicationGroupId = var.cache_replication_group_id }
      missing     = "notBreaching"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  extended_statistic  = lookup(each.value, "extended", null)
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison
  period              = each.value.period
  evaluation_periods  = each.value.evaluations
  dimensions          = each.value.dimensions
  treat_missing_data  = each.value.missing
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# Matches the worker's log line for an event that failed ten times (docs/runbooks/outbox-dead-letter.md).
resource "aws_cloudwatch_log_metric_filter" "dead_letter" {
  name           = "${var.name}-outbox-dead-letter"
  log_group_name = var.worker_log_group_name
  pattern        = "{ $.msg = \"Outbox event dead-lettered after maximum attempts\" }"
  metric_transformation {
    name          = "OutboxDeadLetters"
    namespace     = "RaisingTalents/${var.name}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "dead_letter" {
  alarm_name          = "${var.name}-outbox-dead-letter"
  alarm_description   = "An outbox event failed ten times. Runbook: docs/runbooks/outbox-dead-letter.md"
  namespace           = "RaisingTalents/${var.name}"
  metric_name         = "OutboxDeadLetters"
  statistic           = "Sum"
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = [format("user:Environment$%s", var.environment)]
  }

  # Warn on the forecast, before the money is spent.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }
}
