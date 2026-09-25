# Pi Runner integration probe

`pnpm --filter @workmesh/agent-runner test:live:minimax:m3` uses the local
`MINIMAX_CN_API_KEY` environment variable to run a real `MiniMax-M3` Pi SDK
tool cycle over Chat Completions and Responses. It prints protocol, model,
tool-call count, final-text presence, and settlement only.

The probe uses an isolated temporary agent directory with a fixed environment
reference in `models.json`, redirects Pi writable state to a separate temporary
directory, disables built-in tools, and exposes only a deterministic read-only
probe tool. It removes its own temporary directory after execution.

This package does not yet implement the WorkMesh Runner service, delegated
authorization, durable Turn/attempt storage, outbound policy, or Stop fencing.
