output "bucket_name" {
  description = "Where the deploy workflow uploads the build."
  value       = aws_s3_bucket.web.id
}

output "bucket_arn" {
  description = "For the deploy role's policy."
  value       = aws_s3_bucket.web.arn
}

output "distribution_id" {
  description = "For cache invalidations after a deploy."
  value       = aws_cloudfront_distribution.web.id
}

output "web_url" {
  description = "Public web app address."
  value       = "https://${var.domain_name}"
}
