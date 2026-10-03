variable "name" {
  description = "Instance identifier, for example rt-staging."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the database security group."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets in at least two availability zones."
  type        = list(string)
}

variable "client_security_group_ids" {
  description = "Security groups allowed to connect, keyed by a readable name such as api or worker."
  type        = map(string)
}

variable "kms_key_arn" {
  description = "Key for storage, the master password secret and Performance Insights."
  type        = string
}

variable "engine_major_version" {
  description = "Postgres major version. Minor versions upgrade automatically."
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "Instance size. Graviton (t4g, m7g) costs less for the same work."
  type        = string
}

variable "allocated_storage_gb" {
  description = "Starting storage."
  type        = number
  default     = 20
}

variable "max_allocated_storage_gb" {
  description = "Storage grows on its own up to this size."
  type        = number
  default     = 100
}

variable "database_name" {
  description = "Database created on first boot."
  type        = string
}

variable "master_username" {
  description = "Admin user. Its password is managed by RDS."
  type        = string
}

variable "multi_az" {
  description = "Standby in a second zone with automatic failover. Required in production."
  type        = bool
}

variable "backup_retention_days" {
  description = "Days of point-in-time recovery."
  type        = number
  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "Keep at least 7 days of backups."
  }
}

variable "deletion_protection" {
  description = "Blocks deleting the instance until this is switched off."
  type        = bool
  default     = true
}
