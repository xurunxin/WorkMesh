# Pi Runner integration probe

`pnpm --filter @workmesh/agent-runner test:live:minimax:m3` uses the local
`MINIMAX_CN_API_KEY` environment variable to run a real `MiniMax-M3` Pi SDK
tool cycle over Chat Completions and Responses. It prints protocol, model,
tool-call count, final-text presence, and settlement only.

The probe uses an isolated temporary agent directory with a fixed environment
reference in `models.json`, redirects Pi writable state to a separate temporary
directory, disables built-in tools, and exposes only a deterministic read-only
probe tool. It removes its own temporary directory after execution.

## 委托执行与等待

`pnpm --filter @workmesh/agent-runner run:session` 使用安装用途凭据发现精确 Session，
沿 ACK、合法 executing、claim、credential、start、settle 完成公开 Turn。
服务端重验委托、scope、fence、批准和 Lease；工具可见性不代替授权。
`--once` 执行一次发现循环，不在本地复活已停止或 stale Session。

Runner 声明 `executionWaits` 能力，但只有服务器部署开关与原 Attempt opt-in 均启用时
才提供 `workmesh_wait`。工具请求等待后关闭当前模型、普通工具和 steering，释放本人
Lease，在同一次受控 settle 提交公开等待回复与条件。被动监测不运行模型或续租；
Human 准确批准或输入后，Worker 原子创建唯一续 Turn，新 Attempt 重新准入。
批准 action hash 保留服务器返回的完整 `sha256:` 字符串。Human pause 不自动解除。

Stop 先闭门并停止模型，清理 Runner 本人的 scratch，再以原准确 E Token、独立有界
signal 提交专用 stopAck。该路径不调用普通 Activity、Token refresh 或 Lease release。
ACK 丢响应使用安装身份只读确认原动作；拒绝或缺失来源仅报告无法确认，不盲重写。
未知在途工具、过期凭据、强杀和清理失败须由 Human 处理残留；强杀不保证 finally。
Pi 内部 completion 仍由外层 settle 回执恢复。
写响应的 transport、5xx 或 JSON 解码失败保留未知副作用标记，即使普通工具将错误包装
为模型可读结果，也不能据此登记自动恢复等待。模型退出的所有路径均先 await Pi idle
再 dispose/清理 scratch；idle 无法确认时保留本人目录，Stop ACK 报告准确残留。
