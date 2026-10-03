variable "name" {
  description = "Prefix, for example rt-staging."
  type        = string
}

variable "account_id" {
  description = "AWS account id, keeps the bucket name unique."
  type        = string
}

variable "domain_name" {
  description = "Media host name, for example media.staging.raisingtalents.app."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate in us-east-1, which CloudFront requires."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 zone for the media record."
  type        = string
}

variable "deleted_media_retention_days" {
  description = "Days a replaced or deleted file can still be restored."
  type        = number
  default     = 30
}
