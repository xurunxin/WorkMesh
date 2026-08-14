#!/bin/sh
set -eu
node /app/runtime-guard.mjs
exec "$@"
