#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$directory"
if ! sha256sum --check --status <<'WORKMESH_HELPER_SUMS'
@HELPER_SUMS@
WORKMESH_HELPER_SUMS
then
  echo INSTALL_HELPER_HASH >&2
  exit 1
fi
exec "$directory/installer/bin/workmesh-connector-installer" --uninstall "$@"
