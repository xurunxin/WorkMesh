# R1 独立规格审查与处置台账

输入：execution-inputs.json 的29张卡完整正文、最新main以及原审查全文。规划层三项blocking已由原复核者在1e1659974核验闭合，本报告处理实际规格，不能沿用规划通过宣称最终稿通过。P1冻结16条和D0/G1历史原件保持不变。

## blocking

本轮没有已证实的该级别新增finding；不表示所有实现已通过。

## high

### R1-H01

位置：docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md:119（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/api/src/auth-idempotency.ts:285；apps/web/app/lib/mcp-onboarding.ts:131。

事实：重放直接解密返回；当前 onboarding 要执行全部 Skill 与身份校验，而 ADR 在 verify_connection 前提交配置。pending 精确 body 包含 pairingCode。

影响：可能持久提交错误/撤销凭据；Windows mode不能证明配对码受到保护。

具体处置：统一完整身份/当前凭据验证先于秘密与正式配置，敏感pending并发/ACL验证和失败补偿；撤回无秘密pending与重放重验撤权假定。

owner：R1；#5 执行者；受影响任务：#5、#7、#20；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-H02

位置：docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md:528（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/api/src/inbox/routes.ts:1125；apps/api/src/inbox/routes.ts:1149；apps/api/src/collaboration/routes.ts:1003；apps/api/src/collaboration/routes.ts:1061；packages/db/migrations/0032_agent_inbox_receipts.sql:92。

事实：当前 reply/answer/resolve 按根消息唯一resolution完成，但投影更新仅筛 room_message。每recipient/source唯一仅保证每前驱生成幂等，不定义恢复链收敛。

影响：多次恢复可能被当新业务输入绕过去重/Stop，完成后仍留open后继，或发生并发最终回复。

具体处置：冻结直接前驱、持久根及可空根消息引用、每前驱恢复资格/幂等/统一根锁、三完成路径全链原子收敛与Stop/撤权/换届约束；F3/F4/F5接口和F6联合验收明确owner。

owner：R1 冻结；#26/#27/#28 分面；#29 联合验收；受影响任务：#26、#27、#28、#29；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-H03

位置：docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md:118（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/web/features/work-items/view-model.ts:46；apps/web/features/work-items/detail/work-item-execution-workspace.tsx:104；packages/db/src/schema.ts:18。

事实：workflow category与activeAgentState分开；详情按audience.canRespond选择Attention。没有awaiting_review执行枚举。

影响：虚构状态映射使暖色暗示错误权限，误将执行态回写工作流。

具体处置：按当前授权未决Attention判暖色，保留两维/自定义工作流，使用真实枚举；领域mutation与本地复制/草稿分开，多选逐项结果恢复。

owner：R1；#12/#14/#22 执行者；受影响任务：#12、#14、#22；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-H04

位置：docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md:400（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/api/src/agent/commands.ts:826；docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md:1。

事实：PR197已给撤权与用量框架，但派生失效范围和新execution retry计数仍留给实现者。现有命令保留principal等式。

影响：旧revision子会话静默保留权限或新执行不计成本；错误把policy批准当委派。

具体处置：全体旧revision派生会话失效；新Session retry新logicaldispatch/新use，重放不重扣；预留/启动/取消台账与状态事件outbox原子；0062合取及两层上限分配#25。

owner：R1；#25 执行者；受影响任务：#24、#25、#26、#29；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

## medium

### R1-M01

位置：docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md:227（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/worker/src/automation.ts:677；apps/worker/src/automation.ts:718；packages/contracts/src/index.ts:2167。

事实：既有notification delivery已有claim/reclaim/fence；ADR同时称preset表和零迁移文件目录。

影响：实现者可能重复建队列或加入不需要的preset聚合。

具体处置：目录仅文件；复用delivery行作attempt，新增intent/cursor/source关联；C1负责target管理、C2消费，不恢复延期回调。

owner：R1；#15/#17 执行者；受影响任务：#15、#16、#17；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-M02

位置：docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md:35（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：packages/ui/src/tokens.css:94；apps/web/e2e/baselines/d0/README.md:27。

事实：产品已有且默认暗色，D0仅固定亮色取样。

影响：陈旧只亮色前提可能允许迁移删除现有暗色。

具体处置：撤换陈旧正文；#11定义暗色继承映射、#21逐面消费及清理回归；参考暗色值迁移延后。

owner：R1；#11/#21 执行者；受影响任务：#11、#21、#12；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-M03

位置：docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md:98（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：apps/api/src/workbench-runner.ts:88；packages/db/src/schema.ts:321。

事实：没有空闲Runner活性事实，原ADR却称既有域拒绝缺Runner的委派。

影响：unknown可能被解释成授权门禁。

具体处置：删除无依据的现有拒绝断言，不改变服务端授权，GET零写入。

owner：R1；#8/#9 执行者；受影响任务：#8、#9、#26；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-M04

位置：docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md:6（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：docs/reviews/r1/execution-inputs.json:1；docs/evidence/build-input-reachability.md:1。

事实：五条产品链被称六条，卡仍带旧dcf精确相等/最终G1未合门禁；F5/F6互锁仍在源卡。

影响：阻塞授权执行或按过时规格实现；#6原验收可能遗漏。

具体处置：正文替换当前门禁，无环任务/验收阶段图，全部卡完整映射；保留历史源/旧测试逐条处置。

owner：R1；Chief 同步；受影响任务：#3、#5、#20、#21、#22、#23、#24、#25、#26、#27、#28、#29；处置：修改；复核：待最终定向复核。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

### R1-M05

位置：docs/reviews/r1/execution-inputs.json:1（输入base 72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2）；代码证据：docs/adr/0071-lite-single-node-self-hosted-deployment.md:1；deploy/lite/README.md:1。

事实：#20没有获批设备矩阵，#16官方出站协议部署条件未核实，#27容量数字未测。

影响：把建议当批准会擅扩范围或编造验收阈值。

具体处置：形成decisions.md具体建议；#20/#16阶段一交Chief裁定，#27先实测再冻结预算；受影响阶段保持关闭。

owner：Chief；#20/#16/#27 执行者；受影响任务：#20、#16、#27；处置：交总管裁定／测量门禁；复核：待决，不冒称用户批准。复核目标为同号任务完整规格、task-contracts.json、对应ADR与coverage，不接受只有摘要的交接。

## low

本轮没有已证实的该级别新增finding；不表示所有实现已通过。

## 既有决策与领域不变量

- docs/adr/0028-declarative-route-policy-and-event-audience.md：Accepted。
- docs/adr/0028-kaneo-frontend-architecture-and-dependency-policy.md：Accepted。
- docs/adr/0031-authenticated-single-use-bootstrap.md：Accepted。
- docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md：Accepted。
- docs/adr/0043-agent-connection-and-coordination-mcp.md：Accepted。
- docs/adr/0045-webui-redesign-i18n-theme-unification.md：Proposed。
- docs/adr/0046-agent-connection-recovery-and-execution-capacity.md：Accepted。
- docs/adr/0050-human-attention-authorized-projection.md：Accepted。
- docs/adr/0052-human-control-plane-information-architecture.md：Accepted。
- docs/adr/0053-human-attention-governed-responses.md：Accepted。
- docs/adr/0055-governed-agent-session-controls.md：Accepted。
- docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md：Accepted。
- docs/adr/0064-unified-human-control-plane-web-experience.md：Accepted。
- docs/adr/0071-lite-single-node-self-hosted-deployment.md：Proposed。
- docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md：Proposed。
- docs/adr/0073-human-ordered-position-within-a-status-column.md：Proposed。
- docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md：Proposed。
- docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md：Proposed。
- docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md：Proposed。
- docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md：Proposed。
- docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md：Proposed。

两份0028分别治理route-policy/audience与前端架构，不合并编号语义。0028前端禁止凭参考classname引入框架；0052 IA与0064 canonical shell由A2/D4保留；0037 claim不可变由新输入而非改绑修订；0062 Approval与委派合取，不收窄自主授权。0050/0053的当前人Attention不能替代授权命令，0043/0046校验与单次pairing保持。其余已读边界ADR无新增冲突；0071/0072/0073仍为Proposed，不能当已完成能力。

| 不变量 | 规格核对与责任 |
| --- | --- |
| 租约不授权 | F1/F2授权合取，F3准入仍校验适用lease；新Inbox输入不授权 |
| Stop服务端强制 | 五入口事务guard、同根输入抑制、旧revision全部派生失效；外部进程只能发取消请求 |
| 状态+事件+outbox同事务 | F0/F1任命建房，F2预留/启动台账，F3结果，F4 checkpoint引用，F5三完成路径，F6消息提交 |
| View Model非授权来源 | A1unknown不门禁，D2当前人Attention只显示，D4同授权模型，F4摘要不权威 |

## 建议砍清单与未批准事项

砍掉B1独立先发与#6重复build、悬空B4/C4、C2→C3及D5→C1、S1产品门禁、虚构awaiting_review暖色、全批原子拖拽、复制/草稿领域Command、preset表/CRUD、延期渠道决策回调及旧dcf精确相等要求。保留C1→C2、D0→D1a→D1b、所有原合法验收；原条目逐项迁移/撤回原因见legacy-requirements.json。

设备矩阵、渠道官方正文访问缺口和F4测量预算见decisions.md；它们标为受影响阶段关口，不把建议或风险接受写成用户批准。新功能、真实外发、团队权限、新凭证与外部发布均未实施。

## 验证与交接

执行 node docs/reviews/r1/verify-specs.mjs 核验29卡哈希/全文、完整规格索引、原测试/DoD迁移、九类矩阵、依赖/验收无环及历史冻结段。实际检查见execution-checks.md和execution-logs；最终定向独审见execution-review.md，Chief同步后须再读取Todos全文比对，不声称已同步。
