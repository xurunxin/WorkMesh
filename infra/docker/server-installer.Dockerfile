# syntax=docker/dockerfile:1.7
ARG WORKMESH_API_IMAGE
FROM ${WORKMESH_API_IMAGE}
USER root
RUN apk add --no-cache docker-cli docker-cli-compose
COPY scripts/server-distribution /opt/workmesh/server-distribution
WORKDIR /app
ENTRYPOINT ["node", "/opt/workmesh/server-distribution/install.mjs"]
