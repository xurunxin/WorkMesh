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
