data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_s3_bucket" "media" {
  #checkov:skip=CKV_AWS_145:Media is served publicly through CloudFront; S3-managed encryption avoids a KMS call per image view
  #checkov:skip=CKV_AWS_18:Media access is logged at CloudFront with the log analytics work in milestone 6
  #checkov:skip=CKV2_AWS_62:Upload processing events are added with the media pipeline in milestone 3
  #checkov:skip=CKV_AWS_144:Versioning protects against deletion; cross-region replication is a production decision
  bucket        = "${var.name}-media-${var.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  # Uploads land under pending/ and move once processed. Anything left there was abandoned.
  rule {
    id     = "expire-abandoned-uploads"
    status = "Enabled"
    filter {
      prefix = "pending/"
    }
    expiration {
      days = 1
    }
  }

  rule {
    id     = "tidy-versions-and-multipart"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = var.deleted_media_retention_days
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Browsers send uploads straight to the bucket (presigned POST), so the web app's origin
# must be allowed. The phone app needs no CORS; nothing else may post here.
resource "aws_s3_bucket_cors_configuration" "media" {
  count  = length(var.upload_cors_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.media.id
  cors_rule {
    allowed_origins = var.upload_cors_origins
    allowed_methods = ["POST"]
    allowed_headers = ["*"]
    max_age_seconds = 600
  }
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.name}-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "media" {
  name = "${var.name}-media-security"
  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

resource "aws_cloudfront_distribution" "media" {
  #checkov:skip=CKV_AWS_68:Static images need no WAF; the API, which takes input, has one
  #checkov:skip=CKV2_AWS_47:Covered by CKV_AWS_68 above
  #checkov:skip=CKV_AWS_86:CloudFront access logging is added with the log analytics work in milestone 6
  #checkov:skip=CKV_AWS_310:A single S3 origin has nothing to fail over to
  #checkov:skip=CKV_AWS_305:An image CDN serves files by path; there is no index page
  #checkov:skip=CKV_AWS_374:Talent and agents can be anywhere; blocking countries is a product decision, not a default
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name} media"
  aliases         = [var.domain_name]
  http_version    = "http2and3"
  # Includes African edge locations, Lagos among them. PriceClass_100 would serve Nigeria from Europe.
  price_class = "PriceClass_200"

  origin {
    origin_id                = "media-bucket"
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id           = "media-bucket"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.media.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Only processed, scanned variants under media/. Raw uploads under pending/ may
        # carry location data and have not been scanned, so the CDN can never serve them.
        Sid       = "CloudFrontReadsScannedMediaOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.media.arn}/media/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.media.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.media.arn, "${aws_s3_bucket.media.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.media]
}

resource "aws_route53_record" "media" {
  for_each = toset(["A", "AAAA"])
  zone_id  = var.hosted_zone_id
  name     = var.domain_name
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.media.domain_name
    zone_id                = aws_cloudfront_distribution.media.hosted_zone_id
    evaluate_target_health = false
  }
}
