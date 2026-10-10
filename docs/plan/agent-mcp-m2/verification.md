# 九类验收与真实运行方案

## 断言与落点

acceptance-matrix.json 保留冻结 M2 两张表的每一原行及对应正拒断言、适用理由与测试落点；下述执行均是未来产品阶段，当前未运行。成功数量／skip／首败不预填。本轮实际静态检查另见 static-checks.json。

扩展 apps/api/integration/stage2-collaboration.integration.test.ts、现有 documents 与 Inbox／Handoff 集成、agent-lock-order.integration.test.ts；SDK/MCP/Runner 单元只核 transport、角色、分页、错误模型实收。新增 packages/conformance/src/planning-collaboration.fixture.ts／planning-collaboration.conformance.test.ts，复用 createMcpCoverageFixture、pairTarget、createExecution、connect、runPi 与 createExecutionRecoveryFixture，测试以真实 REST、真实 MCP HTTP 和实际 Pi 子进程证据裁定。该套件与原两套同时接入 packages/conformance/vitest.integration.config.ts、根 vitest.config.ts exclude、scripts/ci-policy.mjs/.test.mjs 逐套删除负例及 Required CI。更新锁 manifest 时只以既有生成机制重定位，随后取消更新变量原检查复验。

planning-collaboration.fixture 的新增夹具只提供当前 Human 原始启动／授权动作、准确父子队列与受控 adapter 投递；不实现自主 child Pi admission。HTTP 启动和响应丢失模拟保留原 HTTP status/body/headers（秘密脱敏）、MCP tool success/error、模型真正收到的 tool 结果及 durable Turn/Attempt/artifact/event/outbox。C 完成普通规划对象；Document 操作切至授权精确 E，因为现行 C 无 owner scope，不能把冻结示例字面顺序当扩权限。Handoff 接受／cancel／complete、评论写、Guidance 发布、Decision finalize 由真实 Human API 正对照，Agent 调用必须拒绝。

## 父子与安全专门断言

父 P 发布整 Plan，stable step S 跨新 version 仍同 ID。父与step使用DB默认max_child_sessions=8，不声称现有DTO可设置；默认测试造满八份然后第九次create/review拒，父累计总量测试可先完成前八子仍拒第九个，不混成活跃limit释放。step单独低限额及并发boundary用测试专用特权DB夹具：记录准确parent/version/stable step、原DB值及UPDATE值（如父8／step1或父1／step8），不通过Agent API设置；新Plan版本DB默认8，跨版本step边界由夹具分别设置和标记。目标Agent并发正例通过Human夹具准备足够target能力/交付资格，不让更早的target并发拒绝冒父/step边界。不新增客户端上限参数、不更改默认或迁移。

有限预算主链独立于{}回归：父maxInputTokens=100（其余未设维度省略），普通child明确budget:{maxInputTokens:60}，完成后仍有reservation60；reviewer明确budget:{maxInputTokens:40}，返回/数据库budget和inherited_budget、allocation和reserved全部40，受控交付→own E exchange/ACK→真实Pi读自身Session/context实收budget40→本人双证据→M1 completion intent结算→父查询completed→父完成。受控假模型报告本次真实usage，未知usage不填0，也不把利用率投影冒hard cap机制；不新增计费/预算释放域。记录全部实体IDs和模型实收工具结果。创建无If-Match，旧Plan输入STALE_PLAN_VERSION，双方完成用真实最新revision；此整链必须真实HTTP/MCP/Pi，不能仅{}成功代有限链。

预算负例在保留reservation60的独立父夹具：review省略budget（有效100）/{}同拒、显式41拒、超过父cap101拒；负数/Infinity/NaN Zod输入拒（HTTP JSON不能表达Infinity/NaN时测试schema边界，不能伪称发送合法JSON），多维只减一维却遗漏另一满额维度仍继承而超额拒；当所有受限维度都合法缩减则正例。两请求40竞争只一份；ordinary与review混合竞争共同Σ≤100，回滚后旧60不变，重放不增第二40，不自动改请求预算。既有reserved永不因child完成自动释放，无Human调整父预算恢复API。

创建响应消费：REST ordinary对象／review.session含parent_session_id、plan_step_version_id、required_for_parent、inherited_budget、max_child_sessions及原budget维度/其他字段。SDK默认typed结果、显式旧泛型调用、MCP structuredContent.data及Pi模型真正收到的创建结果逐字段比对，wrapper/lease额外字段不丢；UUID/required/budget/count与DB相等，原日期和sequence沿现有DTO正规化不把正规化冒字段丢失。budget/inherited_budget用record，不能经budgetSchema把未知原数字维度剥掉；缺任何必需创建字段应schema拒而非成功null。通用getSession仍沿原schema与权限，不扩parent读子。

13 个 state 中 completed 是正例，其余 queued、acknowledged、planning、executing、awaiting_input、awaiting_approval、blocked、paused、stopping、stale、failed、canceled 逐项作为 required child 返回 COMPLETION_PLAN_INCOMPLETE，集合准确等于 blockerSessionIds；completed required 不入集合、非required 每状态均不因该 gate 阻断。夹具构造非法到达状态需标记为 gate 单元／事务检查，真实客户端生命周期仍走合法 transition，不宣称所有状态都由任意 Agent 可设置。

reviewer 证据矩阵：无两者／仅本人 Room／仅本人 code_review／两者俱全；前三 REVIEW_COMPLETION_EVIDENCE_REQUIRED，最后成功。父代发、他 actor/session、普通 Activity、structured review、noArtifactReason 分别不计入；reviewer publish_plan 和非 code_review Artifact 实际 REST拒绝，Runner工具不可见并测试缓存调用拒绝，无任何自动 Plan发布。不能自审 PR producer 的具体PR场景归 M3；M2只回归已有 review 身份限制，不伪构建 PR 验收。

新投影按严格 DTO allowlist 比对：跨父／Team／principal、错 step/version绑定、篡改cursor／换filter／换exact Session、旧历史无证明绑定全拒或列表排除；超过页限返回nextCursor，逐页完整稳定无重复且后页撤 authority 无泄漏。父 live 时子 terminal／子grant撤销仍只读最小事实，父 queued/paused/stopping/stale/terminal 或撤 Token/grant/definition/principal/team membership 则拒。父 terminal E GET拒与合法 M1 C／安装原动作结果确认成功作为对照；旧 null来源失败关闭，另一 Connection不获结果。

GET 正例前后 fingerprints：agent_sessions、delegations、session_budget_reservations、leases、agent_activities、plans/steps、prompts、Turn/Attempt、artifacts、room_messages、inbox/receipt、events、outbox、idempotency事实全相等；安全拒绝审计 authorization_denials 单列，成功也不新增。响应所有嵌套 key 只在合同 allowlist，不出现 token/prompt、URI或其他child资源。普通 get/list仍不可父读子。

事务故障在创建Session、delegation、reservation、Lease、provision/outbox、review结果、父完成提交前各点注入，确认无新实体和交付；外部fake webhook仅在 commit后发生。并发用双连接 barrier＋pg_blocking_pids 实证锁等待，不凭sleep：ordinary/ordinary、review/review、mixed 创建对父累计总量／活跃限额、step活跃限额、目标maxConcurrency、预算Σ约束；终态旧子占满父总量时新create/review必须拒，不能因活跃数零绕DBguard。跨Plan版本仍计stable step；旧活跃无reservation review按预算占用直到终态，existing reservation不双算；失败、重放均不扣第二份。Plan发布竞创建、父complete竞childcomplete、exclusive竞review_shared按锁后事实与提交次序拒/成，不死锁，不提前派发。

重放同key/body仅一child/delegation/reservation/lease/event/outbox；异体 IDEMPOTENCY_CONFLICT。SDK缺省每次新调用新key，同次网络重试保持key/body，显式key不改；MCP/Pi能看见不同合法同step意图。重复 outbox delivery 不重建child或token authority，重启后事实仍在。Stop/pause/撤权优先继承 M1；已queued失权Turn正式settle，公平固定上界扫描、唯一合法续Turn、旧trigger失效保持原回归，父Stop不伪造子自动级联。

## 实际命令与兼容回归

产品阶段先登记隔离资源，安装锁定依赖并以本机实际 pnpm.cmd 入口依次执行：

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd test:e2e
pnpm.cmd build
pnpm.cmd check:route-policy
pnpm.cmd check:workmesh-skill
pnpm.cmd check:runner-skill
pnpm.cmd ci:test
pnpm.cmd ci:validate
pnpm.cmd smoke:agents
```

以 package.json 原 scripts 为准：integration 顺序含 db-reset/API/conformance/Worker/recovery；不得并发跑破坏性 reset，也不复用他人服务库。先可运行新增套件定向定位，以上完整 Required本机检查不得用定向替代；Required CI必须对最终PR组合新head成功，M1旧CI不能代替。M0/M1完整回归保留 skip/历史首败，#5三OS/分发原门禁不删且本批无发行变化不增为启动依赖，#9/#16 UI裁定不重开。

无需迁移仍跑现有 clean DB 与上一stage升级 tests，SCHEMA及应用迁移不变；已有fixture插入和旧表兼容不能靠改已应用DDL通过。Document baseRevisionId/hash/revision、relations/Handoff/Inbox每操作实际revision规则照operation-decisions；GET无旧revision请求不适用但资源版本结果必须准确。read无mutation幂等/事件回放不适用，要求零写；导入适用逐实体回放和局部失败，不适用整项目事务原子；无新机器shell使新shell清理测试不适用，但实际Pi进程收尾仍验证。

## 运行字节、首败与资源

运行前 source-manifest 分列 exact Git commit/blob 与本机工作树bytes/SHA256，staged runtime fixtures单独保全；Node实际process.version/execPath、pnpm.cmd解析及版本、OS、package manager lock、环境变量名（无秘密值）、工具原命令参数记录。每命令保开始/结束/runtime、native exit、stdout/stderr原字节archive、测试总数/pass/fail/skip及skip原因；缺报告不推算pass。首败原件不可覆盖，修复后生成新指纹和回执，说明受测源码与最终候选字节差异，旧head结果不贴到新组合。

创建独有postgres/redis/rustfs bucket、容器/network/volume（仅夹具需要）、fake HTTPS/model、Pi/API/Worker及临时路径前，登记随机本轮ID、绝对路径、PID/start time/port、镜像ID、resource owner与引用。随机32字节master key和fixture凭据仅子进程env，RustFS私有bucket准备和HeadBucket必须成功，原失败保全；不使用真实外发、发布或团队凭据。临时运行配置先安排精确Git忽略和证据归档，避免敏感或拒清理目录被自动提交。

finally停止本人空闲PID／容器前核实PID start/ownership；先脱敏保全必要原日志。仅删本人闲置资源，不global prune／共享store／他人服务。Windows任何递归先核最终workspace绝对目标、link／引用和逐path保全依据；拒绝目标立即停且不Force/改ACL/换工具/拆分/移动/父删。G1D0C3及当前恢复目录保留；已合worktree清理须actual main、保全齐、无活动引用，否则保留。本轮静态阶段仅工作树内文档与Python/Node短命进程，无容器/卷/network/持久服务。

## 规划关口与产品验收分开

本轮允许 python 静态来源生成／验证、git diff --check、node实际CI分类，不启动任何产品测试或改产品文件。规划包提交准确head停confirm，Chief另一Agent独审通过再confirm；当前不自confirm。产品完成后另做独立成果审查、最新PR Required CI与actual Done/main准确refs；README不得把规划静态pass写成M2实现或验收完成。
