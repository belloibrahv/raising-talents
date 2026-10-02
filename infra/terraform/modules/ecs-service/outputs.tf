output "service_name" {
  description = "ECS service name, or null for task-only modules."
  value       = var.create_service ? aws_ecs_service.this[0].name : null
}

output "task_definition_family" {
  description = "Family the deploy pipeline registers new revisions in."
  value       = aws_ecs_task_definition.this.family
}

output "security_group_id" {
  description = "Tasks' security group."
  value       = aws_security_group.this.id
}

output "task_role_arn" {
  description = "Application role."
  value       = aws_iam_role.task.arn
}

output "execution_role_arn" {
  description = "ECS execution role."
  value       = aws_iam_role.execution.arn
}

output "log_group_name" {
  description = "Application log group."
  value       = aws_cloudwatch_log_group.this.name
}
