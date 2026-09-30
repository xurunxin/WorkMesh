#!/bin/sh
# Verify that one Lite image really serves all four roles, on the machine that
# built it, before the tarball is copied to a device.
#
# The unit tests pin the dispatch table and the compose validator pins the
# topology, but neither can see a wrong path inside the image. This script is the
# only check that does: it runs each role from the real entrypoint and requires
# proof that the entry script was found and started doing its job. A missing entry
# point fails as MODULE_NOT_FOUND; a working one fails later, on the dependency it
# cannot reach, and that difference is the whole signal.
#
# Usage: sh infra/lite/verify-image-roles.sh [image-reference]
# Runs on Linux or WSL. On Windows, use WSL: Docker Desktop's Linux engine is the
# only supported host for this script.
set -eu

IMAGE="${1:-workmesh-lite:local}"
RUN_ID="$(date +%s)-$$"
WORKDIR="$(mktemp -d)"
# How long a long-running role is given to prove it started. A role that resolves
# and loads its entry point prints its line immediately; this only bounds the
# wait for a role that retries a dependency it cannot reach.
ROLE_WINDOW=12
failures=0

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

# A database and an object store that do not exist. Every role must get past
# resolving and loading its entry script before either of these matters. The
# password is 32 characters because the guard derives POSTGRES_PASSWORD from
# DATABASE_URL and enforces that minimum, and a rejected role proves nothing.
UNREACHABLE_DATABASE_URL="postgres://workmesh:uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu@127.0.0.1:1/workmesh"

pass() { printf '  ok   %s\n' "$1"; }
fail() {
  printf '  FAIL %s\n' "$1"
  failures=$((failures + 1))
}

# Runs a role for a bounded time and captures its combined output.
#
# A detached run with an explicit deadline, not `docker run` to completion: a role
# that starts correctly and then retries a dependency it cannot reach never exits
# on its own, and a check that waits for that is a check that hangs.
#
# Deliberately not `--rm`: a role that fails fast is auto-removed before its logs
# can be read, which turns a diagnosable failure into "No such container".
run_role() {
  role="$1"
  shift
  container="workmesh-lite-verify-$RUN_ID-$role"
  docker run --detach --name "$container" \
    -e "WORKMESH_SERVICE=$role" "$@" "$IMAGE" >/dev/null
  waited=0
  while [ "$waited" -lt "$ROLE_WINDOW" ]; do
    if ! docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null | grep -q true; then
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  docker logs "$container" >"$WORKDIR/$role.log" 2>&1 || true
  docker stop --time 10 "$container" >/dev/null 2>&1 || true
  docker rm -f "$container" >/dev/null 2>&1 || true
}

# The entry script was not found, or the process died before it could try to
# reach a dependency. Either way the image does not deliver this role.
assert_role_started() {
  role="$1"
  log="$WORKDIR/$role.log"
  if grep -q "role=$role " "$log"; then
    pass "$role resolved its entry point ($(grep -m1 -o 'entry=[^ ]*' "$log"))"
  else
    fail "$role did not report a resolved entry point"
    sed -n '1,12p' "$log"
    return
  fi
  if grep -Eq 'Cannot find (module|package)|MODULE_NOT_FOUND|ENOENT' "$log"; then
    fail "$role could not load its entry script or a dependency"
    grep -E 'Cannot find (module|package)|MODULE_NOT_FOUND|ENOENT' "$log" | sed -n '1,4p'
  else
    pass "$role loaded its entry script"
  fi
}

printf 'Verifying Lite roles in %s\n\n' "$IMAGE"

# --- the guard rejects a role that does not exist at all ------------------------
output="$(docker run --rm --name "workmesh-lite-verify-$RUN_ID-bogus" \
  -e WORKMESH_SERVICE=bogus "$IMAGE" 2>&1)" && status=0 || status=$?
case "$output" in
  *'WORKMESH_SERVICE is invalid'*)
    [ "$status" -ne 0 ] && pass "unknown role is rejected by the runtime guard" \
      || fail "unknown role was rejected but the container exited 0"
    ;;
  *) fail "unknown role produced an unexpected error"; printf '%s\n' "$output" | sed -n '1,8p' ;;
esac

# --- MCP is a real role that this image deliberately does not carry ------------
output="$(docker run --rm --name "workmesh-lite-verify-$RUN_ID-mcp" \
  -e WORKMESH_SERVICE=mcp \
  -e WORKMESH_API_URL=http://api:3001 \
  -e WORKMESH_SESSION_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -e WORKMESH_MCP_ACCESS_TOKEN=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  "$IMAGE" 2>&1)" && status=0 || status=$?
case "$output" in
  *'runs from its own image'*)
    [ "$status" -eq 64 ] && pass "mcp is refused with a diagnosis and exit code 64" \
      || fail "mcp was refused but exited $status instead of 64"
    ;;
  *) fail "mcp produced an unexpected error"; printf '%s\n' "$output" | sed -n '1,8p' ;;
esac

# --- migrate: entry point lives inside the API tree ----------------------------
run_role migrate -e "DATABASE_URL=$UNREACHABLE_DATABASE_URL"
assert_role_started migrate
if grep -Eqi 'ECONNREFUSED|connect|timeout' "$WORKDIR/migrate.log"; then
  pass "migrate reached the database step (entry point resolved inside the API tree)"
else
  fail "migrate did not fail on the database, so something earlier went wrong"
  sed -n '1,12p' "$WORKDIR/migrate.log"
fi

# --- api ----------------------------------------------------------------------
run_role api \
  -e "DATABASE_URL=$UNREACHABLE_DATABASE_URL" \
  -e REDIS_URL=redis://127.0.0.1:1 \
  -e SESSION_SECRET=5b0q_a2IRxbT0we2m_chizc6kb6cux-Av4VjBmx1kew \
  -e WORKMESH_MASTER_KEY=1111111111111111111111111111111111111111111111111111111111111111 \
  -e WORKMESH_BOOTSTRAP_TOKEN=8pq4q2WRz6-geCCKltMaWDso-Pp62ilcZPlOcwvcW1E \
  -e PAGINATION_CURSOR_KEYS=2026-01:I21L8y0xuk4jGQ2sMjcOSiJ0nVMdrsfo4wbxdwWh6T8 \
  -e PAGINATION_CURSOR_ACTIVE_KID=2026-01 \
  -e AUTH_RATE_LIMIT_HMAC_KEY=ffffffffffffffffffffffffffffffff \
  -e S3_BUCKET=workmesh-artifacts \
  -e S3_ACCESS_KEY_ID=workmesh \
  -e S3_SECRET_ACCESS_KEY=gggggggggggggggggggggggggggggggg \
  -e WEB_ORIGIN=http://127.0.0.1:3000
assert_role_started api

# --- worker -------------------------------------------------------------------
run_role worker \
  -e "DATABASE_URL=$UNREACHABLE_DATABASE_URL" \
  -e REDIS_URL=redis://127.0.0.1:1 \
  -e SESSION_SECRET=5b0q_a2IRxbT0we2m_chizc6kb6cux-Av4VjBmx1kew \
  -e WORKMESH_MASTER_KEY=2222222222222222222222222222222222222222222222222222222222222222 \
  -e S3_ENDPOINT=http://127.0.0.1:1 \
  -e S3_BUCKET=workmesh-artifacts \
  -e S3_ACCESS_KEY_ID=workmesh \
  -e S3_SECRET_ACCESS_KEY=iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
assert_role_started worker

# --- web: the only role that serves without a dependency, so it is proven ------
# Probed from inside the container with the Node that is already in the image, so
# the check needs no published port, no second image, and no host port parsing.
# HOSTNAME and PORT are supplied exactly as the compose supplies them: without
# them the Next runtime binds to the container hostname and nothing local answers.
container="workmesh-lite-verify-$RUN_ID-web"
docker run --rm --detach --name "$container" \
  -e WORKMESH_SERVICE=web \
  -e NEXT_API_UPSTREAM=http://api:3001 \
  -e HOSTNAME=0.0.0.0 \
  -e PORT=3000 \
  "$IMAGE" >/dev/null
attempt=0
while [ "$attempt" -lt 40 ]; do
  if ready="$(docker exec "$container" node -e "
    fetch('http://127.0.0.1:3000/readyz')
      .then((response) => { process.stdout.write(String(response.status)); process.exit(response.ok ? 0 : 1) })
      .catch(() => process.exit(1))
  " 2>/dev/null)"; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ -n "$ready" ]; then
  pass "web serves /readyz from its own tree"
else
  fail "web never became ready"
  docker logs "$container" 2>&1 | sed -n '1,20p'
fi

# The application root is not enough. A Next standalone runtime started from the
# wrong working directory serves HTML that 404s its own assets, so the first
# /_next/static reference in the page is fetched too. That is the check that
# proves the Web role's cwd is the standalone root.
assets="$(docker exec "$container" node -e "
  const base = 'http://127.0.0.1:3000'
  fetch(base + '/')
    .then((response) => response.text())
    .then((html) => {
      const match = html.match(/\/_next\/static\/[^\"']+/)
      if (!match) { process.stdout.write('NO_ASSET_REFERENCE'); return }
      return fetch(base + match[0]).then((asset) => {
        process.stdout.write(String(asset.status))
        process.exit(asset.ok ? 0 : 1)
      })
    })
    .catch((error) => { process.stdout.write('ERROR_' + error.message); process.exit(1) })
" 2>/dev/null || true)"
case "$assets" in
  2*) pass "web serves the application root and its _next/static asset" ;;
  NO_ASSET_REFERENCE) fail "web served no /_next/static reference; the bundle is not wired" ;;
  *) fail "web did not serve a static asset (got '${assets:-no response}')" ;;
esac
docker stop --time 20 "$container" >/dev/null 2>&1 || true

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Lite image role verification passed: one image, four roles.\n'
  exit 0
fi
printf 'Lite image role verification FAILED with %s problem(s).\n' "$failures"
exit 1
