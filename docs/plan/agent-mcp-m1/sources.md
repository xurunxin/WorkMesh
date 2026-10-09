# 来源、全文与前置绑定

[精确远端观察](main-observation.json) 保存本轮平台只读 git 的 `ls-remote origin refs/heads/main` 参数和完整输出。其 SHA 是 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`，与开工 HEAD 一致；该对象的父为 `69085317c88d84b702af727dc0ac7152589626d8` 和 `883d279d3b5978680672a6c1d7364d421d0afd10`，tree 为 `a1c61dbea9e6bb09bbe0a353b6e67e11f4fc0953`，与第二父 tree 相同。对象/父/tree 由本机不可变 Git 对象重新核验，未以远端跟踪分支、FETCH_HEAD 或构建候选代主线。

M0 actual-main 来源已消费：已审合同/operation/domain 决定，product-report、product-recovery-report、product-ci407-report 及实际证据索引，连同本主线落地产品代码。#54 done/PR212、CI408/run37915376122 的历史通过是 Chief 提供的前置证明；本轮没有重新运行或重新查询该 CI，不算 M1 产品测试。旧 ZIP 声明缺失的两容器原件等缺口仍是历史缺口，本轮不修补、不倒改 M0 报告。

## 精确 Git 全文

[source-manifest.json](source-manifest.json) 与 [source-snapshot.zip](source-snapshot.zip) 保存 203 个文件全文。每个成员路径为 `不可变SHA/仓库路径`，单独记录 Git blob OID、原始字节数和 SHA-256；ZIP 自身另记字节数和 SHA-256。`capture-sources.py` 通过 git show 精确对象读取二进制全文，不使用 shell/工具截断输出作为原件。`static-check.py` 独立解读每个成员并重新比较完整 Git blob。

冻结来源为 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d` 的 backend-agent-mcp-priority 全目录，包括 batches-and-acceptance、README、coverage-matrix、operation-index、branch-separation、sources、review。当前 main 的这些完整文件也归档，区别冻结依据与已落增量。[frozen-M1.md](frozen-M1.md) 从冻结全文两个节标题之间精确提取，保留原选项历史，不将已取消的有限终态重放重新设为待选。

权威 CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA/AGENTS、全部现行 ADR、数据库迁移、M0 来源、相关 API/domain/contracts/SDK/MCP/Runner 及测试/CI 入口完整归档。工作树对应文件另外记录原始字节/hash，与 Git 字节的 identical/CRLF/different 关系；运行字节不冒作 Git blob。没有重建已移除的 WORKMESH_PRD。

## 平台全文与截断

[savedplan.md](savedplan.md) 和 implementation.md 来自本轮消息注入的完整当前平台计划正文，去掉包裹标签，UTF-8、LF、末尾一个 LF，两文件字节一致。权威来源不是 todos 工具被截断的 Saved plan 读回。[platform-observation.json](platform-observation.json) 保存工具实际返回、可见前缀和 doc ID；version 与 planCreatedAt 读不到，均为 null，completePlanReadback=false。可见前缀与全文起始逐字一致，但其 hash 不可冒全文 hash。[plan-fulltext-binding.json](plan-fulltext-binding.json) 分别记录全文与前缀，不宣称后端全文读回，也不产生自引用 edit_plan 循环。

current-spec.md 与 spec.md 是工具可见完整 Spec 正文的同字节副本，Spec 在 Saved plan 截断之前结束；可读 Spec 和 frozen-M1 仅移除段落/节分隔的末尾空行并补一个 LF，正文不改。原始工具返回及 Git 全文件字节完整保留，冻结节的原提取字节数/hash 与可读副本分列。steering.md 保存本轮反馈全文。生效要求是 current-spec 加后续 steering 加明确裁定；注入的 savedplan 原文不被静默重写。执行细节以合同/兼容/生命周期/映射/矩阵补充展开，不改变已选只读方案或扩大权限。
