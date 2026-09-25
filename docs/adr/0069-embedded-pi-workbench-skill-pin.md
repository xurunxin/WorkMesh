# Embedded Pi Workbench Skill pin

Status: Accepted for W12 partial implementation; public Skill release remains open.

## Context

The Pi Runner had no WorkMesh Skill loaded. It already offered capability filtered tools, but model behavior depended on a turn prompt to discover authority, read before a write, and report evidence. The public WorkMesh coordination Skill 1.1.0 is a signed release pinned by existing Agent Connections. Its signing key is unavailable in this environment; changing its bytes in place would invalidate those pins.

## Decision

Ship a separate, self-contained `workmesh-workbench` 0.1.0 Skill inside the Runner image. Generate a SHA-256 manifest from its exact bytes and check it before release. Before each Pi session starts, the Runner checks the packaged file against that manifest and fails closed on mismatch. Pi receives only this Skill and its content in the system prompt; ambient extensions, Skills, templates, themes, and context files are disabled. The server remains the sole authorization authority. The public signed WorkMesh 1.1.0 artifact remains unchanged.

## Alternatives

- Editing the signed 1.1.0 artifact in place would break an immutable release and existing Connection pins.
- Relying on turn prompts without an installed Skill would not pin operational guidance to an image.
- Dynamically loading arbitrary Skill paths would expose host configuration to the isolated Runner.

## Consequences

The image now has a deterministic Skill file and local hash check. A hash is an integrity pin within the built image, not a signature proving publisher identity. The Skill does not grant capabilities. W12 cannot close until its public signed release, durable Session pin/readback, documentation, and evaluation matrix are delivered. The fixed Skill content contains no credentials.

## Migration

No database migration. Existing Connection Skill pins and release URLs retain 1.1.0. The Runner Docker images include the new file at `/app/apps/agent-runner/skills/` for development or `/app/skills/` for production. Regenerate the 0.1.0 manifest deliberately after Skill edits and verify with `pnpm check:runner-skill` before rebuilding the image.

## Spec changes

W12 plan records the partial implementation and remaining gates. No REST API, event schema, or Agent Protocol change. The later public version and Session pin will require a separate spec/API review.
