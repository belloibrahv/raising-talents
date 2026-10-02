output "state_bucket" {
  description = "Pass to tofu init as -backend-config=bucket=..."
  value       = aws_s3_bucket.state.id
}

output "role_arns" {
  description = "Set these as GitHub variables (see infra/terraform/README.md)."
  value       = { for key, role in aws_iam_role.ci : key => role.arn }
}
