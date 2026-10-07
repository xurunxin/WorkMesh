# R1 独立规格审查、处置与执行交接

实际主线输入 `5743f027ec86e8726d2cfdd38e0e038bdebeae49` 已在原构建分支；初稿基点 `f137787faa0979b59dd70668001b09bb5e132421`。本轮按已审计划修订文档/完整规格，不实现产品功能。G1历史证明 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2` 保持冻结，不代替本轮检查。最终独立复核由Chief安排，本报告不预填通过。

输入：两次执行29卡完整正文/元数据/哈希与非原子读取时间范围；最新主线Git blob/全文；G1受控原外部审查；P1冻结16条；D0历史基线。历史已审计划和#3源补交保持原件。见 [主线来源](r1/execution-main-inputs.json)、[复读差异](r1/pre-review-deltas.json)。

## blocking

未证实新增该级finding；不表示R1全部门禁或新功能通过。

## high

### R1-H01

位置：`docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md:119`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/api/src/auth-idempotency.ts:285；apps/web/app/lib/mcp-onboarding.ts:131。

已读事实：重放直接解密返回；当前 onboarding 要执行全部 Skill 与身份校验，而 ADR 在 verify_connection 前提交配置。pending 精确 body 包含 pairingCode。

影响：可能持久提交错误/撤销凭据；Windows mode不能证明配对码受到保护。

具体处置：统一完整身份/当前凭据验证先于秘密与正式配置，敏感pending并发/ACL验证和失败补偿；撤回无秘密pending与重放重验撤权假定。

owner：R1；#5 执行者；受影响任务：#5、#7、#20；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H02

位置：`docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md:528`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/api/src/inbox/routes.ts:1125；apps/api/src/inbox/routes.ts:1149；apps/api/src/collaboration/routes.ts:1003；apps/api/src/collaboration/routes.ts:1061；packages/db/migrations/0032_agent_inbox_receipts.sql:92。

已读事实：当前 reply/answer/resolve 按根消息唯一resolution完成，但投影更新仅筛 room_message。每recipient/source唯一仅保证每前驱生成幂等，不定义恢复链收敛。

影响：多次恢复可能被当新业务输入绕过去重/Stop，完成后仍留open后继，或发生并发最终回复。

具体处置：冻结直接前驱、持久根及可空根消息引用、每前驱恢复资格/幂等/统一根锁、三完成路径全链原子收敛与Stop/撤权/换届约束；F3/F4/F5接口和F6联合验收明确owner。

owner：R1 冻结；#26/#27/#28 分面；#29 联合验收；受影响任务：#26、#27、#28、#29；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H03

位置：`docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md:118`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/web/features/work-items/view-model.ts:46；apps/web/features/work-items/detail/work-item-execution-workspace.tsx:104；packages/db/src/schema.ts:18。

已读事实：workflow category与activeAgentState分开；详情按audience.canRespond选择Attention。没有awaiting_review执行枚举。

影响：虚构状态映射使暖色暗示错误权限，误将执行态回写工作流。

具体处置：按当前授权未决Attention判暖色，保留两维/自定义工作流，使用真实枚举；领域mutation与本地复制/草稿分开，多选逐项结果恢复。

owner：R1；#12/#14/#22 执行者；受影响任务：#12、#14、#22；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H04

位置：`docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md:400`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/api/src/agent/commands.ts:826；docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md:1。

已读事实：PR197已给撤权与用量框架，但派生失效范围和新execution retry计数仍留给实现者。现有命令保留principal等式。

影响：旧revision子会话静默保留权限或新执行不计成本；错误把policy批准当委派。

具体处置：全体旧revision派生会话失效；新Session retry新logicaldispatch/新use，重放不重扣；预留/启动/取消台账与状态事件outbox原子；0062合取及两层上限分配#25。

owner：R1；#25 执行者；受影响任务：#24、#25、#26、#29；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H05

位置：`docs/reviews/r1/execution-inputs.json:546`（来源提交 `f137787faa0979b59dd70668001b09bb5e132421`）；代码/受控证据：docs/reviews/r1/execution-inputs.json；apps/api/src/agent/commands.ts:826；docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md: Migration。

已读事实：源#27把效果去重绑定授权；同一standing revision可以有多次合法logical dispatch。初稿只修源句仍缺迁移/台账一致性。

影响：可能吞掉后续分派或checkpoint重放重复扣量。

具体处置：#25逻辑分派记录/幂等键与用量，#27结果/checkpoint原子引用；委派id/revision仅授权来源，同步ADR Migration/main/index/全部活动正文。

owner：R1；#25/#27 执行者；受影响任务：#25、#27、#29；处置：修改；复核状态：**生产者已修订，待Chief安排最终独立复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H06

位置：`docs/reviews/r1/test-coverage.json:1551`（来源提交 `f137787faa0979b59dd70668001b09bb5e132421`）；代码/受控证据：AGENTS.md: Tests；packages/ui/src/tokens.css:94；apps/api/integration/stage1-lifecycle.integration.test.ts:1。

已读事实：初稿九类重复整段任务测试并把纯主题/只读面标全适用；文件存在不证明断言覆盖。

影响：虚假覆盖掩盖并发/事务边界，强迫UI新增领域状态。

具体处置：29 feature逐类独立具体断言、实际文件或待建owner，不适用按该面边界解释；原测试/DoD全文与哈希、target id和用例映射保留。

owner：R1；各feature执行者；受影响任务：#5、#8、#9、#11、#12、#13、#14、#15、#16、#17、#20、#21、#22、#23、#24、#25、#26、#27、#28、#29；处置：修改；复核状态：**生产者已修订，待Chief安排最终独立复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-H07

位置：`docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md:596`（来源提交 `f137787faa0979b59dd70668001b09bb5e132421`）；代码/受控证据：apps/api/src/inbox/routes.ts:309；apps/api/src/inbox/routes.ts:1266；packages/db/src/agent-locks.ts:66；packages/db/src/agent-lock-order-manifest.ts:1；apps/api/src/agent/guard.ts:207。

已读事实：初稿根锁排序没有统一现有Session advisory/authority rank；持root再获取Session会形成逆序。

影响：恢复与reply/resolve/Stop/换届并发可能死锁，锁后绑定变化漏重验。

具体处置：冻结locator→排序Session advisory→生命周期/appointment前缀→完整authority rank（Chief委派保留delegation rank）→guard重验→root/前驱/后继；变化整事务回滚重试；三完成路径共用，#28逐语句清单与交叉并发，#29联合验收。

owner：R1；#24/#25/#28执行者；#29联合；受影响任务：#24、#25、#26、#28、#29；处置：修改；复核状态：**生产者已修订，待Chief安排最终独立复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

## medium

### R1-M01

位置：`docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md:227`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/worker/src/automation.ts:677；apps/worker/src/automation.ts:718；packages/contracts/src/index.ts:2167。

已读事实：既有notification delivery已有claim/reclaim/fence；ADR同时称preset表和零迁移文件目录。

影响：实现者可能重复建队列或加入不需要的preset聚合。

具体处置：目录仅文件；复用delivery行作attempt，新增intent/cursor/source关联；C1负责target管理、C2消费，不恢复延期回调。

owner：R1；#15/#17 执行者；受影响任务：#15、#16、#17；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-M02

位置：`docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md:35`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：packages/ui/src/tokens.css:94；apps/web/e2e/baselines/d0/README.md:27。

已读事实：产品已有且默认暗色，D0仅固定亮色取样。

影响：陈旧只亮色前提可能允许迁移删除现有暗色。

具体处置：撤换陈旧正文；#11定义暗色继承映射、#21逐面消费及清理回归；参考暗色值迁移延后。

owner：R1；#11/#21 执行者；受影响任务：#11、#21、#12；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-M03

位置：`docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md:98`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：apps/api/src/workbench-runner.ts:88；packages/db/src/schema.ts:321。

已读事实：没有空闲Runner活性事实，原ADR却称既有域拒绝缺Runner的委派。

影响：unknown可能被解释成授权门禁。

具体处置：删除无依据的现有拒绝断言，不改变服务端授权，GET零写入。

owner：R1；#8/#9 执行者；受影响任务：#8、#9、#26；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-M04

位置：`docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md:6`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：docs/reviews/r1/execution-inputs.json:1；docs/evidence/build-input-reachability.md:1。

已读事实：五条产品链被称六条，卡仍带旧dcf精确相等/最终G1未合门禁；F5/F6互锁仍在源卡。

影响：阻塞授权执行或按过时规格实现；#6原验收可能遗漏。

具体处置：正文替换当前门禁，无环任务/验收阶段图，全部卡完整映射；保留历史源/旧测试逐条处置。

owner：R1；Chief 同步；受影响任务：#3、#5、#20、#21、#22、#23、#24、#25、#26、#27、#28、#29；处置：修改；复核状态：**待最终定向复核**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-M05

位置：`docs/reviews/r1/execution-inputs.json:1`（来源提交 `72dbd5e862a81edc36b1f0ea59df69e6aa4b01b2`）；代码/受控证据：docs/adr/0071-lite-single-node-self-hosted-deployment.md:1；deploy/lite/README.md:1。

已读事实：#20没有获批设备矩阵，#16官方出站协议部署条件未核实，#27容量数字未测。

影响：把建议当批准会擅扩范围或编造验收阈值。

具体处置：形成decisions.md具体建议；#20/#16阶段一交Chief裁定，#27先实测再冻结预算；受影响阶段保持关闭。

owner：Chief；#20/#16/#27 执行者；受影响任务：#20、#16、#27；处置：交总管裁定／测量门禁；复核状态：**待决，不冒称用户批准**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

### R1-M06

位置：`docs/reviews/r1/execution-inputs.json:126`（来源提交 `f137787faa0979b59dd70668001b09bb5e132421`）；代码/受控证据：docs/reviews/r1/legacy-requirements.json；docs/references/todos-analysis/reviews/todos-review.md:11。

已读事实：#6当前卡为关闭记录，没有合并前全文历史接口；受控B2主计划与外部审查已追回。

影响：无法独立排除原卡另有未纳入受控材料的测试/DoD。

具体处置：已知原条目逐项分配#5/#20；缺口和追回方法落source-gaps.md，Chief在R1完成/同步前提供历史全文或核验来源范围，不能宣称全部额外条目已追回。

owner：Chief 来源交接；R1 映射复核；受影响任务：#3、#5、#20；处置：已形成具体追溯交付；历史来源缺口待核验；复核状态：**未闭合；不冒称全文齐全**。修订证据按对应任务全文、ADR/main及 [逐类别矩阵](r1/test-coverage.md) 核验，不接受只有摘要的交接。

## low

未证实新增该级finding；不表示R1全部门禁或新功能通过。

## 既有决策状态及冲突裁决

| 文件 | 实际状态 |
| --- | --- |
| docs/adr/0028-declarative-route-policy-and-event-audience.md | Accepted |
| docs/adr/0028-kaneo-frontend-architecture-and-dependency-policy.md | Accepted |
| docs/adr/0031-authenticated-single-use-bootstrap.md | Accepted |
| docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md | Accepted |
| docs/adr/0043-agent-connection-and-coordination-mcp.md | Accepted |
| docs/adr/0045-webui-redesign-i18n-theme-unification.md | Proposed |
| docs/adr/0046-agent-connection-recovery-and-execution-capacity.md | Accepted |
| docs/adr/0050-human-attention-authorized-projection.md | Accepted |
| docs/adr/0052-human-control-plane-information-architecture.md | Accepted |
| docs/adr/0053-human-attention-governed-responses.md | Accepted |
| docs/adr/0055-governed-agent-session-controls.md | Accepted |
| docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md | Accepted |
| docs/adr/0064-unified-human-control-plane-web-experience.md | Accepted |
| docs/adr/0071-lite-single-node-self-hosted-deployment.md | Proposed |
| docs/adr/0072-redis-free-and-object-store-free-runtime-profiles.md | Proposed |
| docs/adr/0073-human-ordered-position-within-a-status-column.md | Proposed |
| docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md | Proposed |
| docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md | Proposed |
| docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md | Proposed |
| docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md | Proposed |
| docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md | Proposed |

状态逐文件读取，哈希见 [台账](r1/adr-states.json)；两个0028分别是路由/事件受众及前端模块/依赖政策。0074–0078仍为Proposed，不能因本批已选择采用就把所有编号写Accepted。

| 既有决策 | 发现的冲突与具体处置 |
| --- | --- |
| 0028 路由/事件受众 | F0/F6新传输必须声明route policy和当前授权事件过滤；现有reader不等于新checkpoint组合。分配#23/#29，摘要/View Model不授权。 |
| 0028 前端模块/依赖 | 0077只改共享token/既有模块消费，保持M1–M5和依赖边界；两个编号完整文件名引用，未发现需要重决模块架构。 |
| 0052 IA | ready/unknown为只读提示，A2链接canonical页面；D4不另建授权/激活入口。无任命/关闭态不可暗示Chief可用；#9/#13组合验收。 |
| 0064 视觉与shell | 原0077否认改变视觉authority不成立。本批已批准参考实测亮色值/卡片结构/布局，明确有限修订视觉基线；canonical URL、单一authenticated shell、焦点/页面责任及read model边界保留。 |
| 0043/0046 连接器 | 纠正验证之前提交秘密/配置、无敏感pending、重放必重验撤权假定；#5完整协议/当前credential校验先提交，Windows ACL与补偿实测。 |
| 0037 claim/短会话 | 已批准successor/re-delivery有限修订，原claim/归因/回执不转移，原Consequences原文保留；三完成路径/根Stop/锁序冻入#26/#28，ACK不等resolve。 |
| 0062 自主控制 | 不恢复被否决的逐次批准；standing delegation与有效action Approval合取，保留principal等式与确切plan/head两关口。两层上限、传播和计量分配#25。 |

## 领域不变量与四类交界

| 不变量/交界 | 规格与验收责任 |
| --- | --- |
| 租约不授权 | #25各入口有效身份/委派/capability/scope/Approval/lease合取；#26准入与#28新输入不授予权限。 |
| Stop服务端强制 | #25旧revision派生执行失效；#26/#28按根持久抑制，换届/新successor不清除；外部进程只发取消请求并记录真实结果。 |
| 状态+事件+outbox同事务 | #23entry迁移/#24任命建房；#25分派预留/启动台账；#26激活结果；#27checkpoint结果引用；#28全链完成；#29消息提交。失败/崩溃用例各自分配。 |
| View Model非授权来源 | #8 Runner unknown不激活；#12暖色来自当前人canRespond Attention；#13布局不新授权；#27摘要当前授权重读。 |
| workflow/session分维 | 不捏造awaiting_review执行状态，保留自定义workflow；#12/#14/#22 local复制/草稿零mutation，领域移动逐项提交。 |
| A/D与F | 配置ready非激活条件，Chief关闭态明确；F不整体串行阻塞旧B/A/C/D。 |
| C与F | 渠道ack是attempt结果，Inbox ACK是收件事实，两者都非resolve/人决定；不恢复回调身份桥。 |
| F0/F1 | F0两枚举新entry与全链可消费接口，F1任命建房；原migration/checksum不改，Workspace/Team及exact-recipient可见边界独立验收。 |

## 原审查与测试/DoD去向

原外部报告 `docs/references/todos-analysis/reviews/todos-review.md` 全文逐项复核，当前处置如下；这是生产者修订结果，不沿用原报告的批准含义。

| 原finding | 本轮处置及任务 |
| --- | --- |
| F01 | R1-H01，B1/B2→#5同一纵向；B4/无源码安装→#20。 |
| F02 | #14主动作/菜单、#22逐项多选/拖拽/草稿；撤回全批原子移动与本地普通Command混淆。 |
| F03 | 完整29任务id索引、无环实现/最终验收图；砍悬空/无关边，保留C1→C2。 |
| F04 | #1原授权行政证据不重开；S1可选流程不挡产品，不申请权限或假称工具可用。 |
| F05 | #15 target配置/秘密引用，#16 adapter/delivery消费；复用claim/reclaim/fence，延期callback继续排除。 |
| F06 | #12真实workflow/session/Attention授权投影，#14/#22沿用服务端mutation。 |
| F07 | 0077显式有限修订0064视觉authority；withPlan、方案/变更关口与R1直接门禁全部对齐。 |
| F08 | G1受控原件已main；历史/两次执行快照、完整规格文件/index及差异供独审，未声称平台doc工具读回或Todos已同步。 |
| F09 | P1冻结编号16条与第7/8限流事实保留；#7 operationId隔离，IP/socket共享。 |
| F10 | #8 not_applicable为适用性，Runner unknown不阻止配置缺口消失；#9文案/返回/焦点与#13组合验收。 |
| F11 | 按feature逐九类具体断言/现有或待建文件/owner；行政与纯UI真实不适用，历史原测试逐项保留。 |
| F12 | #11/#21 token/主题、#12颜色语义/卡片结构、#13布局回归；容量/设备数值不得发明，阶段关口见decisions。 |
| F13 | 两0028完整引用；权限开关历史行政来源保留，未新增权限请求。 |

第二轮报告 `docs/adr/0078-review-round2.md`：H1四类撤权/来源持久化、H2 0062合取/两关口迁移与失效、H3上下游两表/实时授权交集、M1逻辑分派台账同事务/重放一次、M2不建立逐次分派授权绑定，均归#25并由#26/#29消费/联合验收；L1设计冻结与F0→F1/F2→F3实现边分开。F5选择已由用户裁定，不再次询问。

[完整任务索引](../plan/activation-task-specs/index.json)保存真实todoId、requires/blocks及acceptanceRequires、阶段owner/输入/输出/验收；[旧条目原文台账](r1/legacy-requirements.json)保存原测试/DoD和撤回理由；[九类矩阵](r1/test-coverage.md)及JSON给出154条卡测试、DoD来源哈希/去向。#6卡历史全文缺口见 [来源边界](r1/source-gaps.md)，不把已知B2要求齐全冒称未知全文追回。

## 建议砍清单和未批准事项

已按授权撤回B1独立先发/#6重复build、悬空B4/C4、C2→C3与D5→C1、S1产品门禁、虚构awaiting_review、全批原子移动、复制/草稿领域Command、preset表/CRUD、延期渠道回调和旧dcf正文必须相等限制。保留C1→C2、D0→D1a→D1b及全部已知合法原验收。

设备发布矩阵、企业微信官方正文/部署条件、F4未测容量预算的仓库决定/实现边界/缺口与具体建议见 [可审方案](r1/decisions.md)。各任务先完成资料/测量阶段，由Chief裁定真实分歧；不把建议或接受风险写成用户批准。本轮无迁移、API/event、团队权限、真实外发或产品功能改动。

## 验证与最终交接

初稿三个 high 的具体修订/证据与后续验收责任见 [生产者回复](r1/producer-review-response.md)及 `findings.json` 的 `producerEvidence`；现无已知未处置的 blocking/high 修订项，独立闭合仍待 Chief 的最终成果审查。#6 来源缺口、待裁决阶段和 UI 超时未知根因继续保留。

运行 `node docs/reviews/r1/verify-specs.mjs` 与历史交接校验器：29/29全文哈希、261行矩阵、139项适用独立断言、154条原checkbox、完整id/stages/DoD/旧条目、实现与最终验收无环、P1/D0冻结段和原0037 claim段保留。它只证明静态一致性，不是最终独审或待实现组合成功。

实际命令、环境、失败/修正依据、运行范围和最新结果见 [执行检查](r1/execution-checks.md)；精确内容字节清单见 [交付清单](r1/execution-manifest.json)，最终提交由平台回合结束生成，不虚报尚不存在的head。Chief以该head及 [成果复核清单](r1/execution-review.md)安排主力开发独审，blocking/high与来源缺口/失败处置逐项闭合、最新PR/head Required CI成功后再按委托合入并同步逐卡读回。当前不合入、不同步Todos、不放行产品。
