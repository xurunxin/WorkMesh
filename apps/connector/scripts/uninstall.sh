#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec "$directory/installer/bin/workmesh-connector-installer" --uninstall "$@"
