#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
env_file=${SOTOVOR_ENV_FILE:-"$root/.env"}
release_file=${SOTOVOR_RELEASE_FILE:-"$root/.release.env"}
env_args=(--env-file "$env_file")
if [[ -f "$release_file" ]]; then
  env_args+=(--env-file "$release_file")
fi
exec docker compose --project-name "${COMPOSE_PROJECT_NAME:-sotovor}" \
  --project-directory "$root" "${env_args[@]}" -f "$root/compose.prod.yaml" "$@"
