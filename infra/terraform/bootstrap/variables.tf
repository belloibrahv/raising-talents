variable "aws_account_id" {
  description = "Account to bootstrap."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id)) && var.aws_account_id != "000000000000"
    error_message = "Set the real 12-digit account id."
  }
}

variable "aws_region" {
  description = "Region for the state bucket and key."
  type        = string
  default     = "eu-west-1"
}

variable "github_repository" {
  description = "owner/name of the repository allowed to assume the CI roles."
  type        = string
  default     = "belloibrahv/raising-talents"
}

variable "environments" {
  description = "Environments that get plan, apply and deploy roles."
  type        = list(string)
  default     = ["staging"]
}
