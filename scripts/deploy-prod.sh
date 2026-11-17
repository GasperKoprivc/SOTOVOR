#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd -- "$root"
if [[ $# -ne 1 || ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: bash scripts/deploy-prod.sh <40-character commit SHA>' >&2
  exit 2
fi
# Serialize manual and automated deploys on the VPS.
exec 9>.deploy.lock
flock -w 300 9
compose=(bash scripts/prod-compose.sh)
pending=$(mktemp .release.XXXXXXXX)
trap 'rm -f -- "$pending"' EXIT
printf 'SOTOVOR_IMAGE=gasperkoprivc/sotovor:sha-%s\n' "$1" > "$pending"
SOTOVOR_RELEASE_FILE="$root/$pending" "${compose[@]}" pull

if [[ -f .release.env ]] && ! cmp -s .release.env "$pending"; then
  cp .release.env .previous-release.env
fi
mv -- "$pending" .release.env
"${compose[@]}" up -d --wait --wait-timeout 180
# Remount Caddyfile even when the deployment upload replaced its inode.
"${compose[@]}" up -d --no-deps --force-recreate caddy
domain=$("${compose[@]}" exec -T caddy printenv SOTOVOR_DOMAIN)
bash scripts/smoke-prod.sh "https://$domain"
