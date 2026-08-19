#!/usr/bin/env bash
# Run the one-off migrate task and gate on its exit code.
#
# Exactly one process applies migrations, and it finishes before any service
# restarts. A failure stops the deploy: better to keep serving the old code
# than to start new code against a schema that did not migrate. The task
# definition pins the api image, which is where packages/db (and so the
# migration files) ship.
#
# Inputs (env): CLUSTER, TASK_DEF (family or family:revision), SUBNETS
#   (comma-separated), SECURITY_GROUP, LOG_GROUP (for the error message).
set -euo pipefail
: "${CLUSTER:?}" "${TASK_DEF:?}" "${SUBNETS:?}" "${SECURITY_GROUP:?}"
LOG_GROUP="${LOG_GROUP:-/ecs/joice-migrate}"

run=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --output json)
task_arn=$(jq -r '.tasks[0].taskArn // empty' <<<"$run")
if [ -z "$task_arn" ]; then
  echo "::error::run-task placed no task: $(jq -c '.failures' <<<"$run")" >&2
  exit 1
fi
echo "Migration task: $task_arn"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task_arn"

task=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task_arn" --output json)
exit_code=$(jq -r '.tasks[0].containers[0].exitCode // "none"' <<<"$task")
stopped_reason=$(jq -r '.tasks[0].stoppedReason // ""' <<<"$task")
echo "Migration exit code: $exit_code ($stopped_reason)"
if [ "$exit_code" != "0" ]; then
  echo "::error::Migrations failed (exit $exit_code). Not deploying. See $LOG_GROUP." >&2
  exit 1
fi
