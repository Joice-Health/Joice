# CloudFront in front of the ALB: free TLS on the default domain, edge caching
# for immutable Next.js assets + the background video, compression everywhere.
# SSR HTML and /api/* pass through uncached.

locals {
  alb_origin_id = "${var.project}-alb"
}

# AWS managed policies (stable, account-independent lookups by name)
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

# 301 every non-canonical host (www + redirect domains) to the canonical domain,
# preserving path and query string so shared ?ref= links keep attributing.
resource "aws_cloudfront_function" "canonical_host" {
  name    = "${var.project}-canonical-host"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = <<-EOF
    function handler(event) {
      var request = event.request;
      var host = request.headers.host.value;
      if (host === '${var.domain_name}') {
        return request;
      }
      var qs = '';
      var keys = Object.keys(request.querystring);
      if (keys.length > 0) {
        qs = '?' + keys
          .map(function (k) { return k + '=' + encodeURIComponent(request.querystring[k].value); })
          .join('&');
      }
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
          location: { value: 'https://${var.domain_name}' + request.uri + qs },
        },
      };
    }
  EOF
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  comment         = "${var.project} web + api"
  price_class     = "PriceClass_100" # NA + EU edges; expand when the audience does
  http_version    = "http2and3"
  is_ipv6_enabled = true
  aliases         = local.all_hosts

  depends_on = [aws_acm_certificate_validation.main]

  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = local.alb_origin_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # ALB has no cert without a custom domain; see Before-PHI checklist
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # SSR HTML (default): no caching, forward everything the app needs.
  default_cache_behavior {
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical_host.arn
    }
  }

  # Hashed, immutable Next.js build assets — cache hard at the edge.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical_host.arn
    }
  }

  # The ambient background video (~MBs) — biggest single win from edge caching.
  ordered_cache_behavior {
    path_pattern           = "*.mp4"
    target_origin_id       = local.alb_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false # already-compressed media
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical_host.arn
    }
  }

  # API — never cached, all viewer context forwarded.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.canonical_host.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.main.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
