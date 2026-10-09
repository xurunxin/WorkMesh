# M1 受控方案入口

本批只交文档，产品尚未实施。本平台计划内容保持不变；按本轮明确反馈在同 todo、同会话分支保存完整可独审方案。终态恢复采用精确归属只读确认，不采用有限终态命令重放。先由平台另一 Agent 审查 Proposed ADR、安全合同和完整批次，blocking/high 闭合后由 Chief confirm 才进入产品实施；文档提交或合入不代表本卡完成。

## 审查顺序

1. [当前 spec 全文](current-spec.md)、[本轮 steering 全文](steering.md)、[冻结 M1 原文](frozen-M1.md)：steering 与用户已选只读确认裁定覆盖原文中对应条款，其他要求保留。
2. [savedplan](savedplan.md) 与 [implementation](implementation.md)：本轮注入完整当前计划，逐字节一致；[全文绑定](plan-fulltext-binding.json) 区分注入全文与工具截断读回，不重新 edit_plan。
3. [Proposed ADR](../../adr/0080-exact-session-execution-result-confirmation.md)、[安全合同](security-contract.md)、[兼容策略](compatibility.md)：新增路径/DTO/policy 都是提案，主线不存在确认端点。
4. [操作索引](operation-index.md) 与 [逐操作完整映射](operation-decisions.json)：完整 Session、Plan/context/版本、Approval、Lease、Recovery、stopAck、Human/内部前置；既有 REST 合同、实际源码锚点和拟新增消费者分列。
5. [Runner 生命周期](lifecycle.md)、[九类 DoD 与实际验证入口](verification.md)：普通 makeTool、模型退出、原 E Token、独立 finally signal、失响应和不可确认残留均具体化。
6. [来源说明](sources.md)、[不可变源码索引](source-manifest.json)、[源码全文容器](source-snapshot.zip)、[本轮静态回执与门禁](review.md)。

只读身份解析不得调用会写 usage/续建 C Session 的 resolveCoordinationIdentity；成功和拒绝均不签 Token、续 Session、写 receipt/领域 event/outbox，既有独立 authorization_denials 例外单列。保留普通终态 E 拒绝和 ADR0068 settle 回执重放；Pi 内层 completion 没有独立 receipt 的事实不得伪造。安装/Connection 归属历史关联缺失时 Agent 失败关闭，合法 Human 保留原读取。

本批只使用 Todos 与仓库记录，没有新建真实 WorkMesh Project/WorkItem。Web UI、F/TA 新域、真实外发/发布、团队权限及凭据连接扩大不在范围内。

## 实际状态

来源 main 为 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`，重新读取的是 `refs/heads/main`，不是 FETCH_HEAD。完整来源由 Git blob 归档，原始字节未通过工具显示前缀重建。当前会话分支交付，最终提交 head 由回复给出，避免文件写入自身提交循环。

本轮无产品服务、无产品测试、无迁移、无产品 REST/事件变更；仅静态检查结果见 review。产品检查、独立成果审查、最新 PR Required CI 和实际 done/main 均是后续验收门禁，未运行不得写成通过。在本文件变更的审查页可用预览按钮阅读，Files 页可浏览同分支完整文档。
