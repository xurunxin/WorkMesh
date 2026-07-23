FROM node:22-alpine AS base
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && chmod -R a+rX "$COREPACK_HOME" \
  && addgroup -S workmesh \
  && adduser -S workmesh -G workmesh
WORKDIR /app
COPY --chown=workmesh:workmesh package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY --chown=workmesh:workmesh apps/api/package.json apps/api/package.json
COPY --chown=workmesh:workmesh apps/web/package.json apps/web/package.json
COPY --chown=workmesh:workmesh apps/worker/package.json apps/worker/package.json
COPY --chown=workmesh:workmesh apps/mcp/package.json apps/mcp/package.json
COPY --chown=workmesh:workmesh apps/fake-agent/package.json apps/fake-agent/package.json
COPY --chown=workmesh:workmesh packages/config/package.json packages/config/package.json
COPY --chown=workmesh:workmesh packages/contracts/package.json packages/contracts/package.json
COPY --chown=workmesh:workmesh packages/db/package.json packages/db/package.json
COPY --chown=workmesh:workmesh packages/domain/package.json packages/domain/package.json
COPY --chown=workmesh:workmesh packages/observability/package.json packages/observability/package.json
COPY --chown=workmesh:workmesh packages/ui/package.json packages/ui/package.json
COPY --chown=workmesh:workmesh packages/agent-sdk/package.json packages/agent-sdk/package.json
RUN --mount=type=cache,id=workmesh-web-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --chown=workmesh:workmesh . .
USER workmesh
CMD ["pnpm","--filter","@workmesh/web","dev","--hostname","0.0.0.0"]
