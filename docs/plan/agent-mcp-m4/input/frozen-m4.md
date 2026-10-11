## M4：现有可选领域的 Agent 操作覆盖

**范围**：选择已部署启用的Planning、Template、Automation、Agent Loops、Costs/A2A读取族及现行有限写：`runLoopNow`、`recordUsage`、health/completion提案等。增加typed SDK/MCP与必要Runner适配；Human管理规则/Loop/template/通知、私有view/预算与身份边界不改变；按owner/scope补现有saved view读取/允许创建适配。A2A event stream使用隔离协议adapter，不把其cursor当domain event cursor；若目标客户端只支持tool，给有界查询或明确不支持，不伪装工具能无限流。

**Initiative rollup后端读取修复**：推荐M4包含 `getInitiativeRollup` 的既有Agent读修复，先实现与 `listInitiatives` 一致的live Session、Delegation/Team grant与project/work-item scope授权投影，再补typed SDK/MCP/Runner。当前 `operations/routes.ts:496–569` 仍用Human membership.actor_id=current.id筛项目，不能将合法Agent的零项目聚合当成功。仅扩大到现行允许读取的项目，不给Agent membership或Initiative管理权；保持Human读取、200可见项目上限、COSTS feature及currency/unknown成本语义。未修复前Agent rollup明确暂不支持，发现/交付报告不得标全面可用；不以空聚合掩盖拒绝或缺口。

**文件**：`apps/api/src/operations/routes.ts`、contracts/SDK/MCP/Runner/feature registry、DB stage4与 `packages/a2a-adapter`既有协议；没有TA新机器/日历/CLI计费/出站MCP功能。默认feature关闭仍有明确错误。

**真实客户端链**：授权C/E查询已启用规则/Loop→读取一次run/source/effect/usage事实→允许时runLoopNow→跟踪运行、预算/结果→读项目进展；不能通过自然语言通知或变更rule暗中扩大scope。未启用则客户端明确该链不可用，核心链继续。

**测试落点**：stage4 operations/automation/Loop/usage既有集成、feature/policy/MCP/Runner测试；`packages/conformance/src/optional-domains.conformance.test.ts` 待创建，按启用配置分别运行，禁用负例也要验证。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 遍历分页/滚动引用读rule/run/Loop/usage/Template pin/Initiative；同一非空Initiative中授权项目rollup必须非零且计数/健康/成本与授权事实一致，Human membership读回归；允许run产生准确run/effect及可跟踪结果；缺usage保未知不填0 |
| 越权/撤权 | rollup中同Initiative的其他scope项目排除，跨Team/Project负例有可读正对照；先list再撤Delegation/Team grant，rollup必须拒绝（不能返回零值冒成功）；私有advanced view/Template owner、预算/Loop scope重新授权；Human管理不授Agent，关闭feature拒绝 |
| 非法状态 | 已停用Loop、重叠运行、超预算、错误Template pin/协议版本拒绝；enabled不变成管理权限 |
| 幂等 | runLoopNow/usage同key同body、异体冲突；同occurrence重复effect不执行第二次；读查询无key写义务 |
| 旧revision | 对选定revisioned有限写保原版本规则；纯GET无If-Match不适用；Human-onlyrule版本更新用例归现行领域消费者回归，不新增Agent管理 |
| 事务失败 | 有限写run/admission/usage/effect回滚零新state/event/outbox；只读列表无新领域command事务，不适用写回滚但需零写断言 |
| 重放 | 定时/webhook/job/outbox重复effect fenced/idempotent；新增适配不重演已完成run。没有日历新规则时不把TA14条件写为通过 |
| 并发 | 两run竞争no-overlap、预算预留竞争、分页撤权，H暂停rule/Loop与E请求按现行锁门禁处理 |
| 重启/恢复/Stop | 读取持久run/result并从cursor恢复；停止E不再触发普通effect；外部unknown仅对账。M4无新增shell/机器资源，不适用那些进程清理测试 |

**任务DoD**：被选现有可选域逐operation闭环证据，未选/禁用/权限保留明确，不把整个TA路线图计入范围。
