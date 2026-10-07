# Verifiable and simplified agent connection onboarding

Status

Proposed

仅替换 ADR 0046 的人工操作流程，不撤销 ADR 0043 的新 key 拒绝规则。
客户端恢复仍须重放同一请求身份；这里改变执行校验的工具，不减少校验或放宽凭据重放。

Context

Agents get stuck at connection authentication. Before deciding what to change,
the existing behaviour was read rather than assumed, and three of the four
suspected failure modes turned out to be misdescribed:

**The server already stores a recoverable response.** `authIdempotentTransaction`
encrypts the entire redemption response with AES-256-GCM and writes it to
`auth_idempotency_records.replay_ciphertext` inside the same transaction
(`apps/api/src/auth-idempotency.ts:128-144,218,319-339`); a worker erases the
ciphertext, IV, tag, and key metadata at expiry
(`apps/worker/src/session-lifecycle.ts:672-690`). The response body is
canonicalised on first write and replayed byte-identically
(`apps/api/src/auth-idempotency.ts:294-304`). An existing integration test
asserts `replay.body === first.body`
(`apps/api/integration/stage5-agent-connections.integration.test.ts:333-335`,
not executed during this review).

**The recovery therefore does not fail because the server forgets.** It fails
because the *client* has no stable request identity to replay with. Replay
matching requires the caller's `Idempotency-Key` **and** the same subject,
operation, canonicalised body, and client context
(`apps/api/src/auth-idempotency.ts:205-216,285-304,343-352`). An agent that
crashes before persisting its key, or that mints a fresh key on retry, falls
through the replay path into the handler, where the pairing row is already
`consumed_at` and the request is refused with
`AGENT_CONNECTION_PAIRING_CONSUMED` (`apps/api/src/agent-connections.ts:522`).
The gap is narrow and real: **losing the request identity is unrecoverable.**

**The pairing code is not short.** `createPairing` derives a 43-character
payload from 32 random bytes (`packages/db/src/index.ts:41`). Any design that
calls it a "short code" is proposing a new protocol, not describing an existing
one.

**The clock is three separate timers**, not one: the pairing code expires ten
minutes after creation and gates the **first** redemption only
(`apps/api/src/agent-connections.ts:358-365,523`); the encrypted replay window is
fifteen minutes; rotation has its own overlap. Steps after a successful
redemption no longer carry the pairing code at all, so "the ten minutes covers
all seven steps" was wrong.

What remains genuinely too hard is the **ceremony**, not the storage.
`buildAgentConnectionInstruction` (`apps/web/app/lib/mcp-onboarding.ts:131-151`)
instructs an agent to perform seven steps involving a URL fragment, a discovery
fetch, a redemption, a SHA-256 fingerprint comparison, a secret-store write, a
client-config edit, a pinned-Skill install with byte-level verification, and a
`verify_connection` assertion round-trip. Four of those are integrity
verifications that a human is watching the same screen for, and each is an
independent place for the flow to stop.

One further inaccuracy is corrected here because it changes the design: the two
redeem endpoints do **not** share one rate-limit budget. Both are classified
`{ endpointClass: 'pairing', subject: 'pairing' }`
(`apps/api/src/auth-rate-limit/inventory.ts:36-37`), but the actual buckets key
on `operationId` for the endpoint budget and `operationId + subject + clientIp`
for the subject budget (`apps/api/src/auth-rate-limit/limiter.ts:129-145,154-159`),
and the two operations have different `operationId`s. The socket and client-IP
budgets are shared. The failure backoff is **not** shared: its key includes
`operationId`, `clientIp`, and subject
(`apps/api/src/auth-rate-limit/limiter.ts:122-125`). Separately, the
database `attempts` counter increments only on a *known* identity mismatch — a
wrong slug or a known client type that does not match the envelope — and only
for that pairing row; a random wrong code does not consume a valid pairing's
budget (`apps/api/src/agent-connections.ts:521-525,561-562`). Splitting
`endpointClass` would change nothing.

Decision

Onboarding becomes **one vertical path, two human-scale steps, and verification
that code performs rather than that an agent is asked to perform.**

### The gap is closed on the client, and v1 adds no new credential storage

A repeat redemption with a **new** `Idempotency-Key` remains refused. That is
ADR 0043's rule and it stays, because satisfying a claim with only the pairing
code and public fields would make the code a replayable bearer for the window —
precisely the property the single-use design avoids.

Instead, `apps/connector` makes the request identity recoverable by
construction. 首次网络请求前，原子保存 `Idempotency-Key`、包含完整 `wmp_` pairingCode
的精确规范化请求 body 和客户端上下文（origin、user-agent）。这是敏感 pending 文件，
不是无秘密的恢复文件；POSIX 使用并验证 `0600`，Windows 设置并验证当前用户专用 ACL。
独占创建/锁定后再暂存并 rename；并发启动复用同一 pending 身份，不生成竞态新 key。
其中不得保存兑换后的 install token，不打印配对码、令牌或完整请求。On any subsequent run — including
after a crash, a process kill, or a reboot — if a pending record exists it
replays that record verbatim, and the existing encrypted replay returns the same
token.

This closes the reported failure without a new table, a new column, a new
retention story, or any change to the server's credential lifetime. The token
continues to be delivered only through the redemption response; the
server-side copy continues to be the existing generic auth replay, with the
existing erasure job.

The 15-minute window is the only recovery budget, and the client surfaces the
`idempotency_replay` metadata it receives rather than hiding it: when the window
closes, the connector says so and tells the human exactly what to do next.

### The seven steps become two, and the connector keeps every verification

The reduction is about **who does the work**, not about **what gets checked**.

| Step | Before | After |
| --- | --- | --- |
| 1 | human reads a connect URL, agent parses a fragment | 输入完整带前缀配对码（43 字符指随机 payload，不是完整 token 长度）；QR 保留完整 token |
| 2 | agent fetches discovery and checks the advertised facts | connector fetches discovery and checks them |
| 3 | agent POSTs with a fresh key, hoping to remember it | connector persists the request identity, then POSTs |
| 4 | agent computes `SHA-256(token).slice(0,12)` and compares by hand | connector 在持久保存兑换令牌前比对指纹；敏感 pending 已在请求前保存 |
| 5 | agent edits client configuration by hand | 只在全部 discovery、Skill、身份、能力及当前凭据验证通过后写秘密存储，再原子替换正式引用配置 |
| 6 | agent installs the Skill and verifies its raw bytes, hash, and signature | connector does exactly this, unchanged in substance |
| 7 | agent reloads and asserts Team, principal, profile, Skill, capabilities | 在内存中执行 `initialize → verify_connection → get_workmesh_context`，逐项比对 Team、principal、profile、Skill、capabilities 和 authenticated_credential，验证当前凭据而非旧 overlap；完成后才能提交第 5 步 |

Steps 4 and 6 remain **client-side verifications of real bytes**, because ADR
0046 § requires verifying the Skill's actual downloaded content rather than
trusting a server-supplied hash string, and ADR 0043 § requires the fingerprint
comparison before the token is stored. What changes is that a tested program
performs them instead of a prompt asking a language model to perform them, and
a failure leaves the existing configuration untouched rather than half-written.

The server keeps verifying everything it verifies today: client type, policy
status, capability ceiling, delegation privilege, expiry, and revocation. The
simplification is in the ceremony, not in the gate.

重放命中可能返回旧加密响应，不能声称它重新检查撤权。取回令牌后必须完成当前身份验证；
撤权/过期/旧 overlap 凭据均不得写入新配置。秘密存储与文件系统不是跨系统事务：提交前保留
既有秘密引用与配置，秘密写入或 rename 失败恢复旧引用并清除本次新增秘密；崩溃恢复依据
受保护的提交阶段记录完成补偿，不能删除他人已有凭据。只有完整提交后才清理 pending。

### v1 is the pairing path, and it says so

ADR 0062 § already made **enrollment the default** and manual pairing the
recovery affordance. This ADR does not silently reverse that, and it does not
claim to have invented the choice. v1 therefore takes one vertical path and
names it: the connector's `connect` command drives the **pairing** path, which
is the one with the response-loss problem described above.

Enrollment recovery is a **separate task**, not part of this ADR's v1: its
input set is larger (`wme_` token, name, slug, client, manifest, requested
capabilities — `packages/contracts/src/index.ts:2918-2930`), its success path
writes `agent_enrollment_redemptions` rather than a pairing
(`apps/api/src/agent-connections.ts:919-971`), and it has its own budget
semantics where a repeat must not decrement `redemption_count` twice
(`apps/api/src/agent-connections.ts:870-871,886-891`). A future change may make
the same connector drive it; that change gets its own contract.

`POST /api/v1/agent-connections` currently also **creates** Agents
(`apps/api/src/agent-connections.ts:443-469`). This ADR does not remove that
behaviour, because doing so is a breaking change that deserves its own
migration. It is recorded as an ambiguity to resolve before the endpoint is
narrowed, not silently reinterpreted here.

The redemption input is a strict object containing `pairingCode`, `agentSlug`,
and `client`, with no separate claim identifier
(`packages/contracts/src/index.ts:2711-2723`). Pairing codes are prefixed
32-byte random opaque tokens, yielding a 43-character base64url payload
(`packages/db/src/index.ts:41`; `apps/api/src/agent-connections.ts:32-35,358-365`).
The full claim/replay, rate-limit, and attempts findings are tracked in the
[activation plan's P1 evidence ledger](../plan/2026-10-07-activation-onboarding-and-china-ecosystem.md).

### Failures name their recovery, and guessing is not abuse

Every onboarding error gains `next_action` (what the client may do) and
`human_action` (the single thing a human must do, phrased so the client can
paste it). `AGENT_CONNECTION_CLIENT_TYPE_MISMATCH` additionally returns the
deployment's supported client types — while being explicit that this corrects a
**wrong type guess** and does not repair a pairing bound to a different agent
slug, which no client-side list can fix.

The mismatch lock is left in place but its meaning is documented precisely: it
bounds repeated identity guesses against one pairing envelope, it is not a
brute-force budget for guessing codes, and a random wrong code never reaches it
because no such pairing row exists. The shared client-IP budget from ADR 0030
stays shared; the tests below fix exactly what is and is not isolated.

## Relationship to existing decisions

| Existing | Relationship |
| --- | --- |
| ADR 0031 bootstrap replay | The **shape** is borrowed: persist a stable request identity, return the identical response for an exact retry. The object differs: bootstrap credential versus connection claim. ADR 0031 is not modified. |
| ADR 0043 §2 | Unchanged in substance: a new `Idempotency-Key` against a consumed pairing code is still refused. What is added is the client-side discipline that makes the *original* key recoverable. |
| ADR 0046 | Unchanged in substance: Skill raw bytes, hash, and signature are still verified by the client, on the same LF and raw-bytes rules, and a failure still does not overwrite existing configuration. |
| ADR 0030 | Unchanged: the shared-source budget stays. The wrong claim that the two redeem endpoints shared one budget is retracted, and no `endpointClass` split is made. |
| ADR 0062 | Enrollment remains the default there. This ADR's v1 explicitly scopes itself to the pairing path and defers enrollment recovery to a named follow-up. |

## Alternatives

- **Return the credential for a repeat claim keyed on the connection, so a new key works.** Rejected: on a lost first response the client may not know the connection id, an id is not a secret, and satisfying the claim from the pairing code plus public fields makes the code a replayable bearer for the window — the exact property this design avoids. It also contradicts ADR 0043 §2, which would have to be superseded on a security question rather than an ergonomics one.
- **Add an encrypted claim-response column to `agent_connection_pairings`.** Rejected for v1: the equivalent ciphertext already exists in the generic auth replay with an existing erasure job, and the specific gap is client-side request identity. A second ciphertext would introduce a second retention deadline, a second revocation behaviour, and a second cleanup path for no recovery gain, and the two deadlines would not agree. Revisit only if a claim must outlive the generic replay window.
- **Make pairing codes reusable until expiry.** Rejected: a bearer replayable for a window is a shared secret with a timer.
- **Show the installation token in the UI so a human can paste it.** Rejected: it moves a credential that never reaches a human's screen into chat history, the clipboard, and every onboarding screenshot.
- **Shorten the pairing code to something hand-typable.** Rejected for v1: it is a new bearer protocol with its own entropy and brute-force analysis, and it is not the reported failure. The QR path removes the typing burden without touching the protocol.
- **Delete the seven-step instructions and let agents improvise.** Rejected: improvisation is what produces a fresh `Idempotency-Key` on retry.
- **Verify nothing on the client and trust the server's hashes.** Rejected as the opposite error, and it would weaken ADR 0046. What is removed is manual effort, not verification.

## Consequences

A new Agent goes from a human-supervised multi-turn ceremony to one command, and
the one failure that was actually unrecoverable becomes recoverable without a
new server-side secret store. The token's lifetime, the enforcement set, and the
replay window are all unchanged, so the security review surface is the client
package and its tests rather than a credential lifecycle.

The costs are honest. `apps/connector` is a new package and therefore a new
maintenance surface; it is deliberately thin (no domain logic, contract schemas
reused, asserted against the same integration fixtures the API tests use), but
it is real. It must be installable on a **Lite device with no source checkout**,
which `pnpm --filter` inside a checkout is not — so it ships as a published,
versioned binary with its own release path, and that is a real piece of work
this ADR does not itself perform.

Onboarding errors across the surface gain a required shape, so existing tests
that assert bare codes need their expectations extended. That churn is intended:
the recovery instruction is the feature.

## Migration

None. No schema change, no data change, no new column, no new retention job. The
connector is a new client; the API is unchanged except for added error metadata
and the client-type list on one error.

Because the error shape changes, the OpenAPI contract and the generated
route-policy artifacts are regenerated with `pnpm generate:route-policy`
(`scripts/generate-route-policy-artifacts.mts`) rather than hand-edited, and the
existing integration tests that assert bare error codes are updated in the same
change so the suite never passes against a stale shape.

## Spec changes

- `OPENAPI.yaml` declares the required `next_action` and `human_action` fields
  on every onboarding error, the supported-client-type list on a type mismatch,
  and the client-side request-identity contract that the replay guarantee depends
  on.
- `docs/agent-integration.md` is rewritten around the two-step flow; the manual
  fingerprint and Skill-verification prose is replaced by "the connector performs
  them", with the substantive requirement kept.
- `AGENT_PROTOCOL.md` gains a short recovery paragraph: a lost redemption
  response is recoverable by replaying the **same** request identity, and minting
  a new `Idempotency-Key` is not a recovery path.
- `AGENTS.md` gains the connector install and `connect` command in the setup
  section, noting the published-binary path for Lite devices.
- `CONTEXT.md` gains **Claim** to separate the transport binding from the
  Delegation, which remains the authorization grant.
