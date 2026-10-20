# syntax=docker/dockerfile:1.7
ARG WORKMESH_API_IMAGE
FROM ${WORKMESH_API_IMAGE} AS validators
# Copy only the compiled validator dependency closure, not the entire API tree.
RUN mkdir -p /tmp/workmesh-installer/node_modules/@workmesh \
    && cp -aL /app/node_modules/@workmesh/config /tmp/workmesh-installer/node_modules/@workmesh/config \
    && cp -aL /app/node_modules/@workmesh/contracts /tmp/workmesh-installer/node_modules/@workmesh/contracts \
    && cp -aL /app/node_modules/zod /tmp/workmesh-installer/node_modules/zod \
    && cp /app/runtime-secrets.mjs /tmp/workmesh-installer/runtime-secrets.mjs

FROM node:22.19.0-alpine3.21
ARG WORKMESH_BUILD_SHA
RUN apk upgrade --no-cache \
    && apk add --no-cache docker-cli docker-cli-compose postgresql16-client \
    && test -n "$WORKMESH_BUILD_SHA" \
    && echo "$WORKMESH_BUILD_SHA" | grep -Eq '^[0-9a-f]{40}$' \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=validators /tmp/workmesh-installer /app
COPY scripts/server-distribution /opt/workmesh/server-distribution
WORKDIR /app
ENV NODE_ENV=production WORKMESH_BUILD_SHA=$WORKMESH_BUILD_SHA
LABEL org.opencontainers.image.revision=$WORKMESH_BUILD_SHA \
      org.opencontainers.image.title="WorkMesh Server Installer"
ENTRYPOINT ["node", "/opt/workmesh/server-distribution/install.mjs"]
