#!/bin/sh
# Lite image entrypoint. Differs from `entrypoint.sh` only in the second line:
# this image serves four roles and has no per-service `command:` to exec, so the
# dispatcher resolves the role from WORKMESH_SERVICE. Both files are kept
# separate so the production images keep their exact current behaviour.
set -eu
node /opt/workmesh/api/runtime-guard.mjs
exec node /opt/workmesh/api/lite-dispatch.mjs "$@"
