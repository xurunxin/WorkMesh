# Multica-inspired authority-first Human-Agent workspace

Status: Accepted

## Context

WorkMesh already owns the authoritative Project, Work Item, Human Attention,
Approval, Agent Session, Plan, Activity, Recovery, and Evidence domains. The
Human Control Plane is complete, but two usability defects remain material:

- the Web Markdown renderer is a handwritten line parser that turns soft line
  wraps into separate paragraphs and does not correctly render CommonMark/GFM;
- pending Approvals expose bulk actions only after row selection, while command
  failures are reported outside the acted-on item and the list does not expose
  the viewer's current actionability.

Multica demonstrates a useful product shape: one RichContent boundary, explicit
document/compact density, locally scrolling code and tables, responsive action
groups, direct item actions, and per-item progress. Multica's custom license
restricts hosted and embedded use of its source and branding. WorkMesh must not
copy Multica TSX, CSS, tokens, assets, routes, stores, or product identity.

ADR 0029 selected durable Markdown/plain text and deliberately used a small
local parser for its initial Gate. That parser is now the source of observable
readability defects and no longer satisfies the product contract.

## Decision

Keep Markdown/plain text as the durable source and the native textarea editor
as the replaceable authoring boundary. Replace only the renderer with
`react-markdown@10.1.0` and `remark-gfm@4.0.1`, independently configured by
WorkMesh. Raw HTML remains disabled and no HTML sink or `rehype-raw` dependency
is authorized. Link and image destinations pass a WorkMesh URL transform that
allows credential-free HTTP(S) and approved relative WorkMesh routes only.

Expose one Web `Markdown`/`RichContent` component with `document` and `compact`
density. Both densities share the same syntax tree and component mapping.
Document content never collapses. Compact Agent/activity output may collapse
after 14 lines or 1600 characters and must expand without creating a nested
vertical scroll area. Tables and fenced code scroll horizontally inside their
own wrappers; the page itself must not gain horizontal overflow.

Add API-free responsive presentation primitives to `packages/ui`: action bars,
data-table frames, description lists, fields, and bounded overflow text. A
control's label stays intact while its containing action group wraps. Critical
relationship titles may use two lines. Dense mobile decision surfaces render as
cards rather than depending on a desktop table.

Approval list and detail projections expose a viewer-specific actionability
union derived by the same domain evaluator used by the decide command:

```ts
type ApprovalViewerActionability =
  | { status: 'actionable'; allowed_decisions: ['approved', 'rejected'] }
  | {
      status: 'blocked'
      reason:
        | 'viewer_already_decided'
        | 'expired'
        | 'session_inactive'
        | 'authority_revoked'
        | 'already_decided'
    }
```

This projection is a usability fact, not authorization. The decision command
continues to revalidate identity, Human Team membership, Agent and Team grants,
Delegation, Session, expiry, quorum, revision, and idempotency at mutation time.

Every actionable Approval exposes direct Approve, Reject, and Other feedback
controls. Approve and Reject use stable non-empty default reasons and require no
manual comment. Other feedback requires text plus one of two existing decisions:
approve with additional requirements, or reject with feedback. Approve with
requirements becomes approved immediately; the immutable reason remains visible
to the Agent through the existing Approval/event/context surfaces. No third
Approval state or second workflow authority is introduced. High/critical risk
requires a scope confirmation but not mandatory prose.

The UI owns per-Approval mutation state. A click produces an in-place busy,
success, quorum-pending, or structured error result. Bulk approval remains a
client orchestration over independent authoritative commands and preserves
per-item failures, consistent with ADR 0053. Human Attention, the Approval
inbox, and Work Item detail reuse the same decision component.

## Alternatives

Copy Multica frontend source or tokens: rejected by its license and because it
would introduce a second product architecture.

Persist HTML or editor JSON: rejected because Markdown is already durable and
the task is rendering/readability, not a new content authority.

Keep the handwritten parser and add more regular expressions: rejected because
CommonMark nesting, soft breaks, tables, and extension behavior need a tested
syntax tree rather than more line-local cases.

Make `reason` optional in the API: rejected because the server's immutable audit
fact remains valuable; the Web can generate an explicit default without asking
the Human to type it.

Create a generic Human Attention mutation endpoint: rejected by ADR 0053; source
commands remain authoritative.

## Consequences

The Web gains two MIT dependencies and a larger but bounded renderer bundle.
Markdown behavior becomes standards-based and shared across descriptions,
guidance, comments, plans, activities, handoffs, and Agent output. Existing
stored content requires no migration.

Approval reads perform additional authority-derived projection work, while the
decide command remains the final authority. State can still change between read
and click; stale revision and authority errors therefore remain explicit UI
recovery paths rather than automatic mutation retries.

## Migration

No database migration or backfill is required. Existing Markdown remains source
compatible. Existing Approval rows and decisions remain valid. The client and
API deploy together because the new read field is additive and old clients may
ignore it.

The historical `codex/web-ui-ux-continuation` branch is not merged wholesale:
current `origin/main` contains the later accepted Human Control Plane and a
direct merge produces overlapping conflicts. Unique behavior is re-audited and
ported only when it remains absent from the accepted baseline.

## Spec changes

- Supersedes ADR 0029 only for the handwritten rendering implementation; its
  durable Markdown, no-HTML-sink, draft, mention, and artifact boundaries stay.
- `OPENAPI.yaml` and `packages/contracts` gain Approval viewer actionability.
- `AGENT_PROTOCOL.md` documents that actionability is informational and that an
  approved reason may contain Human additional requirements.
- Local execution plan:
  `docs/plan/2026-08-28-multica-authority-first-human-agent-workspace.md`.
- WorkMesh Project `0691b1ff-2361-4b45-8d7c-1e3432a3b1ef`, Milestone M6, and
  GEN-504 through GEN-511 are the remote control and evidence plane.
