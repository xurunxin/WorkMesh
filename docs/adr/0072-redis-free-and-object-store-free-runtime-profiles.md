# Redis-free and object-store-free runtime profiles, and the SQLite assessment

Status: Proposed

## Context

ADR 0071 adds a Lite deployment class for a single operator on a single weak
device, and sets the supported floor at 2 GB of RAM. That floor is uncomfortable
for the class of device people actually keep on a shelf: an old mini PC, a
thin client, a small NAS. This ADR asks whether the three data services can be
removed, and if so what is actually lost.

The three candidates are not equal, and the difference is not a matter of taste.
It is visible in the source.

**Redis is a wake-hint transport, not a queue.** `apps/worker/src/index.ts:172`
says it in a comment above `RedisStreamSink`:

> Redis is a delivery transport only. PostgreSQL remains the source for SSE
> and the durable recovery point if this write succeeds before the DB confirm.

The outbox is claimed from PostgreSQL, not from Redis:
`claimOutbox` opens a transaction and selects rows `FOR UPDATE SKIP LOCKED`
(`apps/worker/src/index.ts:291-302`). Redis is written with a single `xAdd`
carrying a durable cursor and a workspace id, trimmed by `MAXLEN`
(`apps/worker/src/index.ts:249-258`). On the read side, `NoopWakeSource`
already exists (`apps/api/src/realtime/wake-source.ts:82`), and
`createRealtimeCoordinator` runs two independent timers gated on availability
(`apps/api/src/realtime/coordinator.ts:126-132`): the healthy cadence of
15 s when the wake source reports `healthy`, and the fallback cadence of 1 s
when it reports `unavailable`. The behaviour is already pinned by a test named
"uses one shared fallback reconciliation when Redis is unavailable"
(`apps/api/src/realtime/coordinator.test.ts:60`).

**RustFS is one implementation of a seven-command surface.**
`packages/artifact-storage/src/index.ts` issues `PutObject`, `GetObject` with
`ChecksumMode: "ENABLED"`, `PutObjectRetention`, `HeadBucket`,
`GetObjectLockConfiguration`, `HeadObject`, `DeleteObject`, and one
`getSignedUrl` for the client-side presigned upload. The constructor already
accepts an injected `ObjectClient = Pick<S3Client, "send">`, which is how the
tests fake it.

**PostgreSQL is the domain.** Across `packages/db/src`, `apps/api/src`, and
`apps/worker/src`: 211 occurrences of `FOR UPDATE`, 40 of `SKIP LOCKED`, 15 of
`pg_advisory`, 161 of `::uuid`, 199 of `jsonb`, 146 of `interval`, 23 of
`FILTER (WHERE)`, 6 of `unnest(`, 5 of `array_agg`, 1 of `DISTINCT ON`. There
are 56 SQL migrations and an 86 KB Drizzle `pg-core` schema. Deadlock
avoidance is not incidental here: `packages/db/src/agent-locks.ts` defines a
canonical seven-rank lock acquisition order, and that order is frozen by a
SHA-pinned manifest (`agent-lock-order-manifest.ts`, 27 KB) with a 27 KB
conformance test.

## Decision

Two capability switches are introduced, and a third proposal is declined.

The switches are independent on purpose. Dropping the wake transport and
dropping the artifact store are unrelated problems with unrelated blast radii,
and an operator on a marginal device may well want one without the other.

- `WORKMESH_REALTIME_TRANSPORT=redis|database` (default `redis`)
- `WORKMESH_ARTIFACT_STORE=s3|filesystem` (default `s3`)

The production class keeps both defaults. Every switch is an
explicit deployment choice, never inferred, and never enabled by omission.

### A. Redis becomes an optional wake transport

`loadRealtimeRedisHintConfig` (`packages/config/src/index.ts:256`) currently
parses `REDIS_URL` as a required URL, which is the single change that forces
every consumer to have a Redis. It returns a discriminated union instead:

```ts
type RealtimeTransportConfig =
  | Readonly<{ kind: 'redis'; redisUrl: string; maxLen: number }>
  | Readonly<{ kind: 'database' }>
```

Three consequences follow, each small because the seams already exist.

1. **API wake source.** `apps/api/src/server.ts:347-351` already selects
   between `NoopWakeSource` and `RedisStreamWakeSource` and already accepts an
   injected source. The `NODE_ENV === "test"` branch becomes a config branch:
   `kind: 'database'` selects the polling path. No new class is introduced.
2. **Worker sink.** With `kind: 'database'` the worker does not publish. The
   outbox claim loop already ticks on its own interval and the API's fallback
   timer already polls, so the wake channel has no remaining producer or
   consumer. This removes work rather than adding it.
3. **Admin retention view.** `apps/api/src/admin-retention.ts:152-168` connects
   to Redis solely to read `xLen` as a health signal, and its comment already
   constrains the response to vocabulary only. Under `kind: 'database'` it
   reports `not-configured` instead of `unavailable`, so the admin view does
   not report a healthy subsystem as broken.

### B. The auth rate limiter gets a semantic store interface

This is the only part of the Redis removal that is real work, and it is work on
the *interface*, not on the limiter.

`AuthRateLimitStore` (`apps/api/src/auth-rate-limit/redis-store.ts:3`) exposes
`eval(script, {keys, arguments})`. That is a Lua-shaped interface: the token
bucket arithmetic lives inside `ADMIT_SCRIPT` and `FAILURE_SCRIPT`
(`limiter.ts:10-50`), so no store other than Redis can implement it. The
interface is raised to the semantics the limiter actually needs:

```ts
interface AuthRateLimitStore {
  admit(dimensions: readonly Dimension[], failureKey: string): Promise<Admission>
  recordFailure(failureKey: string): Promise<number>
  clearFailure(failureKey: string): Promise<void>
  sampleLogOnce(key: string): Promise<boolean>
  close(): Promise<void>
}
```

`RedisAuthRateLimitStore` keeps both Lua scripts unchanged and maps the four
semantic calls onto them, so the production behaviour is identical.
`InMemoryAuthRateLimitStore` re-implements the same refill arithmetic in
TypeScript over a `Map`, with an injected clock and lazy eviction plus a
periodic sweep.

**Correctness gate: one conformance suite, two implementations.** The two
stores are held to a single table-driven suite that replays identical
scenarios — burst exhaustion, partial refill, exponential failure backoff
across the clamp, success clearing, multi-dimension minimum-wait selection, and
boundary values — and asserts identical decisions. A separate suite proves the
in-memory store is not shared between processes and therefore is rejected when
more than one API instance is configured.

**This is a security-policy change and is recorded as one.** The limiter today
fails closed: a store error becomes `AuthRateLimitUnavailableError` and the
request is rejected (`limiter.ts:194-201`). An in-memory store has no external
dependency to fail, so that class of error disappears for that store; the
Redis store keeps it. The in-memory store's residual exposure is bounded and
named: token state is lost on API restart, and it is per-process. That is
correct for a single-replica profile and **must be refused** for a
multi-replica one, which is why the single-instance precondition is enforced
rather than documented. The production class is unchanged.

### C. Filesystem artifacts

`FilesystemArtifactStorage` implements the same seven-command surface over
content-addressed immutable files. Each S3 guarantee is mapped to the
mechanism that actually provides it, and the mapping is where the design
earns its keep:

| S3 guarantee | Mechanism it relied on | Filesystem equivalent |
| --- | --- | --- |
| Uploaded bytes are the verified bytes | `ChecksumMode: "ENABLED"` on read | server recomputes SHA-256 and only then `rename`s into place |
| COMPLIANCE retention | `ObjectLockEnabledForBucket` plus `PutObjectRetention` | `O_EXCL` create, `retentionUntil` in a sidecar that may never be shortened, deletes refused outright |
| Accidental overwrite is recoverable | bucket versioning | content addressing: different bytes are a different key, so overwrite cannot occur |
| Retention archive is append-only | versioning plus object lock | same as above; the delete path does not exist |
| Bucket is correctly configured | `HeadBucket` plus `GetObjectLockConfiguration` | root writable, lock directory present, `O_EXCL` verified |

The versioning mapping deserves its own sentence because it looks like a
downgrade and is not. S3 versioning recovers a previous version after an
accidental overwrite; content addressing makes the accident impossible, because
a different payload is written to a different path. The recovery property is
preserved by construction rather than by history. What is genuinely lost is the
ability to *list historical versions* of one logical artifact, which no
WorkMesh path does today.

Deletion stays refused. This is not a new restriction: both classes already ship
with `WORKMESH_EVENT_PRUNE_ENABLED=false` and
`WORKMESH_RETENTION_CLEANUP_ENABLED=false`.

**The presigned upload is the one genuinely protocol-visible change.**
`createUploadUrl` returns a presigned S3 URL plus `requiredHeaders`. With no
S3 there is nothing to presign. The intent instead returns a WorkMesh-origin
URL, `<API>/api/artifacts/upload/<intentId>`, and the same header discipline
ADR 0070 established: the short-lived upload token is an HMAC over the intent
id, the expected checksum, the content type, and an expiry, signed with
`WORKMESH_MASTER_KEY`, and the client sends it together with
`x-checksum-sha256`. The API streams the body to a temporary file, recomputes
the checksum, `rename`s atomically, and finalises. The signed-header property
that ADR 0070 fixed is preserved, and the server-side recomputation is
strictly stronger than trusting the client's declared checksum.

The costs are named rather than absorbed. The API process now receives
untrusted bytes; it already receives untrusted JSON, and this path neither
executes nor decompresses anything, so the external-runner invariant in
`AGENTS.md` is not engaged. A hard body-size cap becomes mandatory and is
shared with the MCP upload cap rather than duplicated. And the response shape
of `createUploadUrl` changes, so the client profile and the MCP adapter must
follow; event and contract versions move independently of the REST version, as
the architecture requires.

The `RECOVERY_TARGET_OBJECT_LOCK_REQUIRED` gate stays on the S3 path. The
filesystem path earns its rehearsal from a different proof: archive, restore,
and recompute every checksum.

### D. PostgreSQL to SQLite is declined, with the reasoning recorded

Not because SQLite is a poor database. Because of where the cost sits.

SQLite has no row locks, no advisory locks, no `uuid`, no `jsonb` operators, no
`INTERVAL`, no `SKIP LOCKED`, no `unnest`, no `LISTEN`/`NOTIFY`, and one writer
at a time. Set against the counts above, a SQLite port is not a compatibility
layer. It is a second implementation of the concurrency-control layer, a second
86 KB schema, a second dialect for every raw-SQL repository, and a fork of 56
migrations. The lock-order manifest and its conformance test do not port; they
are deleted, because SQLite makes deadlock structurally impossible. That part
is cheap. The 199 `jsonb` usages, the 161 `::uuid` casts, and the schema twin
are not.

There is a genuinely attractive argument on the other side, and it deserves to
be written down rather than dismissed: in WAL mode SQLite offers a *stronger*
single-writer guarantee than PostgreSQL's serializable isolation with retry,
and it would let the repository delete an entire class of deadlock machinery.
If a future WorkMesh were designed for SQLite from the start, this would be a
reasonable target. It is expensive as a port, not as a design.

The decisive argument is arithmetic. PostgreSQL costs 60-90 MB when tuned per
ADR 0071. The two approved switches save 8-15 MB (Redis) and 20-40 MB
(object store). Tier 0 in ADR 0071 — embedding the Worker runtime in the API
process and static-exporting Web — saves 240-400 MB, three to four times more,
by deleting Node runtimes, which is where the memory actually is, without
touching a single domain invariant. **A 1 GB device is not reachable by
changing databases. It is reachable by running fewer Node processes, or not at
all.**

Revisit condition, recorded so the decision is falsifiable rather than
permanent: if the measured footprint from `docs/operations/lite-footprint.md`
shows the Node runtimes are already eliminated and the remaining resident set
is still dominated by PostgreSQL on a device the operator actually owns, this
decision reopens with real data behind it.

## Alternatives

- **Keep Redis, drop only the artifact store.** Rejected as incomplete: the
  Redis work in Part A is smaller than the artifact work in Part B, and
  fail-closed authentication against an external dependency is the single
  weakest part of the Lite topology.
- **Make the limiter fail open instead of adding an in-memory store.**
  Rejected: it removes the protection without replacing it, and it weakens the
  production class as collateral. A real second implementation costs less than
  a permanently disabled control.
- **Keep the Lua interface and embed a Redis-compatible server on the box.**
  Rejected: that is the same resident memory with a smaller image.
- **Port the schema to SQLite's JSON functions and keep one database.**
  Rejected: the 199 `jsonb` usages are not the problem and are not the cost.
  The cost is the second schema and the second migration lineage.
- **Use SQLite for a derived read model and keep PostgreSQL authoritative.**
  Rejected as scope creep: it adds a third persistence surface to save memory
  that a node-runtime reduction saves more of.
- **Merge the API and Worker containers to save memory.** Rejected in ADR 0071
  for the same reason this ADR reuses: it saves container overhead, not a Node
  runtime.

## Consequences

A Lite operator on a 2 GB device can reach a six-service-free topology:
PostgreSQL, the API, the Worker, and Web, with no Redis and no object-storage
container. The resident set drops by roughly 30-55 MB from the data services
alone, but the topology drops by two services, two volumes, two health checks,
a bucket-initialisation step, a retention-policy template, and a second
recovery rehearsal contract. On a device where the operator is the only user,
the second of those is worth more than the first.

With no Redis, a connected SSE client sees event latency bounded by
`REALTIME_FALLBACK_RECONCILE_MS` rather than the wake stream. The default 1 s is
already the configured fallback and is not perceptible on a LAN. Nothing about
correctness changes, because the durable cursor in PostgreSQL was always the
only source of truth; the stream was a latency optimisation all along.

With no object store, artifact upload gains a server-side checksum
recomputation and loses presigned direct-to-storage writes. The security
property improves and the client protocol changes.

Rate limiting under `WORKMESH_REALTIME_TRANSPORT=database` and a single API
instance is now enforced in process rather than in Redis, which means an API
restart resets token buckets. This is a bounded, named exposure on a single-user
LAN, and the same exposure already exists in the Redis path whenever Redis
restarts with AOF disabled per ADR 0071. What the in-memory path additionally
loses is cross-instance sharing, which is why it refuses to start when more
than one API instance is configured.

## Migration

No schema migration and no data migration for Parts A and B. Both switches
default to the current behaviour, so an existing deployment that sets nothing is
byte-for-byte unchanged.

Migrating an existing instance means: install the filesystem artifact store,
copy the existing bucket content into the content-addressed layout with a
checksum-verifying script, set `WORKMESH_ARTIFACT_STORE=filesystem`, and only
then remove the object-storage service. The reverse order loses access to
artifacts that exist only in the filesystem layout. `WORKMESH_REALTIME_TRANSPORT`
can be flipped at any time with no data movement, because the wake stream is
purely derived.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and
`pnpm test:e2e` must stay green. The new store conformance suite is part of
`pnpm test`, not a separate opt-in job, so the two implementations cannot drift
silently.

## Spec changes

- `AGENT_PROTOCOL.md` and the client profile gain the upload-intent change:
  the upload URL origin is a deployment-selected capability, and a client must
  not assume an S3 host.
- `packages/contracts` gains the semantic `AuthRateLimitStore` shape as a
  versioned contract, and the new upload-intent response shape as its own
  version, independent of the REST API version.
- `docs/agent-runner.md` and `docs/operations/lite-footprint.md` record the
  two switches and the single-instance precondition for in-memory rate
  limiting.
- ADR 0071 gains a note that Lite may run with two services removed, so its
  service table is no longer the only Lite topology.
