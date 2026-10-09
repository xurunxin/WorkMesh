# Runner 修复与定向运行证据

本记录只支持 Runner 定向修复；不能替代真实 API、Worker、MCP/Pi conformance 或全仓必需检查，也不表示 M1 验收。受测 Git HEAD 为 `5da5fdfac94d89e09b5409bca0877c0e02eedb77`，实际工作树新增修复在各检查的 `*-inputs.zip` 分别保全；HEAD 不是产品已合主线证明。

## 修复与反例

`ExecutionLifecycle.request` 已在原 checkpoint 对非明确拒绝的写响应保留未知标记；这次用实际 `createWorkMeshTools` 的 `makeTool` 包装链验证 structured 5xx、JSON 解码失败及 transport 丢响应均不能登记自动等待。没有用成功 Activity 抹掉未知标记，模型可读错误仍是失败。

`runPi` 原有 prompt reject 分支可能在普通 `waitForIdle` 前退出；Pi 的同步 `dispose` 只发出 abort，不等静止。本次在 session finally 明确 await Pi abort/idle 后才 dispose 与清理本人 scratch。idle 未确认时保留目录，专用 Stop finally 报告无法确认 idle 与资源残留，不能假称模型已停止。既有 Stop 最高退出优先级、原 E Token 和独立 cleanup signal 保持。

新增 `run-session-cleanup.test.ts` 用受控 Pi Session fixture 验证 Stop 与 scratch 删除故障、idle 确认故障两条路径：没有普通 settle/release/Activity，仍调用专用 Stop cleanup，摘要和风险准确。该测试不是运行真实产品 HTTP 的 Stop 证明；真实 Pi SDK 等待模型闭门仍由既有 `wait-pi.test.ts` 定向运行，完整系统链由 conformance 单列。

## 实际结果

| 命令 | 回执 | 实际结果 |
| --- | --- | --- |
| `pnpm --filter @workmesh/agent-runner test` | `runner-repair-test.json` | exit 0；13 files / 66 tests；此前时序修复尚未加入 |
| `pnpm --filter @workmesh/agent-runner typecheck` | `runner-repair-types.json` | exit 2；新增 test method/path 缺显式类型，TS7006 首败保留 |
| `pnpm --filter @workmesh/agent-runner typecheck` | `runner-repair-types-second.json` | 修正精确 request method/path 类型后 exit 0 |
| `pnpm --filter @workmesh/agent-runner test` | `runner-repair-test-second.json` | 最终本次 Runner 源码 exit 0；13 files / 67 tests / 0 skip |

四次均经 `scripts/m1-run-check.py`，真实 Node 为 `22.19.0`。回执保存精确命令、进程退出、runtime、输入 ZIP hash、worktree 与 HEAD Git blob 字节、后指纹。运行期间其他工作区部分文件可变化；Runner 源码本次末次受测后未变，README 三行说明在运行后补充，不能将所有 repo 输入一概称最终组合已测。

## 原件与资源

`runner-legacy-logs.zip` 无损保存 `node_modules/.m1-runtime` 的八个历史 Runner 日志原字节；`runner-legacy-logs.json` 逐成员记录长度/SHA-256，`historical-runner-*.log` 是去尾随空白的可读副本。保留 Skill LF pin 两用例失败与之前/之后的实际摘要。原临时记录器没独立进程退出回执和完整受测输入，历史 exitCode 为 null；最早仅工具截断可见的十八失败没有完整原件，明确缺口，不补造。

最终定向运行创建的三个本人 scratch 路径、created/retained/removed_after_injected_failure 回执，以及真实 Pi 模型 HTTP fixture 的 localhost 端口 created/closed，均在 `runner-repair-test-second.log`。两条模拟失败在确认 mock 模型已结束后仅删除各自经 `removeScratch` 校验的目录；没有动共享容器、其他服务、恢复目录或审批拒绝目标。失败注入只作用这两个测试的本人路径，不改变生产清理权限。
