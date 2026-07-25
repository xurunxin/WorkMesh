# Repository context and AGENTS scope

Status: Accepted

## Context

Agents require reproducible repository context, but repository guidance is untrusted input and must not grant capabilities or disclose repositories outside a live delegation.

## Decision

A repository context immutably pins repository, base branch, base SHA, branch naming pattern, allowed paths, allowed repository operations, and exactly one project, work item, or session. The caller supplies scope and the pinned SHA, but never supplies guidance content or provenance. After the API commits a human-authorized resolution intent, the worker revalidates the human administrator/maintainer authority and asks the provider to read the pinned commit tree and applicable blobs. Applicable `AGENTS.md` files are discovered root-to-leaf and recorded with provider blob SHA, SHA-256 content hash, and exact content. Context is authorized before it is read or returned. Agent access requires active definition, Team grant, delegation, `repo:read`, and a matching resource link.

Guidance can constrain requested work but cannot add platform capability, Team access, approval, or merge authority. Commit intents reject traversal and paths outside the pinned scope.

## Alternatives

Reading the provider live on every prompt; treating AGENTS.md as platform policy; a mutable unversioned context blob.

## Consequences

Sessions are reproducible at a specific repository state and guidance provenance is auditable. A changed base or guidance file requires a new immutable context.

## Migration

Migration 0008 adds repository contexts and guidance entries. Migration 0013 stores the provider-resolved guidance content and supports an asynchronous human context-resolution action.

## Spec changes

Repository context contracts include base SHA, path/permission scope, and guidance provenance.
