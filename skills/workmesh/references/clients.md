# Client adapters

Run `node scripts/pair.mjs --url "https://workmesh.example/connect#fragment" --agent-slug coordinator --client codex --output .workmesh` from this Skill directory. The script writes a mode-0600 `.env` secret and a redacted adapter file. Keep `.workmesh/` out of source control.

For Codex, OpenCode, pi, or a generic MCP client, create a Streamable HTTP server named `workmesh` using the emitted URL. Source custom header `X-WorkMesh-Installation-Token` from `WORKMESH_INSTALLATION_TOKEN`; do not inline it in a repository configuration.

If the client cannot source a custom header from an environment secret, run the WorkMesh production MCP image in stdio mode with command `node dist/stdio.js` and:

```text
WORKMESH_API_URL=https://workmesh.example
WORKMESH_INSTALLATION_TOKEN=<secret>
WORKMESH_MCP_MODE=read-write
```

After any configuration path, install the pinned Skill and call `verify_connection` before creating or updating work.
