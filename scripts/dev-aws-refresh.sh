#!/usr/bin/env bash
# Refresh the short-lived AWS SSO credentials that local RAG dev depends on:
# logs in (browser approval), writes the new keys into .env, and recreates the
# api container so it picks them up. Run whenever the api logs show
# ExpiredTokenException (this account's SSO sessions last ~1 hour).
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

docker compose up -d --force-recreate api

echo "⏳ waiting for the api..."
for _ in $(seq 1 20); do
  if curl -sf localhost:4000/health >/dev/null 2>&1; then
    echo "✅ api healthy — fresh credentials in place"
    exit 0
  fi
  sleep 1
done
echo "⚠️  api not healthy yet — check: docker compose logs api --tail 20"
exit 1
