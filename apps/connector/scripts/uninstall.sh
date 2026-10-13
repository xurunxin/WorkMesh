#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$directory"
sha256sum --check --status <<'WORKMESH_HELPER_SUMS'
@HELPER_SUMS@
WORKMESH_HELPER_SUMS
exec "$directory/installer/bin/workmesh-connector-installer" --uninstall "$@"
