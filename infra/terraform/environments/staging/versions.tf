terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.67"
    }
  }

  # The bucket is passed at init: tofu init -backend-config="bucket=raising-talents-tofu-state-<account id>"
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    kms_key_id   = "alias/raising-talents-tofu-state"
    use_lockfile = true
  }

  # OpenTofu encrypts state and plan files before they leave the machine. Reading the
  # bucket is not enough to read the state: the KMS key is needed as well.
  encryption {
    key_provider "aws_kms" "state" {
      kms_key_id = "alias/raising-talents-tofu-state"
      region     = "eu-west-1"
      key_spec   = "AES_256"
    }
    method "aes_gcm" "state" {
      keys = key_provider.aws_kms.state
    }
    state {
      method   = method.aes_gcm.state
      enforced = true
    }
    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}
