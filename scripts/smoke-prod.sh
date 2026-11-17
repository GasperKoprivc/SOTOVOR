#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 || "$1" != https://* ]]; then
  echo 'Usage: bash scripts/smoke-prod.sh https://your-domain' >&2
  exit 2
fi
base=${1%/}
curl_args=(--fail --silent --show-error --retry 10 --retry-all-errors --retry-max-time 90 --max-time 10)
if [[ -n "${CURL_CA_BUNDLE:-}" ]]; then curl_args+=(--cacert "$CURL_CA_BUNDLE"); fi
ready=$(curl "${curl_args[@]}" "$base/readyz")
if [[ "$ready" != '{"status":"ready"}' ]]; then
  echo 'Unexpected response from /readyz.' >&2
  exit 1
fi
landing=$(curl "${curl_args[@]}" "$base/")
if [[ "$landing" != *'<div id="root">'* ]]; then
  echo 'The homepage did not return the Sotovor frontend.' >&2
  exit 1
fi
echo "Sotovor is ready at $base"
