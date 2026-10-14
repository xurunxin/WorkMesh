#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then exit 2; fi
case "$1" in
  http://*|https://*) ;;
  *) exit 1 ;;
esac
# The configured readiness endpoints are local and never contain credentials.
case "$1" in *'@'*) exit 1 ;; esac
# Avoid starting a JavaScript VM for each probe. Do not follow redirects or use
# proxy environment variables; require a complete response within the same 2s.
status=$(curl --silent --show-error --noproxy '*' --proto '=http,https' \
  --max-time 2 --max-redirs 0 --output /dev/null --write-out '%{http_code}' "$1") || exit 1
case "$status" in 2[0-9][0-9]) exit 0 ;; *) exit 1 ;; esac
