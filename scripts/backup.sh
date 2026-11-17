#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
backup_dir=${SOTOVOR_BACKUP_DIR:-"$root/backups"}
retention=${SOTOVOR_BACKUP_RETENTION_DAYS:-14}
if [[ ! "$retention" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo 'SOTOVOR_BACKUP_RETENTION_DAYS must be between 1 and 9999.' >&2
  exit 2
fi
mkdir -p -- "$backup_dir"
archive="$backup_dir/sotovor-$(date -u +'%Y%m%dT%H%M%S')-$$.archive.gz"
partial=$(mktemp "$backup_dir/.partial.XXXXXXXX")
trap 'rm -f -- "$partial"' EXIT

bash "$root/scripts/prod-compose.sh" exec -T mongo sh -ec '
  exec mongodump --host 127.0.0.1 --username "$SOTOVOR_MONGO_APP_USER" \
    --password "$SOTOVOR_MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_INITDB_DATABASE" \
    --db "$MONGO_INITDB_DATABASE" --archive --gzip
' > "$partial"
gzip -t -- "$partial"
mv -- "$partial" "$archive"
find "$backup_dir" -maxdepth 1 -type f -name 'sotovor-*.archive.gz' -mmin "+$((retention * 1440 - 1))" -delete
printf '%s\n' "$archive"
