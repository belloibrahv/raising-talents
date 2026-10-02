output "bucket_name" {
  description = "Media bucket."
  value       = aws_s3_bucket.media.id
}

output "bucket_arn" {
  description = "For IAM policies."
  value       = aws_s3_bucket.media.arn
}

output "distribution_id" {
  description = "For cache invalidations."
  value       = aws_cloudfront_distribution.media.id
}

output "media_url" {
  description = "Public media address."
  value       = "https://${var.domain_name}"
}
