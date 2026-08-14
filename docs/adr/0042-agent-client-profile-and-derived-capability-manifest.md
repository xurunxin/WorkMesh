# Agent Client Profile and derived capability manifest

Status

Accepted

Context

Native HTTP, MCP, webhook, Inbox, realtime, Session, Artifact, and Handoff
surfaces existed without one adapter-neutral client contract. A separately
maintained capability list would drift from route authorization and could be
misread as a grant.

Decision

Publish Agent Collaboration Client Profile 1.0. Public server info declares the
preferred/supported Profile and conformance versions. An exact authenticated
Agent Session can retrieve a capability manifest through REST or MCP. Its
operation rows are generated from the checked-in route-policy manifest, feature
registry, and MCP policy bindings. Live definition, Team, and Delegation
capabilities are intersected only to produce `eligibleByCapability`; every
request remains subject to the existing authorization path.

Provide `@workmesh/conformance` with one driver-neutral lifecycle, Native HTTP
and MCP reference drivers, public Codex/OpenCode/pi-style behavior fixtures,
hostile-state reactions, and JSON/JUnit/transcript evidence. Engineering Graph
is an explicitly negotiated Experimental extension and remains disabled in
Stable Core.

Alternatives

A hand-authored capability endpoint was rejected because it creates a second
authorization registry. Vendor-specific adapters were rejected because private
runtime details are unstable and unnecessary. Happy-path-only smoke tests were
rejected because reconnect, duplicate delivery, revocation, stop, scope,
revision, Lease, approval, feature, and cursor failures define interoperability.

Consequences

Adding a REST or MCP operation changes the derived manifest automatically and
is checked by route-policy tests. Clients have actionable reactions without
assuming that advertised support grants authority. CI produces portable
machine-readable and human-readable conformance evidence.

Migration

No database migration is required. Existing clients remain compatible because
the public info response only adds fields and the new capability endpoint and
MCP resource are additive. Clients that request an unknown Profile version fail
closed rather than being silently downgraded.

Spec changes

OpenAPI, Agent Protocol, SDK, MCP, version policy, integration guide, README,
PRD, and CI document and exercise the same Profile 1.0 contract.
