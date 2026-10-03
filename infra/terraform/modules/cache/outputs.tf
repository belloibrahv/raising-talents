output "url_secret_arn" {
  description = "Secret holding REDIS_URL."
  value       = aws_secretsmanager_secret.url.arn
}

output "replication_group_id" {
  description = "For CloudWatch alarms."
  value       = aws_elasticache_replication_group.this.id
}

output "security_group_id" {
  description = "Cache security group."
  value       = aws_security_group.this.id
}
