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
