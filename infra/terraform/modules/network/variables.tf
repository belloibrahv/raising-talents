variable "name" {
  description = "Prefix for every resource, for example rt-staging."
  type        = string
}

variable "cidr_block" {
  description = "VPC address range. Each subnet gets a /24 from it."
  type        = string
}

variable "az_count" {
  description = "Availability zones to spread across. Two is the minimum for a load balancer and Multi-AZ databases."
  type        = number
  default     = 2
  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "Use two or three availability zones."
  }
}

variable "single_nat_gateway" {
  description = "One NAT gateway for all zones. Cheaper, but one zone failing cuts outbound traffic. Use false in production."
  type        = bool
}

variable "kms_key_arn" {
  description = "Key that encrypts the flow log group."
  type        = string
}

variable "flow_log_retention_days" {
  description = "Days to keep VPC flow logs."
  type        = number
  default     = 90
}
