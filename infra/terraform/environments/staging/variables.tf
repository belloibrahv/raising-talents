variable "aws_account_id" {
  description = "Account this environment lives in. The provider refuses to touch any other."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Set the real 12-digit staging account id."
  }
}

variable "aws_region" {
  description = "Region for everything except CloudFront certificates. See ADR-015."
  type        = string
}

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
}

variable "root_domain" {
  description = "Domain whose Route 53 hosted zone already exists, for example raisingtalents.app."
  type        = string
}

variable "subdomain" {
  description = "Prefix for this environment's hosts, for example staging gives api.staging.<root>."
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC address range."
  type        = string
}

variable "single_nat_gateway" {
  description = "One NAT gateway for all zones (cheaper, less resilient)."
  type        = bool
}

variable "image_tag" {
  description = "Image the task definitions start with. Releases are rolled out by the deploy workflow."
  type        = string
  default     = "bootstrap"
}

variable "database" {
  description = "Postgres sizing and resilience."
  type = object({
    instance_class        = string
    multi_az              = bool
    backup_retention_days = number
  })
}

variable "cache" {
  description = "Valkey sizing."
  type = object({
    node_type  = string
    node_count = number
  })
}

variable "api" {
  description = "API service sizing and scaling."
  type = object({
    cpu       = number
    memory    = number
    min_count = number
    max_count = number
  })
}

variable "worker" {
  description = "Worker service sizing."
  type = object({
    cpu               = number
    memory            = number
    count             = number
    capacity_provider = string
  })
}

variable "otlp_endpoint" {
  description = "Grafana Cloud OTLP gateway. Empty turns tracing off. Its token goes in the otlp secret."
  type        = string
  default     = ""
}

variable "trace_sample_ratio" {
  description = "Share of new traces kept, from 0 to 1."
  type        = string
  default     = "1.0"
}

variable "alert_emails" {
  description = "Who receives alarms and budget warnings."
  type        = list(string)
  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "Add at least one address: alarms nobody receives protect nobody."
  }
}

variable "monthly_budget_usd" {
  description = "Monthly spend that triggers a warning."
  type        = number
}

variable "web_error_reporting_origin" {
  description = "Sentry ingest origin for the web app's browser errors. Empty until a web Sentry project exists."
  type        = string
  default     = ""
}
