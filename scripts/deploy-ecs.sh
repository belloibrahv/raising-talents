#!/usr/bin/env bash
# Rolls one image out to an environment: migrations first, then the services.
# Every step fails loudly, and ECS rolls a service back on its own if new tasks fail.
#
# Required environment: AWS_REGION CLUSTER IMAGE API_SERVICE API_FAMILY WORKER_SERVICE
# WORKER_FAMILY MIGRATE_FAMILY MIGRATE_SUBNETS (comma separated) MIGRATE_SECURITY_GROUP
# MIGRATE_LOG_GROUP API_URL
set -euo pipefail

for name in AWS_REGION CLUSTER IMAGE API_SERVICE API_FAMILY WORKER_SERVICE WORKER_FAMILY \
  MIGRATE_FAMILY MIGRATE_SUBNETS MIGRATE_SECURITY_GROUP MIGRATE_LOG_GROUP API_URL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required variable: ${name}" >&2
    exit 1
  fi
done

log() { printf '[deploy] %s\n' "$*"; }

# Copies the latest revision of a family (which Terraform keeps up to date with
# settings and secrets) and swaps in the new image. Prints the new revision's ARN.
register_revision() {
  local family="$1"
  aws ecs describe-task-definition --task-definition "${family}" --query taskDefinition --output json \
    | jq --arg image "${IMAGE}" '
        .containerDefinitions |= map(if .name == "app" then .image = $image else . end)
        | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
              .registeredAt, .registeredBy, .deregisteredAt)' \
    > "/tmp/${family}.json"
  aws ecs register-task-definition --cli-input-json "file:///tmp/${family}.json" \
    --query taskDefinition.taskDefinitionArn --output text
}

log "Image: ${IMAGE}"
migrate_definition="$(register_revision "${MIGRATE_FAMILY}")"
api_definition="$(register_revision "${API_FAMILY}")"
worker_definition="$(register_revision "${WORKER_FAMILY}")"

log "Running migrations: ${migrate_definition}"
task_arn="$(aws ecs run-task \
  --cluster "${CLUSTER}" \
  --task-definition "${migrate_definition}" \
  --capacity-provider-strategy capacityProvider=FARGATE,weight=1 \
  --network-configuration "awsvpcConfiguration={subnets=[${MIGRATE_SUBNETS}],securityGroups=[${MIGRATE_SECURITY_GROUP}],assignPublicIp=DISABLED}" \
  --started-by "deploy-${GITHUB_SHA:-manual}" \
  --query 'tasks[0].taskArn' --output text)"

aws ecs wait tasks-stopped --cluster "${CLUSTER}" --tasks "${task_arn}"
exit_code="$(aws ecs describe-tasks --cluster "${CLUSTER}" --tasks "${task_arn}" \
  --query 'tasks[0].containers[0].exitCode' --output text)"

if [[ "${exit_code}" != "0" ]]; then
  log "Migrations failed with exit code ${exit_code}. Services were not touched. Last log lines:"
  aws logs filter-log-events --log-group-name "${MIGRATE_LOG_GROUP}" \
    --log-stream-name-prefix "app/app/${task_arn##*/}" --query 'events[-20:].message' --output text || true
  exit 1
fi
log "Migrations applied"

log "Rolling out the API and worker"
aws ecs update-service --cluster "${CLUSTER}" --service "${API_SERVICE}" --task-definition "${api_definition}" >/dev/null
aws ecs update-service --cluster "${CLUSTER}" --service "${WORKER_SERVICE}" --task-definition "${worker_definition}" >/dev/null

# Fails if the circuit breaker rolls back, which also fails this job.
aws ecs wait services-stable --cluster "${CLUSTER}" --services "${API_SERVICE}" "${WORKER_SERVICE}"

for service in "${API_SERVICE}" "${WORKER_SERVICE}"; do
  # The backticks are JMESPath literals for the AWS CLI query, not shell expansion.
  # shellcheck disable=SC2016
  running="$(aws ecs describe-services --cluster "${CLUSTER}" --services "${service}" \
    --query 'services[0].deployments[?status==`PRIMARY`].taskDefinition | [0]' --output text)"
  expected="${api_definition}"
  [[ "${service}" == "${WORKER_SERVICE}" ]] && expected="${worker_definition}"
  if [[ "${running}" != "${expected}" ]]; then
    log "${service} is running ${running}, not the new release. It was rolled back."
    exit 1
  fi
done

log "Smoke test: ${API_URL}/health/ready"
status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 --retry 5 --retry-delay 3 \
  --retry-all-errors "${API_URL}/health/ready")"
if [[ "${status}" != "200" ]]; then
  log "Readiness check answered ${status}"
  exit 1
fi
log "Release is live"
