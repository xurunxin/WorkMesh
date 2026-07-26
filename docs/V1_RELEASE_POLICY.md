# WorkMesh v1 release policy

## Release candidates and GA

Release candidates use `v1.0.0-rc.N`, where `N` is a positive, monotonically
increasing integer. GA is `v1.0.0`.

An RC may be promoted to GA only from the same Git commit and the same immutable
container image digests that passed the RC gates. Promotion retags those exact
artifacts; it does not rebuild source, dependencies, or images. If any source,
lockfile, base image, generated artifact, or build input changes, publish a new
RC number and repeat the gates.

The release record must contain:

- Git commit SHA and immutable digest for every shipped image;
- CycloneDX or SPDX SBOMs for every image and distributable package;
- build provenance linking source, builder identity, inputs, and output digests;
- verifiable signatures for Git tags, images, SBOMs, and provenance;
- OpenAPI, Agent Protocol, MCP, A2A-adapter, and schema-baseline versions;
- the exact default-disabled flag registry and validation evidence;
- migration, backup, restore, rollback, and smoke-test evidence.

## RC gates

The candidate must pass lint, typecheck, unit tests, integration tests, browser
acceptance, production builds, clean-database migration, and every supported
pre-v1 baseline upgrade. The release review also verifies that disabled
capabilities admit, claim, effect, and disclose no gated work, and that
re-enabling preserves durable data and rechecks authority.

Security review must cover authentication before feature disclosure, Agent
authorization and revocation, webhook request validation, provider effect
fencing, secrets/log redaction, artifact checksums, dependency advisories, and
image scanning. A known Blocking or High finding prevents promotion.

## Known limitations in v1.0

- Beta and Experimental capabilities default disabled and are not covered by
  the Stable compatibility promise.
- Notification hourly/daily settings defer individual deliveries; they do not
  coalesce a digest payload.
- The built-in scheduler supports only the documented bounded five-field UTC
  cron grammar.
- A2A support is an Experimental, version-isolated `0.3` adapter.
- `WORKMESH_EXPERIMENTAL_MULTI_RUNTIME` is reserved; no multi-runtime execution
  implementation is shipped.
- Restore is a maintenance-window logical restore, not point-in-time recovery.
- Only the exact pre-v1 migration baselines in `VERSION_POLICY.md` are supported.
  Unknown or partial ledgers require operator recovery before traffic starts.

The v1.0 release does not claim future Issues #7, #8, #10, or #11 are complete.
Their acceptance criteria must be evaluated independently before any later
release changes this statement.

## Promotion record

For every RC and GA, record:

1. version, commit SHA, image digests, and artifact signatures;
2. gate commands and actual results;
3. supported upgrade baselines tested and restore evidence;
4. enabled flags used for full-capability testing and the all-disabled result;
5. known limitations and unresolved Medium-or-lower findings;
6. the approver and UTC promotion timestamp.
