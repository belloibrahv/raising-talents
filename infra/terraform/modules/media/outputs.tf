output "bucket_name" {
  description = "Media bucket."
  value       = aws_s3_bucket.media.id
}

output "bucket_arn" {
  description = "For IAM policies."
  value       = aws_s3_bucket.media.arn
}

output "upload_origin" {
  description = "Where presigned POST uploads go, for the web app's Content-Security-Policy."
  value       = "https://${aws_s3_bucket.media.bucket_regional_domain_name}"
}

output "distribution_id" {
  description = "For cache invalidations."
  value       = aws_cloudfront_distribution.media.id
}

output "media_url" {
  description = "Public media address."
  value       = "https://${var.domain_name}"
}
