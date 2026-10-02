variable "name" {
  description = "Replication group id, for example rt-staging."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the cache security group."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets."
  type        = list(string)
}

variable "client_security_group_ids" {
  description = "Security groups allowed to connect, keyed by a readable name."
  type        = map(string)
}

variable "kms_key_arn" {
  description = "Key for data at rest, the URL secret and the slow log."
  type        = string
}

variable "engine_version" {
  description = "Valkey version."
  type        = string
  default     = "8.0"
}

variable "node_type" {
  description = "Node size."
  type        = string
}

variable "node_count" {
  description = "1 for a single node. 2 or more adds replicas and automatic failover."
  type        = number
}

variable "auth_token_version" {
  description = "Raise by one to rotate the auth token. The API and worker pick up the new URL on their next deploy."
  type        = number
  default     = 1
}

variable "snapshot_retention_days" {
  description = "Days of daily snapshots."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "Days to keep the slow log."
  type        = number
  default     = 30
}
