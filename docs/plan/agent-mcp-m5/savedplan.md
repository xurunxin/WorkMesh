## 上下文与假设

完成 M5 的联合验收设计：证明外部客户端与内置 Runner 能完成既有领域闭环，并正确处理授权、异步结果、冲突和恢复。

已重新读取真实 `main`，当前工作树与 M3 合入源码一致。首轮固定采用 Windows 上的实际 OpenCode 进程及 Pi Runner，以本机受控模型驱动确定性工具调用、fake Git 验证交付。模型夹具、协议夹具和实际客户端运行分别记录。

本轮实际完成并提交 `docs/plan/agent-mcp-m5/` 完整规划工件，停 confirm 供 _oY 方案独审；不把落盘留到产品实现回合。使用 Todos＋仓库记录。UI、M4 可选域、F／TA 新域、真实外发及公共发行不在范围内。

## 规划工件变更

所有新增文件位于 `docs/plan/agent-mcp-m5/`，不修改冻结历史报告。

- **`README.md`、`savedplan.md`、`implementation.md`**：保存内容一致的中文方案、依赖和实施顺序；明确方案独审、Chief confirm、产品实施、成果独审、最新 Required CI、Done／main 各关口。本轮提交后停 confirm。
- **`spec.md`、`frozen-m5.md`、`sources.md`、`input/`**：归档当前完整规格、冻结输入 M5 全文、平台注入的原 saved plan 全文及本轮反馈、路线七份完整 Git 原件与 M0／M1／M2／M3 落地合同和产品／修复／CI 来源。原计划关联 `doc:KlfDrOUAFsJU7CSWbjbOp`，独立文档原件未取得单列，不能以注入副本冒后端全文读回。分别登记 commit、blob、完整内容哈希和工作树字节；截断、缺旧原件、历史首败和旧 skip 保留原含义。
- **`environment.md`、`environment.json`**：记录实读客户端路径、OS、可得版本、能力入口、官方文档来源及读取时间，并核现有配置／登录是否需要新外部授权；已有安装不表示已接入。禁止本轮新安装、登录或凭据授权，保护用户配置，后续使用独立本任务临时配置与受控本机模型／fake Git。关键能力缺口形成具体原问题卡。个人 Lite、小团队、企业逐项列出计划测试范围和真实缺口，不把现有他人服务当作测试环境。
- **`operation-matrix.md`、`consumer-matrix.md`、`security-contract.md`**：逐操作关联 REST／Zod／SDK／policy／feature／MCP／manifest／Runner，注明 C、E、安装身份、Human 前提、revision、幂等身份、分页和结果确认方式。消费 M0 冻结规则及后续受控增量；不依据工具数量判定覆盖。
- **`acceptance-matrix.md`、`resources.md`**：将冻结九类要求逐行映射到测试、断言、证据和适用理由，规定源码前后指纹、命令退出、模型实收、持久事实及资源清理回执格式。

## 联合验收实施设计

复用 `createMcpCoverageFixture` 的真实 API、授权准备和重启机制，`createPlanningCollaborationFixture` 的签名投递、失响应代理及 Pi 子进程，以及 `createDeliveryRecoveryFixture` 的 `FakeGitProvider`、Worker 和上传验证。`McpReferenceDriver`、`runClientConformance` 继续证明协议兼容；实际 OpenCode 由独立进程驱动，不能以 `opencode-style` 夹具替代。

两客户端分别运行无 Git 核心链和有 Git 交付链：

1. 新建授权 Connection，规划、领取、ACK、执行、文档／Room／Inbox 协作、证据及完成。两 Human 使用独立 REST 登录，两个 Team、两个 Agent 覆盖交接与撤权；Human cookie 不进入客户端或 Runner。无 Git 链 N4 经 `apps/api/src/collaboration/routes.ts` 的 `acceptHandoff` 接受后，A 的来源 Delegation 已 completed；N5–N6 固定由 B 的新 Session 接收上下文、发布本人的新 Plan、申请批准、等待、交付证据并完成。A 的旧 Plan 与 Session 事实保留，旧 E 的读取、Plan／批准／完成请求实际拒绝并由 Human 核对，不恢复其授权或称 A 已完成。父读子后父完成另建未发生 Handoff 的 `createChildAgentSession`／required child 场景，验证父 Delegation 始终 active、子完成后父查询和完成；Git review 链仍沿原设计。
2. Git 链验证 context、Lease、branch／commit／PR、精确 `getProviderAction`、当前 head 检查、显式限定仓库读范围的 reviewer、Human 批准和 Worker 发送。reviewer 必须交付本人 `review_result`、`code_review` Artifact 和 structured review，完成后父确认 required child。
3. 覆盖正常、越权、非法状态、幂等、旧 revision、事务失败、重放、并发、重启／Stop。分别重启 MCP／API／Worker／Runner；验证 cursor resync、Lease 丢失、原动作确认、unknown 零盲重发及原 E Token 的 Stop_ACK。ADR0068 原子 settle 回滚和明确拒绝后的可见 warning 必须由数据库及客户端证据证明。

F5 的共同 Plan 固定属于独立冲突夹具中的 Agent B、Session S，采用合法 executor Delegation；不使用 reviewer 或 Handoff 来源 Session。OpenCode 的静态 MCP listener 经 B 的原 installation 取得 S 的准确 E，Token 留在后端；Pi 也用 B 的同一 installation、Session S 经真实 Runner claim／credential／start 取得自身准确 E。两消费者属于同一 Session 的合法调用方，不冒充两 Agent 跨 Session 写。仅一个 Pi Attempt 处于 running，等待其 start 已提交后，两模型分别读取 S 的同一 Session revision 和完整 Plan。用模型／代理屏障使 OpenCode 先提交，再释放 Pi 的旧 If-Match 请求；两客户端交换提交顺序另跑一例。断言真实 revision 冲突、Plan 版本无覆盖、stable step ID 保留，以及失败消费者读最新值后用新 intent 明确合并；伴随活动按原合同单列。新 Attempt 只在原 Attempt durable settle 后创建，旧 fence 的拒例另测。Document 使用两方都有合法写范围的共享资源；Issue 的双合法 C 冲突仅归协议对照，Pi E 角色拒绝另列。两个 Agent 各自 E 写对方 Plan 的真实拒绝单独归 F2，不能记作 F5。

F4 不再把当前普通工具描述成已有 HTTP 重试：`workmesh-tools.ts` 的 `makeTool` 和 `run-session.ts` 的 `RunnerApi.request` 目前各发送一次，原自动重试只在 `replayableSettle`。新增最小、明确授权范围内的普通工具传输重放，只允许 `createDocument`、`publishAgentPlan`、`postWorkRoomMessage`；其余操作、provider intent、签名资料传输和 Runner 控制请求不进入此机制。一次工具调用最多发送两次，总预算三十秒；冻结 method／URL／序列化 body／If-Match／operationKey／准确 E 与 headers。可重试传输错误精确限定为 cause 链中 `UND_ERR_SOCKET`、`ECONNRESET`、`EPIPE`、`UND_ERR_CONNECT_TIMEOUT`、`UND_ERR_HEADERS_TIMEOUT`、`UND_ERR_BODY_TIMEOUT`、`ETIMEDOUT`，以及本请求自有超时 signal 的 `TimeoutError`；单纯 TypeError、DNS／TLS／参数错误、所有已收到的 HTTP 拒绝（含 5xx）、JSON 解码错误、模型取消均不自动重发。总截止从第一次业务发送开始固定，状态查询与第二次发送共用剩余预算及工具／shutdown signal，单次 HTTP 最长十五秒；原 E 状态查询不走 refresh。重试只位于一次 `RunnerApi.request` 内，不重新进入 `makeTool`：started／最终 succeeded 或 failed Activity 各一次，普通 GET 与准入查询不额外写 Activity。第二次发送前以原 E 核原 Attempt status，要求 Attempt／Turn running、Delegation active、Session 可执行，并重核 lifecycle／signal／Token 有效期；不能 refresh、换 key、换 Attempt 或换身份。第二次任何失败仍保留首次传输失败的 cause 和 unreconciled 状态，包括随后收到的明确拒绝，不把它当原请求未提交的证明。

真实 Pi 子进程用例由代理在后端 commit 后仅销毁第一次响应；代理不得重发。实际模型只发出一个 toolCall，Runner 发出的两个业务 HTTP 请求必须同 key／body／If-Match／E，数据库只产生一组业务 state／event／outbox，模型实收第二次原回执。分别验证三项白名单操作、logical 新 intent 新 key、两次失响应、首次明确拒绝及重发准入前 Stop／撤权／Attempt 结束；失败和 unknown 保持未对账、不自动完成。普通工具重放、原外层 settle 重放、协议对照各自计数；重启后新 Attempt 仍先读取 durable 事实，不能以新 toolCall 或代理重发充当本用例。

HTTP 每请求重新建立身份；执行工具使用明确的目标 bridge 或准确 E 入口，不依赖前次请求留下的 Token。公共准备与客户端实际工具调用分列。必需只读投影缺口进入 ADR／合同复核关口，不假设端点存在。

在 `implementation.md` 中冻结后续新增联合验收 driver／fixture／测试／reporter 的文件清单与命令；新 conformance 套件同时接入 integration include、根单元 exclude、CI 必含校验和逐套件删除负例，跨包 fixture 排除生产构建但保留 lint／typecheck。

必需 Runner 修复先形成 `docs/adr/0084-runner-tool-bounded-transport-replay.md`，在方案独审中确认重放与不确定结果保全合同。`apps/agent-runner/src/workmesh-tools.ts` 的 `RunnerToolApi`／`makeTool` 只为三项白名单操作传入内部重放选项与工具 signal；`apps/agent-runner/src/run-session.ts` 的 `RunnerApi.request` 保存一次请求的不可变传输输入并实施有界重放，`runPi` 的 toolApi 包装提供原 Attempt／lifecycle 准入检查，`RunnerApiError` 保留首次传输 cause；不改服务端授权、公开 REST／MCP 参数或原 `replayableSettle`。在 `runner-api.test.ts`、`workmesh-tools.test.ts`、`execution-lifecycle.test.ts` 增补同字节／同 Token 重放、不可重放错误、取消／关闭、第二次明确拒绝仍 unreconciled 的有意义回归；真实 Pi 失响应、合法共同 Plan 及交接拒例接入本批联合 conformance 与实际客户端 acceptance。

本轮直接按既有授权完成并提交规划包同步：将 reviewer 原文、当前完整平台方案及本轮反馈、N4–N6／F2／F4／F5 合同写入本目录 `savedplan.md`、`implementation.md`、`journeys.md`、`security-contract.md`、`consumer-matrix.md`、`acceptance-matrix.md`、`sources.md`、`verification.md` 和对应操作索引；新增 `review-response.md` 逐条关联源码、准备身份、时序、断言与未来证据。保全原候选完整 Git byte、旧审核／首败及回执，分列注入全文、工具截断读回和独立 doc 原件缺口，重做规划静态及提交字节核验。提交准确新 head 与 README 复审入口后停 confirm 供 _oY 复核；三项 blocking 当前仍未正式闭合，不以 edit_plan 接受或本轮自述宣告闭合。独审 blocking／high 闭合且 Chief confirm 前不实现 Runner 修复或运行产品验收。

## 验证与交付关口

本轮只验证规划包：完整 Git 来源、冻结文本、九类覆盖、操作合同、链接、UTF-8、全文空白和实际 CI 分类；执行 `git diff --check`，提交规划工件并报告准确 head。所有产品用例保持未执行。

规划包同步并经独审消除 blocking／high、Chief confirm 后，按规划准备独有环境。先运行 `pnpm.cmd --filter @workmesh/agent-runner test src/runner-api.test.ts src/workmesh-tools.test.ts src/execution-lifecycle.test.ts`，再以本批真实 conformance 和后续新增的 `pnpm.cmd --filter @workmesh/conformance acceptance:joint` 验证四条主链、N4–N6 交接后 B 完成与旧 A 拒绝、独立父子完成、F5 同 Session 合法 E 冲突及合并、F4 单次 Pi toolCall 的两个原请求与取消／撤权／不确定结果保全。保存两个真实请求的脱敏指纹、代理首次 commit 后失响应时点、模型实收、Plan／receipt／event／outbox／Turn／Attempt 事实及准确数量；不以单元模拟或原基础协议套件代实际客户端。再执行：

```text
pnpm.cmd check:route-policy
pnpm.cmd check:workmesh-skill
pnpm.cmd check:runner-skill
pnpm.cmd ci:test
pnpm.cmd ci:validate
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd test:e2e
pnpm.cmd --filter @workmesh/conformance build
pnpm.cmd ci:source build
```

结果保存实际数量、skip、缓存、首败、runtime 和受测字节。Lite 与团队夹具结果限定到实际配置；企业、其他 OS、真实模型／Git provider 未测明确列出，不缩减旧分发门禁。脱敏保全后仅清本人闲置资源；审批拒绝目标保留，不绕过。

最终验收须同时具备独立成果审查、最新 PR Required CI 和实际 Done／main 证据，并交付演示步骤、限制及规格偏差。
