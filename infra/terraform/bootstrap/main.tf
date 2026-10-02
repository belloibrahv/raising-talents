locals {
  bucket_name = "raising-talents-tofu-state-${var.aws_account_id}"
  oidc_host   = "token.actions.githubusercontent.com"
}

# ---------- State ----------

resource "aws_kms_key" "state" {
  description             = "Encrypts OpenTofu state and plan files"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  # Written out so it is reviewable: the account administers the key, and IAM policies
  # (the CI roles' tofu-state policy) decide who may use it.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AccountAdministersKey"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.aws_account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
}

resource "aws_kms_alias" "state" {
  name          = "alias/raising-talents-tofu-state"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  #checkov:skip=CKV_AWS_18:State reads are already recorded by CloudTrail; access logs would duplicate them
  #checkov:skip=CKV2_AWS_62:Nothing reacts to state changes
  #checkov:skip=CKV_AWS_144:Versioned and KMS-encrypted; a second region is a production decision
  bucket = local.bucket_name
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "keep-90-days-of-history"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# ---------- GitHub Actions without stored keys ----------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "trust" {
  for_each = {
    for pair in setproduct(var.environments, ["plan", "apply", "deploy"]) : "${pair[0]}-${pair[1]}" => {
      environment = pair[0]
      purpose     = pair[1]
    }
  }
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Plans run on pull requests. Apply and deploy run only from the protected
    # GitHub environment, which can require a reviewer's approval.
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values = each.value.purpose == "plan" ? ["repo:${var.github_repository}:pull_request"] : [
        "repo:${var.github_repository}:environment:${each.value.environment}"
      ]
    }
  }
}

resource "aws_iam_role" "ci" {
  for_each             = data.aws_iam_policy_document.trust
  name                 = "raising-talents-${each.key}"
  assume_role_policy   = each.value.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "state_access" {
  statement {
    sid       = "ReadWriteState"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    sid       = "UseStateKey"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.state.arn]
  }
}

resource "aws_iam_role_policy" "state_access" {
  for_each = { for key, role in aws_iam_role.ci : key => role if !endswith(key, "-deploy") }
  name     = "tofu-state"
  role     = each.value.id
  policy   = data.aws_iam_policy_document.state_access.json
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  for_each   = { for key, role in aws_iam_role.ci : key => role if endswith(key, "-plan") }
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# Applying infrastructure needs broad rights. They are reachable only from the
# protected environment, and every apply is a reviewed plan.
resource "aws_iam_role_policy_attachment" "apply_admin" {
  #checkov:skip=CKV_AWS_274:Infrastructure apply creates IAM roles and every other resource type; access is limited by the trust policy to the protected environment
  for_each   = { for key, role in aws_iam_role.ci : key => role if endswith(key, "-apply") }
  role       = each.value.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "deploy" {
  #checkov:skip=CKV_AWS_356:ecr:GetAuthorizationToken and ecs:RegisterTaskDefinition have no resource-level permissions; every write action is scoped below
  for_each = toset(var.environments)

  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "PushImages"
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload", "ecr:DescribeImages",
      "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
    ]
    resources = ["arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/raising-talents/${each.key}/*"]
  }
  statement {
    sid       = "ReadTaskDefinitionsAndTasks"
    actions   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:DescribeTasks", "ecs:DescribeServices"]
    resources = ["*"]
  }
  statement {
    sid     = "RolloutThisEnvironment"
    actions = ["ecs:UpdateService", "ecs:RunTask"]
    resources = [
      "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:service/rt-${each.key}/*",
      "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/rt-${each.key}-*",
    ]
  }
  statement {
    sid       = "HandTaskRolesToEcs"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${var.aws_account_id}:role/rt-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  statement {
    sid       = "PublishTheWebApp"
    actions   = ["s3:PutObject", "s3:ListBucket"]
    resources = ["arn:aws:s3:::rt-${each.key}-web-${var.aws_account_id}", "arn:aws:s3:::rt-${each.key}-web-${var.aws_account_id}/*"]
  }
  statement {
    # Distribution ids are not known when this role is made; invalidating a cache is harmless.
    sid       = "RefreshTheWebAppCache"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = ["arn:aws:cloudfront::${var.aws_account_id}:distribution/*"]
  }
  statement {
    sid       = "ReadMigrationLogs"
    actions   = ["logs:GetLogEvents", "logs:FilterLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/rt-${each.key}-migrate:*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  for_each = toset(var.environments)
  name     = "deploy"
  role     = aws_iam_role.ci["${each.key}-deploy"].id
  policy   = data.aws_iam_policy_document.deploy[each.key].json
}
