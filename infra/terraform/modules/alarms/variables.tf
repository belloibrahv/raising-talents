variable "name" {
  description = "Prefix, for example rt-staging."
  type        = string
}

variable "environment" {
  description = "Environment tag value the budget filters on."
  type        = string
}

variable "kms_key_arn" {
  description = "Key for the alert topic."
  type        = string
}

variable "alert_emails" {
  description = "Who gets alerts and budget warnings. Each address must confirm its subscription."
  type        = list(string)
}

variable "alb_arn_suffix" {
  description = "Load balancer, for API alarms."
  type        = string
}

variable "target_group_arn_suffix" {
  description = "API target group, for API alarms."
  type        = string
}

variable "db_instance_identifier" {
  description = "Postgres instance, for database alarms."
  type        = string
}

variable "cache_replication_group_id" {
  description = "Valkey group, for cache alarms."
  type        = string
}

variable "worker_log_group_name" {
  description = "Worker log group, for the dead-letter metric."
  type        = string
}

variable "api_5xx_per_5_minutes" {
  description = "Server errors in five minutes before alerting."
  type        = number
  default     = 10
}

variable "monthly_budget_usd" {
  description = "Monthly spend that triggers a warning."
  type        = number
}
