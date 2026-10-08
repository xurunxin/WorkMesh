# Workspace configuration readiness check and the first-run surface

Status

Proposed

Context

WorkMesh already owns every individual step a new operator must take. An
administrator is created once through the authenticated bootstrap credential
(ADR 0031). An Agent is enrolled through a policy or bound to a client through a
connection. A model is configured through `LlmConnection`
(`apps/api/src/workbench-llm-connections.ts`). A project attaches a repository.
Each is correctly governed and each is reachable from the browser.

Nothing states the workspace as a whole. A freshly installed deployment is
indistinguishable from a working one at the level a new operator cares about. The
failure is not an error; it is a correct product that is silent about being
unconfigured.

A tempting fix is a four-fact "can this team run?" gate — a runner, a model, an
agent, a project. Reading the code before proposing it shows that **three of the
four facts are not observable today**, and that the fourth does not mean what the
gate would need it to mean:

**There is no idle-runner liveness fact.** A runner heartbeats only while it has
an assigned Agent Session; with no assignment it never enters the heartbeat loop
(`apps/agent-runner/src/run-session.ts:332-357`), and
`workbench/runner/assignments` reads existing Session, Delegation, and grant rows
rather than a runner registration (`apps/api/src/workbench-runner.ts:88-109`). The
heartbeat lives on the Agent Session (`packages/db/src/schema.ts:321-324`), and a
`RunnerAttempt` is the state of one turn, not a liveness registration. A gate that
required a live runner would therefore report "runner not ready" on every fresh
install forever, and the only way to clear it would be to run work first — which
is the exact inversion a first-run surface must not have. Treating a Session
heartbeat as runner process liveness would be a false signal in the other
direction.

**The model condition is narrower than "a model exists".** Model-backed commands
require `connection.status = 'active'` **and** `model.enabled = true`
(`apps/api/src/workbench-conversations.ts:150-166`).

**An active agent is not a usable one.** It still needs a matching Delegation and
Session to do anything, which is a property of a future command rather than of the
workspace's configuration.

**A project is not a precondition for work.** Projects scope repository-backed
work; non-repository work is legitimate (ADR 0004, ADR 0024,
`AGENT_PROTOCOL.md:1746-1756`). Gating a whole workspace on a repository would
permanently mark a valid non-repository team as blocked.

The reference product makes the dependency visible instead: a banner whose entire
content is the remaining setup items, each linking to the page that resolves it,
above an empty state offering three natural-language starting points.

The self-hosted class raises the stakes. ADR 0071 and ADR 0072 are **Proposed,
not implemented**, and a Lite operator has no colleague to notice that half the
setup is missing and no release process that would have caught it.

Decision

WorkMesh gains a **configuration readiness projection** for a Team and a
first-run surface that renders it. The projection is derived, never stored, and
it makes no claim about execution capability.

### Three evidence classes, never conflated

The projection reports, per check, one of three states, and the distinction is
the whole point:

| Class | Question | Example |
| --- | --- | --- |
| `ready` | is this configured, and is the configuration internally consistent? | an `LlmConnection` is `active` and has at least one `enabled` model |
| `blocked` | is a prerequisite definitely absent, for this caller? | no Agent definition is visible to this caller in this Team |
| `unknown` | does WorkMesh have the evidence to answer, at all? | runner liveness, because no such fact exists outside an assigned session |

A check that cannot be answered is `unknown`, never `blocked`. An operator is told
the difference, because "you have not configured a runner" and "we cannot tell
whether a runner is online" call for different actions, and conflating them would
send a correct operator to configure something that is already configured.

Each check is scoped to a **caller and a Team**, because readiness is not a
workspace-wide property: a personal model is visible to its owner and invisible
to a teammate, and a Team-scoped Agent is not visible from another Team.

### The v1 check set, and the one thing deliberately missing

| Check | v1 state | Source |
| --- | --- | --- |
| Model | `ready` / `blocked` | `LlmConnection.status = 'active'` and at least one `enabled` model, within caller visibility |
| Agent | `ready` / `blocked` | 当前 workspace、Team 中 active definition 且 Team 授权未撤销 |
| Repository-backed work | `ready` / `blocked`；适用性另列 | 指定资源只检查当前上下文；未指定才检查所选 Team 至少一个 Project 的仓库与 base branch |
| Runner liveness | `unknown` in v1 | no fact exists; a durable runner registration and heartbeat is a **separate** task, and this ADR withdraws the zero-migration claim for that reason only if that task is taken |

仓库不适用用 `applicability=not_applicable`、`state=null` 表示；适用项使用
`applicability=applicable` 和三态 `ready|blocked|unknown`。`not_applicable`
不是第四种就绪状态，非仓库工作不会因此被标成配置失败。

### 已确认的查询契约与安全边界

`GET /api/v1/workbench/configuration-readiness`（`getConfigurationReadiness`）
只允许 Human session，查询必填 `teamId`、`workKind=repository|non_repository`，
可选 `projectId`、`workItemId`。`workKind` 仅影响查询，不保存仓库工作意图。
指定 Project 时只检查该 Project；指定 WorkItem 时检查其直接上下文及所属 Project。
同时传入两个资源时必须归属一致；未指定资源时才检查所选 Team 的 Project。
资源不存在、删除、不可见或越过 workspace/Team 时统一 `NOT_FOUND`。非仓库查询
仍先校验所传资源范围。仓库及 provider 必须 active、base branch 非空，并遵守
现有 Gitea 功能开关。模型 personal 仅本人、team 仅所选 Team，workspace 按
既有可见性。看不见或配置不满足统一 `blocked/unmet`，不返回隐藏资源元数据。

响应固定 `checks.model/agent/repository/runner`，每项含 `applicability`、
`state`、`reasonCode`；`ready/configured`、`blocked/unmet`、
`unknown/not_observable`，非仓库项 `null/non_repository_work`。
Runner 恒 unknown，不读取 assignment、Attempt 或 Session heartbeat，不提供
总体可运行布尔值。同一 SELECT 重验当前会话、Actor、Team 与配置权限；响应
`Cache-Control: no-store`。数据库故障按结构化错误返回，不冒充状态。

成功、重复、参数错误和查询故障均零数据库写入；鉴权拒绝保留既有
`authorization_denials` 安全审计例外（ADR 0028），不代表零安全审计。
没有写入端点、schema 变更或迁移，不产生 Session、receipt、event、outbox，
查询不成为委派、激活或执行授权。这里记录用户已确认的契约，不宣告实现验收通过。

### The gate is advisory in the domain and binding in the interface

`blocked` 投影不改变任何命令的授权，也不新增「必须有在线 Runner 才能委派」的前置。
当前代码没有可证明空闲 Runner 在线的事实；`unknown` 不能推导为停机或授权拒绝。
创建工作项、委派和激活分别由既有服务端命令校验身份、会话、授权、能力、范围、
Approval、Stop、revision 和适用的租约。配置查询不产生会话、回执、事件或 outbox。
投影说明配置缺口，不能成为运行许可；`CONTEXT.md` 的 View Model 非授权来源规则保持。

The interface treats it as binding: unmet checks render as an ordered list in the
workbench conversation area, one row per check, each row a link to the page that
resolves it, ordered by dependency depth so the deepest prerequisite is first. An
empty state grows a primary action **only** when the corresponding check is
unmet. A Project list that is empty in an otherwise configured workspace stays a
plain empty state.

The links are the existing canonical routes. No new setup shell, no second
navigation authority, and Back/Forward and focus behaviour are unchanged
(ADR 0059, ADR 0064).

### One surface, not a wizard

No step order, no "step 2 of 4", no stored acknowledgement, no `seen` record. A
wizard is a second information architecture that can disagree with the first and
strands anyone who arrived by another route. The list is order-derived but not
order-enforced: resolve the Project first and the list simply shows fewer items.

起始提示新增三个固定 WorkMesh 字符串，仍放在现有类型化中英文 i18n 字典中，
不提供 workspace 可编辑设置。三条内容及点击语义由 A2 完整计划冻结：点击只填未发送草稿并聚焦，
没有对话时仅展开既有创建表单；Human 明确创建后才填草稿，不自动创建、发送、委派或激活。

### A2 已确认的 URL 与项目配置范围

workKind 仅从 URL 明确读取 repository/non_repository，不从 Team、Project、WorkItem、
已有仓库或对话推断。缺失、重复或非法参数时不查询，显示普通上下文提示。
显式失效上下文不回退到另一资源；Back/Forward 后重新查询当前权限与配置。

仓库缺口的 canonical 深链必须抵达既有 Projects 页面中的真实配置区。
该区允许复用既有 provider-connections、repositories、repositories/{id}/context 命令，
补齐必要连接、注册和上下文入口，不新增 setup 页面或配置实体。
workspace admin 管连接及注册，当前 Team admin/maintainer 配置既有仓库上下文，
普通成员只读；界面操作提示不授予权限，POST 和 Worker 按既有规则重新核对授权。
上下文命令只提交待处理 action，Worker 产生 repository.context.pinned 后才显示已配置。
稳定请求身份、事务/event/outbox、并发追加事实、撤权、校验和秘密保护保持既有命令语义。
新增 POST 没有 If-Match，不伪造 revision 防护；当前配置以服务器读取为准。

仓库读取的 can_configure_context 是当前 caller 的无秘密 UI 提示，Agent 固定 false，
不建立能力授予或新安全政策。A1 readiness 仍是只读合同，不因配置区新增命令而产生领域写入。
Runner 始终 unknown；完成配置不自动触发执行。

原六项验收与 Lite 安装链路保持；A2 独立验收，组合回归归原后续阶段。
具体方案与逐类映射见 [A2 完整计划](../plan/a2-configuration-readiness.md)
及 [验收映射](../plan/a2-configuration-readiness/review-map.md)。
这些内容记录用户已确认范围与待独审实施方案，不改变本 ADR 的 Proposed 状态，不宣告产品完成。

### A2 独审要求的最小命令与读取修补

本节按实读C1当前main更新，仍是待独审实施决定，不改变Proposed状态、不声明已修复。

- `apps/api/src/delivery/repository-configuration.ts`、`apps/api/src/delivery/routes.ts`：封装仓库读取投影，按当前 workspace admin、Team admin/maintainer 派生操作提示。A2 以 `teamId=T&availableOnly=true` 请求：校验当前 Team 可读，在 SQL 中先限制 Team、active 仓库/连接与已启用 provider，再执行既有 Paginator 的游标排序和 `limit+1`，不在分页后筛选。新筛选分支将 Team、`availableOnly` 值及仅在 true 时生效的排序后 provider 集合放进 Paginator `filters`，沿用 actor/workspace/route、`full_name,id` 排序和 `limit+1`；切 Team/筛选/feature 导致 `PAGINATION_CURSOR_MISMATCH`，丢弃游标从首屏重读。`availableOnly=false` 或未传时不隐藏禁用 provider，保留原 feature 拒绝；显式 `teamId` 仍在 SQL 分页前限制范围，无新参数的旧分支保持 `filters={}`。无新参数的 Human/Agent 请求保留旧分支、分页信封、既有字段及 feature 拒绝语义，仅附加已规划的操作提示字段；Agent 携带新 Human 筛选参数返回 `VALIDATION_ERROR`，不扩张 Session/Delegation 范围。上下文直接读取和 POST 仍执行 `requireProviderFeature`。

- `apps/api/src/delivery/routes.ts` 的连接创建：新增局部 `providerConnectionFingerprint`，复用 `workbench-llm-connections.ts` 的 `createHmac('sha256', masterKey())` 模式，以 UTF-8 `workmesh:provider-connection-idempotency\0` 为用途域，追加字段名、NUL 分隔及秘密原字符串字节，分别计算 `webhookSecret`、`privateKey`、`accessToken` 的摘要；未提供字段用 `null`，已提供字段用带算法标记的摘要，不 trim 或重写秘密；只将公共字段、明确的缺省标记和这些摘要交给 `h.meta`，继续由 `mutate` 比较最终 `request_hash`。同 key 同正文重放，仅改任一秘密字段返回 `IDEMPOTENCY_KEY_REUSED`；不采用秘密明文或无密钥散列。旧脱敏账本无法证明正文相同，按指纹不匹配拒绝，不降级旧算法、不改历史账本、不自动换 key 重提；提示先核对已有连接，显式提交才可使用新请求身份；合法的新同文重试保持 key，账本保留原 TTL/过期清理语义，主密钥缺失失败关闭，不用随机盐破坏稳定重试。秘密仅按现有加密存储进入连接表，不进入账本、事件、响应或日志。

- `apps/worker/src/provider-actions.ts`：把 `authorizeRepositoryContextResolution` 的事务内检查抽成接收 `PoolClient` 的 helper，在外部读取前和 `finishAction` 的 context 插入前复用；正常返回和 `action.result` checkpoint 恢复统一经过后者。采用当前 C1 `lockChannelAuthority` 的模式：无锁 locator 只找 ID；先对 workspace 取 `FOR KEY SHARE` 防止 Team 删除与事件 FK 锁倒置，保留 action 的 `FOR UPDATE`，再以 `lockAgentAuthorityPlan` 一次取得完整目标资源锁计划。Session 目标定位其 definition/grant/delegation 及关联 WorkItem/Project，遵守 helper 全局顺序与同类 ID 排序；这些锁不成为新的 Human 配置授权条件。随后对连接/仓库、Team、Human、具体 membership 行取 `FOR SHARE`，锁后重读全部 locator 绑定及现行 Human/角色/active/非删除目标权限，不新增逆序目标锁、不嵌套事务、不用 `EXISTS` 或 `FOR KEY SHARE` 替代授权行锁。锁持有至 context、pinned 与 outbox 提交；失权同事务 action dead 并复用 `provider.action.authorization_revoked`，不新增 context/guidance、pinned 或其 outbox，拒绝事实自身 outbox 单列。撤权先持锁则等待后拒绝；发布先持锁则撤权等待其提交。供应商读取期间不持数据库锁，C1 `appendEvent` 的迁移兼容与内部通知快照机制保留。

- `packages/db/src/agent-lock-order-manifest.ts`：登记 Worker 新增的资源锁消费符号及受影响 SQL statement；沿用既有清单生成与 `agent-lock-order-inventory.test.ts` 校验，不修改 `agentLockRanks` 或锁 helper，逐 statement 复核而不以行号变化当安全证明。

复用workspace兼容FK锁、完整资源plan、授权行锁的现行顺序；不改C1通知锁helper/受众/内部快照/迁移。旧脱敏幂等键fail-closed，新同文稳定，旧无参数仓库权限及filters={}不变。13条精确三修/整合场景、原六验收及DoD见review-fixes.json与review-map.md；所有产品结果未实现、未运行。

## Alternatives

- **A four-fact "can this team run" gate.** Rejected: three of the four facts are
  not observable today, so the gate would report a permanently false negative on
  every fresh install and would make running work the price of learning what is
  missing.
- **A stored `activated_at` timestamp.** Rejected: it drifts. Revoking the only
  model, archiving the only agent, or changing the default repository would leave
  a stale claim that the workspace works. The projection is cheap and cannot lie.
- **Report runner liveness from the Agent Session heartbeat.** Rejected: a
  session heartbeat is evidence about a turn, not about an idle process. It would
  be wrong in the direction that matters, showing a runner as ready when nothing
  is running.
- **Client-side derivation.** Rejected: the client cannot see credential status or
  capability approval, and a readiness answer that is wrong on a stale tab is
  worse than none.
- **Enforcing the gate in the domain as a new precondition.** Rejected: it would
  create two sources of truth for the same fact. The existing refusals are already
  correct and already tested.
- **A dismissible banner with a stored acknowledgement.** Rejected: dismissal
  turns a fact into a preference, and there is no safe per-operator preference
  store for it here.
- **A mandatory setup wizard.** Rejected: duplicates the real information
  architecture and cannot be recovered from when reality diverges.
- **Workspace-editable starting prompts, versioned now.** Deferred, not rejected:
  it is a reasonable product idea that needs its own command and permission
  design. It is not a first-run surface concern.

## Consequences

A new Lite operator learns what is missing, in dependency order, before their
first confusing command rather than after it, and is explicitly told when the
platform does not know rather than being given a confident wrong answer.

The cost is a read model with real obligations: it must stay consistent with the
underlying resource types, respect their visibility rules, and distinguish
`unknown` from `blocked` correctly, which is the failure mode a future
implementer is most likely to get wrong. Because the projection is advisory, a
bug in it produces a misleading banner and never an authorization failure, which
is the correct failure direction.

The honest limitation is in the product, not the design: **WorkMesh cannot tell a
new operator whether a runner is online**, and this ADR does not pretend
otherwise. A durable runner registration and heartbeat, distinct from Session
heartbeat, is the change that would let that check become real, and it carries a
migration, so it is named as follow-up work rather than assumed.

The code-fact audit for this premise is recorded in the [activation plan's P1
evidence ledger](../plan/2026-10-07-activation-onboarding-and-china-ecosystem.md).
The current runner loop sends heartbeats only after resolving a Session
assignment (`apps/agent-runner/src/run-session.ts:331-357`), the assignments route
queries Session/Delegation/grant rows (`apps/api/src/workbench-runner.ts:88-109`),
and heartbeat columns live on `agent_sessions` (`packages/db/src/schema.ts:316-324`).

## Migration

No database migration, no backfill, and no new table. Every fact the projection
reads already exists in the current schema, and the `unknown` result for runner
liveness is precisely what lets that stay true.

The new read model is additive: the API gains a route, the web application gains a
component, and the route-policy manifest gains a row, regenerated with
`pnpm generate:route-policy` (`scripts/generate-route-policy-artifacts.mts`)
rather than hand-edited. The only visible change for an already-configured
workspace is one additional query per workbench load, which the existing
read-model path can absorb or the workbench can fetch lazily on first render.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green, and `scripts/validate-ci.mjs` must not need an
exemption. Any statement added to the agent lock inventory is regenerated with
`UPDATE_AGENT_LOCK_MANIFEST=1` and reviewed per statement — not diffed for line
numbers alone, because `statementId` covers the owner and a canonical SQL hash
(`packages/db/src/agent-lock-order-inventory.test.ts:141-167,373-392`).

## Spec changes

### A2 已批准表面与配置入口

工作类型只来自 URL 的唯一合法 `workKind=repository|non_repository`，缺失、重复或非法参数不查询、不从 Team/对话/工作项推断。A1 投影及权限边界不变；非仓库工作仍为 `not_applicable`，Runner 恒 `unknown`，不能作为执行许可。

工作台按依赖深度排列可任意顺序解决的 unmet，固定起始提示采用三个新增中英文 WorkMesh 文案；点击只追加未发送草稿、聚焦或展开现有创建表单。仓库缺口使用 Projects canonical 页面及固定锚点，模型/Agent 使用已有 canonical 路由，浏览器往返重新查询并恢复焦点。

用户已批准项目内复用现有 provider connection、仓库注册和异步上下文 POST；只读投影自身仍无写入副作用。配置命令不自动创建 Session、委派或激活，追加 POST 没有 If-Match。新增 DTO 的 `provider_action_id` 仅用于把精确上下文结果关联至已完成动作，历史未关联结果为 null。`can_configure_context` 是提示，命令和 Worker 各自核验当前权限。

Worker 正常解析和 checkpoint 恢复均在最终落库事务内重验 Human、Team/目标作用域及资源状态，复用既有 workspace 前置锁和资源锁序，授权锁持有至事实/event/outbox 提交；不跨供应商请求持锁。连接秘密按独立用途域和字段名参加稳定 HMAC 指纹，账本不存明文；旧脱敏账本无法证明正文相同，拒绝重放且保留原 TTL 语义，不自动换键。

目标变更 Team 后，拒绝事件沿用既有解析器解析目标当前作用域，并限定原请求人的 audience，同时保留当前资源授权过滤；动作历史目标不改写，不能为了记录拒绝而降低事件作用域校验。分页最终 SQL 重验当前角色、membership 与 Team 删除状态，预检缓存不授予读取范围。

仓库列表新增 Human 专用 Team/可用 provider 筛选，在 SQL 分页前执行并绑定游标；旧无参数 Human/Agent 的范围、排序、分页信封及 200 条上限保持，Agent 拒绝新增筛选。C1 事件快照兼容及 C3 模型预置默认关闭、读取/草稿零保存出站的行为保留。无新实体、端点、事件类型或迁移；实施与实际验收记录在 `docs/reviews/a2/`，未通过 Lite、人类视觉及最终 CI 的项目不记通过。

- `OPENAPI.yaml` declares the readiness route, its three states per check
  (`ready` / `blocked` / `unknown`；`not_applicable` 另属适用性), and the fact that it
  is a query with no write counterpart.
- `CONTEXT.md` gains **Configuration readiness** as a derived View Model,
  explicitly not an authorization input and not a run permit.
- `AGENT_PROTOCOL.md` gains a pointer from the "a session needs an online runner
  and a model" requirement to this projection, so the protocol document and the
  interface stop describing the dependency two different ways.
- `docs/plan/` gains the implementation plan, with the visibility-scoping and
  `unknown`-versus-`blocked` cases called out explicitly.
