# Route53 zones for the canonical domain and every redirect domain, one ACM cert
# (us-east-1, which is this stack's region) covering apex + www of all of them,
# and alias records pointing everything at the CloudFront distribution.
#
# The only manual step: point each registrar at the zone's nameservers
# (printed by `terraform output nameservers`). ACM validation — and therefore
# the first apply that attaches the cert to CloudFront — completes only after
# the nameserver cutover propagates.

locals {
  all_zones = concat([var.domain_name], var.redirect_domains)
  # apex + www for every zone
  all_hosts = flatten([for z in local.all_zones : [z, "www.${z}"]])

  canonical_url = "https://${var.domain_name}"
}

resource "aws_route53_zone" "main" {
  for_each = toset(local.all_zones)

  name = each.value
}

# ---- Certificate (CloudFront requires us-east-1; that's our provider region) ----

resource "aws_acm_certificate" "main" {
  domain_name               = var.domain_name
  subject_alternative_names = [for h in local.all_hosts : h if h != var.domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  # Map each validation option to the zone that owns it (strip an optional www.)
  cert_validations = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
      zone   = replace(dvo.domain_name, "www.", "")
    }
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.cert_validations

  zone_id         = aws_route53_zone.main[each.value.zone].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# ---- Alias records: apex + www of every domain -> CloudFront ----

locals {
  # host => owning zone
  host_zone = { for h in local.all_hosts : h => replace(h, "www.", "") }
}

resource "aws_route53_record" "alias_a" {
  for_each = local.host_zone

  zone_id = aws_route53_zone.main[each.value].zone_id
  name    = each.key
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "alias_aaaa" {
  for_each = local.host_zone

  zone_id = aws_route53_zone.main[each.value].zone_id
  name    = each.key
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}

# ---- Email (Google Workspace) ----

# Mirrors the registrar's MX record so mail keeps flowing after the NS cutover.
resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = ["1 smtp.google.com"]
}
