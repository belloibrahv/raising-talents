# The progressive web app (ADR-023): static files in a private bucket, served by CloudFront.

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

locals {
  # The page may only talk to our API, our media CDN, the upload bucket, Mux and, when set,
  # the error tracker's ingest address.
  # Mux streams from *.mux.com and takes direct uploads on Google Cloud Storage.
  content_security_policy = join("; ", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob: ${var.media_url} https://image.mux.com",
    "media-src 'self' blob: https://stream.mux.com https://*.mux.com",
    "connect-src 'self' ${var.api_url} ${var.media_url} ${join(" ", var.upload_origins)} https://stream.mux.com https://*.mux.com https://storage.googleapis.com ${var.error_reporting_origin}",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ])
}

resource "aws_s3_bucket" "web" {
  #checkov:skip=CKV_AWS_145:Public static files served through CloudFront; S3-managed encryption avoids a KMS call per request
  #checkov:skip=CKV_AWS_18:Access is logged at CloudFront with the log analytics work in milestone 6
  #checkov:skip=CKV2_AWS_62:Nothing reacts to new web builds; the deploy workflow invalidates the cache itself
  #checkov:skip=CKV_AWS_144:Every build can be rebuilt from git; replication adds nothing
  bucket        = "${var.name}-web-${var.account_id}"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  # Deploys never delete old hashed files, so a page loaded before a release can still fetch
  # its chunks; they are small. Overwritten files (index.html, sw.js) keep 30 days of history.
  rule {
    id     = "tidy-overwritten-files"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Files live under /assets/ and /icons/, plus a few known names at the root. Every other
# path is a screen of the app and gets index.html, so the router takes over. A dot is not a
# file test: handles have dots (/talents/ngozi.adeyemi). A missing file still answers 404.
resource "aws_cloudfront_function" "spa_routes" {
  name    = "${var.name}-web-routes"
  runtime = "cloudfront-js-2.0"
  comment = "Serve index.html for app routes"
  publish = true
  code    = <<-JS
    var ROOT_FILES = /^\/(index\.html|sw\.js(\.map)?|workbox-[\w-]+\.js(\.map)?|manifest\.webmanifest|favicon\.svg|apple-touch-icon\.png|og\.png|robots\.txt)$/;
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var isFile = uri.indexOf('/assets/') === 0 || uri.indexOf('/icons/') === 0 || ROOT_FILES.test(uri);
      if (!isFile) request.uri = '/index.html';
      return request;
    }
  JS
}

resource "aws_cloudfront_response_headers_policy" "web" {
  name = "${var.name}-web-security"
  security_headers_config {
    content_security_policy {
      content_security_policy = local.content_security_policy
      override                = true
    }
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
  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(self), microphone=(), geolocation=(), payment=()"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  #checkov:skip=CKV_AWS_68:Static files need no WAF; the API, which takes input, has one
  #checkov:skip=CKV2_AWS_47:Covered by CKV_AWS_68 above
  #checkov:skip=CKV_AWS_86:CloudFront access logging is added with the log analytics work in milestone 6
  #checkov:skip=CKV_AWS_310:A single S3 origin has nothing to fail over to
  #checkov:skip=CKV_AWS_374:Talent and agents can be anywhere; blocking countries is a product decision, not a default
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.name} web app"
  aliases             = [var.domain_name]
  http_version        = "http2and3"
  default_root_object = "index.html"
  # Includes African edge locations, Lagos among them.
  price_class = "PriceClass_200"

  origin {
    origin_id                = "web-bucket"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  # Hashed build files never change, so they are cached for a year at the edge and in browsers.
  ordered_cache_behavior {
    path_pattern               = "/assets/*"
    target_origin_id           = "web-bucket"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web.id
  }

  # index.html, sw.js and the manifest are uploaded with Cache-Control: no-cache, which this
  # policy honours, and each deploy invalidates them, so a release reaches people at once.
  default_cache_behavior {
    target_origin_id           = "web-bucket"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routes.arn
    }
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

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontReadsTheApp"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.web.arn } }
      },
      {
        # Without it S3 answers 403 for a missing file; with it, an honest 404.
        Sid       = "CloudFrontSeesMissingFiles"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:ListBucket"
        Resource  = aws_s3_bucket.web.arn
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.web.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.web.arn, "${aws_s3_bucket.web.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.web]
}

resource "aws_route53_record" "web" {
  for_each = toset(["A", "AAAA"])
  zone_id  = var.hosted_zone_id
  name     = var.domain_name
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
