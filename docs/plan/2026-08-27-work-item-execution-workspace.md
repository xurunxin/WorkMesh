# Work Item execution and decision workspace

Issue: [#95](https://github.com/xurunxin/WorkMesh/issues/95)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADR: `docs/adr/0056-work-item-execution-workspace.md`

Depends on: #89, #90, #93, and #94

## Objective

Make Work Item detail explain current execution, Human Attention, responsibility,
relationships, and evidence before metadata editing, using existing authoritative
server projections.

## Tasks

### 1. Compose the authoritative execution workspace

Build a shared Work Item overview from execution-summary, Human Attention, Active
Executor, compact Run Timeline, and evidence projections. Keep loading, empty,
partial, stale, and unavailable facts explicit.

Tests: projection rendering, active/terminal Run distinctions, evidence state,
Attention priority, authorization failure, and targeted refresh.

Definition of done: the first detail view uses no free-text client inference for
operational state.

### 2. Reorder detail information architecture

Place Overview first; retain editable Details, Agent controls, relationships, and
Discussion as stable sections. Keep Responsible Human, Active Agent Executor,
workflow state, and Session state visibly distinct.

Tests: draft/conflict retention, ordinary realtime refresh, delegation result
link, section continuity, and sheet/full-page parity.

Definition of done: operational comprehension is available before the editor and
no existing authoritative mutation is removed.

### 3. Preserve navigation, responsive, and accessibility behavior

URL-own the selected detail section, preserve list/board return context and focus,
and verify narrow single-task navigation without page overflow.

Tests: Back/Forward, focus return, 390/768/1440/1920 reflow, keyboard, semantic
regions, localization, and disabled optional features.

Definition of done: quick and full detail share one model and stable navigation.

### 4. Integrated acceptance and release

Run focused unit/integration/browser coverage and repository gates, then open and
merge the Issue-specific PR with exact evidence in WorkMesh.

Tests: executing Work Item plus Approval, concurrent draft and Run refresh,
revision conflict, delegation/replacement, and terminal-without-evidence.

Definition of done: Issue #95 is closed by a merged PR and WorkMesh records the
commit, PR, screenshots, and actual validation results.
