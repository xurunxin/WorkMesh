# Actionable Human and Agent collaboration queues

Issue: [#96](https://github.com/xurunxin/WorkMesh/issues/96)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADR: `docs/adr/0057-actionable-collaboration-queues.md`

Depends on: #88, #89, #90, and #92

## Objective

Turn the Inbox route into actionable Human and Agent queues with contextual
threads while preserving server-authoritative Attention, receipt, reply,
resolution, claim, and authorization semantics.

## Tasks

### 1. Publish bounded collaboration queue projections

Enrich Human Inbox list context and add a Human-authorized, body-redacted Agent
Inbox observability projection with recipient, claim, receipt, source subject,
deadline, and stale-recipient facts. Update contracts and OpenAPI first.

Tests: contract/OpenAPI parity; Human Team authorization; exact-Session body
redaction; claimant and receipt projection; pagination; disabled Graph metadata.

Definition of done: the Web can explain both queues without client joins or
exposing Agent Inbox content to another principal.

### 2. Build the actionable queue and contextual thread surface

Compose typed Human Attention, informational Human Inbox, and read-only Agent
delivery queues. Add URL-owned filters and selection, contextual thread detail,
reply draft preservation, receipts, readable resource links, and progressive
technical details.

Tests: required-vs-informational separation; reply revision conflict; distinct
ack/read/response/resolution labels; return focus; localization; empty/error and
offline states.

Definition of done: Human-required work never competes with informational noise,
and a selected message can be understood and answered in context.

### 3. Group safe notifications and reconcile realtime navigation

Group only equivalent low-value notification updates, preserve high-value and
failure facts individually, and refresh queues without reordering the active
selection. Add responsive split-pane and narrow queue-to-thread navigation.

Tests: duplicate/out-of-order convergence; grouping allow/deny matrix; keyboard
and screen-reader announcements; 390/768/1440/1920 reflow; Back/Forward restore.

Definition of done: repeated noise is bounded without hiding decisions, failures,
state transitions, evidence, or delivery results.

### 4. Integrated acceptance and release

Run focused contract, API, Web, integration, and browser coverage plus repository
gates, then open and merge the Issue-specific PR with exact evidence in WorkMesh.

Tests: Human question/reply lifecycle; atomic Agent claim observation; Approval
plus grouped updates; duplicate realtime delivery; reply conflict draft recovery;
Graph-disabled behavior.

Definition of done: Issue #96 is closed by a merged PR and WorkMesh records the
commit, PR, screenshots, and actual validation results.
