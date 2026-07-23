# Stage 1 Agent SDK, MCP, and Fake Agent

`@workmesh/agent-sdk` is the Native HTTP client for an external agent. Each public mutation gets a fresh UUID-derived idempotency key by default, while retries of that one request retain the same key; callers may supply an explicit stable operation key. It also sends optional correlation/revision headers and retries only network errors, `429`, and retryable `5xx` responses. A `409` is returned to the caller for a fresh read-and-merge; it is never retried automatically.

Session delivery contains a one-time `exchangeToken`. Exchange it together with the active installation token; the exchange token is not a bearer credential by itself. The SDK can optionally hold that installation token to make one `401` expiry refresh through the server's `/token/refresh` endpoint; it never retries a stop/transition conflict. Installation/session tokens, webhook secrets, signatures, and authorization headers are recursively redacted by the SDK logger.

```ts
const client = new WorkMeshClient({ baseUrl: 'https://workmesh.example' })
await client.exchangeSessionToken(sessionId, exchangeToken, installationToken)
await client.acknowledge(sessionId, { summary: 'Received; preparing plan.' })
```

For a human-initiated run, use `delegateAndStart(workItemId, input, { ifMatch })`; it calls the server's atomic `/api/v1/work-items/{id}/agent-session` command instead of composing a delegation and session in the client. Session retry and approval consumption also use their revisioned server commands.

Webhook receivers must verify raw bytes. `verifyWebhook(rawBody, headers, { secrets: [newSecret, oldSecret] })` performs timestamp-window validation, constant-time HMAC comparison, and supports a rotation overlap. Delivery-id de-duplication remains the receiver's durable responsibility.

## MCP

The MCP server exposes session-scoped WorkMesh data as resources and delegates every tool to the WorkMesh REST API; it does not reproduce domain authorization or state transitions. `WORKMESH_MCP_MODE=read-only` omits every mutation tool. Read/write mode offers ACK, heartbeat, activity, plan publication, auditable Agent messages/questions, approval requests, artifact publication, complete, and fail. It deliberately does not expose a tool that impersonates a human prompt. Both modes provide work-item, context, plan, activity, and guidance resources plus `list_work_items` and `get_work_item`.

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

Run `pnpm smoke:agents` for SDK retry/HMAC coverage plus MCP construction and fake-agent signed-delivery/deduplication smoke checks. The full fake-agent workflow requires a running Stage 1 API and a real created session.
