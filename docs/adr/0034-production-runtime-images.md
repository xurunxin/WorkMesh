# Production runtime images and lifecycle

Status

Accepted

Context

The development Compose stack builds from the checkout and runs source-oriented commands. That is useful for local work, but it does not provide immutable application artifacts, exact source provenance, minimal runtime contents, fail-closed production configuration, independent readiness, or a bounded shutdown contract. Reusing that file for production would also couple safe local defaults to production policy.

Decision

WorkMesh has a separate `docker-compose.production.yml`. Its API, worker, MCP, and Web services consume four explicit required full-image references and never build from the deployment checkout. Each reference accepts either a GHCR exact 40-character Git SHA tag for pre-release validation or a GHCR `@sha256` digest for immutable release deployment. Digests are preferred, and the Issue #10 RC workflow enforces digest-only release composition. Each service has a dedicated multi-stage Dockerfile. API, worker, and MCP images contain compiled JavaScript plus production dependencies; the Web image uses Next.js standalone output. Every image records `org.opencontainers.image.revision` and runs as UID/GID `10001:10001`.

The production Compose application services use a read-only root filesystem, drop all Linux capabilities, disable privilege escalation, and provide only a no-exec `/tmp` tmpfs. Required credentials have no usable fallback values. The optional MCP profile renders empty credential values when disabled, while its image preflight fails closed if the profile is actually started without them. An image preflight rejects a missing or non-production environment, an invalid build SHA, placeholders, weak secrets, and exact secret reuse before the service starts.

All four runtimes expose independent `/livez` and `/readyz` endpoints. Liveness proves that the process and health server are responsive without checking dependencies. Readiness withdraws admission during shutdown and proves required dependencies. Worker readiness checks PostgreSQL, Redis, and object storage. PostgreSQL Compose readiness uses TCP so its temporary initialization server cannot release the migration dependency.

SIGTERM first withdraws readiness and admission. API and MCP stop accepting requests. The worker stops scheduling and claiming new work, waits for the currently claimed tick, and then closes its dependencies. Each service has a 30-second internal deadline and a 35-second Compose grace period.

Alternatives

One Compose file with environment-dependent build and runtime behavior was rejected because development fallbacks could leak into production and make the deployed artifact ambiguous. Source runners such as `tsx` were rejected because they ship build tooling and source into the runtime. A shared health endpoint was rejected because it cannot express per-process admission or dependency state. Immediate worker termination was rejected because it can interrupt claimed work without a drain opportunity.

Consequences

Operators publish four images for one exact Git SHA, set `WORKMESH_BUILD_SHA` to that source revision, and set `WORKMESH_API_IMAGE`, `WORKMESH_WORKER_IMAGE`, `WORKMESH_MCP_IMAGE`, and `WORKMESH_WEB_IMAGE` to the matching full GHCR references. A digest reference controls immutable artifact selection while `WORKMESH_BUILD_SHA` remains the runtime/source label. `NEXT_PUBLIC_API_URL` is a Web build input, so a Web image is tied to its external API URL; the label `io.workmesh.web.api-url` makes that value inspectable. Deployments must use distinct, high-entropy secrets and a TLS reverse proxy. The MCP service remains opt-in through the `agent` profile.

Migration

Existing local development continues to use `docker-compose.yml` and its source-oriented workflow. Production operators build and publish the four production Dockerfiles, resolve their pushed digests, populate a production environment file with full references, validate the rendered Compose configuration, and start `docker-compose.production.yml`. Exact-SHA tags remain available for pre-release validation until the RC workflow supplies digest-only references. The one-shot compiled migrator runs before API and worker startup and remains idempotent. No database schema migration is introduced by this decision.

Spec changes

`docker-compose.production.yml`, the four production Dockerfiles, `.env.example`, `docs/production-deployment.md`, the runtime health endpoints, and `scripts/validate-production-images.mjs` define and verify the production image, configuration, lifecycle, and health contracts.
