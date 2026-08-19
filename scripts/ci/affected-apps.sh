#!/usr/bin/env bash
# Decide which deployable apps (web, api, brain) this commit changes, so the
# deploy workflow builds and rolls only those.
#
# The comparison base is the newest-started successful run of the deploy
# workflow on the deploy branch: the last commit every service was brought
# level with (deploy.yml stamps that sha on unchanged images too). Turborepo
# then reports which workspaces changed between base and HEAD, counting a
# workspace as changed when any tracked file in it, or in a workspace it
# depends on, changed. Package-level: a README edit inside apps/web still
# marks web.
#
# Anything unusual falls open to "all three", which is exactly what the
# workflow did before change detection existed. The failure mode is a slower
# deploy, never a missing one.
#
# Inputs (env):
#   SCOPE               "changed" (default) or "all"
#   GH_TOKEN            token with actions:read, for the run-history lookup
#   GITHUB_REPOSITORY   owner/repo                     (set by Actions)
#   GITHUB_OUTPUT       where outputs go               (set by Actions; stdout locally)
#   GITHUB_STEP_SUMMARY where the summary table goes   (set by Actions; /dev/null locally)
#   WORKFLOW_FILE       defaults to deploy.yml
#   BRANCH              defaults to main
#
# Outputs: web, api, brain (true|false), any (true|false), base (the sha of
# the last successful deploy, or empty when none could be resolved), reason.
#
# Locally:
#   GH_TOKEN=$(gh auth token) GITHUB_REPOSITORY=$(gh repo view --json nameWithOwner -q .nameWithOwner) \
#     bash scripts/ci/affected-apps.sh
set -euo pipefail

SCOPE="${SCOPE:-changed}"
WORKFLOW_FILE="${WORKFLOW_FILE:-deploy.yml}"
BRANCH="${BRANCH:-main}"
GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/stdout}"
GITHUB_STEP_SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
: "${GITHUB_REPOSITORY:?set GITHUB_REPOSITORY=owner/repo}"

web=false; api=false; brain=false
base=""
reason=""

all() {
  web=true; api=true; brain=true
  reason="$1"
}

# Turborepo package name -> app. @joice/brain is the library; the deployable
# brain service is @joice/brain-service.
mark() {
  case "$1" in
    @joice/web) web=true ;;
    @joice/api) api=true ;;
    @joice/brain-service) brain=true ;;
  esac
}

head_sha=$(git rev-parse HEAD)

# The last successful deploy is the restore point as well as the diff base, so
# resolve it whenever we can, even for scope=all.
base=$(gh api \
  "repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?branch=${BRANCH}&status=success&per_page=30&exclude_pull_requests=true" \
  --jq '[.workflow_runs[]] | max_by(.run_started_at) | .head_sha // empty' 2>/dev/null || true)
if ! [[ "$base" =~ ^[0-9a-f]{40}$ ]]; then
  base=""
fi

if [ "$SCOPE" = "all" ]; then
  all "scope=all requested"
elif [ -z "$base" ]; then
  all "no successful ${WORKFLOW_FILE} run found on ${BRANCH}"
elif ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  all "last deployed commit ${base:0:7} is not in this checkout"
elif [ "$base" = "$head_sha" ]; then
  all "HEAD ${head_sha:0:7} is already the last deployed commit (re-run or manual dispatch)"
elif ! git merge-base --is-ancestor "$base" HEAD; then
  all "last deployed commit ${base:0:7} is not an ancestor of HEAD (rollback or rewritten history)"
elif [ -n "$(git diff --name-only "$base" HEAD -- .dockerignore .github/workflows scripts/ci)" ]; then
  # These live outside every workspace, so Turborepo cannot see them, yet they
  # change what the images contain or how they are built.
  all "CI or Docker-context files changed since ${base:0:7}"
elif ! json=$(TURBO_SCM_BASE="$base" TURBO_SCM_HEAD="$head_sha" TURBO_TELEMETRY_DISABLED=1 \
              bunx turbo ls --affected --output=json 2>/dev/null) \
     || ! jq -e '.packages.items' <<<"$json" >/dev/null 2>&1; then
  all "turbo ls --affected did not return a package list"
else
  while IFS= read -r name; do
    mark "$name"
  done < <(jq -r '.packages.items[].name' <<<"$json")
  reason="workspaces changed since ${base:0:7}"
fi

any=false
if [ "$web" = true ] || [ "$api" = true ] || [ "$brain" = true ]; then
  any=true
fi

{
  echo "web=$web"
  echo "api=$api"
  echo "brain=$brain"
  echo "any=$any"
  echo "base=$base"
  echo "reason=$reason"
} >> "$GITHUB_OUTPUT"

echo "web=$web api=$api brain=$brain any=$any base=${base:-none}"
echo "reason: $reason"

{
  echo "### Deploy scope"
  echo ""
  echo "| app | deploy |"
  echo "|---|---|"
  echo "| web | $web |"
  echo "| api | $api |"
  echo "| brain | $brain |"
  echo ""
  echo "Base: \`${base:-none}\` (${reason})"
  echo ""
} >> "$GITHUB_STEP_SUMMARY"
