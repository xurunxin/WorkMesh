# Collection pagination inventory and operations

Every route below returns `{ "items": [...], "nextCursor": "opaque-or-null" }`. The default page size is 50 and the maximum is 200. `/api/v1/rooms` is a singleton subject lookup. `/api/v1/templates/export` is an atomic export capped at 100 templates and 100 versions per template. Durable `/api/v1/events`, SSE `Last-Event-ID`, and A2A task-event cursors remain decimal and are intentionally separate.

Bounded singleton aggregates are not collection pages: Initiative rollup accepts at most 200 visible projects and fails explicitly above that bound; Project delivery returns at most 200 entries in each named evidence bucket; Agent list items embed at most 200 most-recent Team-access grants; current-plan steps are bounded by the 500-step publish contract. Larger consumers must use the corresponding dedicated collection rather than treating these summaries as exports.

| Collection | Stable order |
| --- | --- |
| teams | `name ASC, id ASC` |
| workflow states | `position ASC, id ASC` |
| projects | `updated_at DESC, id DESC` |
| humans | `display_name ASC, id ASC` |
| work items | `updated_at DESC, id DESC` |
| comments | `created_at ASC, id ASC` |
| saved views | `name ASC, id ASC` |
| agents | `display_name ASC, id ASC` |
| sessions | `updated_at DESC, id DESC` |
| activities | `sequence ASC, id ASC` |
| plan versions | `revision ASC, id ASC` |
| artifacts and approvals | `created_at DESC, id DESC` |
| room timeline | `created_at ASC, id ASC` |
| inbox, leases, handoffs | `created_at DESC, id DESC` |
| repositories | `full_name ASC, id ASC` |
| cycles | `starts_at ASC, id ASC` |
| initiatives | `priority DESC, updated_at DESC, id DESC` |
| advanced views | owner favorite first, then `updated_at DESC, id DESC` |
| project health updates | `created_at DESC, id DESC` |
| automation rules | `updated_at DESC, id DESC` |
| automation runs | `created_at DESC, id DESC` |
| loops | `updated_at DESC, id DESC`; embedded `recent_runs` is explicitly capped at 10 |
| templates | `kind ASC, name ASC, id ASC` |

Advanced-view result cursors additionally bind the view ID, current revision, entity type, normalized filters, and allowlisted ordering. Each requested field uses explicit `NULLS LAST` semantics and the entity ID is appended as the final deterministic key.

## Mutation model

Traversal uses PostgreSQL `READ COMMITTED`. Rows whose sort tuple is unchanged are neither duplicated nor omitted. Deleted rows disappear. Inserts or updates that move before the current boundary may not appear; rows moved or inserted after it may appear. Authorization is live on every request: membership, delegation, capability, scope, or other revocation takes effect immediately and may produce a shorter later page.

Filter aliases are normalized before cursor binding. For example, `mine=true`, `ownerId=<current actor>`, and `responsibleHumanActorId=<current actor>` bind the same effective owner filter. Explicit defaults such as inbox `status=open` are part of the binding.

## Key rotation

Configure a ring such as:

```text
PAGINATION_CURSOR_KEYS=2026-07:<base64url-32-random-bytes>,2026-04:<previous-key>
PAGINATION_CURSOR_ACTIVE_KID=2026-07
PAGINATION_CURSOR_TTL_SECONDS=900
```

Generate each value independently. Never reuse `SESSION_SECRET`, `WORKMESH_MASTER_KEY`, `WORKMESH_BOOTSTRAP_TOKEN`, `AUTH_RATE_LIMIT_HMAC_KEY`, database/object-store passwords, or MCP tokens. Add the new key, deploy it as active, wait at least the TTL, and only then remove the retired key.

## Query-plan and load evidence

Migration `0024_cursor_pagination_indexes.sql` supplies authorization-prefix/keyset indexes selected for the collection queries. Reproduce plan evidence after loading the representative fixture:

```powershell
rtk pwsh -NoLogo -NoProfile -NonInteractive -Command '$env:RUN_INTEGRATION="1"; pnpm --filter @workmesh/db test:integration -- pagination-migration.integration.test.ts'
```

The database traversal fixture loads 10,050 Teams, asserts that PostgreSQL selects `teams_workspace_name_page`, walks 101 pages, and verifies that no query returns more than `limit + 1` rows. API authorization integration separately revokes a human Team membership and an Agent session token between pages and verifies that the continuation request discloses no later-page data. Unit coverage exercises repeated sort values, tampering, expiry, binding mismatches, and another 101-page traversal.
