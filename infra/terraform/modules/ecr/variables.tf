variable "name" {
  description = "Repository name, for example raising-talents/api."
  type        = string
}

variable "kms_key_arn" {
  description = "Key that encrypts stored images."
  type        = string
}

variable "keep_images" {
  description = "Number of images to keep."
  type        = number
  default     = 30
}
