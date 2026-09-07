# Service Connect (story 4.7): brain-to-api traffic leaves the public edge.
#
# Before this, the only route between tasks was the canonical URL: brain ->
# CloudFront -> ALB -> api, which meant /api/internal/* had to be reachable
# from the internet with only the bearer token as the boundary. With the PHI
# keys on, that endpoint can serve health-tier traits, so the token stopped
# being enough on its own. Service Connect gives the brain a VPC-private name
# for the api (http://api:4000); the same apply flips INTERNAL_EDGE_BLOCKED on
# the api task, and the internal middleware then refuses any request carrying
# CloudFront's X-Origin-Verify header, token or no token. Rollback is the same
# pair reversed, one apply.

resource "aws_service_discovery_http_namespace" "main" {
  # Project-prefixed so a second environment (the staging branch) in the same
  # account gets its own namespace from its own project slug, no edits.
  name        = "${var.project}.local"
  description = "Service Connect namespace: private names between the platform's services"
}

# The api security group admits only the ALB (ecs.tf); this admits the brain
# tasks too, for the Service Connect path.
resource "aws_security_group_rule" "api_from_brain" {
  type                     = "ingress"
  from_port                = 4000
  to_port                  = 4000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.api.id
  source_security_group_id = aws_security_group.brain.id
  description              = "Brain to api over Service Connect (internal profile reads and observation writes)"
}
