# WM-UX-011 canonical navigation and Evidence Drawer

Spec: `docs/adr/0059-canonical-navigation-and-evidence-drawer.md`
GitHub: https://github.com/xurunxin/WorkMesh/issues/98

## 1. Publish the canonical route and evidence contracts

Create a typed supported-object route map, URL-owned drawer identity/source state, safe external URI policy, and reference/rich evidence normalization. Test route preservation, immutable IDs, unsupported targets, and URI rejection.

## 2. Build the shared Evidence Drawer

Render provenance, producer/session/principal, Work/Plan/action/validation, provider/head/check identity, timestamps, freshness, validation states, sanitized preview, related/superseded evidence, and Technical Details. Unknown fields stay explicit.

## 3. Integrate authoritative surfaces

Use the shared drawer from Run Timeline, Attention, Work Item execution, Recovery, and collaboration evidence entry points. Preserve filters, selected object, Project context, scroll anchor, focus, and Back/Forward. Graph/provider integration remains absent when unsupported.

## 4. Verify the complete navigation slice

Run focused contract/component tests, responsive History/focus E2E, URI/non-inference tests, repository lint/typecheck/test, diff checks, and record commit/PR evidence in WorkMesh.

## Definition of done

Explicit supported relationships navigate bidirectionally without ID copying or lost context; evidence states and exact-head facts are honest; every target remains independently authorized; Stable navigation operates with Graph/provider features disabled.
