# Work Item presentation primitives

The v27 Work Surface components are API-free presentation boundaries. Import
`WorkItemList`, `WorkItemBoard`, `WorkItemCard`, `WorkItemFilters`,
`WorkSurfaceState`, and `WorkSurfacePagination` from `@workmesh/ui` and pass
serializable rows plus callbacks.

Query, authorization, saved-view persistence, optimistic move commands, CSRF,
idempotency, revisions, and routing stay in `apps/web/features/work-items`.
The board and list deliberately consume the same mapped collection. A board
may scroll horizontally inside its named region; the document should never
gain horizontal overflow.

Saved View controls intentionally expose list/create/apply only. Update and
delete controls must not be added until the server contract provides those
revisioned routes.

## v30 collaboration feedback

Use `Card`, `Badge`, and `WorkSurfaceState` as API-free render primitives for Inbox and notification facts. Keep preference persistence, delivery status, retries, authorization, revisions, and durable cursor handling in the application layer; never infer delivery success from a saved preference.

## v32 i18n entry

App-layer i18n (`apps/web/app/lib/i18n.tsx`) is the primary copy source
for the WorkMesh web app. The `LocaleProvider` exposes ten typed `Copy`
subsets via `useLocale()`:

- `issueCopy` — Work Item list / board copy
- `surfaceCopy` — Work Surface (loading / empty / error) copy
- `detailCopy` — Work Item detail copy
- `guidanceCopy` — Guidance revision history copy
- `settingsCopy` — Settings page copy
- `loginCopy` — /login page copy
- `installCopy` — /install page copy
- `operationsCopy` — /operations page copy
- `connectCopy` — /connect onboarding page copy
- `agentsCopy` — /agents page copy

`useLocale()` also exposes a flat `t(key)` helper for short labels
(nav, buttons, status) that is shared across pages.

The default locale is `zh-CN`. English dictionaries may be left empty
for keys that are not yet translated; those fall through to the
`packages/ui` English defaults and finally to the page literal as a
last resort. The last layer logs a dev-only `console.warn` once per
missing key.

`packages/ui` `defaultWorkItemCopy` is fallback-only. Do not treat it
as the primary copy source.
