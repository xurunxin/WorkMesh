# MCP transport boundary

Status: Accepted

## Context

MCP is a useful agent integration surface, but its request and resource conventions must not define WorkMesh authorization, state, or persistence semantics.

## Decision

Keep MCP as an adapter over shared contracts and domain commands. MCP resources expose bounded context manifests, plans, activities, and guidance; MCP mutation tools carry an idempotency key and invoke the same server-side command gate as REST. The domain package imports no MCP SDK or transport type. Session tokens, capability scope, approval, revision, and Stop are enforced by the API/domain boundary rather than tool descriptions.

## Alternatives

Embed business policy in MCP tools; expose unrestricted context blobs; make MCP the persistence model; use natural-language warnings for high-risk actions.

## Consequences

REST, SDK, and MCP observe identical error codes and invariants. A read-only MCP endpoint can be deployed separately without gaining mutation authority.

## Migration

Stage 1 adds MCP resource/tool mappings without changing Stage 0 REST behavior. A2A remains outside this stage.

## Spec changes

MCP resources use `workmesh://` URIs and mutation tools map to the Stage 1 REST contracts; they do not add a second domain protocol.
