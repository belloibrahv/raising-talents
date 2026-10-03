variable "name" {
  description = "Service and task family name, for example rt-staging-api."
  type        = string
}

variable "create_service" {
  description = "False for one-off tasks such as migrations: only the task definition is created."
  type        = bool
  default     = true
}

variable "cluster_arn" {
  description = "ECS cluster ARN."
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name, for autoscaling."
  type        = string
}

variable "image" {
  description = "Image the task definition starts with. The deploy pipeline replaces it on every release."
  type        = string
}

variable "command" {
  description = "Arguments for node, which is the image's entrypoint."
  type        = list(string)
}

variable "cpu" {
  description = "CPU units (1024 is one vCPU)."
  type        = number
}

variable "memory" {
  description = "Memory in MiB."
  type        = number
}

variable "environment" {
  description = "Plain settings. Never put secrets here."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Settings read from Secrets Manager at start, as NAME = secret ARN or ARN:json-key::."
  type        = map(string)
  default     = {}
}

variable "kms_key_arn" {
  description = "Key for the log group and secrets."
  type        = string
}

variable "log_retention_days" {
  description = "Days to keep application logs."
  type        = number
  default     = 30
}

variable "task_policy_json" {
  description = "IAM policy for the application code, or null for none."
  type        = string
  default     = null
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC range, for outbound rules to Postgres and Valkey."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets the tasks run in."
  type        = list(string)
}

variable "container_port" {
  description = "Port the container listens on, or null for services without HTTP."
  type        = number
  default     = null
}

variable "load_balancer" {
  description = "Target group and load balancer security group, or null for services without HTTP."
  type = object({
    target_group_arn  = string
    security_group_id = string
  })
  default = null
}

variable "capacity_provider" {
  description = "FARGATE, or FARGATE_SPOT for work that tolerates a two-minute interruption notice."
  type        = string
  default     = "FARGATE"
  validation {
    condition     = contains(["FARGATE", "FARGATE_SPOT"], var.capacity_provider)
    error_message = "Use FARGATE or FARGATE_SPOT."
  }
}

variable "desired_count" {
  description = "Tasks to start with."
  type        = number
  default     = 1
}

variable "min_count" {
  description = "Fewest tasks autoscaling keeps."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Most tasks autoscaling adds. Equal to min_count turns autoscaling off."
  type        = number
  default     = 1
}

variable "cpu_target_percent" {
  description = "Average CPU autoscaling aims for."
  type        = number
  default     = 60
}

variable "enable_execute_command" {
  description = "Allows a shell-less ECS Exec session for debugging. Off unless needed."
  type        = bool
  default     = false
}
