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
test "$arch" = 'amd64' || { echo INSTALL_ARCH_MISMATCH >&2; exit 1; }
if ! sha256sum --check --status <<'WORKMESH_HELPER_SUMS'
2ef87e87e8d1540cb9fd0aed6ffc8ecddfb1c7cafa2836b21e6143f67ec2c5da  installer-linux-amd64/bin/workmesh-connector-installer
fbe4d645feb0d4232176a3352a2ac6bd145fc496af7ebc2b86cae793cb778b11  installer-linux-amd64/node_modules/@koromix/koffi-linux-x64/index.js
eeae504bbd28c8b70d59c298a76aba281d0aff2d198c1fde667e5a93f3bedfe2  installer-linux-amd64/node_modules/@koromix/koffi-linux-x64/linux_x64/koffi.node
2f112cec6975d21f855ed845a9627d248425ecbf04ed1d5705f690d6994edcdb  installer-linux-amd64/node_modules/@koromix/koffi-linux-x64/package.json
22bcbbbacd739b026a8dc484f62a31484ce4c4e31f3408b60b29b4e41d62b290  installer-linux-amd64/node_modules/koffi/LICENSE.txt
d5e4c3b53c1166265f3b7a386a0aec446bb99c41bf58c6c05643d1dcade12ffd  installer-linux-amd64/node_modules/koffi/cnoke.cjs
a200e15ec168d00cb3155794808a98243051c61dd7f6989c23c57ee220c918b9  installer-linux-amd64/node_modules/koffi/index.cjs
34508972d2e18b79fd4a289943568a68bbaf18badd2e82a25c8deb1af27f6225  installer-linux-amd64/node_modules/koffi/index.js
f36c7fd3caa9c43da3db45e1ee272892087b4001b6f575fffb76dd80574829b1  installer-linux-amd64/node_modules/koffi/indirect.cjs
5c5045c5b5ec2083535efdfdbd95f5212545ce29a4b7f33a683504a35e5b6a02  installer-linux-amd64/node_modules/koffi/indirect.js
80d8fbff4730e3314f3036fefd5af0d89203ed8a01c61d134727f1d38a16d72b  installer-linux-amd64/node_modules/koffi/package.json
5e8bf2ce51906244b2b8e8c5c321afd79c2f8d65c9846a118f845db96dbb33d0  installer-linux-amd64/node_modules/koffi/src/koffi/index.cjs
025b00fbc7f952eef40c98e4778832108585260be3611d2175584eff93d5604b  installer-linux-amd64/node_modules/koffi/src/koffi/index.js
ca74165a3a78b02cab86eda18147e073a43ca2f7123c5bc0aa575a34150b2377  installer-linux-amd64/node_modules/koffi/src/koffi/indirect.cjs
fda9ae20155cac5038d5d254670df48b40b9e828a4bd23a90934ebb2ba7a0947  installer-linux-amd64/node_modules/koffi/src/koffi/indirect.js
522a9d98e271b565de4013910b8c81bb061a34d3460e43fd9a92daab8fbadddc  installer-linux-amd64/node_modules/koffi/src/koffi/src/static.cjs
a2a6ea215e4d5f26d039b48eee1e7c8ca037935c4fcba8d0ec2b6e680fa7a976  installer-linux-amd64/node_modules/koffi/src/koffi/src/static.js
82895e2a78b911b297e7497d9d6033ab87a0afe64f4904615dacfa318d83adfa  installer-linux-amd64/node_modules/koffi/src/koffi/src/trampolines.cjs
WORKMESH_HELPER_SUMS
then
  echo INSTALL_HELPER_HASH >&2
  exit 1
fi
exec "./installer-linux-$arch/bin/workmesh-connector-installer" "$@"
