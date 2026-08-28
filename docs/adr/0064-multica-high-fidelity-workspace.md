# Multica high-fidelity workspace

Status: Accepted

## Context

M6 established reliable approvals, shared rich content, responsive primitives, and authoritative Human/Agent projections. Visual review at 1440×900 showed that the Project Work board still began below several stacked summary and filter containers, retained the previous administration-console styling, and did not visibly resemble the selected Multica workspace reference.

The selected reference is `X:/Projects/Code/multica/apps/docs/public/images/docs/workspace-overview.webp`. Multica's license does not permit copying its restricted product source, assets, brand, or design tokens into WorkMesh. The reference may be used to independently reproduce layout and interaction principles.

## Decision

WorkMesh adopts a high-fidelity, independently implemented workspace presentation:

- the Project Work surface opens with the work canvas above the fold;
- the shell uses a quiet neutral navigation rail and continuous content canvas;
- filters collapse into compact toolbar controls instead of a permanently expanded form;
- board columns use softly tinted lanes, compact headers, inline create/menu actions, and dense white cards;
- cards prioritize identifier, title, concise description, responsible Human, active Agent, recency, risk, and dependency signals;
- authoritative Approval, Session, Evidence, revision, and Human responsibility facts remain unchanged and move into compact indicators or the detail surface;
- Project Overview and delivery information remain available on their own tab and are not duplicated above the board.

No Multica TSX, CSS, assets, branding, or design-token values are copied.

## Alternatives

- Keep the M6 authority-first visual fusion. Rejected because its stacked panels obscure the main work surface.
- Add an always-visible authority rail beside the board. Rejected because it reduces board fidelity and usable width.
- Redesign only the board without the shell. Rejected because the existing shell remains the dominant visual mismatch.

## Consequences

The Web and shared UI presentation layers change substantially while REST, SSE, contracts, domain rules, database schema, Worker, and MCP remain unchanged. Existing keyboard, pointer, explicit-status, revision-conflict, and responsive behavior must continue to pass.

## Migration

No data migration. Existing route parameters and authoritative DTOs are retained. The board remains progressively usable on narrow screens through contained horizontal scrolling and a card-first fallback.

## Spec changes

This ADR refines and supersedes the visual-presentation decision in ADR 0063. ADR 0063 remains authoritative for RichContent, approval reliability, and authority boundaries.
