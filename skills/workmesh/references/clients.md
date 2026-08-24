# Client adapters

Run `node scripts/pair.mjs --url "https://workmesh.example/connect#fragment" --agent-slug coordinator --client codex --output .workmesh` from this Skill directory. The script writes a mode-0600 `.env` secret and a redacted adapter file. Keep `.workmesh/` out of source control.

For Codex, OpenCode, pi, or a generic MCP client, create a Streamable HTTP server named `workmesh` using the emitted URL. Source custom header `X-WorkMesh-Installation-Token` from `WORKMESH_INSTALLATION_TOKEN`; do not inline it in a repository configuration.

If the client cannot source a custom header from an environment secret, run the WorkMesh production MCP image in stdio mode with command `node dist/stdio.js` and:

```text
WORKMESH_API_URL=https://workmesh.example
WORKMESH_INSTALLATION_TOKEN=<secret>
WORKMESH_MCP_MODE=read-write
```

After any configuration path, install the pinned Skill and call `verify_connection`, then `get_workmesh_context`, before creating, claiming, or updating work.

For autonomous execution, use this loop after the identity checks:

1. Call `list_claimable_work_items`; it returns unassigned Issues and exact same-identity all-stale assignments that remain eligible after live `work:read` and `work:write` authorization is revalidated.
2. Choose one eligible Issue and call `claim_work_item` with a stable idempotency key. For stale recovery, accept the new Session ID and discard local authority for the old Session. Keep using the same MCP Connection; the server refreshes exact-Session authority for later execution tools.
3. If the response is lost, replay the same key; do not issue a second claim key for the same intent.
4. On `CLAIM_CONFLICT`, `AGENT_CONCURRENCY_LIMIT`, cancellation, or Stop, re-read state and continue the next discovery round.
5. After completion, publish evidence and repeat discovery. A Human force assignment is authoritative and may atomically replace a self-claimed execution; `delegate_work_item` remains the separate Agent-to-Agent operation.
