# 后端优先：Agent 全功能 MCP 覆盖与独立交付范围方案

状态：可审方案；2026-10-09。任务：[#53](todo:c2myb8a18ksdT50jkJnb8)。产品基准 head：`74f247f9240eaf21e74ef248f71a445c1d4276d7`；被本轮平台独审的方案 head：`32a5c2c1270b1038d65a391a6b771aff42842c85`。本次修订的最终 head 由平台提交产生，不虚构 SHA。

## 已定方向与建议结论

用户09:53已选择“启动方案，后端独立交付”。建议先把现有领域功能形成 Agent 无需 Web 点击的工作闭环，再单独选择 F/TA 新增后端范围。后端独立交付方向已经确定；本文件提出具体切片、消费者兼容检查和验收标准，供裁定后实施。本轮没有产品代码、UI、迁移、API 或事件变更，没有 cherry-pick、merge、外发、连接或权限变更。

“全面可用”应指：在明示的角色、部署 feature、授权和凭据条件下，Agent 能发现操作，取得准确 ID/revision/context，完成命令，确认异步结果，在失败或 Stop 后安全恢复，并提供结果与证据。Human 决策、管理员授予权限及外部凭据供给仍是真实前提；不把这些操作改成 Agent 自批，也不把一个工具数量或 REST endpoint 数量当作完成指标。

现有主线已经实现 Coordination Connection、接单与委派、普通规划 CRUD、版本化文档、Session/Plan/Activity、Inbox、Lease/Handoff、Git 提供方动作、审批和证据、自动化与循环等领域基础。MCP 静态注册覆盖其中相当部分，Runner 只有首批适配；仍有读取/恢复入口缺口和被描述为可见但 Human-only 的工具；评论写仅Human，E普通CRUD也不能按工具广告取得Team协调角色，终态失响应不能依赖原E token直接重读。现有组件存在不证明目标组合已验收。

建议按以下顺序推进，具体任务全文与适用验收见[批次及验收](batches-and-acceptance.md)：

1. **M0：发现、角色及恢复契约一致**。校正可发现工具与实际可调用动作的差异，保留资源型客户端兼容，明确 Session 模式与 Coordination 模式，稳定幂等重试和完整错误信息。
2. **M1：现有核心执行闭环**。补 Session/Plan/Approval/Lease/Stop 的读取与恢复工具及 Runner 适配，新增最小精确归属终态结果确认合同，尤其 `stop_ack` 和租约续期/释放；不扩张人类控制权限。
3. **M2：现有协作与规划闭环**。补评论读取、Inbox/Work Room、Handoff、版本化文档、规划查询及已有子 Session／reviewer 的创建与完成链，明确 exact Session 身份和required child父完成阻断。
4. **M3：已有 Git 与证据交付闭环**。补仓库/交付/上传状态的可发现查询；精确 provider action 终态查询缺少现行 REST，需要先补查询合同与授权。保留 Worker/outbox、独立审查和 exact-head Human 批准。
5. **M4：已存在的可选领域覆盖**。按已启用部署验自动化/Loop/成本/周期/Initiative/Template 的现有 Agent 读取和允许动作；Initiative rollup先修后端Session scope读取差异再适配，未修标Agent不支持。Human 管理动作保留。
6. **M5：选定部署与真实客户端联合验收**。运行外部 MCP 客户端与内置 Pi Runner 的同一闭环，记录客户端/OS/版本及证据；公共签名 Skill 发布与无源码分发仍分别走旧卡和既有发布门禁。

M0–M5是本方案提出的完整任务边界，尚未创建任务或启动实现。#5/#9/#16按原todo继续修正与收尾，不复制为M批次任务；它们是相关输入和可并行准备的后端独立交付切片，不作为所有 MCP 补齐工作的统一阻塞。

## 阅读导航与来源强度

| 文件 | 用途 |
| --- | --- |
| [coverage-matrix.md](coverage-matrix.md) | 领域/角色/前提→REST/合同/SDK→policy/feature→MCP参数与返回→manifest→Runner→验收与错误恢复 |
| [operation-index.md](operation-index.md) | 精确main全部OpenAPI operation、Human/公共/内部角色、工具绑定、参数与返回schema出处；防止漏项 |
| [branch-separation.md](branch-separation.md) | #5/#9/#16精确文件/提交来源、后端与UI拆分、消费者兼容、冲突及保全 |
| [batches-and-acceptance.md](batches-and-acceptance.md) | 六个完整拟实施任务、真实客户端使用链、九类验收与不适用理由、DoD和待裁定项 |
| [sources.md](sources.md) | 实读remote ref、完整Git blob指纹、旧卡/TA读取缺口及本轮资源账本 |
| [review.md](review.md) | 本卡授权的独立方案审查、修订对应和实际文档检查 |

来源不是事务快照。主线和未合分支代码按精确 Git SHA 读取；平台长正文的截断不能充当全文或全文哈希。main缺少TA本地总计划及任务包，当前只使用平台可见卡片范围，不伪补它们。本方案不接受A2/C2/D1b旧视觉，不改写P1/D0/G1/R1/D1a/A1/C1/C3/#52历史验收。

权威产品依据是现行 `CONTEXT.md`、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql`及已接受ADR。没有恢复已移除的 `WORKMESH_PRD.md`；历史ADR中的PRD提及仅保留其历史含义。ADR0078仍为Proposed，F2自主委派和F5审计重新投递已有用户裁定保留，但不推导F链全部实施授权。ADR0067/0069的部分实现状态也不能抹掉。

## 全链的交付要求

每条选定操作必须具有同一 `operationId` 的REST/Zod合同、SDK、route-policy与feature、MCP binding、derived manifest、Runner适配和conformance证据。复合工具需列出其全部组成命令与权限；不能用 `apply_project_import→createProject` 的单行binding证明其Milestone/WorkItem/relation整链授权与能力支持。API仍逐次重新授权，manifest的 `supported` 表示feature支持，`eligibleByCapability`仅表示能力交集；两者不等于目标资源、当前状态、批准、Lease或真实工具实现已满足。

MCP现有成功返回为text JSON加 `structuredContent.data`，失败为 `isError=true`、text JSON及 `structuredContent.error`，包含 `code/message/details/correlationId/safeNextAction`，可提取 `currentRevision`。新增工具沿此格式，分页保留 `nextCursor`，异步操作返回准确 action ID/目标/状态及下一查询入口。SDK重试保留同一操作身份；改变正文须新身份；权限拒绝不自动刷新凭据绕过。

资源URI与tools/list是两种发现机制。Session/Plan/Guidance等现有resource能被支持resource的客户端读取；若目标客户端只消费tool，需添加等价只读工具。只读模式不得注册写工具，Coordination与executor工具不能混成无差别角色。停止后的专用清理不能经过会产生普通Activity的Runner通用写包装器，也不能因普通eligible过滤而消失。

## Human保留与后续范围关口

保留现行Human专属的Connection/成员/权限管理、模型连接与秘密配置、审批决定、Handoff接受、Session控制与重试、强制Lease释放、Guidance发布、Project update发布、完成建议裁决，以及自动化/Loop/Template管理等。破坏性Project/Issue动作还存在声明与Coordination领域约束差异，需在M0明确展示并验证，不以声明中含Agent放行。

如果用户希望Agent管理其中某一类，应为那一类单独提出领域权限/协议变化和ADR，裁定后再实施。正常Human批准可用现有REST通过经授权的人类客户端完成；这仍是Human行为，不将Human cookie注入Agent。没有可靠的Human操作入口时，应在演示中如实记为闭环前提缺口。

待裁定项集中在[范围问题](batches-and-acceptance.md#范围问题与推荐)。不重新询问后端独立交付方向，不要求用户提供Chief已有可读状态，不把出站MCP、机器管理或shell列为入站工具补齐。

## 本轮检查与交付限制

本轮只改 `docs/plan/backend-agent-mcp-priority/*.md`，沿当前 `scripts/ci-policy.mjs` 的docs判定做来源、覆盖、链接、空白和独立审查；不反复运行零收益全产品检查，不把未来用例写为通过。修订的来源、索引、链接、空白及CI分类实际结果见[review.md](review.md)；三项平台独审意见的修订对应已归档，修订后平台复审仍待执行。最终PR Required CI由平台流程确认，本轮不冒远端CI成功。后续产品批次仍须执行其适用必需检查，失败或skip不记通过。

R1既有例外允许本批使用Todos＋仓库替代真实WorkMesh双轨记录。本轮没有可调用的WorkMesh MCP控制面，使用本卡对话和这些文件记录方案、取舍与后续问题，没有伪造远端Project/WorkItem。没有新建容器、服务或秘密，当前及旧证据目录保留；资源说明见sources.md。

演示方案时，在本文件的变更预览中依次打开覆盖矩阵、拆分方案和验收任务，再对照来源SHA读取原件。此演示是方案审阅，不是新功能演示。后续派工需消费独审意见与用户裁定，旧卡仍由原todo承接完整纠正规格和原失败材料。
