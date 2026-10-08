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
