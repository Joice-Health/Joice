#!/usr/bin/env bash
# Refresh the short-lived AWS SSO credentials that local chat/voice dev depends
# on: logs in (browser approval), writes the new keys into .env, and recreates
# the brain container so it picks them up. Run whenever the brain logs show
# ExpiredTokenException (this account's SSO sessions last ~1 hour).
#
# It's the BRAIN that needs credentials, not the api — Bedrock, Transcribe and
# Polly moved there with the service split, and the api has no AWS dependencies
# at all now.
#
#   ./scripts/dev-aws-refresh.sh [profile]   # default profile: shaun
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${1:-shaun}"

aws sso login --profile "$PROFILE"
eval "$(aws configure export-credentials --profile "$PROFILE" --format env)"

perl -i -pe "
  s|^AWS_ACCESS_KEY_ID=.*|AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID|;
  s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY|;
  s|^AWS_SESSION_TOKEN=.*|AWS_SESSION_TOKEN=$AWS_SESSION_TOKEN|;
" .env

docker compose up -d --force-recreate brain

echo "⏳ waiting for the brain..."
for _ in $(seq 1 30); do
  if curl -sf localhost:4100/health >/dev/null 2>&1; then
    echo "✅ brain healthy — fresh credentials in place"
    exit 0
  fi
  sleep 2
done
echo "⚠️  brain not healthy yet — check: docker compose logs brain --tail 20"
exit 1
