# 精确来源与观察边界

## 真实 main 与 M1 前置

本轮平台 git 使用 projectId `DzkLDn6UW-IbfoTJzN9Ro`，`ls-remote origin refs/heads/main refs/heads/tds/conv-01a121fb-781b-7b58-9bca-a596b92a8cbe` 返回两 ref 均为 `cfce77546b64c2a8d7d12949261c38e2f666d5ae`。原返回保存于 [main-observation](input/main-observation.json)，不是 origin/main 或共享 FETCH_HEAD 推断。

本地准确不可变对象的 tree／parents、M1 受审产品到证据 head 的完整 diff 列表见 source-manifest.json 的 commits／m1Precondition。main commit message 是 PR213 merge，tree 为 `ae2505b7740961f0e4c9f6c680ff90280b697af0`。本轮 todos 实读 M1 Phase=done；[CI411 实读](input/m1-ci411-readback.json)给出 run `37973142192` 十 job completed/success，含 Required CI。此原返回是摘要，不是 Actions 全日志下载，native exit/runtime 未提供则保持 null。

Chief 原发送的 PR merged、三项 blocking 闭合和准确 parent／tree 信息来自 Spec／反馈，分别保存，不冒为本 Agent 的独立审查。CI410 报告及原件索引是另一运行的历史源，未将其 ZIP 冒作 CI411。当前 M2 组合无产品实测／远端 CI 结论。

## 完整冻结来源

从准确冻结 commit 读取 README、batches-and-acceptance、coverage-matrix、operation-index、branch-separation、sources、review 七份完整 Git blob；本轮逐 blob 与开工 main 对比。不修订原报告的过时状态；以本轮 spec 的明确后续裁定解释历史。原节首尾按标题边界抽取，完整原字节在 ZIP 的 frozen/m2-section.md；frozen-m2.md 是同正文的可读副本，只规范 EOF 为一个 LF，原件／副本字节分列。

当前权威 CONTEXT、AGENT_PROTOCOL、OPENAPI、SCHEMA 及 ADR 全文，以及实际涉及的 API、domain、DB、SDK、MCP、Runner、Worker、conformance、CI、版本／内嵌 Skill 消费者全文均封存在 source-snapshot.zip。source-manifest.json 每项含真实 blob ID、bytes、SHA-256、对应 member；工作树字节另列。没有从工具截断前缀计算“全文 hash”。

## 平台与手工注入

- 本轮 authoritative saved copy：用户消息中“this is the current plan”全文，原 doc ID 从 conversation 的 plan 链接绑定；保存于 input/platform-injected-savedplan.md。history/author-original-plan.md 保全本 Agent 原 plan 正文，history/author-original-response.md 保全可见原答复。只能证明可见文本保真，无法声称后台编码或未提供的创建／版本字段。
- todos 原读回：input/m2-todo-readback.json 明确含 truncated。仅比较可见 Saved plan 前缀；它不承担完整 plan hash。conversation 原读回含 in-flight 文本，作为其实际返回原件保全。
- 未收到单独的 implementation 完整平台注入、没有单独 doc ID／version／createdAt，相关字段为 null。implementation.md 是本轮仓库执行副本；savedplan.md 与之 byte-equal，但不能称从后台取得两份原件。
- Chief 反馈、用户确认与本轮四次 edit_plan 的 old/new 文本效力分列于 input/provenance.json及input/plan-edits.json；新平台 doc ID 在 turn 结束前未知，保持 null，不为取得自身未来 ID 循环编辑。
- 工具返回保存的是可见 CallToolResult 的 JSON 序列化，不是 MCP wire、底层 HTTP 响应字节或隐藏 callID。缺失元数据保留 null。

## 保全与资源

无新服务、容器、镜像、卷、网络或秘密。本轮创建的路径仅 M2 目录与 Proposed ADR；Python／Node／git 为有界静态子进程。原工作树、M0／M1 证据和 G1D0C3 拒目标不删除、不移动。工具探索曾请求不存在的 packages/conformance/vitest.unit.config.ts／apps/api/src/agent/session-delivery.ts／packages/db/src/agent-execution-capacity.ts；已根据真实目录定位，不能把这些路径写成可复用源码或产品测试失败。
