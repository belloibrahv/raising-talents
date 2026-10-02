output "address" {
  description = "Host name for DATABASE_HOST."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Port for DATABASE_PORT."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Database name for DATABASE_NAME."
  value       = aws_db_instance.this.db_name
}

output "master_secret_arn" {
  description = "Secrets Manager secret RDS keeps the username and password in."
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "instance_identifier" {
  description = "For CloudWatch alarms."
  value       = aws_db_instance.this.identifier
}

output "security_group_id" {
  description = "Database security group."
  value       = aws_security_group.this.id
}
