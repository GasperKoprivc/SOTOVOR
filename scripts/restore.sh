#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $# -ne 2 || "$1" != '--replace' || ! -f "$2" ]]; then
  echo 'Usage: bash scripts/restore.sh --replace /path/to/sotovor-*.archive.gz' >&2
  echo 'Stops the app and replaces collections contained in the archive.' >&2
  exit 2
fi
archive=$2
gzip -t -- "$archive"
compose=(bash "$root/scripts/prod-compose.sh")
# Check the archive and namespace before taking the application offline.
restore=(exec -T mongo sh -ec '
  exec mongorestore --host 127.0.0.1 --username "$SOTOVOR_MONGO_APP_USER" \
    --password "$SOTOVOR_MONGO_APP_PASSWORD" --authenticationDatabase "$MONGO_INITDB_DATABASE" \
    --nsInclude "$MONGO_INITDB_DATABASE.*" --archive --gzip "$@"
' restore)
"${compose[@]}" "${restore[@]}" --dryRun < "$archive"
"${compose[@]}" stop app
"${compose[@]}" "${restore[@]}" --drop --stopOnError < "$archive"
echo 'Restore finished. Start the app with: bash scripts/prod-compose.sh up -d --wait'
