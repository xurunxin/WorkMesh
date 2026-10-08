# D1b 实施前置核验

当前计划 `doc:nnchKV-O25SWiYsj3hXgm` 的正文保持不变，版本字段继续为 `null`；完整快照、来源与历史由 `plan-source.json` 和 `plan-binding.json` 保存。最新 main 已重新 fetch，仍为计划基点 `1078bbcd527550bfabee73093b7ffd0032d3fd24`。本轮仅修正前置独审提出的三项证据／登记问题，未迁移 UI 消费或删除旧声明。

## 定向修正

- 当前成果以 `plan-binding.json.artifacts` 的实际 index blob、Git 原字节和工作区原字节绑定；过期记录转入 `historicalArtifactBindings`，保留原提交及历史内容。验证器复核当前绑定，发现任何哈希／字节数／blob 过期即失败。
- 运行时保留 status-color、dismissal-depth、overlay-depth 三项。映射的 `runtimeDefinitions` 给出实际生产者、清除、消费和 fallback；CSS 所有未声明 wm 依赖必须与登记集合一致。overlay 的堆栈及回焦动态行为仍待迁移面／全局阶段验证。
- 留证运行将实际命令、真实退出状态、runtime、耗时、执行前后完整输入指纹及无损 stdout／stderr 保存；报告不能自证，使用单独复核命令检查当前输入、输出哈希和前后相等。

## 可复核命令与结果来源

先将本轮受控源码／文档加入 index，使实际 blob 可读，再执行：

```text
node docs/reviews/d1b/run-preflight.mjs
node docs/reviews/d1b/run-preflight.mjs --check-record
git diff --check
```

精确子命令为 `node docs/reviews/d1b/verify-preflight.mjs`。本轮实际运行结果、退出码及输入绑定见 [`preflight-execution.json`](evidence/preflight-execution.json)，子进程原始 stdout／清单见 [`preflight-inventory.json`](evidence/preflight-inventory.json)。stdout／stderr 不 trim；旧清单保留在 `bb3963e` 的 Git 历史，不能作为新验证器的运行证据。

检查覆盖完整旧槽／声明、显式退役映射、四组拟迁依赖图、现有三个实例生产／清除／fallback 契约、当前成果双字节绑定及其失败负例。词法清单仍是保守前置清单，不能据计数宣称 AST 阶段账本已经实现或允许清旧。

## 关口与后续

清旧门禁保持关闭，首面迁移尚未开始。动态绑定、运行截图、明暗子树继承、导航／焦点及实际视觉批准不由本轮静态检查替代；静态修正完成后交独审定向复核本次三项。产品全回归、最新 Required CI、成果合入及最终 Chief 验收均后置；本轮未重跑尚未到阶段的产品全回归，也未启动需要恢复或清理的服务。
