# 本轮静态核验与独审门禁

本轮只保存受控文档与 Proposed ADR，不修改产品。准确提交 head 在最终回复中登记，不把文件写入自身 head。没有内部独审结论，没有代表平台另一 Agent 或 Chief 作出确认。

## 实际静态检查

回执为 [static-checks.json](static-checks.json)。复核命令：`python docs/plan/agent-mcp-m1/static-check.py`；检查源码 ZIP 的 203 个独立全文成员/哈希/对象、精确 main 父与 tree、冻结节全文、spec/plan 两对一致、平台可见前缀、操作合同及锚点、九类矩阵、相对链接、空白和只文档差异。将文档暂存后核 `git diff --cached --check`，再次执行带 `--staged` 的脚本并保存回执，核实际 CI 分类。提交后使用 `--commit HEAD` 对比受核验文档与提交 blob；只读结果在回复报告，避免自引用提交循环。

首败保存在 [static-first-failure.json](static-first-failure.json)：Spec 可读副本末尾保留两个工具分隔 LF，而核验期望一个；规范可读副本末尾空行，原始平台返回与 Git 全文保留。随后 [链接检查失败](static-link-failure.json) 是回执目标尚未生成，预建明确未完成文件后再正常核验；该次工具显示截断的缺口明示，未伪造完整日志。静态检查不调用 API handler、不启动 API/MCP/Worker/Runner，也不代表功能可用或产品测试通过。REST/DTO/policy/SDK/MCP/manifest/Runner/conformance 同步实施及全部必需本机检查、真实 Stop/失响应/撤权/并发/零事实运行、最新 Required CI、实际 main 合入尚未验收。

## 待独审闭合

- Proposed ADR、安全合同的无副作用身份分流、live 身份/双 Delegation/Connection 来源/精确 action 与 key、原回执 revision/sequence、最小摘要；拒绝账本例外明示。
- 完整批次逐 operation 的角色、状态、scope、参数输出、具名消费者、旧 wire/工具兼容与 Human 控制保留，不把新查询当已有端点。
- Pi settle 内层 completion 无独立 receipt 的事实、旧外层回执重放、不可确认不证明未提交、历史归属关联被清理后 Agent 拒绝。
- Stop 关闭模型/工具/steering、等待退出、独立有界 finally、原 E Token 不刷新、cleanupSummary/residualRisks、晚到请求与失败残留、普通 release 不代 Stop。
- 九类真实运行矩阵/CI 入口/逐套件删除负例、源码指纹和首败原件、资源准备恢复与清理；所有未来测试未运行。

下一步由平台另一 Agent 从此目录审完整方案，blocking/high 闭合后 Chief confirm 进入实现。本轮停止于该门禁，文档合入不等于整卡完成。

## 资源与保存

只运行了只读 Git、Python 文档生成/核验和 Node CI 分类等短生命周期命令，退出随回执登记；未创建容器、镜像、卷、网络、监听服务或长期后台进程。生成路径仅本目录与该 Proposed ADR，都是交付文件，保留。未删除任何目录、共享 store、恢复现场、历史 worktree 或已拒 G1/D0/C3 目标；无全局 prune、ACL/属性调整或审批绕行。本轮没有产品运行首败现场；静态失败则按实际输出记录并修正后另留回执。
