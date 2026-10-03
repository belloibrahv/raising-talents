data "aws_caller_identity" "current" {}

data "aws_route53_zone" "root" {
  name = var.root_domain
}

locals {
  name         = "rt-${var.environment}"
  account_id   = data.aws_caller_identity.current.account_id
  env_domain   = "${var.subdomain}.${var.root_domain}"
  api_domain   = "api.${local.env_domain}"
  media_domain = "media.${local.env_domain}"
  email_from   = "no-reply@${local.env_domain}"
  image        = "${module.ecr.repository_url}:${var.image_tag}"
  node_args    = ["--import", "./dist/instrument.js"]
}

# ---------- Encryption key ----------

data "aws_iam_policy_document" "kms" {
  #checkov:skip=CKV_AWS_111:Key policy: Resource "*" means this key, the only form key policies accept
  #checkov:skip=CKV_AWS_356:Key policy: Resource "*" means this key, the only form key policies accept
  #checkov:skip=CKV_AWS_109:Key policy: the account root must administer the key or it becomes unmanageable
  statement {
    sid       = "AccountAdministersKey"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.account_id}:root"]
    }
  }

  statement {
    sid       = "CloudWatchLogsEncryptsThisEnvironmentsLogs"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:*"]
    }
  }

  statement {
    sid       = "CloudWatchAlarmsPublishToEncryptedTopic"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "env" {
  description             = "Encrypts ${local.name} data: database, cache, secrets, logs, images"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "env" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.env.key_id
}

# ---------- Network, images, cluster ----------

module "network" {
  source             = "../../modules/network"
  name               = local.name
  cidr_block         = var.vpc_cidr_block
  single_nat_gateway = var.single_nat_gateway
  kms_key_arn        = aws_kms_key.env.arn
}

module "ecr" {
  source      = "../../modules/ecr"
  name        = "raising-talents/${var.environment}/api"
  kms_key_arn = aws_kms_key.env.arn
}

resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ---------- Application secrets ----------
# Created empty. Values are set once by an engineer (docs/runbooks/staging-first-deploy.md)
# and never pass through this code or the state file.

resource "aws_secretsmanager_secret" "app" {
  #checkov:skip=CKV2_AWS_57:JWT keys rotate every 90 days by runbook with an overlap window; pepper, Sentry and OTLP values are not credentials that rotation helps
  for_each = {
    jwt    = "Access token signing keys: JSON with privateKeyBase64, publicKeyBase64, keyId"
    pepper = "Server secret for hashing verification codes"
    sentry = "Sentry DSN for the API and worker"
    otlp   = "OTLP headers for Grafana Cloud, for example Authorization=Basic ..."
  }
  name                    = "${local.name}/${each.key}"
  description             = each.value
  kms_key_id              = aws_kms_key.env.arn
  recovery_window_in_days = 7
}

# ---------- Email ----------

resource "aws_sesv2_email_identity" "domain" {
  email_identity = local.env_domain
}

resource "aws_route53_record" "dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.env_domain}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

# A custom MAIL FROM domain makes SPF align with the sender, which DMARC needs.
resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = "mail.${local.env_domain}"
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_route53_record" "mail_from_mx" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "mail.${local.env_domain}"
  type    = "MX"
  ttl     = 1800
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "mail.${local.env_domain}"
  type    = "TXT"
  ttl     = 1800
  records = ["v=spf1 include:amazonses.com -all"]
}

resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = "_dmarc.${local.env_domain}"
  type    = "TXT"
  ttl     = 1800
  records = ["v=DMARC1; p=quarantine; adkim=s; aspf=s"]
}

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = local.name
  reputation_options {
    reputation_metrics_enabled = true
  }
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
  delivery_options {
    tls_policy = "REQUIRE"
  }
}

# ---------- Shared task settings ----------

locals {
  database_environment = {
    DATABASE_HOST = module.database.address
    DATABASE_PORT = tostring(module.database.port)
    DATABASE_NAME = module.database.database_name
    DATABASE_SSL  = "verify-full"
  }

  database_secrets = {
    DATABASE_USER     = "${module.database.master_secret_arn}:username::"
    DATABASE_PASSWORD = "${module.database.master_secret_arn}:password::"
  }

  app_environment = merge(local.database_environment, {
    NODE_ENV                    = "staging"
    LOG_LEVEL                   = "info"
    TRUST_PROXY                 = "true"
    EMAIL_TRANSPORT             = "ses"
    EMAIL_FROM                  = "Raising Talents <${local.email_from}>"
    SES_CONFIGURATION_SET       = aws_sesv2_configuration_set.this.configuration_set_name
    JWT_ISSUER                  = "https://${local.api_domain}"
    JWT_AUDIENCE                = "raising-talents-app"
    BREACHED_PASSWORD_CHECK     = "true"
    MEDIA_BUCKET                = module.media.bucket_name
    MEDIA_CDN_URL               = module.media.media_url
    CONTENT_SCANNER             = "rekognition"
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otlp_endpoint
    OTEL_TRACES_SAMPLER         = "parentbased_traceidratio"
    OTEL_TRACES_SAMPLER_ARG     = var.trace_sample_ratio
  })

  app_secrets = merge(local.database_secrets, {
    REDIS_URL                  = module.cache.url_secret_arn
    JWT_PRIVATE_KEY_BASE64     = "${aws_secretsmanager_secret.app["jwt"].arn}:privateKeyBase64::"
    JWT_PUBLIC_KEY_BASE64      = "${aws_secretsmanager_secret.app["jwt"].arn}:publicKeyBase64::"
    JWT_KEY_ID                 = "${aws_secretsmanager_secret.app["jwt"].arn}:keyId::"
    VERIFICATION_CODE_PEPPER   = aws_secretsmanager_secret.app["pepper"].arn
    SENTRY_DSN                 = aws_secretsmanager_secret.app["sentry"].arn
    OTEL_EXPORTER_OTLP_HEADERS = aws_secretsmanager_secret.app["otlp"].arn
  })

  service_defaults = {
    cluster_arn    = aws_ecs_cluster.this.arn
    cluster_name   = aws_ecs_cluster.this.name
    vpc_id         = module.network.vpc_id
    vpc_cidr_block = module.network.vpc_cidr_block
    subnet_ids     = module.network.private_subnet_ids
    kms_key_arn    = aws_kms_key.env.arn
  }
}

data "aws_iam_policy_document" "api" {
  # Presigned uploads are signed with the API's role, so it needs PutObject on the
  # upload prefix only. HeadObject (the completion check) is covered by GetObject.
  statement {
    sid       = "SignUploadsCheckAndDiscardThem"
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = ["${module.media.bucket_arn}/pending/*"]
  }
}

data "aws_iam_policy_document" "worker" {
  #checkov:skip=CKV_AWS_356:rekognition:DetectModerationLabels has no resource-level permissions; every S3 statement is scoped to a prefix
  statement {
    sid       = "ReadAndDiscardUploads"
    actions   = ["s3:GetObject", "s3:DeleteObject"]
    resources = ["${module.media.bucket_arn}/pending/*"]
  }
  statement {
    sid       = "WriteProcessedImages"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${module.media.bucket_arn}/media/*"]
  }
  statement {
    sid       = "ScanImages"
    actions   = ["rekognition:DetectModerationLabels"]
    resources = ["*"]
  }

  # The worker sends verification and notification emails, only as the no-reply address.
  statement {
    sid       = "SendEmailAsNoReply"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.this.arn]
    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.email_from]
    }
  }
}

# ---------- Services ----------

module "api" {
  source = "../../modules/ecs-service"

  name           = "${local.name}-api"
  cluster_arn    = local.service_defaults.cluster_arn
  cluster_name   = local.service_defaults.cluster_name
  vpc_id         = local.service_defaults.vpc_id
  vpc_cidr_block = local.service_defaults.vpc_cidr_block
  subnet_ids     = local.service_defaults.subnet_ids
  kms_key_arn    = local.service_defaults.kms_key_arn

  image          = local.image
  command        = concat(local.node_args, ["dist/main.api.js"])
  cpu            = var.api.cpu
  memory         = var.api.memory
  desired_count  = var.api.min_count
  min_count      = var.api.min_count
  max_count      = var.api.max_count
  container_port = 3000
  load_balancer = {
    target_group_arn  = module.edge.target_group_arn
    security_group_id = module.edge.alb_security_group_id
  }

  task_policy_json = data.aws_iam_policy_document.api.json

  environment = merge(local.app_environment, { PORT = "3000" })
  secrets     = local.app_secrets
}

module "worker" {
  source = "../../modules/ecs-service"

  name           = "${local.name}-worker"
  cluster_arn    = local.service_defaults.cluster_arn
  cluster_name   = local.service_defaults.cluster_name
  vpc_id         = local.service_defaults.vpc_id
  vpc_cidr_block = local.service_defaults.vpc_cidr_block
  subnet_ids     = local.service_defaults.subnet_ids
  kms_key_arn    = local.service_defaults.kms_key_arn

  image             = local.image
  command           = concat(local.node_args, ["dist/main.worker.js"])
  cpu               = var.worker.cpu
  memory            = var.worker.memory
  desired_count     = var.worker.count
  min_count         = var.worker.count
  max_count         = var.worker.count
  capacity_provider = var.worker.capacity_provider
  task_policy_json  = data.aws_iam_policy_document.worker.json

  environment = local.app_environment
  secrets     = local.app_secrets
}

# One-off task the deploy workflow runs before each release. Database settings only.
module "migrate" {
  source = "../../modules/ecs-service"

  name           = "${local.name}-migrate"
  create_service = false
  cluster_arn    = local.service_defaults.cluster_arn
  cluster_name   = local.service_defaults.cluster_name
  vpc_id         = local.service_defaults.vpc_id
  vpc_cidr_block = local.service_defaults.vpc_cidr_block
  subnet_ids     = local.service_defaults.subnet_ids
  kms_key_arn    = local.service_defaults.kms_key_arn

  image   = local.image
  command = ["dist/platform/database/migrate.js"]
  cpu     = 256
  memory  = 512

  environment = merge(local.database_environment, { NODE_ENV = "staging" })
  secrets     = local.database_secrets
}

# ---------- Data stores ----------

module "database" {
  source = "../../modules/database"

  name                  = local.name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.private_subnet_ids
  kms_key_arn           = aws_kms_key.env.arn
  instance_class        = var.database.instance_class
  multi_az              = var.database.multi_az
  backup_retention_days = var.database.backup_retention_days
  database_name         = "raising_talents"
  master_username       = "rt_admin"
  client_security_group_ids = {
    api     = module.api.security_group_id
    worker  = module.worker.security_group_id
    migrate = module.migrate.security_group_id
  }
}

module "cache" {
  source = "../../modules/cache"

  name        = local.name
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.private_subnet_ids
  kms_key_arn = aws_kms_key.env.arn
  node_type   = var.cache.node_type
  node_count  = var.cache.node_count
  client_security_group_ids = {
    api    = module.api.security_group_id
    worker = module.worker.security_group_id
  }
}

# ---------- Public entry points ----------

module "edge" {
  source = "../../modules/edge"

  name              = local.name
  account_id        = local.account_id
  vpc_id            = module.network.vpc_id
  vpc_cidr_block    = module.network.vpc_cidr_block
  public_subnet_ids = module.network.public_subnet_ids
  domain_name       = local.api_domain
  hosted_zone_id    = data.aws_route53_zone.root.zone_id
  kms_key_arn       = aws_kms_key.env.arn
}

resource "aws_acm_certificate" "media" {
  provider          = aws.us_east_1
  domain_name       = local.media_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "media_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.media.domain_validation_options : option.domain_name => option
  }
  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "media" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.media.arn
  validation_record_fqdns = [for record in aws_route53_record.media_certificate_validation : record.fqdn]
}

module "media" {
  source = "../../modules/media"

  name            = local.name
  account_id      = local.account_id
  domain_name     = local.media_domain
  certificate_arn = aws_acm_certificate_validation.media.certificate_arn
  hosted_zone_id  = data.aws_route53_zone.root.zone_id
}

# ---------- Alerts and cost ----------

module "alarms" {
  source = "../../modules/alarms"

  name                       = local.name
  environment                = var.environment
  kms_key_arn                = aws_kms_key.env.arn
  alert_emails               = var.alert_emails
  monthly_budget_usd         = var.monthly_budget_usd
  alb_arn_suffix             = module.edge.alb_arn_suffix
  target_group_arn_suffix    = module.edge.target_group_arn_suffix
  db_instance_identifier     = module.database.instance_identifier
  cache_replication_group_id = module.cache.replication_group_id
  worker_log_group_name      = module.worker.log_group_name
}
