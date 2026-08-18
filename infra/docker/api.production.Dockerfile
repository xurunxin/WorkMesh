# syntax=docker/dockerfile:1.7
FROM node:22.17.1-alpine3.22 AS build
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY infra/docker/prepare-production-deploy.mjs ./infra/docker/prepare-production-deploy.mjs
RUN --mount=type=cache,id=workmesh-production-pnpm,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
RUN pnpm --filter @workmesh/config build \
    && pnpm --filter @workmesh/api... build \
    && pnpm --filter @workmesh/api --prod deploy /out \
    && node infra/docker/prepare-production-deploy.mjs /out

FROM node:22.17.1-alpine3.22 AS runtime
ARG WORKMESH_BUILD_SHA
RUN apk upgrade --no-cache \
    && apk add --no-cache postgresql16-client \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && test -n "$WORKMESH_BUILD_SHA" \
    && echo "$WORKMESH_BUILD_SHA" | grep -Eq '^[0-9a-f]{40}$' \
    && addgroup -S -g 10001 workmesh \
    && adduser -S -D -H -u 10001 -G workmesh workmesh
WORKDIR /app
COPY --from=build --chown=10001:10001 /out ./
COPY --chown=10001:10001 packages/config/src/runtime-secrets.mjs ./runtime-secrets.mjs
COPY --chown=10001:10001 infra/docker/runtime-guard.mjs infra/docker/entrypoint.sh infra/docker/healthcheck.mjs ./
# Windows checkouts may place CRLF in the shell script; normalize the shebang
# inside the Linux image before making the production entrypoint executable.
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod 0555 /app/entrypoint.sh
ENV NODE_ENV=production WORKMESH_SERVICE=api WORKMESH_BUILD_SHA=$WORKMESH_BUILD_SHA API_HOST=0.0.0.0 API_PORT=3001
LABEL org.opencontainers.image.revision=$WORKMESH_BUILD_SHA \
      org.opencontainers.image.title="WorkMesh API"
USER 10001:10001
EXPOSE 3001
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/server.js"]
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD ["node", "/app/healthcheck.mjs", "http://127.0.0.1:3001/readyz"]
