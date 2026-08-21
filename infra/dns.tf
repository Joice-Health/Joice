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

# ---- Clerk (auth + email) CNAMEs on the canonical domain ----
# Values come from the Clerk dashboard (Domains) and must match exactly.

locals {
  clerk_cnames = {
    "accounts"        = "accounts.clerk.services"
    "clerk"           = "frontend-api.clerk.services"
    "clk._domainkey"  = "dkim1.ntg093l6b8dg.clerk.services"
    "clk2._domainkey" = "dkim2.ntg093l6b8dg.clerk.services"
    "clkmail"         = "mail.ntg093l6b8dg.clerk.services"
  }
}

resource "aws_route53_record" "clerk" {
  for_each = local.clerk_cnames

  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [each.value]
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

resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:_spf.google.com ~all"]
}

locals {
  # From Google Admin (Apps > Google Workspace > Gmail > Authenticate email).
  google_dkim = "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwpe7yCk8NZzKPvf+PNiisongW3VDs879xq/pfmShhUCzHvMrPIeddF5s42+Sukx+2NRbWDCW5YWT6hMjPUmHd0nDJqWsZlb/Gi7g2+yLPpH6G01Cm1ptPr343h8LQ/xrR49Ohg9LPi+sK63pLODiojE55z8joPANj8mIjh6gTZgGuWz+sepORvC/sx3LMDDbRJiQYJu8crjzwI/NNQWKkhF4gw5AtutMN1IEB+KCe3CddMoBVObuw7NObDwPdRqZHFmsXS7cuhqV682sazXoKzzm/fADEwOOkeanOOdXDugEJ04XHdkQyd11cvLNK8uXp5siC1+sJJEoK0v2yFLvHQIDAQAB"
}

# ---- Patient portal + consults (vendor-hosted) ----

# Patient portal on the vendor's Vercel project; "care" must match the custom
# domain configured on their side.
resource "aws_route53_record" "portal" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "care.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["7a0aee5a15afe95c.vercel-dns-017.com"]
}

resource "aws_route53_record" "consults" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "consults.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["djtiy2x59d7qf.cloudfront.net"]
}

# CloudFront alternate-domain ownership verification for the consults CNAME.
resource "aws_route53_record" "consults_challenge" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "_cf-challenge.consults.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["djtiy2x59d7qf.cloudfront.net"]
}

resource "aws_route53_record" "google_dkim" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "google._domainkey.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  # Route53 caps each TXT character-string at 255 chars; "" splices the halves back together.
  records = ["${substr(local.google_dkim, 0, 255)}\"\"${substr(local.google_dkim, 255, 255)}"]
}

# ---- SendGrid domain authentication + link branding ----
# Values come from the SendGrid dashboard (Settings > Sender Authentication)
# and must match exactly. em7695 is the sending domain, s1/s2 are DKIM,
# url2049 + 24224351 are branded link/click tracking.

locals {
  sendgrid_cnames = {
    "em7695"        = "u24224351.wl102.sendgrid.net"
    "s1._domainkey" = "s1.domainkey.u24224351.wl102.sendgrid.net"
    "s2._domainkey" = "s2.domainkey.u24224351.wl102.sendgrid.net"
    "url2049"       = "sendgrid.net"
    "24224351"      = "sendgrid.net"
  }
}

resource "aws_route53_record" "sendgrid" {
  for_each = local.sendgrid_cnames

  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "${each.key}.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [each.value]
}

# p=none: monitor only, no delivery impact; tighten once SendGrid + Google
# have both been observed passing DMARC.
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main[var.domain_name].zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=none;"]
}
