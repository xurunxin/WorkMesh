# syntax=docker/dockerfile:1.7
# Lite single-node image: one tag, four roles.
#
# The build happens elsewhere. A low-power device cannot run the Next.js
# production build, so this image is produced on a workstation and moved as a
# tarball (`docker save | gzip`, then `docker load`). That is the whole reason
# this file exists as one image instead of four: one build, one tag, no registry
# and no digest ring on the device.
#
# Layout installed in the runtime stage, matching the dispatch table in
# packages/config/src/service-command.ts:
#   /opt/workmesh/api      pnpm deploy tree for @workmesh/api
#   /opt/workmesh/worker   pnpm deploy tree for @workmesh/worker
#   /opt/workmesh/web      Next.js standalone bundle
# The entrypoint, guard, dispatcher, and health probe live inside the API tree so
# that `@workmesh/config` resolves through the deploy tree's node_modules.

ARG NODE_IMAGE=node:22.19.0-alpine3.21

FROM ${NODE_IMAGE} AS build
ARG NEXT_PUBLIC_API_URL
ENV COREPACK_HOME=/opt/corepack NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# An empty NEXT_PUBLIC_API_URL is the Lite default, not a mistake. The Browser
# then uses a relative base and the Next server proxies /api to
# NEXT_API_UPSTREAM, which is what keeps the session cookie first-party on a
# device that can be reached by LAN address, hostname, or tunnel name — none of
# which are knowable at build time.
RUN test -z "$NEXT_PUBLIC_API_URL" || node -e "new URL(process.env.NEXT_PUBLIC_API_URL)"
RUN corepack enable \
    && corepack prepare pnpm@9.15.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY skills/workmesh/SKILL.md skills/workmesh/public-key.pem ./skills/workmesh/
COPY skills/workmesh/references/protocol.md skills/workmesh/references/clients.md ./skills/workmesh/references/
COPY infra/docker/prepare-production-deploy.mjs ./infra/docker/prepare-production-deploy.mjs
RUN --mount=type=cache,id=workmesh-lite-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN pnpm check:workmesh-skill \
    && pnpm --filter @workmesh/config build \
    && pnpm --filter @workmesh/api... build \
    && pnpm --filter @workmesh/worker... build \
    && pnpm --filter @workmesh/web... build
# Three trees, not four: @workmesh/db is a workspace dependency of the API, so
# the migrate role runs from inside the API tree.
RUN pnpm --filter @workmesh/api --prod deploy /out-api \
    && node infra/docker/prepare-production-deploy.mjs /out-api \
    && pnpm --filter @workmesh/worker --prod deploy /out-worker \
    && node infra/docker/prepare-production-deploy.mjs /out-worker \
    && mkdir -p /out-web \
    && cp -R apps/web/.next/standalone/. /out-web/ \
    && mkdir -p /out-web/apps/web/.next \
    && cp -R apps/web/.next/static /out-web/apps/web/.next/static \
    && cp -R apps/web/public /out-web/apps/web/public

FROM ${NODE_IMAGE} AS runtime
ARG WORKMESH_BUILD_SHA
ARG NEXT_PUBLIC_API_URL
RUN apk upgrade --no-cache \
    && apk add --no-cache postgresql16-client \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && test -n "$WORKMESH_BUILD_SHA" \
    && echo "$WORKMESH_BUILD_SHA" | grep -Eq '^[0-9a-f]{40}$' \
    && addgroup -S -g 10001 workmesh \
    && adduser -S -D -H -u 10001 -G workmesh workmesh \
    && mkdir -p /opt/workmesh \
    && chown 10001:10001 /opt/workmesh
WORKDIR /opt/workmesh/api
# Absolute destinations on purpose. A relative `COPY ./api` resolves against
# WORKDIR, which silently nests the tree one level deeper and breaks every entry
# point in the dispatch table while leaving the image looking healthy.
COPY --from=build --chown=10001:10001 /out-api /opt/workmesh/api
COPY --from=build --chown=10001:10001 /out-worker /opt/workmesh/worker
COPY --from=build --chown=10001:10001 /out-web /opt/workmesh/web
COPY --chown=10001:10001 packages/config/src/runtime-secrets.mjs ./runtime-secrets.mjs
COPY --chown=10001:10001 infra/docker/runtime-guard.mjs ./runtime-guard.mjs
COPY --chown=10001:10001 infra/docker/lite-dispatch.mjs ./lite-dispatch.mjs
COPY --chown=10001:10001 infra/docker/lite-entrypoint.sh ./entrypoint.sh
COPY --chown=10001:10001 infra/docker/healthcheck.mjs ./healthcheck.mjs
# Windows checkouts may place CRLF in the shell script; normalize the shebang
# inside the Linux image before making the production entrypoint executable.
RUN sed -i 's/\r$//' /opt/workmesh/api/entrypoint.sh \
    && chmod 0555 /opt/workmesh/api/entrypoint.sh
# NEXT_PUBLIC_API_URL is baked into the Web bundle at build time and re-exported
# here so the runtime guard can verify it without Compose having to repeat it.
# HOSTNAME is set because the Next standalone runtime otherwise binds to the
# container hostname, which is correct-looking in the log and unreachable from
# inside the container. PORT stays unset: each role listens on its own port.
ENV NODE_ENV=production WORKMESH_BUILD_SHA=$WORKMESH_BUILD_SHA \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL HOSTNAME=0.0.0.0
LABEL org.opencontainers.image.revision=$WORKMESH_BUILD_SHA \
      org.opencontainers.image.title="WorkMesh Lite" \
      io.workmesh.lite.roles="api,worker,web,migrate" \
      io.workmesh.web.api-url=$NEXT_PUBLIC_API_URL
USER 10001:10001
STOPSIGNAL SIGTERM
ENTRYPOINT ["/opt/workmesh/api/entrypoint.sh"]
