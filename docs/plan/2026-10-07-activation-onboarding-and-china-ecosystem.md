<!-- WM-ACTIVATE-20261007:ROADMAP -->
# 工作台就绪面、可证明的接入恢复、一个通知渠道与国内模型预置

状态：Proposed；D0 视觉基线门禁已完成；G1 在真实初始 base `419a1d7`、历史 main 整合点 `4b287b4` 及当前 PR base `36c7709` 的 44 项输入读取均已通过，最终门禁待本分支 required CI 全通过、证据提交合入及 Chief 宣告；通用 mocked-dev 失败仍待独立处置，D1 门禁待 G1/P1/R1 验收。P1 十六行事实台账已冻结，参考材料位于 `docs/references/todos-analysis/`。现行 main 同时包含 F 链 总管 / agent graph（ADR 0078），F0 阻塞于 F2 的授权收窄待确认。共六条链（A/B/C/D/F），其余门禁独立验收。本稿经 gpt-6-astra / high 多轮对抗式审查，
第一版的结论与被撤回的主张记录在
`docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.review.md`。

**source of truth**：`docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md`、
`docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md`、
`docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md`、
`docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md`、
`docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md`（F 链 总管 / agent graph）。

对照物：todos.dev 的任务输入原件保存在 `docs/references/todos-analysis/`，包括 `ui-inventory.md`、`design-tokens.md`、
`kanban-cards.md`、引用的测量 JSON、截图索引和 28 张原始截图；来源与哈希见该目录的 `SOURCE-MANIFEST.json`。

> 注：ADR 0074/0075/0076 的文件名已按审查结论改过（去掉与实际内容不符的
> "activation gate"、"recoverable"、"identity" 等承诺性词）。旧文件名不再使用。

## 本批执行记录例外

> 跟进目前看板中的工作事项，逐步推进，完成这批workmesh的迭代任务

用户已选择「本批使用 Todos＋仓库」「采用并独立复核」「按条件持续推进」。
经用户于 2026-10-07 18:38（Asia/Shanghai）明确批准，本批仅以 Todos 编排、以仓库保存
规格和执行证据，替代本仓库 `AGENTS.md` 对 WorkMesh Project/WorkItem 双轨记录的要求。
此决定覆盖此前「Todos 编排 + WorkMesh 追踪」的答复；不声称已创建或同步 WorkMesh 记录，
也不改变 WorkMesh 产品自身的领域控制面。其他领域、安全、测试、审批和交付约束继续有效。
总管已按 G1 交接映射同步 #5–#17 与 #20–#22 的完整 spec（包括已关闭的 #6）；本地证据记录
逐项核验结果。本例外只适用于本批 Todo #18 及其映射的批次任务。
本批不等待真实 WorkMesh MCP 接入；后续任务仍按各自批准的控制面要求执行。

用户已委托总管在门禁和必需检查通过、blocking/high 问题解决后继续派工、独立审查、确认计划并合并仓库改动。
真实新设计分歧、新需求、团队权限变更、凭证授权及仓库以外发布仍需用户单独批准。

## G1 输入可达性门禁

历史 base `32789cec4d50db0b85a63d91049cc425d9e917a2` 含四份 ADR、主计划和旧 `.review.md`，但不含原件输入包及 P1 台账。
G1 原件和验证脚本已随本次取得的 `main` 提交 `419a1d7af90c09cb9364819977f32ec59cf86f87` 纳入本分支，
来源及字节哈希见 `SOURCE-MANIFEST.json`；材料入库不等于 G1 独立 build 门禁通过。
P1 的 16 条事实台账由 `c98ec5f538b3acd9ac052c4ef100e1d111232518`
引入，已随 `735578d8d0733e04cae5640cedfaf0c6181391c7` 合入 PR #192 merge commit
`660c74a6247544ffac64e7ef8f968d1025b2a668`。#2 已 done，第二轮独立审查批准合并；PR CI check 344 / run
`37614969993` 的 8 个 job 全部成功。P1 台账现已冻结为后续输入；#3 是冻结后的独立规格裁决，不是 P1 合并前置。

P1 冻结与 G1 材料合入不代表 G1 最终门禁通过。真实隔离 build 已在材料合并后的实际 base
`419a1d7af90c09cb9364819977f32ec59cf86f87` 中逐份读取输入正文：44/44 文件、16/16 P1 台账，
验证器退出码 0；Git blob、提交字节 SHA-256 和工作树字节 SHA-256 见
`docs/evidence/build-input-reachability.final.json`。该结果是初始 base 的有效读取证明，不能改写成后续 main。

D0 经 PR #195 合入 main 后，Chief 于 2026-10-07 21:09 核实 main 快照为
`4b287b4e9892bfb4545dbbff94d04f45633c3a64`（包含 D0 提交
`768bbd82fcc52a873168b39a8382d2f14c928abc` 与 G1 材料 main `419a1d7…`）。本轮实际整合的最新
`origin/main` 为 `36c7709a8bd49c640b8dbfa04a09cfb777f943c8`；在该提交的精确 detached worktree
重跑输入验证，44/44 文件、P1 16/16、0 errors。计划状态行的合并冲突已解决，保留 D0 计划/清单增量、
P1 冻结、D1a/D1b 拆分和 main 新增的 ADR 0078/F 链；最终合并计划和根清单的哈希见最终证据。
D0 独审及 CI #352（run `37623264959`，8/8）通过，历史 main push CI #353（run `37626312217`，8/8）通过。
此整合不会改写 `419a1d7` 初始 build 证明。

本轮必需本地检查已完成（命令、退出码和结果见 `docs/evidence/build-input-reachability.final.md`）；
本分支 merge 提交后的 PR/CI 与用户指定的独立复核仍待完成。完成前依赖输入的任务保持“待验证”，
不放行 #3 或相关实现。D0 视觉基线门禁完成不解除 G1 最终/R1 门禁。

交接原件及其引用的测量 JSON、截图索引和 28 张截图保存在 `docs/references/todos-analysis/`；#19 完整审查原件位于
`docs/references/todos-analysis/reviews/todos-review.md`。来源相对路径、字节数和 SHA-256 见 `SOURCE-MANIFEST.json`。
通用分析 README 和其他采集工具不属于本批依赖输入闭包。

本次局部同步 [D0](todo:MPhtZiff23B33m9i2equq) 的基线证据与已批准的 D1 拆分引用；全批规格修订和 blocking/high 处置由 [R1](todo:q_1zKPuGsG-2ZRUwOwQx4) 独立复核。[G1](todo:Tws50k02Pi52R-RJEXP_N)、P1、R1 与 D0 各自验收，D0 完成不表示其他链已就绪。D0 视觉基线门禁已完成；D0 的通用 mocked-dev 失败仍按其独立计划记录和处置，不作为本轮 G1 输入读取结论。本轮不重跑 fresh build；后续如整合后受控输入正文发生变化，须单独记录该整合版本实际读取结果，不得复用 `419a1d7` 的旧哈希。

## 审查撤回的四个前提（写在这里以免再犯）

1. **「安装令牌只存在于响应里」是错的。** 服务端已用 AES-256-GCM 把整个兑换响应
   加密写入 `auth_idempotency_records.replay_ciphertext`
   （`apps/api/src/auth-idempotency.ts:128-144,218,319-339`），并有 worker 到期
   擦除（`apps/worker/src/session-lifecycle.ts:672-690`）。**真正**的缺口是
   **客户端没有可重放的稳定请求身份**。因此 v1 不新增 pairing 密文列、不改服务端
   凭据生命周期。
2. **「两个兑换端点共用同一限流预算」是错的。** 两者虽同为
   `{endpointClass: pairing, subject: pairing}`，但桶按 `operationId` 分
   （`apps/api/src/auth-rate-limit/limiter.ts:129-145,154-159`），而两个
   operationId 不同；共用的是 socket / client-IP 桶。失败退避键也包含
   operationId（`apps/api/src/auth-rate-limit/limiter.ts:122-125`），因此同样隔离。数据库
   `attempts` 只在**已知的**身份不匹配（slug 或已知 clientType 对不上信封）时
   递增，随机错误 code 不会消耗合法 pairing 的预算
   （`apps/api/src/agent-connections.ts:521-525,561-562`）。**不做**
   `endpointClass` 拆分。
3. **「保存模型连接前服务端会真实请求验证密钥」是错的。** create/update 只做
   格式与策略校验并发**不出站请求**，ADR 0065 明写此点。预置目录因此不声称任何
   兼容性，真实 probe 单列为独立任务。
4. **「国内生态零覆盖」需要收窄。** 准确说法是：**没有**企业微信/钉钉/飞书/
   小程序适配器。平台并非没有通知面——ADR 0062 已有人工 Web Push，schema 自
   `0016_stage4_usage_notifications.sql:6,85-103` 起就有 notification
   channel/delivery 表。缺的是**渠道（channel）**面。

另有两处我原判断错误、经核实后自我纠正：配对码并非短码，而是 32 随机字节的
43 字符载荷（`packages/db/src/index.ts:41`）；十分钟只约束**首次**兑换
（`agent-connections.ts:358-365,523`），与 15 分钟重放、轮换 overlap 是三个独立
计时器。

### 第二轮撤回：ADR 0078 的组合性质错误（F 链专属）

`docs/adr/0078-review.md` 查出**2 blocking + 6 high + 3 medium**，其中最要紧的一条
不是事实错误，而是推理错误：

> **把「构件存在」直接升级成「组合性质已经成立」。** 表和事件确实存在，但缺的
> 连接恰好负责权限、原子性和崩溃恢复；这些不是接线细节。

具体被推翻的推断（这是我本会话第三次犯同一类错的更隐蔽版本——前两次是编造
事实，这次是从零件的存在推出了组合的性质）：

| ADR 0078 初稿的推断 | 实际 |
|---|---|
| 「短会话 + snapshot/delta/cursor = 跨会话只取新增」 | 三个构件分属不同域（ADR 0033），**没有一个是消费 checkpoint**；且新会话无历史模型上下文，只给增量等于假设它知道未变的名单 |
| 「enum 加一个值就有 Team 房间了」 | `0001_v1_baseline.sql:599-614` 的 CHECK 只有三个分支，`enforce_room_subject()` 会把 team 走进 session 分支并抛 `WORK_ROOM_SUBJECT_NOT_FOUND` |
| 「房间沿用现成的创建与归档命令」 | `work_room_channels` **没有归档字段**，也没有通用归档命令 |
| 「prompt 作者即激活来源」 | `authorActorId` 只记作者，无激活来源/任命版本/授权绑定；且现有 `prompt()` **只接受 Human**（`agent/commands.ts:2843-2853`） |
| 「Inbox 只有两态所以不能用」 | `inbox_item_receipts` 已有 claimed/read/acknowledged/replied；ACK 不等于 resolve |
| 「capabilitySchema 16 项」 | **17 项**，初稿的分组只覆盖 15 项，漏了 `repo:read` 与 `artifact:write` |

**留给后续 ADR 的规矩**：凡是写成「A 加 B 已经给出 C」的句子，必须指出**负责
原子性/权限/崩溃恢复的那个组件**现在在哪。指不出来，就说明 C 是待建工作，不是
既有性质。

## 目标与非目标

**目标**：

- 新装的 WorkMesh 在第一次打开时就说清"还差什么、点哪里补"，并且在平台**确实
  不知道**时明说不知道（`unknown`），不装作知道。
- Agent 接入从七步仪式变成一条命令，并消除"丢响应即永久死路"——修法在客户端，
  不改服务端凭据语义。
- 投一个通知渠道出去，配一张**不带决策权**的卡片，把决策留在已登录的网页里。
- 国内模型预置成只读、带出处的版本化目录，让常见场景不用手敲 base URL。
- **D 链**：把参考产品（todos.dev）实测出的视觉体系、卡片结构与工作台三栏布局
  搬进 WorkMesh 已定的机制（0028 的 CSS 变量基线 / 0045 的单套 token），
  并把"只有人工关口是暖色"变成可断言的不变量。

**非目标**（全部来自审查的"建议砍"清单）：

- 不做工作区可编辑的起始提示语（无写入契约，退回固定 i18n 文案）。
- 不做四渠道同时上线；v1 只做企业微信，钉钉/飞书/SMTP 各自独立后续。
- 不做卡片内直接决策（需先有一份身份绑定 ADR）。
- 不做小程序完整客户端（先做只读 + 认证兼容 spike）。
- 不做目录 OAuth 创建首管理员（会静默改写 ADR 0031 的安全政策）。
- 不做新的短码协议；沿用现有 43 字符信封。
- 不做"保存前真实探测密钥"，单列为 probe 任务。
- 不新增部署拓扑；ADR 0071 / 0072 仍为 **Proposed，未实现**。

## P1：16 条代码事实断言核实台账（2026-10-07）

以下结论以当前工作区代码和文档为准，覆盖原草稿中的错误前提及本计划依赖的
关键代码事实。行号按本次核查时工作树记录；“错误”列出可替代证据，不以关键词
零命中推导全局不存在。

| # | 断言 | 核实结果 | 修正后的表述与证据 |
|---:|---|---|---|
| 1 | 安装令牌只存在于兑换响应，服务端不能恢复响应 | **错误** | 安装令牌明文在兑换响应中生成并返回（`apps/api/src/agent-connections.ts:529-539,553-557`）；完整响应另以 AES-256-GCM 加密存入通用认证幂等表（`apps/api/src/auth-idempotency.ts:128-144,319-339`），不是“只存在于响应”。 |
| 2 | 加密重放没有到期擦除 | **错误** | worker 按 `replay_expires_at` 清空密文、IV、tag 和重放密钥元数据（`apps/worker/src/session-lifecycle.ts:672-690`）。 |
| 3 | 精确重放只检查 caller 的幂等 key | **不完整** | 重放还绑定 subject、operation、规范化 request body、client context，且受重放窗口与已完成状态约束（`apps/api/src/auth-idempotency.ts:210-216,285-304`）。 |
| 4 | 兑换入参带有 claim 标识，可用它恢复凭据 | **错误** | `agentConnectionRedeemInputSchema` 严格只接受 `pairingCode`、`agentSlug`、`client`，无 claim 标识字段（`packages/contracts/src/index.ts:2711-2723`）；当前恢复身份来自原幂等请求身份。 |
| 5 | `POST /api/v1/agent-connections` 只绑定已有 Agent | **错误** | 路由查无定义时会插入 Agent actor 与 `agent_definitions`（`apps/api/src/agent-connections.ts:429-469`）；不可通过文档把现有创建能力描述成不存在。 |
| 6 | 配对码是短码，或不是 32 随机字节载荷 | **错误** | `opaqueToken()` 生成 32 随机字节并编码为无填充 base64url 的 43 字符；配对前缀 `wmp_` 由连接 token 拼接（`packages/db/src/index.ts:41`、`apps/api/src/agent-connections.ts:32-35,358-360`），完整值再加前缀。 |
| 7 | 两个兑换端点共用同一 endpoint/subject 限流预算或失败退避 | **错误** | endpoint 桶按 `operationId`，subject-client 桶也包含 `operationId`；失败键为 `operationId + clientIp + subject`，而两个 operation ID 不同（`apps/api/src/auth-rate-limit/limiter.ts:122-145,154-159`；`apps/api/src/auth-rate-limit/inventory.ts:36-37`）。 |
| 8 | 两个兑换端点完全没有共享限流预算 | **错误** | socket peer 与 client IP 维度不含 operation ID，仍由两个入口共享（`apps/api/src/auth-rate-limit/limiter.ts:129-145`）。准确表述是 endpoint、subject-client 和失败退避按 operation 隔离，IP/socket 预算共享。 |
| 9 | pairing 的 attempts 是错误 code 暴力破解计数 | **错误** | 随机错误 code 在查 pairing 行时失败；仅已知 pairing 的 slug/type mismatch 进入外部 catch 并递增 attempts，达到阈值时拒绝（`apps/api/src/agent-connections.ts:518-525,560-562`）。 |
| 10 | 配对码十分钟有效期覆盖完整七步安装流程 | **错误** | 十分钟 `expiresAt` 创建于 pairing，redeem 时校验；成功兑换后后续本地配置/Skill 校验不再使用该 code（`apps/api/src/agent-connections.ts:358-365,518-523,546-557`）。15 分钟重放窗口独立定义于 `auth-idempotency.ts:248-249`。 |
| 11 | 保存模型连接会向供应商真实请求验证密钥 | **错误** | API 对 URL 做格式/策略规范化（`apps/api/src/workbench-llm-connections.ts:49-69`），ADR 0065 明确当前 API 不向配置目标发请求（`docs/adr/0065-prototype-web-pi-workbench-and-llm-connections.md:48-50`）。 |
| 12 | 模型只要存在就可用于模型支持命令 | **错误** | 授权查询要求 connection `active` 且 model `enabled=true`（`apps/api/src/workbench-conversations.ts:150-166`）。 |
| 13 | Runner 有独立的在线/空闲心跳事实 | **未发现；结论限于已读实现** | runner 在获得 Session assignment 并进入执行流程后才发送 Session heartbeat（`apps/agent-runner/src/run-session.ts:331-357`）；assignment 查询关联 Session/Delegation/grant，而不是 runner 注册（`apps/api/src/workbench-runner.ts:88-109`）；heartbeat 字段属于 `agent_sessions`（`packages/db/src/schema.ts:316-324`）。因此当前就绪项应为 `unknown`，不声称未来不存在此能力。 |
| 14 | 平台完全没有通知投递能力 | **错误** | ADR 0062 已记录人工 Web Push（`docs/adr/0062-autonomous-control-plane-and-agent-lifecycle.md:30-32`），schema 有 notification、delivery 与 browser push subscription（`packages/db/src/schema.ts:523-543`）。缺口应限定为目标生态渠道适配器。 |
| 15 | 企业微信、钉钉、飞书、小程序适配器已存在，或可据“零命中”断定所有生态代码不存在 | **未发现适配器；检索结论有边界** | 本次对 `apps/`、`packages/`、`docs/adr/`、`docs/plan/` 与 `docs/agent-integration.md` 显式纳入检索，命令使用 `rg -n -uu -i`，检索词为 `企业微信|wecom|wechat work|wework|钉钉|dingtalk|飞书|feishu|lark|小程序|mini.?program`；排除 `node_modules/`、`.git/`、`dist/`、`.next/`、`coverage/`。命中仅为计划/ADR规划文字，未找到实现证据；结论只写“未发现渠道适配器”，不外推为国内模型/全部文档不存在。 |
| 16 | Human Attention / Redis wake sink 可直接作为持久通知队列 | **错误** | ADR 0050 将 Attention 定义为派生查询；worker Redis sink 写 cursor/workspace wake hint 并按 `MAXLEN` 裁剪，PostgreSQL outbox 才负责 claim/delivery（`apps/worker/src/index.ts:249-258,291-325`；ADR 0033）。新渠道投递仍需持久契约。 |

核查依据为表中逐项代码/文档定位及第 15 项明确列出的搜索词、目录范围和排除项。
没有发现推翻 ADR 0074–0076 当前决策前提的新证据；本次只补精确事实依据与检索边界，
不改设计决策。交叉引用：[`ADR 0074`](../adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md)、
[`ADR 0075`](../adr/0075-verifiable-and-simplified-agent-connection-onboarding.md)、
[`ADR 0076`](../adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md)。

核查任务清单：

- [x] 16 条断言逐条有结论；
- [x] 每条被推翻的断言都有替代证据；
- [x] 搜索未发现项记录检索词、纳入范围和排除项；
- [x] 结论同步到计划及相关 ADR，计划中的相对链接目标可解析；
- [x] 每项验证均记录测试/检查命令、实际结果与原因；五项必需检查均已通过。首轮失败和修正后重跑结果均保留在下表。

### 必需检查记录

执行环境：Windows PowerShell，Node `v24.20.0`、pnpm `9.15.4`；专用 Docker PostgreSQL 16、Redis 7、RustFS。集成与 E2E 使用本地回环端口和独立 `*_test` 数据库（包括单独的 E2E 重跑库、恢复源/目标库），未连接生产库，也未复用 D0 分支数据库。E2E 的 bootstrap、cursor、限流密钥为进程内生成的测试值；模型相关 live provider 用例按测试默认跳过，未以真实模型调用代替 fake provider。

| 必需检查 | 执行命令 / 对应测试 | 实际结果 | 结论 |
|---|---|---|---|
| lint | `pnpm lint`（Turbo 全仓 lint，18 个任务） | 18/18 任务通过，退出码 0。首次因依赖尚未安装而启动失败；随后按 lockfile 执行 `pnpm install --frozen-lockfile`，重跑通过。 | 通过 |
| typecheck | `pnpm typecheck`（Turbo 全仓类型检查，18 个任务） | 18/18 任务通过，退出码 0。 | 通过 |
| test | `pnpm test`（Turbo 全仓单元测试，29 个任务；含 API、Web Vitest） | 29/29 任务通过，退出码 0；Web 报告 113 个文件 / 776 项通过，API 174 项通过。 | 通过 |
| test:integration | `pnpm test:integration`：DB `@workmesh/db test:integration`（17 文件 / 77 项）；API `@workmesh/api test:integration`（22 文件 / 154 项通过、1 项 live MiniMax 跳过）；Worker `@workmesh/worker test:integration`（8 文件 / 78 项通过、1 项 retention upgrade barrier 跳过）；Recovery `@workmesh/recovery test:integration`（1 文件 / 1 项）。 | 完整命令退出码 0；共 310 项通过、2 项按测试设计跳过。首次 recovery 重跑误指向无 ObjectLock 的预建测试桶而失败；移除桶覆盖配置、由用例创建隔离 ObjectLock 桶后完整重跑通过。 | 通过 |
| test:e2e | `pnpm test:e2e`，对应 `apps/web/e2e/**/*.spec.ts`（Playwright，1 worker） | 首轮 73 通过 / 1 失败：`e2e/documents.spec.ts` 的“Project and Issue documents keep immutable revisions through the real Web and API”超时，未在详情面板找到“讨论”标签。新建隔离库单独重跑该文件：9/9 项通过；再用全新隔离库重跑完整命令：74/74 项通过，退出码 0。首轮失败保留为重跑前观察，不隐去。 | 通过（完整重跑） |

按你的要求，另补跑了默认关闭的 retention upgrade barrier：设置 `RUN_RETENTION_UPGRADE_INTEGRATION=1`，使用独立 `workmesh_retention_upgrade_test` 数据库和启用 Object Lock/versioning 的 `workmesh-retention-upgrade-test` RustFS 桶，执行 `pnpm --filter @workmesh/worker exec vitest run --config ../../vitest.integration.config.ts integration/retention-upgrade-barrier.integration.test.ts`；1/1 项通过，验证一个精确对象版本、versioned HEAD、零 delete marker 及 retention 扩展。此补验与上表完整 `pnpm test:integration` 分开计数。

首轮 E2E 失败未能复现：针对性 9 项组合与完整 74 项重跑均通过。没有因此修改实现或测试。只读静态核查的 16 条断言以台账逐条 `file:line` 证据为准；本任务未新增测试代码。五项本机门禁全部通过。#2 已完成，第二轮独立审查批准合并；PR #192 merge commit `660c74a6247544ffac64e7ef8f968d1025b2a668` 包含修订提交 `735578d8d0733e04cae5640cedfaf0c6181391c7` 与此完整台账；CI run `37614969993`（check 344）8/8 job 成功。P1 16 条事实据此冻结为后续输入；G1 实际 build 可达性仍须单独验证。

### P1 完成定义与依赖

**DoD**：16 条断言全部有核实结论；每条被推翻的断言都有替代 `file:line` 证据；检索零命中项写明检索词、范围及排除项；结论已同步到计划与受影响 ADR 且相对引用可解析；五项仓库必需检查的命令、结果及失败/跳过原因均已记录并通过。满足 DoD 后仍须完成独立复核及冻结，之后 B1、A1、D1、C1 才可开工（本项 `blocks：B1, A1, D1, C1`）。

## 现状与证据（已核实，含被撤回项）

| 事实 | 证据 | 对计划的影响 |
|---|---|---|
| 兑换响应已有加密重放 + 到期擦除 | `auth-idempotency.ts:128-144,218,319-339`；`session-lifecycle.ts:672-690` | B1 改为纯客户端改动，**零迁移** |
| 重放需同 key + 同 subject/op/规范化 body/客户端上下文 | `auth-idempotency.ts:205-216,285-304,343-352` | 缺口=客户端丢请求身份 |
| 丢失原请求身份后，不能用新 key 再兑已消费 code | `agent-connections.ts:522` `PAIRING_CONSUMED`；原 key/body/context 在有效重放窗内仍可重放 | 缺口限定为客户端遗失原请求身份且无法精确重放 |
| 接入指令确为 7 步 | `mcp-onboarding.ts:141-147` | 压到 2 步 |
| 其中 4 步是完整性校验，不得删除 | ADR 0043（指纹）、ADR 0046（Skill 原始字节/哈希/签名） | 由 connector **执行**，不由 agent 手工做 |
| 两个兑换端点预算**已**按 operationId 隔离 | `limiter.ts:129-145,154-159` | 不拆 endpointClass |
| DB attempts 只在已知身份不匹配时递增 | `agent-connections.ts:521-525,561-562` | 锁的语义要写清，不是 code 暴力破解预算 |
| enrollment 是 ADR 0062 定的默认，pairing 是恢复通道 | ADR 0062 | v1 明确选 pairing 纵向路径，不静默反转 |
| enrollment 输入更大且不写 pairing | `contracts/src/index.ts:2918-2930`；`agent-connections.ts:919-971` | enrollment 恢复是独立任务 |
| `POST /agent-connections` 目前也能建 Agent | `agent-connections.ts:443-469` | 不靠改文档假装它只绑定已有 Agent |
| 无空闲 Runner 在线事实 | `run-session.ts:332-357`；`workbench-runner.ts:88-109`；`schema.ts:321-324` | 就绪面 Runner 项 v1 只能 `unknown` |
| 模型条件是 active + enabled | `workbench-conversations.ts:150-166` | 判据收紧到这条 |
| 项目不是所有工作的前提 | ADR 0004、ADR 0024、`AGENT_PROTOCOL.md:1746-1756` | 仓库项可 `not_applicable` |
| 保存模型连接不出站 | ADR 0065；`workbench-llm-connections.ts:49-69` | 预置不声称兼容性 |
| Human Attention 是派生查询，无表/无 outbox/无调度 | ADR 0050 | 投递意图必须新设计（F10） |
| Redis sink 只是 wake hint 且有 MAXLEN 裁剪 | `worker/src/index.ts:249-258`；ADR 0033 | 不能当渠道队列 |
| 已有 Web Push 与 notification 表 | ADR 0062；`0016_stage4_usage_notifications.sql:6,85-103` | 渠道面是扩展不是从零 |
| 限流默认仍构建 Redis store | `auth-rate-limit/plugin.ts:53-59` | ADR 0072 未实现，兼容性是后续门槛 |
| 锁清单 pin 的是 statementId（owner + 规范 SQL 哈希）与 rankSequence | `agent-lock-order-inventory.test.ts:141-167,373-392` | **不是**只许行号位移 |
| 路由策略矩阵由脚本生成 | `scripts/generate-route-policy-artifacts.mts`；`pnpm generate:route-policy` | 用生成器，不手改 |
| ADR 0071/0072 Status 均为 Proposed | 两条 ADR 首行 | 事实表区分"文件存在/提案/已实现/已验收"四态 |
| 本次检索范围内未发现企业微信/钉钉/飞书/小程序渠道适配器 | 检索词、目录范围与排除项见 P1 台账第 15 项 | 仅说明未找到适配器，不推断国内模型或全部文档不存在 |

## 任务链与依赖

```
B1 客户端请求身份 ──▶ B2 connector ──▶ B3 错误分类 ──▶ B4 文档
   （零迁移，可独立先发；不依赖 A、C、D）

A1 就绪投影 ──▶ A2 首跑面
   （零迁移，可与 B 并行；不被 C 阻塞）

C1 投递契约 ──▶ C2 企业微信适配器
C3 预置目录（只读，不依赖 A）

D0 视觉基线 ──▶ D1a 新增并存槽/映射 ──▶ D1b 逐面迁移/清理 ──▶ D2 卡片结构契约 ──▶ D3 单暖色不变量
              ──▶ D4 三栏工作台布局 ──▶ D5 卡片交互集（全部走受治理 Command）

F0 团队房间扩展（blocking，最先）──▶ F1 任命与能力派生
                              ├─▶ F2 分派授权绑定 ──▶ F3 激活与准入
                              ├─▶ F4 消费协议（最重）
                              ├─▶ F5 收件恢复选择 ──▶ F6 两个薄工具与交付链
F-memory 长期记忆（延后，不阻塞上述任何一条）

延后：C-identity（目录首管理员）、C-card（卡片决策）、C-mp（小程序）、
      C-probe（真实模型探测）、C-dingtalk/C-feishu/C-smtp、
      D-dark（暗色，值已预取，见 ADR 0074/0077）
```

审查特别指出：审查前那版把 B 链汇入 A2、又把 C 的投递强行依赖 A 的就绪投影，
自相矛盾且拖慢可独立发布的工作。上图的依赖是修正后的。

**D 链的独立性与前置**：D 链**不依赖** A/B/C 任一条，它只依赖已定的 0028
（前端架构与 M1–M5 分期，Accepted）、0045（单套 token，Proposed）、0052
（IA，Accepted）、0064（统一 shell，Accepted）、0073（列内位置，Proposed）。
D0 是硬门禁：**没有基线就不许改 token 值**，否则视觉回归无从评审。D 链**不触碰**
领域与端点，纯表现层。

## A 链 — 工作台就绪面（ADR 0074）

### A1 — 就绪投影（只读，零迁移）

- **交付**：`GET /api/v1/readiness`；每项检查三态 `ready` / `blocked` /
  `unknown`，仓库项另有 `not_applicable`；`CONTEXT.md` 加
  **Configuration readiness** 词条。
- **约束**：无任何写入端点；按调用者与 Team 作用域化（个人模型对队友不可见）；
  Runner 项 v1 恒为 `unknown`；模型判据为 `active` + `enabled`。
- **测试**：四个 happy path（配置齐全 → `ready`）；每项单独缺失；跨 Team 与
  他人个人模型**不泄露存在性**；**无 assignment 的空闲 runner 不得被报成离线**
  （`unknown`）；模型 disabled → `blocked`；模型属于他人 → 对该调用者
  `blocked` 且不泄露；非仓库工作 → `not_applicable` 而非 `blocked`；心跳过期
  不影响结论（v1 无 Runner 事实）；断言**无状态/事件/outbox/receipt 写入**
  （不是"事务计数为 0"——只读事务不违反 Query）。
- **DoD**：`pnpm generate:route-policy` 重生成矩阵；lint/typecheck/test/
  integration/e2e 全绿；`validate-ci.mjs` 无豁免。

### A2 — 首跑面

- **交付**：工作台会话区上方的未满足项列表（有序、行内深链、计数）；空状态
  仅在对应项 unmet 时长主动作；起始提示使用**现有 i18n bundle 的固定文案**。
- **测试**：列表顺序=依赖深度；点击深链返回后重算；全满足时不渲染；非 unmet
  空状态不长横幅；e2e"装完 Lite → 看到缺配置 → 逐项补齐 → 横幅消失"；
  路由回退/键盘/窄屏/i18n 回归。

## B 链 — 可证明的接入恢复（ADR 0075）· 优先级最高

### B1 — 客户端请求身份（零迁移，可独立先发）

- **交付**：`apps/connector` 的持久化层：首次发送**前**原子写入
  `0600` 文件，含 `Idempotency-Key`、精确规范化 body、origin、user-agent；
  之后每次运行若存在 pending 记录则**原样重放**。
- **约束**：服务端不改、不加列、不改凭据生命周期；窗口关闭时 connector 明确
  告知并给出人的下一步。
- **测试**：进程在发送前崩溃 → 恢复后同一凭据；发送后崩溃 → 同一凭据；改 body
  继续冲突；**另一 claimant 只持原 code 与公开 connection id 不得取回令牌**；
  窗口外拒绝；过期密文擦除后拒绝；服务端重启后仍可重放；客户端重启后仍可重放。
- **可独立发布的判据**：以上断言全绿 + 现有集成测试仍绿（重放相同 body 的
  `stage5-agent-connections.integration.test.ts:333-335` 不回归）。

### B2 — 一步式 connector（七步 → 两步，且**不删**任何校验）

- **交付**：`pnpm --filter @workmesh/connector connect --code <43 字符> --client
  <type> --origin <url>`；QR 编码该 code；输出可直接粘贴的客户端配置。
- **约束**：指纹前缀比对、Skill **原始字节/哈希/签名**校验、discovery 校验、
  `verify_connection` 比对全部由 connector **执行**（ADR 0043/0046 的实质要求
  保留）；配置**先写暂存文件**、4 与 6 都通过后才原子 rename；失败不覆盖既有
  配置。禁止 pnpm-workspace 内部安装方式——Lite 设备无源码，必须走发布的
  带版本二进制，这条是独立工作项。
- **测试**：黄金路径；指纹不符/签名错/Skill 字节被篡改/错误 Team/错误
  principal/旧 overlap 凭据误用 → 全部拒绝且不写配置；配置写一半被杀 → 既有
  配置完好；stdout/stderr/恢复文件/配置**均无明文令牌**；同 code 连跑两次幂等。

### B3 — 错误分类（不改限流架构）

- **交付**：所有接入错误带 `next_action` + `human_action`；类型不匹配返回部署
  支持的 clientType 列表，并写明这只修正**猜错类型**、不修复 slug 绑定不一致。
- **明确不做**：不拆 `endpointClass`；不改 ADR 0030 的共享来源预算。
- **测试**：表驱动，每条错误码都有可执行 next_action；**耗尽 endpoint/subject
  桶不影响另一个 operation**；**耗尽共享 IP 桶确实同时影响两者**（这才是真正
  共用的）；错误 code / wrong slug / wrong 已知 type / 未知 enum 四种输入分别
  断言；429 尊重 Retry-After；store 故障 fail closed。固定时钟 + 低阈值。

### B4 — 词汇收敛与文档

- **交付**：`docs/agent-integration.md` 改为两步流程；`AGENT_PROTOCOL.md` 写明
  重放保证是"重放**同一**请求身份"，**新 key 不是恢复路径**；`AGENTS.md` 补
  connector 安装与命令（含 Lite 二进制路径）。
- **不宣称**：`POST /agent-connections` 仍可建 Agent 这一事实**不被文档悄悄
  改写**；收窄它是破坏性变更，另立 ADR。
- **测试**：文档里每条命令在 CI 以 `--dry-run` 校验存在且参数名正确。

## C 链 — 一个渠道 + 预置目录（ADR 0076）

### C1 — 投递契约（先于任何渠道适配器）

- **交付**：delivery intent / attempt 表；fan-out worker；fenced ack；退避、
  超时 reclaim、DLQ；持久 checkpoint。
- **约束**：投递意图只由业务事务或带持久 cursor 的 worker 产生，**绝不**在
  `GET` 注意力投影时产生；外发**只在提交后**；发送前按目标 Human 重新授权并
  重建最小内容；卡片绑定源 revision，陈旧卡片只能深链不能批准新内容；每个目标
  独立重试，互不影响；承诺**至少一次**并给出不确定结果对账路径，不谎称恰好
  一次。
- **测试**：一个源事件→精确目标投递；每目标幂等去重；两 worker 竞争→每目标
  仅一次；单渠道故障不致其他渠道重投；撤权后抑制；进程在每个提交/发送边界崩溃；
  checkpoint 保存前后崩溃；陈旧 revision 拒绝；并发相反审批正确冲突；重复
  callback 同体去重、异体冲突；无 Redis 档位**明确标记为不支持**而非静默降级。

### C2 — 企业微信适配器（v1 唯一渠道，只提醒 + 深链）

- **交付**：低敏通知 + 指向已登录网页的深链。**卡片不渲染决策控件。**
- **约束**：签名校验失败必拒；回调时窗校验；内容最小化；配置秘密脱敏；
  payload 上限。卡片被转发时必须无害。
- **测试**：签名失败/过期/重放拒绝；深链指向 canonical 路由并保留
  Back/Forward；未绑定/转发/解绑/离队/停用/错误 recipient 全拒绝；**渠道侧
  不产生任何决策写入**（断言零 outbox 决策行）。

### C3 — 国内模型预置目录（只读，不依赖 A）

- **交付**：版本化只读目录，含 provider/region/apiType/baseUrl/modelId/来源
  URL/核对日期/确认方式。
- **约束**：无 API CRUD、无请求内修改、不建表；不声称任何兼容性（因为当前栈
  不验证）；ADR 0062 的 Web Push 与既有 notification 表作为先例被扩展而非重建。
- **测试**：目录版本可读；选中预置只填充可编辑配置；目录替换/覆盖/禁用规则
  有测试；**保存连接不产生任何出站请求**（断言零外部调用）。

## D 链 — 参考产品视觉体系与工作台重构（ADR 0077）

参照物：`docs/references/todos-analysis/`（`design-tokens.md` 实测 token、
`kanban-cards.md` 卡片结构与 9 类交互、28 张截图）。

**采纳什么、不采纳什么**（这是本链最容易做错的地方）：

| 采纳 | 不采纳 |
|---|---|
| 实测**值**（表面/边框/文字色阶、6/8/12px 圆角、间距刻度、状态色值） | Tailwind 工具类与其 classname 字符串（0028 已延后 Tailwind，0045 已否决） |
| 卡片**结构**（三区结构、2 行截断、零阴影、内凹列底） | 状态色硬编码在工具类里的**机制**（0045 的 token 正是为了消灭这个） |
| 三栏工作台 + 可拖分隔线 + 隐藏/最大化 + 状态记忆 | 替换 0052 的 IA 与 0064 的 canonical 导航（两者均 Accepted） |
| 卡片状态化主动作、右键菜单、拖拽、Ctrl 多选、拖卡进对话 | **破坏性拖拽重置**（无确认地中断构建并清空对话/方案/diff） |
| "只有人工关口是暖色"作为可断言不变量 | 顺带引入暗色（0045 明确只做亮色，暗色值已预取为后续 ADR） |

### D0 — 视觉基线（硬门禁，不写实现）

- **交付**：受影响界面的**改动前**截图基线（工作台、看板、项目、Agent 详情、
  列表/详情、设置），固定视口与明暗（本任务固定亮色；产品已有明暗切换）。
- **约束**：D0 未完成前**禁止**任何 token 值变更。没有基线就没有评审视觉回归
  的依据，这是本链唯一的硬门禁。
- **测试**：基线本身可重放（同一视口两次产出可重复）；基线纳入 e2e 资产。
- **开工前测试文件与用例映射**：`apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts`，
  测试组 `D0 亮色视觉基线`；实际用例为 `工作台：覆盖、两次采集一致、D1 可直接比对`、
  `看板：覆盖、两次采集一致、D1 可直接比对`、`项目总览：覆盖、两次采集一致、D1 可直接比对`、
  `Agent 详情：覆盖、两次采集一致、D1 可直接比对`、`工作项列表：覆盖、两次采集一致、D1 可直接比对`、
  `工作项详情：覆盖、两次采集一致、D1 可直接比对`、`设置：覆盖、两次采集一致、D1 可直接比对`。
  以下三项共用这些用例，在 `desktop-1440x1000` 与 `mobile-390x844` 两项目执行：
  - [x] 覆盖全部受影响界面；看板固定滚动，目标列头及卡片完整进入视口。
  - [x] 同一视口两次采集可重复：固定部分栅格条件后，两个独立上下文的原始 PNG SHA-256 相同；重启后再核对原始哈希。
  - [x] 基线可被 D1 的视觉 diff 直接消费：重启后使用 `--update-snapshots=none`、
    `threshold=0.005`、`maxDiffPixels=0` 直接比较已有 PNG，两轮各 14 项通过；本轮未放宽参数。
- **DoD**：基线产出并可重放；D1 开工前以此为门禁。
- **实际证据**：[基线验证报告](../../apps/web/e2e/baselines/d0/verification.md) 与
  [逐项清单](../../apps/web/e2e/baselines/d0/manifest.json)。14 张基线覆盖 7 个面与 2 个视口；
  两轮各两个上下文的哈希校验，与采用容差比较器的重启重放是分别验证的事实。
  容差依据和历史失败保留在证据中，比较器通过不表示用户已验收产品色彩变化。
  五项必需检查在上一修订轮均成功退出，3 个条件跳过及原因保留；新增入口隔离、看板 viewport 断言及详情栅格 A/B 证据。
  最新审查修订撤回通用 mocked-dev 新增 upstream 默认覆盖，仅保留 D0 专用覆盖；
  [独立验证记录](../../apps/web/e2e/baselines/d0/evidence/upstream-scope-verification.json)另存来源新旧哈希、
  14/14 禁止更新基线重放及 28 次原始字节核验。lint/typecheck/test 本轮重跑成功，
  集成/正式 E2E 沿用历史结果；通用入口 12 项旧失败与 115 项未执行不豁免，不宣称全套通过。
  前两轮各 13 通过/1 失败、旧原始 PNG、全部对照与每项通用 mocked-dev 失败原样保留，不能用比较器通过代替哈希一致。
- **依赖与状态**：[D0](todo:MPhtZiff23B33m9i2equq) 的视觉基线门禁已完成（PR #195、独审及 CI #352 通过）；
  通用 mocked-dev 实际失败仍待逐项处置或总管裁决，不改变已完成的视觉基线结论。blocks
  [D1a](todo:IJQA_DfxU0hF5e8L5Xb3v)，并为 [D1b](todo:2j2sxT5wJ-l001efH_meJ) 提供同一份改动前基线；
  D1a 仍须通过 G1、P1、R1 前置。
  不再因缺真实 WorkMesh 连接阻塞 D0；G1/P1/R1 未验证通过时仍不得放行相应实现。
- **文档引用复核**：提交 `dae4620366f33136d65e533d85823db49b9a3fe1` 已删除过时的
  `WORKMESH_PRD.md`；2026-08-22 运行可靠性计划第 34 行及 2026-09-24 工作台基线第 62 行
  已记录现行文档集合与修正陈旧引用的方案。该输入一致性修正由 G1 处理，D0 不重造 PRD、
  不改产品规范，也不把陈旧引用冒称采集/检查阻塞；原始来源核验见上述基线报告。

### D1 — token 值迁移（沿用 0045 的命名空间）

已批准拆为 [D1a](todo:IJQA_DfxU0hF5e8L5Xb3v)（仅新增并存语义槽与来源映射，保留根值及消费方）和
[D1b](todo:2j2sxT5wJ-l001efH_meJ)（逐面迁移、视觉 diff 及人工评审后清理旧值）。D1a 的前置为
G1、P1、R1、D0；D1b 在 D1a 后执行。下列原 D1 清单是两阶段的总范围，不能将 D1a 完成等同全部迁移完成。
本批不新增暗色值，也不因迁移删除已有明暗切换；真实视觉取舍另行由用户裁决。

- **交付**：`packages/ui/src/tokens.css` 新增参考实测值作为**并存**的语义槽；
  一份"0045 语义槽 → 参考实测值"映射表。
- **约束**：顺序不可颠倒——**先新增、后按面迁移、最后才删旧值**。先改根值或先删
  旧 token 是本任务要防的唯一失败模式。**不引入 Tailwind，不引入暗色**。
- **测试**：每迁移一个面，用 D0 基线做视觉 diff 评审；`theme-unification.spec.ts`
  全绿；**旧值仍有消费方时禁止删除**（用一条静态断言守住）。

### D2 — 卡片结构契约

- **交付**：卡片三区结构（meta / title / footer）成为共享契约；8px 圆角、
  1px 边框、10px 12px 内边距、6px 纵向间距、**零阴影**、标题 14px/500 +
  `line-clamp: 2`；列 12px 圆角 + **内凹**表面 + 12px 列间距。
- **约束**：零阴影是承重项——阴影预算只留给浮层，否则满屏卡片糊成一片；这条
  防止日后有人为"手感"加 hover 阴影。
- **测试**：卡片结构断言（三区存在且顺序固定）；标题**最多 2 行**（超长标题被
  截断而非撑高卡片）；卡片计算样式 `box-shadow: none`；列背景为 inset 槽而非
  页面背景。

### D3 — 单暖色不变量

- **交付**：`--wm-warning` 只用于"必须等人"的类状态；`awaiting_review` /
  `awaiting_approval` 属于此类；pending 中性、running/queued 信息色、
  done/closed 成功色、blocked 用**不与 attention 撞色**的中性暖。
- **约束**：这条要写成**可断言的渲染测试**，覆盖看板能显示的每一个状态。写不成
  断言的设计规则只是偏好。
- **测试**：遍历全部状态 → 断言只有 awaiting_* 渲染为 attention 色；blocked
  的色值与 attention 色的距离超过阈值；明暗（如未来）两态各自成立。

### D4 — 三栏工作台布局

- **交付**：导航 / 总管对话 / 看板三栏；可拖分隔线；看板可隐藏（`Ctrl Alt B` 类）
  与最大化（`Ctrl Shift Enter` 类）；布局状态被记忆。
- **约束**：两栏是**同一批授权 read model 的两个视图**，不产生第二权威源；
  分隔线**不改变 URL 所有权**，0064 的 canonical 导航规则原样保留。
- **测试**：分隔线拖动不改变路由与焦点；隐藏/最大化状态跨会话保持；窄屏回退
  行为；键盘可达；**A2 的就绪列表在窄屏下仍可达**（不因布局而丢失）。

### D5 — 卡片交互集（全部走受治理 Command）

- **交付**：状态化主动作（随状态变文案）；右键菜单（下一步排第一，其后编辑/
  复制/复制链接/关闭/删除/重开）；列间拖拽；`Ctrl/⌘` 点选多选批量移动；
  **拖卡进对话输入框**插入任务引用。
- **约束**：每一个都是普通 `Command`，带 `Idempotency-Key`、`If-Match` revision
  与乐观并发，走既有授权检查。**看板是更快到达同一个受治理变更的路，不是第二套
  变更 API**。**不实现破坏性拖拽重置**；任何破坏性转换必须有显式确认面。
- **测试**：每个动作 happy path；未授权 actor 在卡片上同样被拒；陈旧 revision
  拒绝（`If-Match`）；重复幂等键不产生第二次变更；**破坏性路径必须出现确认面**
  （反向断言：不实现无确认的拖拽重置）；`Ctrl` 多选跨列移动原子性；拖卡进对话
  只插入引用、不自动提交（符合 `CONTEXT.md` 的 Draft 规则）。

## F 链 — 总管 / agent graph（ADR 0078）

**前提是「先证明能协调，再谈长期记忆」。** 这也是本批唯一会**收窄一条 Accepted ADR**
的链：0078 把「总管分派」列为 ADR 0062 的显式例外，并可能修订 ADR 0037 的收件箱
恢复语义。**这两处必须在实现前由人确认。**

**它也是唯一跨到 WorkMesh 之外那台机器的链**：`clientType` 就是 harness 身份，
而 WorkMesh **没有内建 runtime**（`harness`/`builtin`/`pi_agent` 全库 0 命中，
唯一的 `runtime` 字段是 `usage_records.runtimeMs`）。没有 agent 持有效连接时
**谁也跑不了，包括总管**——这和 A1 里 Runner 只能报 `unknown` 是同一件事的两面。

### F0 — 团队房间的完整扩展（blocking，必须最先做）

- **交付**：两阶段迁移。entry 1 只 `ADD VALUE 'team'` **且不使用它**；entry 2 替换
  `0001_v1_baseline.sql:599-614` 的 `CHECK` 与 `enforce_room_subject()`，新增
  `team` 分支（同 workspace、`subject_id = team_id`、其余三列为空）。
- **约束**：旧 baseline / legacy 迁移与其 checksum **一字不动**，不为加枚举值
  重生成已发布 baseline；文件内不写 `BEGIN`/`COMMIT`（runner 托管事务）。
- **测试**：四种 subject 的 DB/API 成功路径；跨 workspace 与跨 Team 拒绝；三种旧
  subject 无回归；**普通执行 Session 不能借 Team 房间读到兄弟 Session 的私信**；
  撤权后房间/收件箱/事件/上下文同时收敛；每个 entry 提交前后故障与重跑。

### F1 — 总管任命与能力派生

- **交付**：`chief_appointments` 表 + `(teamId) WHERE status='active'` 部分唯一索引；
  任命/换届/结束三个 Human 命令（带 revision 与幂等键）；总管委派 =
  **该 agent 现有授权 ∩ 协调默认集**。
- **约束**：任命**既不扩权也不缩权**（agent 原有委派不动）；显式放宽是独立的、
  有审计的人工作为；17 项能力必须被完整、互斥、穷尽地分组。
- **测试**：conformance 测试对 `capabilitySchema` 做全量分区，**漏一项即失败**；
  任命一个已持 `repo:merge` 的 agent 后，其普通会话权限不变而总管会话不含
  `repo:merge`；换届原子性；并发任命只有一个成功。

### F2 — 分派授权绑定（人类消息不是授权）

- **交付**：结构化分派授权，绑定 workspace/Team/appointmentId+revision/principal/
  目标 Work Item 或计划版本/目标 agent/能力与 scope/预算/**规范化动作摘要**/
  有效期/最大使用次数；执行命令在状态变更事务内**校验并消费**。
- **约束**：人类消息只是**输入与来源证据**；房间自由文本**不能**直接创建授权，
  必须先形成结构化提案；执行命令保留**真实 agent 作者**并引用真实人类决定；
  0062 例外——只有 `source=human` 满足，`requestApproval` 自动批准与 pending
  reconciliation **不得**自动批准此类动作。
- **测试**：普通人类文本不执行；结构化批准只作用于精确内容；换 target/capability/
  budget/revision 必须重批；两次消费只有一次生效；同 key 重放无第二次效果；消费与
  session/event/outbox 任一点失败共同回滚；撤权、Stop、换届，以及
  `delegate_work_item` / `claim_work_item` / `create_child_session` / retry /
  automation 五个入口**全部**拒绝（共享 guard，不是只查一处）。

### F3 — 激活与准入命令

- **交付**：显式 activation 命令（三源统一），记录真实 source kind/id、发起 actor
  （若有）、执行 service actor、任命 revision、规则版本与 resulting sessionId；
  复用 ADR 0023/0024 的 occurrence、admission、budget reservation、fencing。
- **约束**：**计时器不得伪装成人类指令**；跨 Work Item 分派需要 coordination session
  + 有效连接 + **principal 等于目标 Work Item 的 Responsible Human**
  （`agent/commands.ts:826-886`），团队多负责人时保留该等式，不匹配则退回该人。
- **测试**：同源重复去重；两个消费者竞争；admission/session/prompt/event/outbox 各边界
  崩溃；**无 runner**；主负责人不匹配；旧任命/被撤权/Stop；**事件自环**；累计预算耗尽
  （单会话预算挡不住自激活）。

### F4 — 消费协议（本链最重的一块）

- **交付**：checkpoint 键含 workspace/Team/**任命代次**/消费者版本；server cursor 为
  十进制字符串且不与列表游标混用；baseline 版本与水位冻结；快照—事件衔接协议
  （不是两个 GET 拼起来）；按事件 id 幂等合并并处理删除与撤权；「已处理至 C」与
  该批已提交的提案/激活结果**原子关联**。
- **约束**：**增量读是带量化预算的容量验收要求，不是正确性前提**；首次、游标过期、
  消费者版本变更、授权变化与修复都允许**有界全量重建**；授权收缩先移除不可见数据。
- **测试**：checkpoint 保存前后崩溃、重放、长时间离线过期、baseline 构建期间写入、
  删除/撤权/新获授权、跨 Session/Team 隔离；给定固定 Team/Agent/事件规模断言 token、
  查询数与延迟预算。**不得再出现「几名 agent 就不可用」这类未实测断言。**

### F5 — 收件箱跨短会话恢复（先决定，再实现）

- **交付**：二选一并写进 ADR：**复用同一非终态 Session 直到终态**，或**显式修订
  ADR 0037** 引入有审计的 successor/re-delivery。
- **约束**：claim **不可转移**；**禁止原地改写 `claimedBySessionId`**；旧 claim 保留在
  原 Session，新输入与之相联。
- **测试**：claim 后崩溃/Stop；同 actor 两个 Session；错误 recipient；已 ACK 未回复；
  重复 report/reply 且**回执不伪造**。

### F6 — 两个薄工具与完整交付链

- **交付**：`get_chief`（**纯 Query**，返回 active Chief、appointmentId/revision、
  房间 id）与 `report_to_chief`（**Command**，投递 + 落回执 + 返回引用）。
- **约束**：交付链是 REST → contracts/SDK → route-policy/feature registry → MCP
  bindings → derived manifest（ADR 0042）→ 工具适配（ADR 0067）→ conformance；
  **只加 API 工具不算交付完成**。复用已有 `request_approval`，不新增同义工具。
  `report_to_chief` **只保证消息已提交**，返回当时的响应状态，**不代总管写 ACK，
  也不等模型完成**。
- **测试**：四种路由失败（无任命 / 越权 Team / 任命已变 / 幂等重放）各返回指定错误码；
  换届后重放不重复投递给新人；`get` 与 `post` 之间换届被事务重验拦住；工具适配器在
  unsupported / feature-disabled / revoked / Stopped / 重试 / 载荷超限下行为正确。

### 延后：F-memory（长期记忆）

跨会话注入面，需要自己的权限、来源与脱敏设计。**不是证明协调价值的前提**——先用
现有不可变上下文与受限派生摘要证明协调有用。详见 ADR 0078 的
「Memory is deferred out of the first version」。

## 延后项（保留任务边界，不进 v1）

| 项 | 前置 |
| --- | --- |
| C-identity 目录首管理员 | 必须先显式修订 ADR 0031：预授权 tenant+subject、OAuth state/回调约束、两入口进同一 singleton 锁与同一原子安装事务、安装后永久关闭、账号后续登录/解绑/应急恢复、审计保留真实 auth method |
| C-card 卡片内直接决策 | 必须先有身份绑定 ADR：`(provider, tenant, app, subject)` 复合键绑定已验证 Human；绑定/解绑只由活跃 Human 会话发起；每次回调重查绑定/活跃/workspace/Team/精确 recipient/源 revision/Session Stop；持久 delivery id + 请求摘要防重放 |
| C-mp 小程序 | 先只读 + 认证兼容 spike（ADR 0005 的 cookie/CSRF 路径能否在该客户端成立需先证明），不预先承诺"零新端点"；恢复时只对**已确认提交、同一 Human/workspace、body/revision 不变且结果未知**的操作复用原 key；未提交草稿或 stale preview 必须重新显示并由人确认（`CONTEXT.md` Draft 与 ADR 0055） |
| C-probe 真实模型探测 | 独立设计：受控 runner/worker、在任何数据库事务之外、绑定精确 connection+model revision、走既有出站策略、定义超时/费用上限/秘密脱敏/verified-failed-unknown |
| C-dingtalk / C-feishu / C-smtp | 各自独立 adapter 与验收，不得用 C2 冒充四渠道覆盖 |
| D-dark 暗色主题 | 0045 明确只做亮色；参考实测的暗色值已在 ADR 0077 预取，后续 ADR 直接继承，无需重新测量 |
| F-memory 长期记忆 | 跨会话注入面，需独立权限/来源/脱敏设计；先用现有不可变上下文与受限派生摘要证明协调价值（ADR 0078） |
| F-parallel 按 Team 切分协调 | 单任命是单写者点但**不串行推理**；扩容优先靠提交期去重，不要求用户拆业务 Team（ADR 0078 的 Alternatives） |

## 最小验收矩阵（逐项需填测试文件与用例名后方可开工）

| 类别 | A：查询/首跑 | B：凭据恢复/客户端 | C：投递与预置 |
|---|---|---|---|
| happy path | 对当前 Human/Team 返回可验证配置项；**无 assignment 不伪称离线** | 响应丢失/崩溃后恢复同一凭据 | 一个源事件→精确目标投递；动作复用既有源命令；预置仅填配置 |
| 未授权 actor | 跨 Team、他人 personal model，**不泄露存在性** | 只持 code + 公开 connection id 的另一 claimant 不得恢复；撤销后不返 secret | 错 tenant/subject、转发、解绑、离队、停用、错误 recipient 全拒 |
| 非法状态 | Query 无状态迁移；feature 关闭/模型 disabled/`unknown` 显式 | consumed/expired/revoked/rotating 各按冻结表处理，不新发 token | 已决定、过期卡片、已 Stop/终态 Session 全拒 |
| 重复幂等键 | 不适用（纯 GET） | 同 key 同体同 body；同 key 异体冲突；**新 key 仍被拒** | callback delivery id 同体去重、异体冲突；源命令 key 重放不重复决策/事件 |
| 陈旧 revision | freshness/ETag 明确；Query 的 revision 不当授权 | rotate/revoke 管理命令 stale revision；secret replay 绑定 generation，**不只比公开 connection id** | 旧卡 If-Match 拒；更新 preview 需人再确认；预置目录版本 stale 拒 |
| 事务失败 | 无业务写入，允许只读事务 | 凭据插入/consume/event/outbox/replay 各阶段注入失败，状态一致回滚 | target 配置、投递意图、决策中途失败无半记录；外发只在提交后 |
| webhook/job 重放 | invalidation 重放不增副作用 | 擦除/轮换 job 重放安全；**replay 不再次发 token/event/outbox** | source event / delivery / callback 分别验证；源命令与传输去重分层 |
| 并发 | 资源切换/撤权后重读不串 Team | 双 claim 恰好一代 credential；与 rotate/revoke/清理交错 | 两 worker 同投递、一成一败的渠道、两次相反审批 |
| 重启/outbox 恢复 | 新请求重建当前事实 | 服务端与客户端分别重启；原 key 仍有效；过期擦除后可恢复 | 提交前/后、外发成功未确认、checkpoint 前后崩溃；明确至少一次 |

**D 链（表现层，无领域/端点变更）的验收补充**：

| 类别 | 断言 |
|---|---|
| 基线门禁 | 未产出 D0 基线时，D1 不得开始（用 CI 或 checklist 强制） |
| 迁移顺序 | 旧 token 仍有消费方时禁止删除；先新增 → 再按面迁移 → 最后删除，顺序错即失败 |
| 视觉回归 | 每个面迁移后与 D0 基线做 diff 并人工评审；`theme-unification.spec.ts` 全绿 |
| 卡片结构 | 三区顺序固定；标题 `line-clamp: 2` 截断且卡片高度不变；`box-shadow: none` |
| 语义颜色 | 遍历全部看板状态，**只有** `awaiting_*` 渲染为 attention 色；blocked 色与 attention 色距离超阈值 |
| 布局 | 分隔线拖动不改 URL/焦点；隐藏与最大化状态跨会话保持；窄屏回退且就绪列表仍可达 |
| 交互 | 每个动作带 `Idempotency-Key` 与 `If-Match`；陈旧 revision 被拒；未授权 actor 在卡片上同样被拒；重复幂等键不产生第二次变更 |
| 反向断言 | **无确认的破坏性拖拽重置不存在**；拖卡进对话只插入引用、不自动提交 |

**F 链（总管 / agent graph）的验收补充**：

| 类别 | 断言 |
|---|---|
| 房间扩展 | 四种 subject 成功路径 + 跨 workspace/Team 拒绝；三种旧 subject 零回归；**普通执行 Session 不能借 Team 房间读兄弟 Session 私信**；撤权后房间/收件箱/事件/上下文同时收敛 |
| 迁移边界 | enum 扩展与其被引用**分属两个 entry**；旧 baseline/legacy 文件与 checksum 逐字节不变；每 entry 提交前后故障可重跑 |
| 能力完整性 | conformance 对 `capabilitySchema` 全量分区，**漏一项即失败**；任命不改 agent 原有授权；放宽是独立有审计的人工作为 |
| 授权绑定 | 人类自由文本**不执行**；结构化批准只作用于精确内容；换 target/capability/budget/revision 必须重批；两次消费只一次生效；同 key 重放无第二次效果 |
| 入口覆盖 | `delegate_work_item` / `claim_work_item` / `create_child_session` / retry / automation **五个入口全部**经共享 guard，撤权/Stop/换届下一律拒绝 |
| 0062 例外 | 已启用 YOLO 的 workspace 不会让总管分派被静默放行；`source=workspace_policy` 不被改写成 human |
| 激活 | 同源去重、消费者竞争、各边界崩溃、无 runner、主负责人不匹配、**事件自环**、累计预算耗尽 |
| 消费协议 | checkpoint 保存前后崩溃、重放、离线过期、baseline 构建期间写入、删除/撤权/新获授权、跨 Session/Team 隔离；固定规模下断言 token/查询数/延迟预算 |
| 路由 | 四种失败各返回指定错误码；换届后重放不投递给新人；`get`/`post` 之间换届被事务重验拦住 |
| 工具语义 | `get_chief` 无副作用；`report_to_chief` 不代总管写 ACK、不等模型完成；工具适配器在 unsupported/feature-off/revoked/Stopped/超限时行为正确 |
| 收件恢复 | claim 后崩溃/Stop 有确定结果；同 actor 双 Session 行为确定；回执不伪造 |

全量 `pnpm lint` / `typecheck` / `test` / `test:integration` / `test:e2e` 是最终
回归门槛，**不能代替**上表的新增断言。锁清单用 `UPDATE_AGENT_LOCK_MANIFEST=1`
重生成后**逐条审查**新增/变更 statement 的 owner、rankSequence 与 canonical lock
order，**不接受"只许行号位移"**，也不手改伪造匹配。迁移走
`packages/db/migrations/v1/NNNN_*.sql`，更新 ADR 0038 的 v1 checksum manifest
与 `SCHEMA.sql`，保留全部已应用迁移，测前一生产版本升级、空库、失败注入与旧
密文不回填。

## 风险与已知限制

| 风险 | 影响 | 缓解 |
|---|---|---|
| connector 是新包且要能装到无源码的 Lite 设备 | 多一个发布面 | 薄、复用 contracts、用 API 同一套夹具断言；**发布二进制本身是独立工作项** |
| 错误分类变更使既有断言需扩展 | 测试面大改 | 预期内 churn：恢复指令就是功能 |
| v1 只服务一个渠道 | 三个生态未覆盖 | 显式可见而非隐藏；抽象刻意窄 |
| 至少一次投递会产生重复通知 | 运维噪音 | 明说而非掩盖，给出对账路径；不谎称恰好一次 |
| 预置目录靠人保持正确 | base URL 可能过期 | 每条带来源 URL 与核对日期字段；不声称兼容性 |
| Runner 在线状态仍然 `unknown` | 用户拿不到该项结论 | 这是当前代码的事实；做成 ADR 0074 里点名的后续任务（需要独立心跳协议 + 迁移） |
| Lite 2 GB 足迹未实测 | ADR 0071 容量结论未验收 | 与本计划无关；但渠道 fan-out 在低档位的表现需纳入 `docs/operations/lite-footprint.md` 测量项。**该文件尚未创建**（ADR 0071 指定的验收门），`deploy/lite/` 目前只有 `README.md`，尚无其描述的 `backup.sh` / `restore.sh` / `measure.sh` |
| ADR 0072 未实现 | 无 Redis 档位下渠道不可用 | C1 测试里显式断言"不支持"，不静默降级 |
| **改 token 值 = 全站可见变化** | 视觉回归无从评审；有人会把色彩位移读成"变差" | **D0 基线是硬门禁**；先新增后迁移最后删；位移理由（暖中性 vs slate/蓝）在 ADR 0077 里可辩护 |
| **D 链最易被做歪** | 有人会照抄参考产品的 Tailwind classname，绕过 0028/0045 | ADR 0077 有"采纳/不采纳"对照表；code review 以此表为验收清单 |
| 卡片零阴影日后可能被"加手感"破坏 | 满屏卡片糊成一片 | D2 写成计算样式断言，而非注释 |
| **F 链会收窄 ADR 0062** | 已启用 YOLO 的 workspace 可能让总管分派被静默放行 | 0078 明确列为显式例外：只有 `source=human` 满足；`requestApproval` 自动批准与 pending reconciliation 不得自动批准此类动作；必测已启用/后启用 YOLO |
| **F 链可能修订 ADR 0037** | 收件恢复要么复用非终态会话、要么改既有 ADR | F5 **先决定再实现**，写进 ADR；禁止原地改写 `claimedBySessionId` |
| **F 链没有内建 runtime** | 没有 agent 持有效连接时总管无法启动 | 与 A1 的 Runner `unknown` 同源；A2/D4 必须在无任命或 feature 关闭时显示明确不可用态，不得让布局暗示"总管可用" |
| **F 链成本易被低估** | 「基本都有了」会让人把最重的消费协议当成接线 | 0078 的 Correction 段把六条被推翻的推断逐条列出；F4 单列为本链最重一块并给量化预算 |
| 单任命是单写者点 | 协调判断串行 | 只约束**身份**不约束推理；并行提案 + 提交期去重是扩容路径，不要求用户拆业务 Team |

## 演示步骤

1. `docker compose -f docker-compose.lite.yml up -d`，打开工作台 → 看到缺配置
   列表，**且 Runner 项显示为"无法判断"而不是"未就绪"**（旧行为无横幅）。
2. 只补模型 → 列表项减少；仓库项在非仓库工作台上显示"不适用"。
3. 造一个 Agent，令其在**拿到令牌前**崩溃 → 重跑同一条命令 → 拿到同一枚令牌
   （旧行为：`PAIRING_CONSUMED` 永久死路）。
4. 猜错 `--client` 类型 → 错误带可用类型枚举、可重试、且不计入锁定。
5. 配企业微信渠道，让一条待办出现在卡片上 → 点卡片**只跳转网页**，不在卡片上
   决策；把卡片转发给同事 → 同事点开只到自己有权看的页面，无任何决策写入。
6. 看板：把一张 `awaiting_review` 卡与其他状态的卡并排 → 只有前者是琥珀色；
   把已开始的卡拖回待开始列 → **出现确认面**（不静默清空记录）。
7. 卡片标题写超过两行 → 卡片高度不变，标题被截断；给卡片加 hover → **没有
   阴影**（D2 的承重约束生效）。
8. 拖动分隔线改变两栏比例 → URL 与焦点不变；最大化看板 → 退出后布局状态仍在。

## 规格分歧

- 本计划**不修改**任何既有领域不变量。0074 是 Query；0075 只改"谁做校验"与
  "客户端如何恢复"，不改服务端凭据语义（ADR 0043/0046/0031 实质保留）；
  0076 是新增传输面且 v1 无决策端点。
- 与 ADR 0062 的分歧：0062 把 enrollment 定为默认、pairing 为恢复通道。本计划
  v1 明确选 pairing 纵向路径并**写明这是本次范围选择**，不改 0062；enrollment
  恢复作为独立任务。
- 与 ADR 0031 的分歧：**没有**。目录首管理员已从 v1 移除，因此 0031 未被改写。
  未来若要做，必须先写一份显式修订 0031 的 ADR。
- 闸门在领域内是**咨询性**、在界面上是**强制的**。若 A1 的 `ready` 被误当作运行
  许可，是实现缺陷而非本设计意图；`CONTEXT.md` 的 View Model 规则是依据。
- **F 链是本批唯一的例外集合**：0078 明确把「总管分派」列为 **ADR 0062 的显式例外**
  （只有 `source=human` 满足），并可能**修订 ADR 0037** 的收件箱恢复语义。两处都写
  在 0078 的正文里而非藏进实现。**实现前需人确认这两处收窄。**
- F 链**不新增**人类本已有的权限，只是重组由谁行使；且把重组变成可审计的。
  任命本身不授予任何能力。
