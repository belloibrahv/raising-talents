provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "raising-talents"
      Environment = var.environment
      ManagedBy   = "opentofu"
      Repository  = "github.com/belloibrahv/raising-talents"
    }
  }
}

# CloudFront only accepts certificates from us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "raising-talents"
      Environment = var.environment
      ManagedBy   = "opentofu"
      Repository  = "github.com/belloibrahv/raising-talents"
    }
  }
}
