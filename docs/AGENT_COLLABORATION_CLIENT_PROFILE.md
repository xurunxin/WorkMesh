# Agent Collaboration Client Profile 1.0

Status: Stable Core normative profile.

This profile defines adapter-neutral behavior for an external coding agent that
joins WorkMesh as a durable, auditable team participant. “MUST”, “MUST NOT”,
“SHOULD”, and “MAY” are normative. Native HTTP and MCP are bindings of the same
server policy; neither adapter grants authority. A2A and Engineering Graph are
optional Experimental extensions and are disabled unless explicitly negotiated.

## 1. Discovery and version negotiation

1. A client MUST read public `GET /api/v1/info` before exchanging or attaching a
   Session. It MUST select one value from `supportedClientProfileVersions`; 1.0
   servers prefer `preferredClientProfileVersion=1.0`.
2. After Session-token authentication, the client MUST read
   `GET /api/v1/agent-capabilities` with `WorkMesh-Client-Profile: 1.0`, or the
   MCP resource `workmesh://agent/capabilities`. An unsupported version fails
   with `PROFILE_VERSION_UNSUPPORTED`; the server does not silently downgrade.
3. The manifest is generated from the route-policy, feature, and MCP binding
   registries. `supported` means the deployment implements and enables the
   operation. `eligibleByCapability` is a hint from the current live capability
   intersection. `authorizationEvaluatedPerRequest=true` is invariant: the
   server rechecks identity, Session, Delegation, live grants, scope, approval,
   Lease, revision, and idempotency on every operation.
4. Clients MUST ignore unknown response fields and operations. They MUST NOT
   infer that an omitted optional operation is authorized or emulate it through
   another route.

## 2. Required and optional capabilities

| Capability | 1.0 client requirement | Native HTTP | MCP |
| --- | --- | --- | --- |
| exact Session attach/token renewal | Required | Session exchange/refresh routes | configured Session token |
| ACK, Context, Activity, completion/failure | Required | REST 1.0 | stable resources/tools |
| Inbox list/get/claim/ack/reply | Required for collaboration | `/api/v1/inbox` | Inbox tools |
| durable reconnect | Required | events page and SSE | stateless `list_events` page |
| Artifact evidence | Required unless an explicit no-artifact reason applies | Artifact routes | Artifact tools |
| Work Room collaboration | Required | Room routes | Room tools |
| Handoff | Required for an executor client | Handoff routes | Handoff tools |
| webhook push | Optional delivery optimization | signed, at-least-once webhook | outside MCP transport |
| A2A 0.3 | Experimental | feature-negotiated adapter | not implicit |
| Engineering Graph | Experimental, not shipped in Stable Core | disabled | disabled |

Beta and Experimental entries are usable only when their manifest feature is
enabled. Feature support never widens a Delegation or capability scope.

## 3. Collaboration lifecycle

A conforming client performs the following ordered behavior:

1. Verify server/Profile versions, authenticate the installation, and exchange
   a single-use Session token. Tokens MUST remain local and MUST NOT appear in
   logs, Activity, messages, snapshots, or Artifacts.
2. Receive an assignment by signed push, Inbox pull, or both. Push is a wakeup;
   the durable Session, Context, Inbox, and event log remain authoritative.
3. ACK promptly, transition the acknowledged Session to `executing` with the
   returned revision, retrieve the exact Session Context and pinned Guidance,
   and refetch the current Session revision before completion or any other
   later revisioned mutation. Native clients use the Session/state routes; MCP
   clients use `workmesh://session/{id}` and
   `transition_agent_session_state`.
4. Reconcile Inbox items. Claiming coordinates an Agent-targeted item but does
   not grant authority. ACK appends a receipt; reply uses the server-derived
   Work Room thread and recipients.
5. Publish concise operational Activity, human-visible Room messages, immutable
   Plan versions where applicable, and evidence-bearing Artifacts. Never send
   hidden chain-of-thought.
6. Acquire a Lease only for an operation that requires it. A Lease coordinates
   work and MUST NOT be treated as authorization.
7. Request input or approval, offer a complete scoped Handoff package when work
   moves, and complete/fail with structured evidence. Stop is server-enforced;
   ordinary writes cease immediately and cleanup ACK is the only allowed write.

Every mutation MUST use one stable idempotency key per logical intent. A retry
of the same intent MUST preserve method, target, body, revision, Session, and
key. A different intent MUST use a different key.

## 4. Push, pull, disconnect, and offline resume

- Push receivers MUST verify HMAC over raw bytes and the timestamp window, ACK
  transport promptly, and durably deduplicate `WorkMesh-Delivery-Id`.
- Pull clients MUST persist opaque collection cursors only for their exact
  route/filter/identity. They MUST also persist the decimal Domain Event cursor
  separately; the two cursor families are never interchangeable.
- Realtime/SSE and Redis notifications are wakeups. After any disconnect, a
  client MUST replay PostgreSQL-backed events from its last committed cursor,
  then reconcile its current Session, Context revision, Inbox, outstanding
  approvals, Handoffs, and Leases before resuming effects.
- Duplicate delivery is normal. The client MUST deduplicate delivery and still
  rely on server idempotency for committed mutations.
- `CURSOR_EXPIRED` requires a bounded snapshot rebuild followed by reconnect at
  the returned `resyncCursor`; silently skipping the gap is non-conforming.

## 5. Canonical fail-closed reactions

| Error | Required reaction |
| --- | --- |
| `DELEGATION_NOT_ACTIVE` | discard Session credentials; do not continue work |
| `UNAUTHENTICATED` for an expired Session token | refresh once with active installation authority, otherwise stop |
| `SESSION_STOPPED` | cease ordinary writes and perform allowed cleanup acknowledgement |
| `RESOURCE_SCOPE_DENIED` | do not retry the same target; request a new Delegation if needed |
| `REVISION_CONFLICT` | refetch current state and explicitly rebase the intent |
| `LEASE_EXPIRED` | stop the protected action; reacquire only after live reauthorization |
| `APPROVAL_REQUIRED` | request or wait for a matching approval; never weaken payload binding |
| `FEATURE_DISABLED` | disable the optional capability and continue only Stable behavior |
| `CURSOR_EXPIRED` | rebuild the authorized snapshot and use the server resync cursor |

401/403 authority failures, stop, and revoked/expired Delegations are terminal
for the current credentials. Network errors, 429, and retryable 5xx use bounded
backoff. A 409 is never blindly retried.

## 6. Public CLI behavior fixtures

The conformance package describes public interaction patterns, not vendor
internals:

- `codex-style`: push assignment with durable SSE cursor resume;
- `opencode-style`: Inbox/event polling with pull cursor resume;
- `pi-style`: hybrid event wakeup plus Inbox reconciliation.

All three fixtures execute the same authority and evidence contract. A client
may use a different UI or process model and still conform.

## 7. Executable conformance and evidence

`@workmesh/conformance` exposes an adapter-neutral driver interface, Native HTTP
and MCP reference drivers, the three fixtures, hostile-state matrix, and JSON,
JUnit, and Markdown transcript reporters. Each hostile scenario prepares a
specific server-side failure state and then issues the corresponding Native or
MCP operation; a driver that merely echoes the expected error is non-conforming.

```powershell
pnpm test:conformance -- --output D:\workmesh-conformance
```

The command must report six successful adapter/fixture runs and creates
`report.json`, `junit.xml`, and `transcript.md`. A failure includes the exact
check, expected/observed error, and required client reaction. Release CI retains
these files with the Agent protocol smoke evidence.

## 精确身份资格与 MCP 发现

`GET /api/v1/agent-capabilities?discovery=qualified` 显式返回增强 `discovery`；省略参数仍返回原 manifest，未知协商失败。API 的身份、role、scope type、state、live capabilities 与 operation/variant 资格独立于 MCP 配置；只有 adapter 知道真实注册、只读模式、coordination 和 installation bridge。`eligible` 只说明已知前提通过，`requires_target_check` 的 scope/owner/批准/Lease/revision/幂等前提仍待调用验证，不能当授权成功。未知条件分支（如 Inbox reply kind）保留条件，不直接施加 reviewer 限制。

MCP 的 `get_agent_discovery` 返回本次 API manifest 和 adapter 投影；`tools/list`、`resources/list`、`resources/templates/list` 与 `get_workmesh_context.allowedOperations` 共享同次派生规则。只有可发现且 `eligible` 的当前身份操作计入 allowedOperations；目标 E bridge 条件入口不计入。`registered` 是兼容 callback 是否存在，`deploymentSupported` 还检查 mode、coordination 和 bridge 配置，`discoverable` 再检查已知资格；数量不是产品验收率。

Human-only 旧工具保持名称与输入 schema，发现时隐藏，缓存调用返回结构化 `FORBIDDEN`；只读缓存写调用同样拒绝。旧 resource URI 与 capabilities resource 的原响应保持。仅 tool 客户端可使用 `get_server_info`、`get_server_features`、`get_agent_capabilities`、`get_agent_session`、`get_session_context`、`get_session_plan`、三种 `get_*_guidance` 和 `get_repository_context`。三个 Session 读取 alias 输入字段为准确 `id`；guidance 为 `id`，repository 为 `repositoryId`。所有现有读取继续遵守 pagination 与 durable cursor 合同。

`verify_connection` 无输入目标，manifest/current identity/listTeams 全部使用当前 C。`claim_work_item` 用当前 C claim，再用返回的 exchangeToken 兑换新 E；输出 sessionId 不构成输入 bridge。直接 E 只需 Session Token 读取自身 Session resource/tool，不要求 installation bridge；异 Session 失败关闭，不切换身份。C 的精确目标 E 变体获取一次局部 Token，以该 Token 读取目标资格并执行，核 actorId/sessionId/kind；两层 manifest actorId 必须一致，目标 actor 必须等于当前 C actor，禁止写共享 client 身份。省略 Work Room 的可选 sessionId 使用当前 C；其 Team scope不能替代 Room exact owner，当前 C 读取不归属自己的 Work Item/Project Room仍拒绝，不扩张领域权限。

错误保留 `code/message/details/correlationId` 以及可用的 `currentRevision`。受保护 401/403、撤权、Stop、角色拒绝和冲突不刷新、不重发、不盲写。请求前已知到期刷新仍经 live 授权；显式 stale ACK 保留既有 refresh→ACK 恢复，不先读取拒 stale 的 qualified manifest。Stop ACK 以仍有效的准确 E Token、当前 If-Match 和稳定 key 调用；Stop 后禁止 installation refresh，M0 不新增 MCP 清理 bridge。manifest不可读时保留原拒绝，不使用缓存降级。

调用前持久化显式 Idempotency-Key；丢响应、重连和传输重试保持同 key/body。异正文或另一个逻辑新动作使用新 key。复合 import 保持内容 hash、逐命令部分提交及各命令 key；相同内容再次导入仍受原 hash 身份限制，不能冒作另一个新动作。发现/resource读取不新增业务 receipt/outbox。后续 M1–M5 的缺入口仅披露归属。

真实本机 conformance 使用现有安全配对、真实 API/MCP、两种 mode 与直接 E；Pi 连接本机 HTTPS 假模型，核模型实收工具、真实调用和持久 Turn/Document/工具活动。根 `pnpm test:conformance:integration` 与现有 Required `api-integration` 执行该套件；内存 conformance 独立报告。上述语义决策见 `docs/adr/0079-qualified-agent-discovery-and-recovery.md`，状态保持 Proposed，最终成果须独立审查与最新 Required CI。

### 既有恢复与安装交接的发现边界

普通 qualified manifest 不可读时，旧 `ack_agent_session`、`heartbeat` 名称和输入仍可调用。直接 E 使用自身有效 Token；ACK 在 stale 恢复，在 acknowledged 只允许同 key/body 的回执重放，新 key 拒绝。stopping/terminal 的 heartbeat 仅更新诊断投影，不恢复执行；REST 仍核准确 Session、live grant 和 capability。只读部署仍拒写，受保护 401/403 不刷新、不重发，其余工具继续受普通发现门禁。

安装交接工具 `inspect_pending_handoff`、`reject_handoff` 使用配置的安装 Bearer 和 null 安装身份；不先获取 C/E manifest，不由 Session 角色代替安装资格。提供准确 handoffId 后 REST 判断目标与 live 授权；无安装凭据明确拒绝。MCP reject 使用 `rejectPendingHandoff`，SDK 原 `rejectHandoff` 的 Session 入口保留兼容。
