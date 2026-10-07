# 激活、接入与国内生态：对抗式审查

审查日期：2026-10-07。结论：**当前稿不宜直接进入实现；B1 有独立发布价值，但按现有定义尚不能安全独立交付。**

审查范围是 ADR 0074、0075、0076 和同名开发计划。下文简称它们为 `0074`、`0075`、`0076`、`计划`，行号均对应本次读取的文件。逐一阅读了 `docs/adr/0001` 至 `0073`（包括两个 0028 和两个 0029 文件），并检查了 AGENTS.md、CONTEXT.md、相关 Agent Protocol/OpenAPI 契约及实际实现。根目录 `WORKMESH_PRD.md` 不存在，`rg --files -g '*PRD*'` 也未找到替代文件，因此不声称完成 PRD 一致性验证。

本次只做静态审查：未运行 Git 命令、pnpm 测试、生成器、迁移、网络平台验收或远端 WorkMesh 写入。既有测试源码仅作为实现意图的证据，不代表本次测试通过。唯一写入物是本 review；按本次只读授权，不执行 AGENTS.md 的远端双轨发布。

## blocking

### F01

- **[blocking] “同一 claim”缺少首次请求前可持有的身份证明，connection ID 不能解决丢响应恢复**
- 位置：0075:100–117、175–178；计划 B1:122–133。
- 事实：0075 用“connection it produced”定义 claim，又承诺客户端丢掉响应后换新 `Idempotency-Key` 仍能取回令牌。实际 `agentConnectionRedeemInputSchema` 只有 `pairingCode`、`agentSlug`、`client`，没有 claim ID 或恢复证明（`packages/contracts/src/index.ts:2711–2723`）。服务端由 `code_hash` 找到 pairing，再从 pairing 找 connection（`apps/api/src/agent-connections.ts:518–527`）。首次响应丢失时，客户端未必知道 connection ID；即使知道，ID 也不是秘密。当前重放绑定的是 key、subject、完整规范化 body、Origin/User-Agent（`apps/api/src/auth-idempotency.ts:205–216,285–304,343–352`），并非仅连接身份。ADR 0031:47–53 明确要求相同 key；ADR 0043:152–155 明确拒绝同 code 不同 key。新稿不是“照搬 0031”，而是改变凭据恢复授权。
- 影响：只根据原配对码和公开字段返回凭据，实质上让配对码在窗口内成为可重复取回安装令牌的 bearer；这正是 0075 Alternatives 声称拒绝的方案。反过来，要求响应才给出的 connection ID/恢复值，会保留原来的丢响应死路。
- 建议：B1 开工前二选一并写入契约。推荐 v1 先采用“客户端在发请求前原子持久化 key、规范化请求和上下文，重启后原样重放”，复用现有加密重放，无须新增 pairing 密文列。若必须支持新 key，单独冻结请求前生成并安全保存的高熵恢复证明、服务端不可逆绑定、完整 envelope 比对、并发归属、错误码和兼容规则；不得把 connection ID、slug 或 clientType 当作恢复证明。在 0075 增加明确的 `Supersedes ADR 0043 §2 ...`，说明与 0029/0031 的差异，同步 AGENT_PROTOCOL §3.4 和 OpenAPI 原有拒绝语义。测试必须包含：另一客户端只持原 code/公开 ID 无法取回令牌；首次响应完全丢失仍可恢复；相同 key 改 body 继续冲突。

### F02

- **[blocking] 渠道回调尚无“外部点击者 → 已有 Human Actor”的可信绑定**
- 位置：0076:57–76、82–95、118–130；计划 C1/C2。
- 事实：0076 只规定签名校验和“同一 Command”，目录身份又明确只用于首管理员、不做一般身份联邦。当前 Human 登录是服务端 cookie + CSRF（ADR 0005:7；`OPENAPI.yaml:195–242`）；审批命令要求 `meta.actor.kind === 'human'`（`apps/api/src/agent/commands.ts:3048–3050`），Human Inbox reply 要求精确 recipient（ADR 0053:24–35）。提供方的消息签名证明消息来自该应用，不能单独证明点击者对应哪个 WorkMesh Human、哪个 workspace，或是否仍有资源访问权。四份文档均没有 account-linking、外部租户/用户 ID 唯一绑定、解绑/撤权或回调 actor 解析契约。
- 影响：实现者只能另行发明身份桥接，容易把 channel target 的所有者当点击者、借 service actor 代签 Human、或让转发卡片的接收者取得审批权；“调用同一 Command”不能弥补伪造的 actor 输入。
- 建议：v1 渠道只投递低敏提醒与回到已登录 Web 的深链，暂不直接回传决策。若保留卡片动作，先增加独立身份绑定任务和 ADR：以提供方 tenant/app/subject 的稳定复合键绑定已验证的现有 Human；绑定/解绑由当前 Human 会话确认；每次回调重新检查绑定、Human 活跃性、workspace/Team、精确 recipient、原资源 revision/期限和适用的 Session Stop/委派状态；持久化 delivery ID + 请求摘要来防重放、拒绝同 ID 异体。未绑定、跨租户、转发给他人、解绑后旧卡、停用 Human、Stop 后动作均须拒绝且不产生决策。渠道签名身份与业务 Human 身份分开建模，不能复用首管理员 OAuth 来填这个缺口。

### F03

- **[blocking] 目录首管理员入口静默改写 bootstrap 授权，缺少“谁能成为首管理员”的条件**
- 位置：0076:118–130、206–217；计划 C4:192–197、规格分歧:238–242。
- 事实：ADR 0031:18–22 指定唯一生产凭据传输是 `X-WorkMesh-Bootstrap-Token`；:47–53 指定永久 singleton 关闭安装，且 changed credential 不得访问旧 replay；`OPENAPI.yaml:171–192` 仍声明这套契约。0076 允许企业目录 OAuth 成为首管理员来源，却只写“替换 credential transport”，没有预授权目录租户/subject、OAuth 回调绑定、首次安装争抢、与 bootstrap 并发、安装后重新登录/恢复方式。把“非 workspace 成员无可见性”用于首次安装并不定义入场授权：安装前所有目录用户都还不是成员。
- 影响：可能退化成“第一个完成企业 OAuth 的人接管实例”；两个入口还可能竞争创建不同管理员。目录来源管理员后续如何获得现有 password/session 路径也无实现依据。此处是安全政策变化，不只是 actor kind 保持不变。
- 建议：从 v1 删除目录首管理员路径，保留 bootstrap。后续 ADR 显式修订 0031，定义安装前由部署者配置的 tenant + 精确 subject/受控管理员群体、OAuth state/回调约束及所选协议适用的防重放机制；两个入口必须进入同一 singleton 锁和同一原子安装事务，安装后永久关闭。明确账号后续登录、解绑与应急恢复；审计必须保留真实认证来源。补充未授权目录用户、跨企业、伪造/重放回调、并发 bootstrap/OAuth、事务回滚、丢响应重放和已安装实例的反例测试。

## high

### F04

- **[high] 新增 pairing 密文不等于完成恢复：已有加密缓存与轮换/擦除规则必须一起处理**
- 位置：0075:51–62、200–228；计划 B1:122–133。
- 事实：“安装令牌只存在于响应里”作为存储事实不正确。`authIdempotentTransaction` 已在同一事务中对完整响应做 AES-256-GCM 加密并写 `auth_idempotency_records.replay_ciphertext`（`apps/api/src/auth-idempotency.ts:128–144,218,319–339`）；worker 在到期后擦除该表的密文/IV/tag/key metadata（`apps/worker/src/session-lifecycle.ts:672–690`）。pairing 表本身的确没有 claim 密文列（`packages/db/migrations/v1/0004_agent_connections.sql:60–73`；Drizzle `schema.ts:296–298`）。但现有 exact replay 在 :304 就返回，根本不再执行 redeem handler 的 consumed/revoked 检查。rotate/confirm 修改的是 connection 和 credential（`agent-connections.ts:702–735`），不是这份通用 auth replay。仅给 pairing 增列，不能实现“轮换后旧 claim 永不可重放”。
- 影响：新增、旧有两份密文可能有不同截止时间和撤销行为；新 key 被拒而原 key 仍取回旧令牌。旧令牌即使已不可用，也违反文档的“永不可重放”承诺。新列没有清理任务时，窗口关闭也不代表秘密已销毁。
- 建议：先将 Context 替换为：“明文只通过兑换响应交付；服务端已有 15 分钟加密 exact replay。缺口是客户端丢失稳定请求身份后的恢复。”若实施新 claim 存储，指定唯一 replay 权威或明确两种记录的关系，绑定 credential generation/ID，定义 rotate 请求、兑换、confirm、revoke、archive 各阶段是否允许解密；在旧 key 和新 key 两条路径都执行相同 fence。规定 AAD、密钥不可用/篡改失败、固定截止时间、到期擦除、升级时旧 pairing 不可凭空回填。增加旧 key/新 key × 轮换/撤销/过期/重启测试，成功 replay 不再发 credential、领域事件或 outbox。`replayable_until` 应来自同一个持久化截止时间，避免当前数据库 `now()+15min` 与 handler `Date.now()+15min` 两个时钟/时点各算一次。

### F05

- **[high] 四事实不能证明“Team 能运行”，Runner 事实在首次运行前也没有所述数据源**
- 位置：0074:20–23、51–65、81–101、168–179；计划 A1/A2 与演示步骤 1–2。
- 事实：当前 Runner 是按已分配 Agent Session 发送心跳；没有 assignment 时不会进入 heartbeat 循环（`apps/agent-runner/src/run-session.ts:332–357`），`workbench/runner/assignments` 读取已存在的 Session/Delegation/grant（`apps/api/src/workbench-runner.ts:88–109`）。当前 schema 的 heartbeat 在 Agent Session 上（`packages/db/src/schema.ts:321–324`），RunnerAttempt 是一次 Turn 的状态，不是安装后空闲 Runner 注册/在线表（`v1/0010_workbench_conversations.sql:85–115`）。所谓“已有 live Runner + build switch”没有给出可查询的部署在线事实，不能把 Session 心跳冒充 Runner 进程 liveness。另一方面，模型命令要求 `connection.status='active' AND model.enabled=true`，而新表只要求“不 revoked、有一个 model”（`apps/api/src/workbench-conversations.ts:150–166`）。Agent 活跃并不等于已有匹配的 Delegation/Session；仓库与 Project 不是所有工作的前提（ADR 0004:7、0024:13、AGENT_PROTOCOL:1746–1756）。四个互不关联的 EXISTS 也不能证明同一个执行组合可用。
- 影响：首次安装可能一直报 Runner 未就绪，用户为获得心跳必须先运行工作；已禁用模型或没有匹配 Session 时又可能错误显示 ready。把编程场景的仓库要求推广到整个 Team，会把合法的非仓库工作永久标为 blocked。由此生成的 resolver 和验收无法稳定实现。
- 建议：将 v1 定义改为“当前 Human / 选定 Team / 工作台场景的配置检查”，不承诺执行可用性；明确 `teamId` 或当前 conversation 上下文、personal/team/workspace 模型可见性、Agent Team grant、确切 feature 名、源字段、TTL 和 `unknown/not_applicable`。模型条件改为 active connection + enabled model。仓库检查仅对明确选择的仓库任务适用。Runner 无独立在线证据时返回 unknown，或拆出新的 Runner 注册/心跳协议任务并撤回零迁移承诺。最终命令仍自行授权，不因 banner 禁用既有合法操作。增加无 assignment 的空闲 Runner、模型 disabled、模型属于另一人/Team、四事实来自不兼容资源、无仓库合法任务、feature 关闭及过期心跳测试。把 A1“事务计数为 0”改为“无状态/事件/outbox/receipt 写入”；只读事务本身不违反 Query。

### F06

- **[high] B 链默认 enrollment，却只交付 pairing 恢复和缺少必需输入的 CLI**
- 位置：0075:84–96、124–139、219–223；计划 B1/B2/B4、拓扑:68–71。
- 事实：enrollment 输入是 `wme_` token + name/slug/client/manifest/requestedCapabilities（`packages/contracts/src/index.ts:2918–2930`），pairing 输入是 `wmp_` + agentSlug/client.version（:2711–2723）。计划命令只有 `--code <wmp_> --client <type>`，没有部署 origin、agentSlug 或这些字段的明确来源。发现文档也不会返回配对信封的 slug（`apps/api/src/agent-connections.ts:395–398`）。enrollment 成功写 `agent_enrollment_redemptions`，并不写 pairing（:919–971）；只给 pairing 增列不能修复被选为默认流程的 enrollment 丢 key 重试。现有配对码是 32 随机字节形成的 43 字符 payload，而不是方便手输的短码（`packages/db/src/index.ts:41`）。此外 `POST /agent-connections` 当前确实可以创建 Agent（`agent-connections.ts:443–469`），仅给 redeem 文档改名不会使整个连接创建流程变成“只绑定已有 Agent”。
- 影响：B2 无法按照“复用现有 schema、零领域逻辑”的交付要求构造合法请求；B1 修复的不是新默认入口。短码、二维码、origin 发现和创建权限的空白会在实施时变成未经审查的协议改动。
- 建议：v1 明确选 pairing 或 enrollment 中一条纵向路径，另一条保持兼容。推荐恢复型客户端先接受现有完整 connect URL + 显式 slug/client，或提供受信任的 server 配置；在首次请求前固化 client.version、body、key。暂不缩短 bearer 熵。若默认改 enrollment，则单列 enrollment replay 和输入收集任务，精确说明多次合法 enrollment 与同次恢复如何区分、恢复不再次扣预算。明确 `createAgentConnection` 继续可创建 Agent，还是按版本移除该行为；不能只改文档让调用方猜。CLI 要包含受保护的本地恢复状态、原子 secret 保存、失败阶段恢复、发布/安装方式和环境引用配置输出；源码 checkout 内 `pnpm --filter` 不是 Lite 无源码设备的安装方式。

### F07

- **[high] “把校验移进 CLI”与“客户端不再校验”互相矛盾，并改写已接受的 Skill 完整性边界**
- 位置：0075:131–145、187–191、242–243；计划 B2:139–143。
- 事实：计划说指纹比对、Skill pin、discover、verify 由 CLI 执行；0075:143–145 却要求调用方不再重算 SHA-256 prefix 或 Skill signature，只记录服务端字段。ADR 0043:143–146 要求保存 token 前比对指纹；ADR 0046:42–52 要求校验真实 Skill 原始字节，且在 `initialize → verify_connection → get_workmesh_context` 身份比较成功后才写配置。服务端返回一个 hash/signature 字符串不等于客户端验证下载的实际字节。
- 影响：可实现成“记录声明即通过”，导致损坏/被替换的 Skill 或错误凭据仍进入客户端配置；同一 B2 可以产生两个相反的实现。
- 建议：替换 0075:141–145 为：“人和模型不再手工计算；connector 仍自动校验 token 前缀及指纹、下载的 Skill 原始字节/hash/signature，并核对 bootstrap 返回的 Team、principal、profile、能力和实际认证凭据；全部通过后原子安装配置。”保留 0046 的 LF/raw bytes 规则和失败不覆盖既有配置；加入 Skill 字节篡改、签名错误、fingerprint 不符、错误 Team/Principal、旧 overlap 凭据误用及进程中断测试。若确实要撤掉这些校验，应另列安全决策、显式 supersede 0043/0046，不能称为交互简化。

### F08

- **[high] 根据 inventory 断言“两端点共用同一预算”不成立，B3 改错了限流维度**
- 位置：0075:19–21、156–166；计划证据表:50、B3:147–152。
- 事实：inventory:36–37 的确都标为 `endpointClass: 'pairing', subject: 'pairing'`，但实际 endpoint bucket 用 `operationId`（`apps/api/src/auth-rate-limit/limiter.ts:129–145`），subject-client bucket 用 `operationId + subject + clientIp`（:154–159），失败退避也包含 operationId（:122–125）。两个 operationId 不同，因此这些桶已经分离；共享的是 socket/client IP 桶。`subject: pairing` 只是输入提取规则，取 body.pairingCode 或 enrollmentToken（`plugin.ts:25–38,75–80`），不是恒定字符串预算。公开兑换请求也没有可信 Human/Agent 分类。另一个容易混淆的计数是数据库 attempts：当前正确 code 下 slug 或已知枚举 clientType 不匹配才累加（`agent-connections.ts:521–525,561–562`）；随机错误 code 不会累加某个合法 pairing 的 attempts。未知 client enum 在 Zod 处即被拒。
- 影响：只拆 endpointClass 不会消除同源 IP 互相影响；按调用方自报 Human/Agent 分桶可被绕过。把 mismatch 锁与凭据猜测限流混为一谈，还会使“8 次正确凭据猜测仍被拒”没有明确可测含义。
- 建议：把证据表替换为上述真实维度。B3 先保留 ADR 0030 的共享来源防滥用预算，只精确定义哪类 mismatch 不计入 pairing attempts，区分 wrong slug 与 wrong type。需要更细分预算时列出每个 bucket 的 key、capacity/refill、失败计数、信任来源和兼容策略，禁止用未认证 actor 标签。测试固定时钟和低阈值：耗尽 A 的 endpoint/subject 桶不影响 B；耗尽共享 IP 桶应影响二者；错误 code、wrong slug、wrong known type、未知 enum 分别断言；429 尊重 Retry-After；store 故障 fail closed。类型错误恢复应说明“部署支持类型”与“此 pairing 已绑定类型”不同，不能承诺枚举列表能纠正所有 envelope mismatch。

### F09

- **[high] 跨渠道“逐字节相同的审计/activity”不是可用验收，会掩盖 provenance 或重复决策**
- 位置：0076:61–64、208–209、236–239；计划:30、C1:169–173、C4:195、演示:232–233、规格分歧:243–245。
- 事实：ADR 0053:37–39 明确没有通用 Attention respond endpoint，而是多个现有 source command。审批命令产生 `approval_decisions`、revision、`approval.decision.recorded`，其中含 `decided_at`（`apps/api/src/agent/commands.ts:3168–3179`）；event 还保存 actor、correlationId、idempotencyKey（`packages/db/src/events.ts:114–159`）。审批已经被同一个 Human 决定后再次提交新动作会冲突（`commands.ts:3164–3168`）。这些事件没有“必定追加相同 Agent activity”的承诺。两个实际渠道操作不能在同一已修改的状态上各成功一次，再逐字比对随机 ID、时间和传输审计。bootstrap 与 OAuth 的认证来源也应不同。
- 影响：开发者可能删掉必要的渠道认证审计来满足字节相等，或误将一次正确冲突当渠道不成立；另一种结果是把两次不同操作错误去重。计划“测试不通过就撤渠道”把错误测试定义当成了架构纪律。
- 建议：用以下可执行契约替换：“对同一 actor、同一 source/revision、同一业务输入，在两个隔离且同构的数据库夹具中，经 Web 与渠道 adapter 调用同一源命令，规范化后领域结果、payload hash（该命令具有此字段时）、状态/revision 增量、领域事件类型/次数和 outbox 次数一致；仅允许明确列出的生成 ID、时间、correlation/transport provenance 不同。拒绝分支返回相同业务错误且无决策写入。”单独验证相同逻辑操作跨传输重放只执行一次；不同 key 的第二次投票正确冲突。按 Approval、Inbox reply、Decision、Completion Suggestion 等 source 列映射表，未支持的只给 Web 深链。Session 控制仍遵守 ADR 0055 的 preview、过期和显式重新确认，不能降为三句卡片摘要。C4 审计比较领域安装结果，保留 auth method 的真实差异。

### F10

- **[high] “复用 outbox”没有定义渠道扇出与恢复，不能把 Attention 投影接到现有 Redis 当消息队列**
- 位置：0076:25–28、72–76；计划:52、73–82、C1:164–173。
- 事实：Human Attention 是派生查询，明确没有自己的表、outbox stream 或 scheduler（ADR 0050:15–18,58–61）。当前 worker 的 Redis sink 只写 `{cursor,workspaceId}`，且做 MAXLEN 裁剪（`apps/worker/src/index.ts:249–258`），由 PostgreSQL outbox 独占 claim 后标 delivered（:291–325）。这是 ADR 0033 的 wake hint，不是 ADR 0007 初版中的完整 payload 队列。ADR 0037 的 Inbox claim/receipt 是特定 actor/session 的协作事实，也不是通用渠道投递队列。新稿写了目标和 attempt 表，但没定义源事件到投递意图的原子边界、重启扫描 checkpoint、多渠道相互隔离、投递前重新授权或提供方已成功而本地未确认的处理。仅 `(attention_id,target)` 唯一还没有说明同一 source 新 revision、同一 target 换接收人应重投、更新旧卡还是抑制。
- 影响：另起消费者争抢同一 outbox 会漏投；依赖 Redis hint 或在 GET Attention 时造投递，会分别丢失恢复能力或违反 Query 无副作用。排队后权限撤销仍按旧投影外发，会泄露数据。一个坏渠道还可能让已成功渠道重复通知。
- 建议：C1 冻结“来源事件 → PostgreSQL 投递意图 → 独立目标 attempt → 提交后外部发送 → fenced 确认”的协议，可复用已有 notification/push 模块但必须给出实际接点。由业务事务或具备持久 cursor 的 worker 产生意图，禁止 Attention GET 写入；每个目标独立重试、退避、超时 reclaim、终态/DLQ，重启不丢 checkpoint。发送前按目标 Human 重新授权并重建最小内容；卡片绑定原始 source revision，旧卡绝不自动批准最新内容。定义 revision/目标版本的 dedup 规则；外部系统不支持幂等时，只承诺至少一次并给出不确定结果对账，不能声称数据库唯一键保证外部恰好一次。测试进程在每个提交/发送边界崩溃、两个 worker 竞争、单渠道故障、撤权后抑制及重复 callback。引用 ADR 0033/0062；ADR 0072 目前仍 Proposed，无 Redis 档位未实装时应作为显式后续兼容门槛，不能标为已有能力。

### F11

- **[high] 模型“保存前真实验证密钥”是错误现状断言，不能顺手引入 API 出站探测**
- 位置：0076:134–141；计划 C4:193–197。
- 事实：`normalizeLlmBaseUrl` 确实存在（`apps/api/src/workbench-llm-connections.ts:49–69`），做协议/凭据/私有主机名单及路径规范化。POST 创建在 :176–200 加密存储 secret、追加事件并返回；PATCH 在 :220–246 更新；模型列表由 :274–310 的登记接口写入。这些路径没有向 provider 发验证请求。ADR 0065:48–50 甚至明确说明“当前 API 不向配置目标发送网络请求”，保存不等于出站探测通过。
- 影响：C4 会遗漏真正的 probe 工程量，或者把新增外部请求塞进持锁数据库事务；预置 URL 正确也不能证明 key 权限、模型可用、工具调用和双协议语义。
- 建议：将原句替换为：“保存执行格式与策略校验，不代表凭据或模型已经验证；预置仅填充可编辑配置。”v1 仅做数据目录，并列 provider/region/apiType/baseUrl/modelId 的来源 URL、核对日期及是否人工确认，不宣称通用兼容。如果需要验证，单列受控 Runner/worker probe 任务，提交意图后才访问外部，绑定精确 connection/model revision，使用既有出站策略，定义超时、费用/额度、秘密脱敏与 verified/failed/unknown 状态；与普通保存分开验收。

## medium

### F12

- **[medium] 计划尚无逐领域测试矩阵，锁清单“只许行号变化”与新增 SQL 的任务相冲突**
- 位置：计划 A1 DoD:105–106、B1:127–133、C1–C4 测试段；0076 Migration:219–227。
- 事实：B1 已列并发、重复 key 和回滚，不能说计划只有“全绿”；但未列重启/擦除/旧 key 撤销等分支，C 链也缺 stale revision、权限在排队后变化、并发投票、未知外部结果和重启恢复。`agent-lock-order-inventory.test.ts` 确实存在，环境变量**确实是** `UPDATE_AGENT_LOCK_MANIFEST`（:373–387）。它 pin 的不只有行号：statementId 包含 owner 和规范化 SQL 的 SHA-256，另有 class/rankSequence（:141–167），并检查完整集合（:390–392）。因此新增 ranked SQL 或修改语义时不可能只允许行号位移。迁移还受 ADR 0038 的 v1 checksum manifest 约束，不能只提任意“新增编号”。
- 影响：任务可以“执行原测试全绿”而漏掉新安全边界；或为满足错误的 manifest diff 限制回避必要的锁检查。不同被指派者对哪些 gate 适用没有共同定义。
- 建议：把下文测试矩阵复制到修订计划，逐项填测试文件/用例名和负责任务，不适用要写理由；全量 required checks 是最终回归门槛，不能代替这些新断言。锁清单要求改为“通过生成器重生成；逐条审查新增/变更 statement 的 owner、rankSequence 和 canonical lock order；无无依据 exemption”，不允手改伪造匹配。迁移用新的 `packages/db/migrations/v1/NNNN_*.sql`，更新 manifest/checksum 和 SCHEMA.sql includes，保留所有已应用迁移；测前一生产版本升级、空库、回滚失败注入和旧密文无回填。明确 reviewer/owner 和每项 DoD，而非只有 A1 有 DoD。

### F13

- **[medium] 新增可编辑配置没有对应写入契约，“零迁移/仅 seed”并未覆盖这些需求**
- 位置：0074:112–118、168–174；计划 A2:110–111；0076:143–145、219–222；计划 C4。
- 事实：A2 增加 workspace 级可编辑 starting prompts，但 A 链的交付只定义只读 activation API，并声称零迁移；没有指出复用哪个已存在配置字段、命令、权限或 revision。0076 同时说新增 preset records 表和“presets ... no migration beyond the seed”，未明确究竟是只读部署文件、seed 初始值还是可经 API 修改的实体。此处不是已证明必须迁移，而是持久化及修改边界未定义。AGENTS.md:66,97–110 要求领域配置变更有原子状态/事件/outbox、编号迁移（适用时）、幂等及 revision。
- 影响：实现者可能往任意 JSON 或浏览器 localStorage 填值、覆盖管理员定制 seed，或者把写入偷偷放进只读 A1；“纯 View Model”与“可编辑设置”混在同一验收中。
- 建议：v1 删除 workspace 可编辑提示，使用现有 i18n 文案；preset 选择有版本的只读部署目录，明确加载/覆盖/禁用规则，不建表、不在请求中修改。若保留编辑功能，拆独立配置任务，指定 owner/scope、GET/修订命令、Human 管理权限、If-Match、Idempotency-Key、过去时事件、outbox、秘密拒绝、迁移/seed 覆盖策略及并发测试；并撤回对应的零迁移绝对描述。

### F14

- **[medium] C 链交付与依赖图不自洽，小程序的身份和恢复验收也未封口**
- 位置：0076:78–85、97–116；计划:4–5、C2/C3/C4、依赖图:201–210。
- 事实：ADR 承诺四渠道，任务只有企业微信/钉钉，飞书与 SMTP 没有实施节点。C4 把新认证边界和纯数据预置绑在一起；C1 的投递/响应并未实际使用 activation，却被强制依赖 A2；图还把 B 链汇入 A2，与文字“A/B 独立”不一致。小程序“零新端点”没有 cookie/CSRF 会话实际接入证据，不能凭薄客户端定位证明可行（现有认证见 ADR 0005、OpenAPI auth 部分）。C3 要求重建会话后重放 pending command，却未区分已经明确提交但结果未知的操作与未提交草稿；CONTEXT.md:67–69 和 ADR 0055:19–21 禁止恢复后自动提交草稿/绕过 stale preview 的重新确认。
- 影响：C 链无法完整验收也难以独立指派；实现者可能为满足小程序“零新端点”绕过现有认证，或在用户恢复一张过时卡片时自动发起旧决策。无关依赖拖慢可独立发布的工作。
- 建议：将 C4 拆成 C-preset 与后续 C-identity；v1 只选一个通知渠道，其他三个和小程序明确标 deferred，或为每个补独立 adapter/验收节点。依赖改为 `A1 → A2`、`B恢复契约 → B服务端/客户端适配 → B文档`、`C投递契约 → 一个通知渠道`；不让 C-preset 或 B1 等 A2。小程序先做只读/auth 兼容 spike，不预先承诺零新端点；仅对已确认提交、同一 Human/workspace、body/revision 不变且结果未知的操作复用原 key，未提交草稿或 stale preview 必须重新显示并由 Human 确认。各节点补负责目录、输入/输出契约、可判定 DoD 与后续工作边界。外部平台域名/证书/登录能力和账号发布要求本次均**待验证**，不得当作已有事实。

## low

本次不单列 low finding。影响较小的事实限定已列在后面的核实台账；未发现的缺陷不为凑数补充。

## nit

### F15

- **[nit] 风险表引用了错误 ADR，章节定位也不稳定**
- 位置：计划:32、216；0074:33–37；计划证据表:41–42。
- 事实：claim 加密重放的威胁模型在 **0075:200–207**，不是计划:216 写的 0076。计划:32 引用“0076 第 5 节第 3 条”，实际该 ADR 没有编号第 5 节，只有标题 `Runners behind a network WorkMesh cannot dial` 下的第 3 条。0071/0072 文件存在，但二者 Status 都是 Proposed；当前 `auth-rate-limit/plugin.ts:53–59` 仍默认构建 Redis store，不能把 0072 视作已实现的无 Redis 档位。
- 影响：后续审查会追到错误安全理由，或将提案当作已经支持并验收的部署能力。
- 建议：修正 216 为 0075，并链接到确切标题；32 使用标题锚点；现状表区分“文件/Compose 已存在”“ADR Proposed”“运行时能力已实现”“设备验收通过”，不要用一个“已有”覆盖四种状态。

## 事实核实台账

以下包括确认正确的断言，避免将已实现能力误报成缺陷。

| 待核实断言 | 读取证据与结论 |
| --- | --- |
| 接入指令确为七步 | **正确。** `apps/web/app/lib/mcp-onboarding.ts:141–147` 明确编号 1–7，0075:32–45 的逐步转述基本一致。依次为 fragment 提取、discovery 校验、POST+fresh key 并保留 exact retry、指纹校验后 secret store 保存、配置 MCP URL/header、安装校验 pinned Skill、reload/verify/context。不能据此说所有校验都应该删除。 |
| “跨四种凭据形态” | **缺少分类依据。** 这段函数明确涉及 wmp_、Idempotency-Key、wmi_，另有 Skill hash/signature/manifest。后者是完整性证据，不都是认证凭据；请列出四个所指对象，或改为“多种 token、操作身份与完整性校验值”。 |
| 安装令牌生成/返回行号 | **正确但须限定。** `agent-connections.ts:529–539` 生成并保存 hash，:554 返回明文；普通 GET 不返明文。说“只通过兑换响应交付”可成立，说“服务端没有保存可恢复响应”错误，见 F04。enrollment 也生成/返回同类 token（:919–935,962–969）。 |
| consumed_at 同事务 | **正确。** :546 与 credential insert、:552 event 在 `authIdempotentTransaction` handler 内；该 helper 用 `withTx`，响应加密完成也在同事务（`auth-idempotency.ts:218,319–339`）。`appendEvent` 同事务插 event/outbox（`packages/db/src/events.ts:114–159`）。 |
| 15 分钟、逐字节相同响应体 | **确有承诺和实现。** :557 暴露 replay metadata；`auth-idempotency.ts:249,294–304,319–339` 持久化 15 分钟窗口、canonicalize 首次和重放体。既有 `stage5-agent-connections.integration.test.ts:333–335` 明确比较 `replay.body === first.body`；本次未执行。相同的是 body，不应推广到所有 HTTP header。两个截止时间分别计算的问题见 F04。 |
| 重放只按 caller key | **不完整。** caller key 是入口，但同 subject、operation、canonical request、client context 均要匹配；跨 subject 的 key 复用另有 advisory-lock fence（`auth-idempotency.ts:210–304`）。新 key 才会再次进入 consumed 检查。 |
| 新 key 后“永久锁死/不可恢复” | **限定后成立。** 新 key 不能再次兑换已消费 code；若原 key/body/context 仍在，窗口内现有实现已能恢复。不要把“丢失请求身份后的恢复缺口”写成所有响应丢失均无法恢复。 |
| 十分钟涵盖七步 | **错误。** `createPairing` 在 :358–365 创建十分钟 expiresAt，redeem 在 :523 检查；成功消费以后，步骤 4–7 不再带 pairing code。十分钟限制首次兑换，另有十五分钟 exact replay 和轮换 overlap；三者需分开描述。 |
| clientType 错计 attempts，8 次锁 | **正确但有边界。** :524 同时检查 slug/type；catch :561–562 在失败事务外累加，:521 从 8 起锁。未知 enum、错误 code、slug 不匹配不是同一种输入路径，见 F08。 |
| 两个端点共用预算 | **原推论错误。** 分类相同，operation/subject 预算已隔离，IP/socket 共用，见 F08。 |
| enrollment 强制并递增预算 | **正确。** :863 policy 行锁，:870–871 拒绝耗尽，:886–891 原子 `redemption_count+1` 且 SQL 再检查有效期/上限。不能再报“从未递增”；该计数与创建 Agent/connection 在同事务，后续失败回滚。 |
| normalizeLlmBaseUrl 存在 | **正确。** `workbench-llm-connections.ts:49–69` 定义，POST :182、PATCH :230 调用；不等于真实 provider probe，见 F11。 |
| 锁 inventory 测试/环境变量 | **均正确。** 文件存在，变量确为 `UPDATE_AGENT_LOCK_MANIFEST=1`（测试:373）。命令会写 manifest，本次没有执行；diff 限制不正确，见 F12。 |
| route-policy matrix 是否生成 | **是。** `scripts/generate-route-policy-artifacts.mts:8,167,186` 指定路径/生成标记/过期检查；根 `package.json:29–30` 的命令是 `pnpm generate:route-policy` / `pnpm check:route-policy`。本次未运行，未手改。 |
| 引用 ADR 编号/文件存在 | **全部存在。** 四文涉及的 0003/0004/0007/0012/0031/0037/0050/0053/0055/0071/0072/0074/0075/0076 均有相应文件，计划写出的完整 ADR 路径也存在。问题是引用意义和遗漏 supersession，非文件杜撰。 |
| pairing 没有加密 claim 响应列 | **正确。** DDL `v1/0004_agent_connections.sql:60–73` 与 `schema.ts:296–298` 都无此列；但 auth replay 表已有密文。哈希和 fingerprint 能匹配凭据，不能从哈希恢复明文。 |
| 全库国内关键词“零命中” | 本次对 apps/packages 的列举关键词未发现既有命中；对 docs 的忽略规则做了检查，`docs/adr/.gitignore` 内容为 `*`，普通全库 rg 不覆盖其中 ADR。显式纳入忽略的 docs 后，所列关键词命中这次新文档本身。**没有证据证明既有渠道适配器存在，也不能把关键词零命中提升为“国内模型代码和全部文档皆不存在”。** 例如 0065:52–54 已记录 MiniMax 中国区实测，关键词本身漏掉“中国区/MiniMax”。建议写清检索范围/排除项和能力分类。 |
| 没有既有通知管道 | 若读成这个意思则不正确。ADR 0062:30–32 已有 Human Web Push，旧 DDL `0016_stage4_usage_notifications.sql:6,85–103` 有 notification channel/delivery。国内卡片 adapter 未发现，不等于通知 delivery 必须从零重建。 |

## 既有 ADR 与领域不变量复核

| 决策组 | 本次判断 |
| --- | --- |
| 0001–0002、0006、0008–0027 | 新稿未明确取消运行时分离、REST/SSE、scope、Plan/Activity 不可变、lease 不授权、handoff/外部效果先提交等规则。C/B 仍须通过真实 source command；不能以“同一 Command”口号代替身份与事务实现。相关缺口见 F01/F02/F10。 |
| 0003、0007、0033、0037 | state/event/outbox 原子规则保留；现有 Redis 已是 wake hint，Attention/Inbox 不能当新渠道的持久队列，见 F10。 |
| 0004–0005、0028 route policy、0029 auth idempotency、0030–0031 | Actor 分离未被文字否定，但 OAuth 首管理员和渠道身份新增信任边界；B 新 key 恢复不能被称为 0031 原样复用。见 F01/F02/F03/F08。 |
| 0028 frontend、0029 rich-content、0032、0034–0042 | 没有发现明确的新库/样式替换或绕开分页/保留/恢复的决定；新增 schema 必须走 0038 v1 manifest。未提交草稿恢复不得自动提交；重新取投影不等于重新授权。 |
| 0043、0046、0047–0049、0062 | 同 code 不同 key 拒绝和客户端验证被新稿改变，必须显式修订；enrollment 已在 0062 被定为默认、manual pairing 为 recovery，0075 不应描述成首次发明这个选择。新稿没有授权重开 terminal Session、替换 responsible Human 或改变执行容量。 |
| 0050–0061、0063–0064 | Attention/Recovery/Control Center 仍为授权后的投影，无通用 respond command。0074 的 workbench 内横幅未与 0064 单一 shell/Next URL 权威直接冲突；resolver 应使用现有 canonical routes 并保留 Back/Forward/focus，不能再生一个 setup shell。卡片/小程序不得绕过 0055 preview/reissue，见 F09/F14。 |
| 0065–0069 | Workbench 模型、执行 Session 与 Runner 的来源必须区分；保存配置不证明真实 provider 验证；Skill 校验不能降为抄字段，见 F05/F07/F11。 |
| 0070–0072 | 没有要求换 artifact 存储，未发现与 0070 直接冲突。0071/0072 为 Proposed；不能在事实表把所有档位及资源验收都认定完成。C 应定义支持矩阵，不把 Redis 当持久权威。 |
| 0073 | 三份新 ADR 未改变 board_rank、列内排序、移动 revision 或 Agent 默认排序，**未发现直接冲突**。不能把 0073 对 layout re-spacing 的特定处理扩展成配置/渠道领域 mutation 可省事件的通用例外。 |
| CONTEXT / AGENTS | 未发现“租约授予授权”或“允许停止后继续普通写”的显式新决策；风险是 callback/claim 的身份输入未定义。Activation 可保持 View Model 身份，但其 ready 不得成为运行许可。已有命令继续检查 identity/session/delegation/capability/scope/approval/lease/revision/idempotency/Stop。 |

三份新 ADR 均包含 Status、Context、Decision、Alternatives、Consequences、Migration、Spec changes，格式完整；无须为了格式虚构 finding。0075 已明确新增编号迁移、更新 SCHEMA.sql 和空库/升级测试；问题是 lifecycle、checksum/lock manifest 和新配置写入的覆盖仍不足。

## 建议加入计划的最小验收矩阵

以下是待实现/待运行的断言，不是本次 PASS。每行在修订计划中指定测试文件、用例名和任务 owner；使用 fake channel/provider、可控时钟和隔离数据库，真实平台验收另列。

| 测试类别 | A：查询/首跑 | B：凭据恢复/客户端 | C：保留的通知、响应、配置或身份任务 |
| --- | --- | --- | --- |
| happy path | 对当前 Human/Team 返回可验证配置项；无 assignment 不伪称离线；不误挡非仓库工作 | 响应丢失、崩溃后恢复同一凭据；enrollment 若纳入则只扣一次预算 | 一个源事件生成精确目标投递；动作复用对应源命令；预置仅填配置 |
| 未授权 actor | 跨 Team、他人 personal model、无 visibility 不泄露存在性 | 只持 code/公开 connection ID 的另一 claimant 不得恢复；撤销后不返 secret | 错 tenant/subject、转发、解绑、离队、停用、错误 recipient 全拒绝 |
| 非法状态 | Query 无状态迁移；禁用 feature/模型与 unknown 显式 | consumed/expired/revoked/rotating/已归档策略按冻结表处理，不新发 token | 已决定、过期卡片、已 Stop/终态 Session、已关闭安装均拒绝 |
| 重复幂等键 | 不适用：纯 GET；如保留设置写入则单独覆盖 | 同 key 同体相同 body；同 key 异体冲突；新 key 是否允许由 F01 决定 | callback delivery ID 同体去重、异体冲突；源命令 key 重放不重复决策/事件 |
| 陈旧 revision | freshness/ETag 明确，不把 Query revision 当 grant | rotate/revoke 管理命令 stale revision；secret replay 绑定 generation，不能只比公开 connection ID | 旧卡 If-Match 拒绝；更新 preview 需 Human 再确认；target/preset 修改 stale revision 拒绝 |
| 事务失败 | 无业务写入；允许只读事务 | 在凭据插入/consume/event/outbox/replay 写入各阶段注入失败，所有状态一致回滚 | target 配置、投递意图、决策中途失败无半记录；外发只在提交后 |
| webhook/job 重放 | invalidation 重放不增副作用 | 擦除/轮换 job 重放安全；replay 不再次发 token/event/outbox | source event、delivery、callback 重放分别验证；源命令与 transport 去重分层 |
| 并发 | 资源切换/撤权后重读不串 Team | 双 claim 恰好一代 credential；与 rotate/revoke/过期清理交错；enrollment 上限不超支 | 两 worker 同投递、有一成功一失败的渠道、两次相反审批、双入口安装竞争 |
| 重启/outbox 恢复 | 新请求重建当前事实；缓存失效可说明 | 服务端和客户端分别重启；原 key/恢复证明仍有效；过期密文擦除可恢复 | 提交前/后、外发成功未确认、checkpoint 保存前后崩溃；明确至少一次与不确定结果 |

此外：A2 路由回退/键盘/窄屏和 i18n；B2 stdout/stderr/配置/恢复文件无明文泄漏及 Skill 篡改；C 的签名/回调时窗、内容最小化、平台 payload 上限和配置秘密脱敏分别指定用例。若 v1 删除对应功能，删除其发布门槛但保留后续任务，不用空泛“全绿”替代。

## 必须修（blocking + high，建议顺序）

1. **F01 + F04**：先定恢复身份和唯一 replay lifecycle，再决定 B1 是否需要数据库变更；明确对 0043 的修订以及旧 key 的轮换/撤销行为。
2. **F06 + F07**：选择 B 的真实默认协议，补齐 CLI 输入/部署/持久化契约，保留自动完整性验证。此后 B 的最小闭环可以独立发布，不依赖 A/C。
3. **F08**：纠正 limiter 事实和测试，移除按分类名即可隔离预算的错误方案。
4. **F05 + F11**：把配置存在、执行权限、Runner 在线和模型实测四种证据分开；改正 activation 判定和已验证模型的假设。
5. **F02 + F03**：v1 移出渠道直接决策和目录首管理员；若保留，先完成独立身份/安全契约及显式 supersession。
6. **F10 + F09**：定义源事件到独立投递意图的持久链路，再用规范化领域等价断言代替跨操作逐字节一致。

**B1 能否独立先发：有条件可以。** 保留原 key 的客户端可靠恢复可以作为小切片；新 key 取回凭据则至少需要 F01/F04 的契约、迁移/清理/回放 fence、旧客户端兼容和针对性安全测试。当前 B1 仅“加一列密文”的任务体不满足独立交付条件，也没有覆盖将被设为默认的 enrollment 路径。

## 建议砍（移出 v1）

- 目录 OAuth 创建首管理员，以及伴随的账号登录/恢复体系。
- 小程序完整客户端；先验证认证和只读恢复，再决定正式范围。
- 四渠道同时上线。先一个渠道做低敏通知 + Web 深链；企业微信/钉钉交互动作、飞书、SMTP 分别后续交付，不用 C2 冒充覆盖四渠道。
- 新的短码协议、换客户端类型/权限的重新绑定协议；先使用现有高熵信封和明确参数。
- workspace 可编辑 starting prompts、可在线 CRUD 的 preset 聚合；先固定文案和版本化只读目录。
- 把“模型保存前真实探测”塞入预置任务；独立 probe 设计后再做。
- 若暂无必须换 key 的产品需求，先砍新服务端 claim 密文副本，交付客户端稳定幂等身份和错误恢复；不能因为已有密文就断言无需评审恢复安全边界。

## 一句话总评

方向有价值，但当前稿把若干错误现状断言、未定义的身份桥接和不可执行的等同性验收当成了已解决前提；先收敛为可证明的接入恢复、诚实的配置检查和一个通知渠道，再扩展生态。
