output "api_url" {
  description = "Public API address."
  value       = module.edge.api_url
}

output "media_url" {
  description = "Public media address."
  value       = module.media.media_url
}

# The deploy workflow reads these to roll out a release.
output "deploy" {
  description = "Everything the deploy workflow needs."
  value = {
    region                 = var.aws_region
    ecr_repository_url     = module.ecr.repository_url
    cluster                = aws_ecs_cluster.this.name
    api_service            = module.api.service_name
    api_family             = module.api.task_definition_family
    worker_service         = module.worker.service_name
    worker_family          = module.worker.task_definition_family
    migrate_family         = module.migrate.task_definition_family
    migrate_subnets        = module.network.private_subnet_ids
    migrate_security_group = module.migrate.security_group_id
    migrate_log_group      = module.migrate.log_group_name
  }
}

output "secret_arns" {
  description = "Secrets to fill before the first deploy (docs/runbooks/staging-first-deploy.md)."
  value       = { for key, secret in aws_secretsmanager_secret.app : key => secret.arn }
}
