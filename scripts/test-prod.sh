#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
temp=$(mktemp -d)
export COMPOSE_PROJECT_NAME="sotovor-test-$$"
export SOTOVOR_ENV_FILE="$temp/test.env"
export SOTOVOR_RELEASE_FILE="$temp/release.env"
export SOTOVOR_BACKUP_DIR="$temp/backups"
export SOTOVOR_BACKUP_RETENTION_DAYS=1
export SOTOVOR_IMAGE="sotovor-production-test:$$"
compose=(bash "$root/scripts/prod-compose.sh")
if [[ $(curl --version) == *Schannel* ]]; then
  # The disposable local CA does not publish a certificate revocation list.
  curl() { command curl --ssl-revoke-best-effort "$@"; }
  export -f curl
fi
cleanup() {
  local result=$?
  if (( result != 0 )); then "${compose[@]}" logs --tail 35 || true; fi
  "${compose[@]}" down --volumes --remove-orphans || true
  docker image rm "$SOTOVOR_IMAGE" >/dev/null 2>&1 || true
  rm -f -- "$temp/test.env" "$temp/release.env" "$temp/ca.crt" "$temp/backups"/sotovor-*.archive.gz
  if [[ -d "$temp/backups" ]]; then rmdir -- "$temp/backups"; fi
  rmdir -- "$temp"
}
trap cleanup EXIT

cat > "$SOTOVOR_ENV_FILE" <<'ENV'
SOTOVOR_DOMAIN=localhost
SOTOVOR_MONGO_ADMIN_PASSWORD=test-admin-only
SOTOVOR_MONGO_APP_PASSWORD=test-app-only
SOTOVOR_SMTP_HOST=unused.example.invalid
SOTOVOR_SMTP_USER=test
SOTOVOR_SMTP_PASSWORD=test
SOTOVOR_SMTP_FROM=test@example.invalid
ENV

docker build -t "$SOTOVOR_IMAGE" "$root"
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" exec -T caddy sh -ec 'caddy validate --config /etc/caddy/Caddyfile'
"${compose[@]}" exec -T caddy sh -ec '
  for attempt in 1 2 3 4 5; do
    if [ -s /data/caddy/pki/authorities/local/root.crt ]; then
      exec cat /data/caddy/pki/authorities/local/root.crt
    fi
    sleep 1
  done
  exit 1
' > "$temp/ca.crt"
CURL_CA_BUNDLE="$temp/ca.crt" bash "$root/scripts/smoke-prod.sh" https://localhost
curl --fail --silent --show-error --head --cacert "$temp/ca.crt" https://localhost/healthz |
  awk 'tolower($0) ~ /^permissions-policy:.*microphone=\(self\)/ { found=1 } END { exit !found }'

mongo_id=$("${compose[@]}" ps -q mongo)
published=$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$mongo_id")
if [[ "$published" != null && "$published" != '{}' ]]; then
  echo 'MongoDB has a published port.' >&2
  exit 1
fi
mongo_query() {
  "${compose[@]}" exec -T mongo sh -ec '
    exec mongosh --quiet --username "$SOTOVOR_MONGO_APP_USER" --password "$SOTOVOR_MONGO_APP_PASSWORD" \
      --authenticationDatabase "$MONGO_INITDB_DATABASE" "$MONGO_INITDB_DATABASE" --eval "$1"
  ' query "$1"
}
# Check MongoDB enforces authentication and keeps the application user scoped to Sotovor.
"${compose[@]}" exec -T mongo mongosh --quiet --eval '
  try { db.getSiblingDB("sotovor").accounts.findOne(); quit(1); }
  catch (error) { quit(error.code === 13 ? 0 : 2); }'
mongo_query 'try { db.getSiblingDB("admin").system.users.findOne(); quit(1); }
  catch (error) { quit(error.code === 13 ? 0 : 2); }'
mongo_query 'db.backupTest.insertOne({_id: 1, value: "before-backup"}); db.backupTest.createIndex({value: 1});'
mkdir -p "$SOTOVOR_BACKUP_DIR"
touch -t 200001010000 "$SOTOVOR_BACKUP_DIR/sotovor-expired.archive.gz"
archive=$(bash "$root/scripts/backup.sh")
test -s "$archive"
test ! -e "$SOTOVOR_BACKUP_DIR/sotovor-expired.archive.gz"
mongo_query 'db.backupTest.updateOne({_id: 1}, {$set: {value: "changed"}});'
bash "$root/scripts/restore.sh" --replace "$archive"
mongo_query 'quit(db.backupTest.findOne({_id: 1})?.value === "before-backup" &&
  db.backupTest.getIndexes().some(index => index.name === "value_1") ? 0 : 1);'
"${compose[@]}" up -d --wait --wait-timeout 90
CURL_CA_BUNDLE="$temp/ca.crt" bash "$root/scripts/smoke-prod.sh" https://localhost
echo 'Production HTTPS, MongoDB access, backup retention and restore verified.'
