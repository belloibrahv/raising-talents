output "repository_url" {
  description = "Push and pull address."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "For IAM policies."
  value       = aws_ecr_repository.this.arn
}

output "repository_name" {
  description = "Repository name."
  value       = aws_ecr_repository.this.name
}
