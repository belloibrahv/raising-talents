variable "name" {
  description = "Prefix, for example rt-staging."
  type        = string
}

variable "account_id" {
  description = "AWS account id, used to keep the log bucket name unique."
  type        = string
}

variable "vpc_id" {
  description = "VPC id."
  type        = string
}

variable "vpc_cidr_block" {
  description = "VPC range, for the load balancer's outbound rule."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets in at least two zones."
  type        = list(string)
}

variable "domain_name" {
  description = "API host name, for example api.staging.raisingtalents.app."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 zone the domain belongs to."
  type        = string
}

variable "kms_key_arn" {
  description = "Key for the WAF log group."
  type        = string
}

variable "target_port" {
  description = "Port the API container listens on."
  type        = number
  default     = 3000
}

variable "deletion_protection" {
  description = "Blocks deleting the load balancer until switched off."
  type        = bool
  default     = true
}

variable "requests_per_5_minutes" {
  description = "Requests one IP may send in five minutes before WAF blocks it."
  type        = number
  default     = 3000
}

variable "auth_requests_per_5_minutes" {
  description = "Requests to /v1/auth/ one IP may send in five minutes."
  type        = number
  default     = 100
}

variable "access_log_retention_days" {
  description = "Days to keep load balancer access logs."
  type        = number
  default     = 90
}

variable "waf_log_retention_days" {
  description = "Days to keep WAF logs."
  type        = number
  default     = 90
}
