# Design QA: Human Control Plane foundation

Result: PASS

Reference: user-selected Option 2, generated at 1440 x 1024 for issue #90.

Implementation route: `/human-control-plane-preview` with
`WORKMESH_HCP_PREVIEW=1`. The route is not linked from production navigation
and returns Not Found without the flag.

## Visual comparison

The reference and the 1440 x 1024 implementation capture were reviewed in the
same comparison input. The implementation retains the selected direction:

- existing 248 px WorkMesh shell and neutral enterprise palette;
- Project title, freshness, Responsible Human, and Active Agent Executor in the first viewport;
- task-oriented Project navigation and Beta Graph label;
- six-value operational summary strip;
- Needs You, Running, At Risk, and Recently Verified zones;
- expanded Run detail with plan steps and evidence access;
- restrained borders, compact typography, and color used as a secondary signal.

The fixture intentionally uses reusable row primitives rather than reproducing
the denser production tables in the reference. Production data integration and
table density belong to #91. No decorative asset was required by the selected
operational UI.

## Responsive results

| State | Result | Horizontal overflow |
| --- | --- | --- |
| zh-CN 390 x 844 | PASS | false |
| zh-CN 768 x 1024 | PASS | false |
| zh-CN 1440 x 1000 | PASS | false |
| zh-CN 1440 x 1024 | PASS | false |
| zh-CN 1920 x 1080 | PASS | false |
| en 390 x 844 | PASS | false |

At 390 px, global navigation collapses to the existing mobile Menu, Project
navigation becomes an independently scrollable tab strip, summary metrics use
two columns, and each operational zone becomes one task column. Essential
actions remain visible without document-level horizontal scrolling.

## Interaction and accessibility

- Project navigation uses canonical hrefs, `aria-current`, and URL-owned state.
- Attention and Run regions have semantic headings and accessible names.
- Lifecycle, health, risk, urgency, and freshness expose separate text labels and `data-semantic-value` values.
- Responsible Human and Active Agent Executor are separate definition-list roles.
- Evidence opens in the shared focus-trapping Sheet and restores trigger focus.
- Pause uses a consequence preview with a specific final action and restores trigger focus.
- Technical events, affected resources, and reason codes are collapsed by default.
- Shared reduced-motion rules disable skeleton animation and minimize transitions.
- No new Human Control Plane component calls `window.prompt` or `window.confirm`.

## Evidence

- `docs/evidence/human-control-plane/hcp-option-2-390x844.png`
- `docs/evidence/human-control-plane/hcp-option-2-768x1024.png`
- `docs/evidence/human-control-plane/hcp-option-2-1440x1024.png`
- `docs/evidence/human-control-plane/hcp-option-2-1920x1080.png`
- `docs/evidence/human-control-plane/hcp-option-2-en-390x844.png`
- `docs/evidence/human-control-plane/hcp-option-2-evidence-drawer-1440x1024.png`
- `docs/evidence/human-control-plane/hcp-option-2-consequence-dialog-1440x1024.png`

---

# Design QA — Autonomous Human Control Plane

## Sources compared

- Existing WorkMesh control-plane captures: `workmesh-control-audit/01-inbox.png` and `workmesh-control-audit/04-agents.png`.
- Implemented captures: `workmesh-hcp-final/approval-yolo-final.png`, `desktop-1440x1024.png`, `mobile-390x844.png`, `mobile-detail-390x844.png`, `agents-enrollment-1440x1024.png`, and `agents-enrollment-390x844.png`.
- Visual target: selected option 3 — compact attention queue, complete decision context, and a sticky response bar.

## Verification

- Desktop 1440×1024: the autonomy policy and Web Push state are visible before the attention queue; selection remains in the URL; queue, context, boundary, evidence, and response controls are visible without a modal.
- Approved/rejected decisions leave the active queue immediately; the final live check showed only the excluded pending Approval in the queue and rendered explicit `拒绝` / `批准并继续` actions.
- Mobile 390×844: controls reflow to one column without document overflow; the attention queue remains scannable; the response form remains sticky while the decision context scrolls; enrollment fields and capability limits remain reachable.
- Agents: primary navigation is split into Agents, Connections, Enrollment policies, and Archived. The enrollment wizard uses the existing WorkMesh visual language and becomes a compact selector on mobile.
- Accessibility: semantic landmarks, tablists, labelled fields, buttons, switches, and visible focus styles are retained. Automated keyboard/reflow E2E coverage passed at 320, 375, 390, 760, 761, 768, 1440, and 1920 widths.
- Comparison outcome: the implementation preserves the existing neutral palette, typography, borders, spacing, and component system while making the action hierarchy and lifecycle separation explicit.

## Findings

- P0: none.
- P1: none.
- P2: none.

final result: passed

---

# Project and workflow visual QA

Reference: selected direction 3 image at `C:/Users/xurx/.codex/generated_images/01a04884-a7e4-7473-abd1-53655231417e/exec-74721f34-d220-469a-9615-edb4d58515e4.png`.

Implementation capture: `artifacts/design-qa/projects-1440x1024.png`.

## Visual comparison

- The implementation preserves the selected reference's fixed shell, compact header search, 300px project rail, elastic project detail pane, metric strip, tabs, milestone workspace, and delivery summary hierarchy.
- Project names, summaries, dates, selected state, long-name truncation, and multi-project density remain legible without document scrolling.
- At 760px and below, the project rail becomes a horizontally scrollable project strip and the detail surface remains independently scrollable.
- Workflow colors use the shared `--wm-status-color` path on list cards, board columns, counts, status rails, and pills; text remains on theme tokens while tinted surfaces use `color-mix`.

## Viewport and interaction checks

- 1440x1024, 1280x768, 768x1024, 375x812, and 320x720: document horizontal and vertical overflow both measured zero on the project page.
- Desktop project overflow is confined to `.project-rail-list` and `.project-overview-grid`; mobile project selection overflow is confined to `.project-rail-list`.
- Inbox, Issues, Projects, Guidance, Agents, Settings, Operations, collaboration evidence, both preview routes, and Connect were checked at 1440px and 320px with zero document overflow.
- Header command center appears after authenticated route transitions, retains Ctrl/Cmd+K metadata, and does not require a window reload.
- Project auto-selection writes the selected project into the URL, long names truncate, and empty/multi-project states render without a second ambiguous create action.
- Workflow state edit, cancel controls, name save, API color update, list-card refresh, selected-Issue refresh, and board-column color projection were exercised in the local browser.

## Findings resolved during QA

- Fixed the command trigger disappearing when the shell header mounted after the global controller.
- Fixed a React synthetic-event lifetime error that crashed the settings page while editing a workflow state.
- Fixed project WorkSurface selectors so list, board, and backlog scroll inside the detail pane.
- Removed the duplicate empty-state `New project` action that made the browser acceptance selector ambiguous.
- Updated the acceptance flow to expand advanced filters before using the Label field.

## Compact desktop regression QA (2026-08-29)

- Source visual truth: `D:/Cache/Temp/codex-clipboard-7bd94f26-4224-44a7-b869-10a23221c89b.png` (994x1380 px including 122px browser chrome).
- Normalized source crop: `artifacts/design-qa/projects-compact-reference-crop.png` (994x1258 px app content; 1x density).
- Implementation capture: `artifacts/design-qa/projects-compact-994x1258.png` (994x1258 CSS px and image px; 1x density).
- Combined comparison: `artifacts/design-qa/projects-compact-comparison.png` (source left, implementation right).
- State: authenticated Projects overview, General team, selected `Acceptance project`, light theme.

### Comparison evidence

- The source showed a P1 responsive failure: the persistent sidebar plus 300px project rail left the project detail header narrow enough to wrap the title and description one character at a time.
- The implementation responds to the actual `.app-content` width. At the matching 994px viewport the project rail becomes a 101px top selector, the detail pane grows to 746px, the title renders on one 24px line, and the overview stacks to one column.
- Full-view comparison confirms zero document, detail-pane, and overview horizontal overflow. The compact project selector, header controls, metrics, tabs, milestone panel, and delivery summary remain visible in their existing design language.
- Focused title-region evidence was readable in the combined comparison, so no separate crop was needed.

### Required fidelity surfaces

- Typography: existing family, weights, sizes, and hierarchy are preserved; title wrapping is corrected without reducing type size.
- Spacing/layout: project navigation moves above detail only when the available content width is at most 860px; the detail header, metrics, and overview regain usable widths.
- Colors/tokens: unchanged and still sourced from WorkMesh tokens.
- Image/assets: no raster or icon assets were introduced or replaced.
- Copy/content: unchanged; project name and description are no longer fragmented.

### Comparison history

- Pass 1: title wrapping was fixed, but the two-column overview still caused internal horizontal overflow at 994px.
- Fix: applied the same content-width container query to the overview grid and compacted the empty project selector.
- Pass 2: matching screenshot and measurements show title width 326px, title height 24px, and zero horizontal overflow for the document, detail pane, and overview.
- Breakpoint checks: 1280x768, 1024x768, 980x768, 768x1024, 761x900, 760x900, 375x812, and 320x720 all have zero document/detail horizontal overflow; the title remains a normal line rather than per-character wrapping.
- Browser console errors: none.

### Findings

- No remaining actionable P0/P1/P2 findings for the reported compact-width regression.

final result: passed
