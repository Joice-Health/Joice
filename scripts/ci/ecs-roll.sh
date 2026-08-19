#!/usr/bin/env bash
# Force a new deployment of each service and watch it through to completion.
#
# This replaces `aws ecs wait services-stable`, which gives up after 10 minutes
# (usually before the ECS circuit breaker has decided anything) and which
# reports success after a circuit-breaker rollback, because "stable" only means
# one deployment with running == desired. Here we remember the deployment ECS
# created for us and fail the moment it is FAILED or has been replaced by
# another PRIMARY deployment.
#
# Inputs (env): CLUSTER, SERVICES (space-separated service names),
#   DEADLINE_MINUTES (default 20), POLL_SECONDS (default 15).
set -euo pipefail
: "${CLUSTER:?}" "${SERVICES:?}"
DEADLINE_MINUTES="${DEADLINE_MINUTES:-20}"
POLL_SECONDS="${POLL_SECONDS:-15}"

names=()
ids=()
for svc in $SERVICES; do
  id=$(aws ecs update-service --cluster "$CLUSTER" --service "$svc" --force-new-deployment \
    --query "service.deployments[?status=='PRIMARY'].id | [0]" --output text)
  if [ -z "$id" ] || [ "$id" = "None" ]; then
    echo "::error::$svc: update-service returned no PRIMARY deployment" >&2
    exit 1
  fi
  echo "$svc: deployment $id started"
  names+=("$svc")
  ids+=("$id")
done

settled=()
for _ in "${names[@]}"; do settled+=(false); done

deadline=$(( $(date +%s) + DEADLINE_MINUTES * 60 ))
while :; do
  resp=$(aws ecs describe-services --cluster "$CLUSTER" --services "${names[@]}" --output json)
  if [ "$(jq -r '.failures | length' <<<"$resp")" != "0" ]; then
    echo "::error::describe-services: $(jq -c '.failures' <<<"$resp")" >&2
    exit 1
  fi

  status_line=""
  all_settled=true
  for i in "${!names[@]}"; do
    svc="${names[$i]}"
    id="${ids[$i]}"
    if [ "${settled[$i]}" = true ]; then
      status_line="$status_line $svc:done"
      continue
    fi

    primary=$(jq -r --arg s "$svc" \
      '.services[] | select(.serviceName==$s) | .deployments[] | select(.status=="PRIMARY") | .id' <<<"$resp")
    dep=$(jq -c --arg s "$svc" --arg d "$id" \
      '.services[] | select(.serviceName==$s) | .deployments[] | select(.id==$d)' <<<"$resp")
    state=$(jq -r '.rolloutState // "UNKNOWN"' <<<"${dep:-null}")
    why=$(jq -r '.rolloutStateReason // ""' <<<"${dep:-null}")
    running=$(jq -r '.runningCount // "?"' <<<"${dep:-null}")
    desired=$(jq -r '.desiredCount // "?"' <<<"${dep:-null}")

    if [ "$primary" != "$id" ]; then
      echo "::error::$svc: deployment $id was replaced by ${primary:-nothing} (circuit breaker rollback?). $why" >&2
      exit 1
    fi
    case "$state" in
      FAILED)
        echo "::error::$svc: deployment $id FAILED. $why" >&2
        exit 1
        ;;
      COMPLETED)
        echo "$svc: deployment $id completed ($running/$desired running)"
        settled[$i]=true
        status_line="$status_line $svc:done"
        ;;
      *)
        all_settled=false
        status_line="$status_line $svc:$state($running/$desired)"
        ;;
    esac
  done

  if [ "$all_settled" = true ]; then
    echo "All services rolled."
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Rollout did not finish within ${DEADLINE_MINUTES} minutes:$status_line" >&2
    exit 1
  fi
  echo "$(date -u +%H:%M:%S)$status_line"
  sleep "$POLL_SECONDS"
done
