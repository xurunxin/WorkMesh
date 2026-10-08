#!/usr/bin/env bash
set -euo pipefail
task_dir=$(mktemp -d -t workmesh-connector-native-XXXXXX)
export XDG_DATA_HOME="$task_dir/data"
export XDG_RUNTIME_DIR="$task_dir/runtime"
mkdir -p "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"
cleanup() {
  pnpm exec tsx scripts/connector-secret-probe.mts delete >/dev/null 2>&1 || true
  if [[ -n "${keyring_pid:-}" ]]; then kill "$keyring_pid" 2>/dev/null || true; fi
  rm -rf -- "$task_dir"
  printf '已清理连接器平台临时目录：%s\n' "$task_dir"
}
trap cleanup EXIT
start_keyring() {
  printf '%s' 'connector-test-only' | gnome-keyring-daemon --foreground --unlock --components=secrets >/dev/null 2>&1 &
  keyring_pid=$!
  sleep 2
}
start_keyring
export WM_CONNECTOR_NATIVE_REF="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
export WM_CONNECTOR_NATIVE_DIGEST="$(pnpm exec tsx scripts/connector-secret-probe.mts put)"
kill "$keyring_pid"
wait "$keyring_pid" || true
start_keyring
pnpm exec tsx scripts/connector-secret-probe.mts check
pnpm exec tsx scripts/connector-secret-probe.mts delete
pnpm --filter @workmesh/connector test:platform
pnpm --filter @workmesh/connector test
