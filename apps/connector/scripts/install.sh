#!/bin/sh
set -eu
umask 077
unset NODE_OPTIONS NODE_PATH LD_PRELOAD LD_LIBRARY_PATH
distribution=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$distribution"
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) arch=amd64 ;;
  Linux:aarch64) arch=arm64 ;;
  *) echo INSTALL_ARCH_MISMATCH >&2; exit 1 ;;
esac
test "$arch" = '@ARCH@' || { echo INSTALL_ARCH_MISMATCH >&2; exit 1; }
sha256sum --check --status <<'WORKMESH_HELPER_SUMS'
@HELPER_SUMS@
WORKMESH_HELPER_SUMS
exec "./installer-linux-$arch/bin/workmesh-connector-installer" "$@"
