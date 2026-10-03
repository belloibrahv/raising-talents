variable "name" {
  description = "Prefix, for example rt-staging."
  type        = string
}

variable "account_id" {
  description = "AWS account id, keeps the bucket name unique."
  type        = string
}

variable "domain_name" {
  description = "Web app host name, for example app.staging.raisingtalents.app."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate in us-east-1, which CloudFront requires."
  type        = string
}

variable "hosted_zone_id" {
  description = "Route 53 zone for the app record."
  type        = string
}

variable "api_url" {
  description = "The API's address. The only API the page may call."
  type        = string
}

variable "media_url" {
  description = "Where processed images are served from."
  type        = string
}

variable "upload_origins" {
  description = "Where the browser sends uploads: the media bucket's regional address, for presigned POST."
  type        = list(string)
}
