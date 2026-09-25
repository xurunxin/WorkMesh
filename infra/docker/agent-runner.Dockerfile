FROM node:22-alpine
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable \
  && corepack prepare pnpm@9.15.4 --activate \
  && chmod -R a+rX "$COREPACK_HOME" \
  && addgroup -S workmesh \
  && adduser -S workmesh -G workmesh
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/agent-runner/package.json apps/agent-runner/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=workmesh-runner-pnpm-store,target=/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY --chown=workmesh:workmesh apps/agent-runner apps/agent-runner
COPY --chown=workmesh:workmesh packages/contracts packages/contracts
USER workmesh
CMD ["pnpm", "--filter", "@workmesh/agent-runner", "run:session"]
