#!/bin/sh
set -eu
umask 077
# The digest must come from the reviewed candidate channel, not from this bundle.
# Node/pnpm/source are not host prerequisites; only the trusted helper uses Node.
[ "$#" -ge 5 ] || { echo 'INSTALL_ARGUMENTS_REQUIRED' >&2; exit 1; }
bundle=$1; expected=$2; prefix=$3; config=$4; action=$5
case "$bundle:$prefix:$config" in *,*) echo 'INSTALL_UNSAFE_PATH' >&2; exit 1;; esac
case "$bundle" in /*) ;; *) echo 'INSTALL_ABSOLUTE_PATH_REQUIRED' >&2; exit 1;; esac
case "$prefix" in /*) ;; *) echo 'INSTALL_ABSOLUTE_PATH_REQUIRED' >&2; exit 1;; esac
case "$config" in /*) ;; *) echo 'INSTALL_ABSOLUTE_PATH_REQUIRED' >&2; exit 1;; esac
[ "${#expected}" = 64 ] && ! printf '%s' "$expected" | grep -q '[^a-f0-9]' || exit 1
[ "$(sha256sum "$bundle/manifest.json" | cut -d ' ' -f 1)" = "$expected" ] || { echo 'INSTALL_MANIFEST_DIGEST_MISMATCH' >&2; exit 1; }
docker compose version >/dev/null
# Only the producer's canonical, digest-authenticated JSON layout is accepted.
parts=$(sed -n '/^  "bootstrapChunks": \[/,/^  \],/p' "$bundle/manifest.json" | sed -n 's/^      "path": "\(chunks\/[a-f0-9]*\.tarpart\)",$/\1/p')
[ -n "$parts" ] || { echo 'INSTALL_BOOTSTRAP_INVALID' >&2; exit 1; }
for part in $parts; do
  digest=${part#chunks/}; digest=${digest%.tarpart}
  [ "${#digest}" = 64 ] && [ -f "$bundle/$part" ] && [ ! -L "$bundle/$part" ] || exit 1
  [ "$(sha256sum "$bundle/$part" | cut -d ' ' -f 1)" = "$digest" ] || { echo 'INSTALL_FILE_DIGEST_MISMATCH' >&2; exit 1; }
done
image=$(sed -n 's/^  "installerImage": "\(sha256:[a-f0-9]*\)".*$/\1/p' "$bundle/manifest.json")
[ "${#image}" = 71 ] || { echo 'INSTALL_BOOTSTRAP_INVALID' >&2; exit 1; }
original_image=$image
archive_image=$(sed -n 's/^  "installerArchiveImage": "\(sha256:[a-f0-9]*\)".*$/\1/p' "$bundle/manifest.json")
[ "${#archive_image}" = 71 ] || { echo 'INSTALL_BOOTSTRAP_INVALID' >&2; exit 1; }
trusted_helper() {
  for candidate in "$original_image" "$archive_image"; do
    actual=$(docker image inspect "$candidate" --format '{{.Id}}' 2>/dev/null || true)
    case "$actual" in "$original_image"|"$archive_image") printf '%s\n' "$actual"; return 0;; esac
  done
  return 1
}
# Importing the trusted tool is the bootstrap boundary; application startup and
# other image imports happen only after the helper validates configuration.
# Reuse an already imported exact digest. Bootstrap chunk verification above and
# the helper's full bundle/configuration verification still run on every call.
if image=$(trusted_helper); then :; else
  for part in $parts; do cat "$bundle/$part"; done | docker load >/dev/null
  image=$(trusted_helper) || { echo 'INSTALL_BOOTSTRAP_IMAGE_MISSING' >&2; exit 1; }
fi
shift 5
exec docker run --rm --network host --pull never \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --mount "type=bind,src=$bundle,dst=$bundle,readonly" \
  --mount "type=bind,src=$prefix,dst=$prefix" \
  --mount "type=bind,src=$config,dst=/run/workmesh-install-config.json,readonly" \
  "$image" --bundle "$bundle" --digest "$expected" --prefix "$prefix" \
  --config /run/workmesh-install-config.json --action "$action" "$@"
