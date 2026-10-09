# Agent SDK, MCP, and Fake Agent

`@workmesh/agent-sdk` is the Native HTTP client for an external agent. Each public mutation gets a fresh UUID-derived idempotency key by default, while retries of that one request retain the same key; callers may supply an explicit stable operation key. It also sends optional correlation/revision headers and retries only network errors, `429`, and retryable `5xx` responses. A `409` is returned to the caller for a fresh read-and-merge; it is never retried automatically.

Before work begins, read `getServerInfo()` and negotiate one advertised Client
Profile version, then call `getAgentCapabilities({ profileVersion: '1.0' })`.
The response is an operation-support manifest derived from server registries;
it is not an authorization grant. MCP exposes the same result as
`workmesh://agent/capabilities`. The normative lifecycle, recovery, and failure
reactions are in [Agent Collaboration Client Profile 1.0](AGENT_COLLABORATION_CLIENT_PROFILE.md).

Retry controls have separate responsibilities. `maxAttempts` defaults to `3`; `baseDelayMs` (`150`) and `maxDelayMs` (`2000`) bound exponential fallback only. A valid `Retry-After` is instead accepted up to `maxRetryAfterMs` (`60000`) and waited in full, subject to the request-wide `maxTotalRetryDelayMs` budget (`120000`). A larger explicit delay suppresses automatic retry rather than truncating the server value. Invalid or negative `Retry-After` values use exponential fallback. When a retry is suppressed, `WorkMeshSdkError.retry` reports the header, parsed delay when valid, and the suppression reason. Retries preserve the original body, authorization header, and idempotency key; `429` and `503` never trigger token refresh.

Session delivery contains a one-time `exchangeToken`. Exchange it together with the active installation token; the exchange token is not a bearer credential by itself. The SDK can optionally hold that installation token to make one `401` expiry refresh through the server's `/token/refresh` endpoint; it never retries a stop/transition conflict. Installation/session tokens, webhook secrets, signatures, and authorization headers are recursively redacted by the SDK logger.

```ts
const client = new WorkMeshClient({ baseUrl: 'https://workmesh.example' })
await client.exchangeSessionToken(sessionId, exchangeToken, installationToken)
await client.acknowledge(sessionId, { summary: 'Received; preparing plan.' })
```

For a human-initiated run, use `delegateAndStart(workItemId, input, { ifMatch })`; it calls the server's atomic `/api/v1/work-items/{id}/agent-session` command instead of composing a delegation and session in the client. Session retry and approval consumption also use their revisioned server commands.

Webhook receivers must verify raw bytes. `verifyWebhook(rawBody, headers, { secrets: [newSecret, oldSecret] })` performs timestamp-window validation, constant-time HMAC comparison, and supports a rotation overlap. Delivery-id de-duplication remains the receiver's durable responsibility.

## MCP

The MCP server exposes session-scoped WorkMesh data as resources and delegates every tool to the WorkMesh REST API; it does not reproduce domain authorization or state transitions. `WORKMESH_MCP_MODE=read-only` omits every mutation tool. Read/write mode offers ACK, heartbeat, activity, plan publication, auditable Agent messages/questions, approval requests, artifact publication, complete, and fail. It deliberately does not expose a tool that impersonates a human prompt. Both modes provide work-item, context, plan, activity, and guidance resources plus `list_work_items`, `list_session_activities`, and `get_work_item`. The list tools return the full `{items,nextCursor}` envelope; pass `nextCursor` back unchanged as `cursor` for explicit continuation.

The HTTP entry point is `POST /mcp` and uses the official stable SDK's Streamable HTTP transport. It accepts `Authorization: Bearer $WORKMESH_MCP_ACCESS_TOKEN` at the MCP boundary and uses the configured `$WORKMESH_SESSION_TOKEN` to call WorkMesh. Keep both values session scoped and do not expose them to an untrusted client.

```powershell
$env:WORKMESH_API_URL = 'http://127.0.0.1:3001'
$env:WORKMESH_SESSION_TOKEN = '<session-token>'
$env:WORKMESH_MCP_ACCESS_TOKEN = '<mcp-access-token>'
pnpm --filter @workmesh/mcp start
```

For local Inspector work, use stdio rather than placing a token in a command line URL:

```powershell
$env:WORKMESH_API_URL = 'http://127.0.0.1:3001'
$env:WORKMESH_SESSION_TOKEN = '<session-token>'
pnpm mcp:inspector
```

The official split `@modelcontextprotocol/server` / `@modelcontextprotocol/node` packages are currently published only as `2.0.0-beta.5`. WorkMesh therefore pins the current stable official `@modelcontextprotocol/sdk@1.29.0`, using only its Streamable HTTP and stdio transports; it does not use the deprecated HTTP+SSE transport.

## Agent Connection quick start

A Workspace Admin creates an Agent Connection from **Agents → Agent
Connections**. Choose the Team, principal Human, client type, and the smallest
capability preset. Grant `agent:delegate` only to a coordinator that must start
other Agents. Give the generated one-line instruction to the Agent; the
10-minute pairing code is kept in the URL fragment and is never sent in an HTTP
request while the landing page opens.

The Agent installs the pinned `workmesh` Skill, redeems the `wmp_` code once,
stores only the returned `wmi_` Installation Token in its secret store, verifies
that its SHA-256 prefix matches `connection.credential_fingerprint_prefix`, and calls
`verify_connection`. The public discovery document is
`/.well-known/workmesh-agent`; the signed Skill is
`/skills/workmesh-1.1.0.md`. Never paste an installation token into a repository,
prompt transcript, command-line argument, or MCP configuration committed to
source control.

Pairing and Installation credentials deliberately use different prefixes. A
`wmp_` URL fragment is a ten-minute, single-use input to the redeem endpoint; it
can never authenticate MCP. A `wmi_` value comes only from a successful redeem
response and is the only value that belongs in `WORKMESH_INSTALLATION_TOKEN`.

For remote Streamable HTTP MCP, send the installation token on every `POST
/mcp` request as `X-WorkMesh-Installation-Token`. For local stdio fallback:

```powershell
$env:WORKMESH_API_URL = 'https://workmesh.example'
$env:WORKMESH_INSTALLATION_TOKEN = '<installation-token-from-secret-store>'
pnpm --filter @workmesh/mcp start:stdio
```

The coordination tool set verifies identity, lists Teams and workflow states,
creates and updates Projects and Issues, and may delegate/start a Session only
when the Connection was explicitly granted `agent:delegate`. Project/Issue
deletion, permission expansion, credential rotation, and Connection revocation
remain Human controls. Rotation uses a 15-minute old/new overlap after the new
credential is redeemed; an unredeemed rotation expires without disabling the
old credential.

### Server-derived MCP client setup

Humans should use `/connect#<one-time-fragment>` or **Agents → Agent Connections** instead of hand-authoring an endpoint. Both surfaces read `/.well-known/workmesh-agent`, `/api/v1/info`, and the authenticated feature registry, then produce a secret-safe configuration for Codex, OpenCode, Pi, or a generic Streamable HTTP MCP client. The rendered template contains only `WORKMESH_INSTALLATION_TOKEN` (or the client's equivalent environment-secret reference), never the redeemed value.

The client must fail closed when discovery is unavailable, its client type is not advertised, the preferred Client Profile or pinned Skill selector is unknown, or the Coordination MCP feature is disabled. After pairing, call `verify_connection` and require the live Team probe plus the returned bootstrap receipt. Then call `get_workmesh_context` before selecting work. These checks establish identity and current server facts only: tool discovery does not create a Session, Delegation, approval, lease, revision, or idempotency authority.

Store the installation credential in the client's secret store and send it only as `X-WorkMesh-Installation-Token` to the exact discovered MCP URL. Never place it in a repository, copied configuration, screenshot, browser storage, prompt transcript, log, or command line.

## Fake Agent and smoke checks

The fake Agent listens at `POST /workmesh/events`, ACKs each delivery before it starts work, validates raw-body HMAC, and de-duplicates `WorkMesh-Delivery-Id`. Exchanged session tokens are held only in its running process (never logged or persisted), allowing later prompted/pause/resume/stop deliveries to use the same scoped client. Its environment toggles delayed ACK/stale, plan/activity/question/approval/fail/complete, stop confirmation, and an intentionally rejected post-stop write:

```powershell
$env:WORKMESH_API_URL = 'http://127.0.0.1:3001'
$env:WORKMESH_INSTALLATION_TOKEN = '<installation-token>'
$env:WORKMESH_WEBHOOK_SECRET = '<webhook-secret>'
$env:FAKE_AGENT_ASK_QUESTION = 'true'
$env:FAKE_AGENT_REQUEST_APPROVAL = 'true'
pnpm --filter @workmesh/fake-agent dev
```

Run `pnpm smoke:agents` for SDK retry/HMAC coverage plus MCP construction and fake-agent signed-delivery/deduplication smoke checks. The full fake-agent workflow requires a running WorkMesh REST v1 API with the applicable support-tier features enabled and a real created session.

Run `pnpm test:conformance -- --output <directory>` for the adapter-neutral
Native/MCP lifecycle, reconnect, duplicate-idempotency, hostile-state matrix,
and Codex/OpenCode/pi-style public CLI fixtures. The output directory contains
`report.json`, `junit.xml`, and `transcript.md`.

## 精确身份资格与 MCP 发现

`GET /api/v1/agent-capabilities?discovery=qualified` 显式返回增强 `discovery`；省略参数仍返回原 manifest，未知协商失败。API 的身份、role、scope type、state、live capabilities 与 operation/variant 资格独立于 MCP 配置；只有 adapter 知道真实注册、只读模式、coordination 和 installation bridge。`eligible` 只说明已知前提通过，`requires_target_check` 的 scope/owner/批准/Lease/revision/幂等前提仍待调用验证，不能当授权成功。未知条件分支（如 Inbox reply kind）保留条件，不直接施加 reviewer 限制。

MCP 的 `get_agent_discovery` 返回本次 API manifest 和 adapter 投影；`tools/list`、`resources/list`、`resources/templates/list` 与 `get_workmesh_context.allowedOperations` 共享同次派生规则。只有可发现且 `eligible` 的当前身份操作计入 allowedOperations；目标 E bridge 条件入口不计入。`registered` 是兼容 callback 是否存在，`deploymentSupported` 还检查 mode、coordination 和 bridge 配置，`discoverable` 再检查已知资格；数量不是产品验收率。

Human-only 旧工具保持名称与输入 schema，发现时隐藏，缓存调用返回结构化 `FORBIDDEN`；只读缓存写调用同样拒绝。旧 resource URI 与 capabilities resource 的原响应保持。仅 tool 客户端可使用 `get_server_info`、`get_server_features`、`get_agent_capabilities`、`get_agent_session`、`get_session_context`、`get_session_plan`、三种 `get_*_guidance` 和 `get_repository_context`。三个 Session 读取 alias 输入字段为准确 `id`；guidance 为 `id`，repository 为 `repositoryId`。所有现有读取继续遵守 pagination 与 durable cursor 合同。

`verify_connection` 无输入目标，manifest/current identity/listTeams 全部使用当前 C。`claim_work_item` 用当前 C claim，再用返回的 exchangeToken 兑换新 E；输出 sessionId 不构成输入 bridge。直接 E 只需 Session Token 读取自身 Session resource/tool，不要求 installation bridge；异 Session 失败关闭，不切换身份。C 的精确目标 E 变体获取一次局部 Token，以该 Token 读取目标资格并执行，核 actorId/sessionId/kind；两层 manifest actorId 必须一致，目标 actor 必须等于当前 C actor，禁止写共享 client 身份。省略 Work Room 的可选 sessionId 使用当前 C；其 Team scope不能替代 Room exact owner，当前 C 读取不归属自己的 Work Item/Project Room仍拒绝，不扩张领域权限。

错误保留 `code/message/details/correlationId` 以及可用的 `currentRevision`。受保护 401/403、撤权、Stop、角色拒绝和冲突不刷新、不重发、不盲写。请求前已知到期刷新仍经 live 授权；显式 stale ACK 保留既有 refresh→ACK 恢复，不先读取拒 stale 的 qualified manifest。Stop ACK 以仍有效的准确 E Token、当前 If-Match 和稳定 key 调用；Stop 后禁止 installation refresh，M0 不新增 MCP 清理 bridge。manifest不可读时保留原拒绝，不使用缓存降级。

调用前持久化显式 Idempotency-Key；丢响应、重连和传输重试保持同 key/body。异正文或另一个逻辑新动作使用新 key。复合 import 保持内容 hash、逐命令部分提交及各命令 key；相同内容再次导入仍受原 hash 身份限制，不能冒作另一个新动作。发现/resource读取不新增业务 receipt/outbox。后续 M1–M5 的缺入口仅披露归属。

真实本机 conformance 使用现有安全配对、真实 API/MCP、两种 mode 与直接 E；Pi 连接本机 HTTPS 假模型，核模型实收工具、真实调用和持久 Turn/Document/工具活动。根 `pnpm test:conformance:integration` 与现有 Required `api-integration` 执行该套件；内存 conformance 独立报告。上述语义决策见 `docs/adr/0079-qualified-agent-discovery-and-recovery.md`，状态保持 Proposed，最终成果须独立审查与最新 Required CI。

### 恢复调用与安装凭据用途

旧 MCP `ack_agent_session`、`heartbeat` 调用不先要求普通 qualified manifest。直接 E 凭有效自身 Token 到 REST；stale ACK 可恢复，acknowledged 同 key/body 可重放回执，新 key ACK 拒绝。stopping/terminal 心跳只诊断，不恢复普通写权限或 manifest 读取。其他工具没有此例外，readonly 缓存写调用仍拒绝，受保护 401/403 不换身份重试。

`inspect_pending_handoff`、`reject_handoff` 按独立 null 安装身份披露条件入口，调用明确使用安装 Bearer；准确 handoffId 的归属与 live 授权由 REST 检查。SDK `rejectPendingHandoff` 专用于该安装用途，原 `rejectHandoff` 的 Session 兼容行为保留；仅 Session Token 的 E 没有安装工具资格。
