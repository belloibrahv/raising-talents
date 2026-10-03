output "target_group_arn" {
  description = "Target group the API service registers with."
  value       = aws_lb_target_group.api.arn
}

output "alb_security_group_id" {
  description = "Allowed to reach the API tasks."
  value       = aws_security_group.alb.id
}

output "alb_arn_suffix" {
  description = "For CloudWatch alarms."
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  description = "For CloudWatch alarms."
  value       = aws_lb_target_group.api.arn_suffix
}

output "api_url" {
  description = "Public API address."
  value       = "https://${var.domain_name}"
}
