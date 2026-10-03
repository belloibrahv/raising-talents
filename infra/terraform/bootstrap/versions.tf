terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }
  # Bootstrap creates the state bucket, so its own state starts local. After the first
  # apply, migrate it into the bucket: see infra/terraform/README.md.
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags {
    tags = {
      Project   = "raising-talents"
      ManagedBy = "opentofu"
      Stack     = "bootstrap"
    }
  }
}
