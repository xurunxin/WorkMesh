# todos.dev WorkMesh 17 条任务审查与可执行修订

审查日期：2026-10-07。任务描述唯一依据：`G:\Projects\MetronX\todos-dev-analysis\tools\todos-readback.md`。下文 `#1`–`#17` 是该文件的编号，P0/B1 等为任务代号；代码路径相对 `G:\Projects\MetronX\WorkMesh`。

本次只读源码、规格和平台信息，只写本报告；未执行 Git 操作、构建、测试、权限变更、任务更新或调度。测试表评价的是**任务要求是否覆盖**，不是运行结果。代码与现有测试文件被读到不等于测试通过。

结论：17 不是天然过多或过少，但当前不是一套可直接启动的执行图。主要问题是连接器验收互相冲突、UI 混入新事务语义、渠道任务混入已延期的身份回调，以及缺失交付任务和人工门禁。建议调整粒度，不为维持“17”而凑数。

## blocking

### F01 **[blocking] B1/B2 的秘密存储与提交顺序不能同时满足，且弱于 Accepted ADR 0046**

- **位置**：#5 B1、#6 B2；回读文件 188–207、233–250 行；ADR 0046:44–54。
- **事实**：B1 要保存“精确规范化 body”，却又写“恢复文件不得包含明文令牌以外的任何秘密”。实际 body 必含 `pairingCode`，见 `packages/contracts/src/index.ts:2711–2723`；这也是秘密。B2 又要求“恢复文件/配置均无明文令牌”。B2 顺序是“claim → 记录 → 校验 → 写配置 → 验证”，且允许指纹和 Skill 两项通过就 rename；ADR 0046:52 明确正式配置须在原始 Skill 校验及 `initialize → verify_connection → get_workmesh_context` 身份比对之后写入。B2 自己还要求错误 Team/principal 时不写配置。现有 `apps/connector` 目录不存在，B1 单独交付的持久化层也尚无可供用户执行的接入命令。
- **影响**：agent 必须自行选择违反哪一条；可能在验证身份前替换有效配置，或把长期安装令牌写进恢复文件。B1 还无法凭一个未接入的模块证明“独立先发”的用户收益。
- **建议**：合并 B1/B2 为一个可执行连接器纵向任务，保留两个内部检查点。替换关键段落为：

> 首次网络发送前持久化原始请求身份：随机 Idempotency-Key、包含完整 `wmp_` 配对码的精确请求 body、origin、user-agent。该记录按敏感材料保护，不含 `wmi_` 安装令牌、不输出到日志或工件。POSIX 用 0600；Windows 明确定义当前用户专用 ACL 并验证实际访问权限，不能仅凭 mode=0600 宣称保护成立。先写临时文件再原子替换；并发启动只能取得同一个 pending 身份。
>
> 从 pending 记录发送/重放。收到安装令牌后先验证指纹，在内存中完成 discovery、Skill 原始字节/哈希/签名，以及 initialize → verify_connection → get_workmesh_context；校验精确 Team、principal、profile、Skill、capabilities 和 authenticated_credential，拒绝误用旧 overlap 凭据。全部通过后将令牌交给客户端秘密存储，正式配置只保存秘密引用。为秘密存储与配置替换定义失败补偿；任何失败保留原配置和原秘密引用。pending 在成功或明确终止后按定义清除。窗口外转人工重新发起合法配对，不建议对同一已消费 code 换 key。
>
> stdout/stderr/普通配置/工件不含明文安装令牌。配对码仅允许存在于受保护的 pending 记录；秘密存储是安装令牌的唯一持久化落点。

补充：`auth-idempotency.ts:285–304` 在命中时直接解密返回，并不重新执行兑换 handler 的 revoke 检查；`agent-connections.ts:527–528` 的检查在 handler 内。因此不要把本地计划矩阵中的“撤销后不返 secret”当作既有重放保证。应测试“旧响应可能重放，但当前身份验证拒绝已撤销/过期凭据，绝不写入新配置”。若必须改变服务端重放内容/可见性，应另立安全契约，不能藏在“服务端不改”的 B1 内。本次未做运行时撤销重放实验。

### F02 **[blocking] D5 要求跨卡片原子提交，却承诺不改端点和领域**

- **位置**：#14 D5；回读文件 569–589 行；本地计划 123–127、298–309 行；ADR 0077 的 Migration。
- **事实**：任务要求“修饰键多选跨列移动原子性”。当前 `apps/web/features/work-items/move-command.ts:23–35,60–78` 对单个 `/work-items/{id}` 发 PATCH；`apps/api/src/commands.ts:872–879,967–978` 每次调用独立事务提交。检查 `OPENAPI.yaml`、contracts、server 与该前端模块，未发现 WorkItem 批量原子移动契约。另一方面，复制链接、拖卡入输入框属于本地交互，任务却要求“每个动作带 Idempotency-Key 与 If-Match”。
- **影响**：串发/并发多个 PATCH 都不能提供全批次原子性。实现者要么伪造通过，要么越界新增批量事务。为插入草稿制造服务端 Command 也与 Draft 边界冲突。
- **建议**：D5 拆为两个可独立验收的实现任务，并采用以下 v1 边界：

> D5a：状态化主动作与菜单。先给出“展示条件 → 既有受治理命令 → 所需 revision → 确认面”的映射。仅领域写入调用带稳定幂等键和 revision 的既有命令；导航、复制链接、插入引用不发领域 mutation。
>
> D5b：拖拽、多选和拖卡入对话。复用现有单项移动适配器；批量操作逐项提交并展示逐项结果，部分失败保留失败项和恢复入口，成功项不伪装回滚。网络结果未知只重放原请求；409 重新展示当前数据并由人确认。拖卡入对话只修改草稿，不自动发送。

将“批量移动原子性”替换为上述“逐项结果与部分失败恢复”。若用户坚持全批次原子，则增加独立 ADR/后端任务，定义批次键、每项 revision、锁顺序、授权、事件和回滚，明确改变 ADR 0077 的纯表现层边界后再实现。ADR 0053:41–47 的批量审批是另一种业务，但其“逐项授权、逐项结果”可作为交互先例，不能冒称已经有批量移动 API。

## high

### F03 **[high] 依赖没有环，但存在悬空交付、无效串行链和不完整的审查门禁**

- **位置**：#1–#4、#7、#9、#13–#17；本地计划 100–127、193–200 行。
- **事实**：从权威回读解析全部 `blocks` 得到 **无环**，悬空节点为 **B4、C4**。B4 是本地计划确有的接入文档任务；C4 在本地计划与 17 条中均无定义。B2 说发布带版本二进制是独立工作项，但这 17 条没有该项。远端新增 `D5 → C1 → C2 → C3`，而本地计划明确 C3 独立、D 链与其他链独立。R1 只 `blocks S1`，依靠 S1 间接卡实现；P1 与 R1 之间没有事实冻结依赖。D4 要验 A2 在窄屏可达，却没有说明何时做两者集成。P0 一边阻塞 P1，一边 B1 写“不依赖 P0、可独立先发”。
- **影响**：二进制和文档无人交付；模型目录被无关 UI 与渠道工作压到最后。若移除不合理的 Skill 硬前置，审查又会失去实现门禁。报告完成/权限配置完成也不能保证代码已经进入后续构建的 base。
- **建议**：按下文“替换依赖图”重写两端依赖，使用真实 todoId，不依赖临时 #编号。补一条 B-ship，包含带版本工件、安装路径、干净无源码环境验收和 B4 文档；删除 C4 引用。P1 先产事实表，R1 在该表上审查，blocking/high 的处置同步回 spec 后才放行相关实现。D0 可先采集。A2 与 D4 允许独立实现，但组合验收必须同时包含两者的已合入版本。

> 每条增加：`requires`（todoId + 所需工件/已合入版本）、`blocks`、`owner`、`withPlan`、方案关口验收、改动关口验收。未满足 requires 时不入执行队列。上游若只产报告，明确接受报告即可；上游若产代码，下游开始前须确认该代码已进入自己的 base。文字依赖不是平台自动调度约束，由总管在派发前逐项读回核对。

当前 MCP 暴露的 31 个工具没有创建关系工具；这只证明**本会话可见 MCP 工具集**没有，不证明整个产品永远没有关联能力。无需为补一个依赖图拆成多个项目。

### F04 **[high] P0 是必要的交付预检，但当前授权方案不最小，且不能解除 S1 的硬阻塞**

- **位置**：#1 P0、#4 S1、#5 B1，以及所有会产仓库改动的任务。
- **事实**：实时 `agents(full=true)` 确认五人全为 `tools: none`。官方说明没有 push/merge/tag 权限的 agent 可以在自己的 checkout 工作，但不会发布。[GitHub 文档](https://todos.dev/docs/github) P0 却把推送授权给只读“独立审查”，把 merge/tag 预先授予主力，同时排除写 Skill；S1 的 DoD 又是“技能入库且被至少一个 agent 加载”。S1 虽有管理员代建退路，但没有指定代建人、交接物与完成时点。P0 把机器与 agent“双开关”写成通用验证，官方双开关指的是 remote shell，并非所有 Git 权限。[权限文档](https://todos.dev/docs/permissions)
- **影响**：实现可以在本地做，远端交付会停；把 P0 放在 backlog 不会自动产生管理员行动。开发角色分配给快速修复/探索后，它们也缺 push。S1 可能无限等待；反而授予审查者多余写权限。
- **建议**：P0 改成管理员执行的“交付路径预检”，不作为代码构建任务：

> 管理员：RunXin Xu（或明确的受托管理员）。为实际需要发布仓库成果的 agent 按任务授予 push；独立审查保持只读。merge 由人审核后经平台关口触发，只有确定由哪个 agent 执行合并时才给该角色所需权限；tag 仅在 B-ship 的真实版本发布确有需要时授权。保留 remote shell 和团队密钥默认关闭。
>
> 回读 grants 并在下一轮确认生效；分别核对 GitHub App 仓库访问、分支保护与审核路径。不开 remote shell 不影响 build 内执行。授权完成前可做只读探索、方案和本地实现，但不得把它们标成“已发布”。

P0 无需“每条填仓库测试文件名”；改为平台检查项、实际回读与阻塞原因记录。本次只核实开关，不尝试推送。

S1 从实现硬前置移除，保留为可选流程资产任务；可先产文件夹，再由指定管理员网页导入，或在明确授权后由一个 agent 创建。验收必须包含 skillId、加载证据和另一任务的实际复用，不能把“记录待代建”算作“入库完成”。官方支持从磁盘导入并按 agent 设置默认技能。[Skills 文档](https://todos.dev/docs/skills)

### F05 **[high] C1/C2 缺少目标配置的责任归属，并重新带入已延期的回调身份系统**

- **位置**：#15 C1、#16 C2、ADR 0076:117–137,211–235。
- **事实**：C1 交付只有 intent/attempt/worker；C2 只有低敏通知与深链。ADR 0076 另要求 channel target CRUD，但两条都没承接配置入口、目标 Human 到渠道地址的投递映射、禁用/删除/秘密管理。C1 还验“并发相反审批”“重复回调”；C2 验签名、回调时窗、未绑定/解绑，而其背景明确当前没有身份绑定契约，且 v1 无卡片决策。C1 写“两 worker 竞争→每目标仅一次”，同时声明至少一次，未区分唯一 attempt 与外部送达。ADR Migration 又把 `preset records` 列进“New tables”，随后说预置无文件以外迁移，和 #17“不建表”冲突。
- **影响**：agent 为了达到测试清单可能新增不在范围内的身份桥接与决策回调；也可能只能写死企业微信目标才能演示。未定义的配置 CRUD 会让九类矩阵与迁移验收全部遗漏。外部超时重试被误写成恰好一次。
- **建议**：C1 保留一条 durable delivery 纵向任务，以 fake sink 独立验收；C2 保留一条实际适配器任务。不要按数据库/API/worker 横向拆成只能互等的三条。两者进入方案确认时必须冻结下列分工：

> C1 负责 target 的配置契约/管理入口、授权、revision、幂等、秘密引用/脱敏、禁用后的抑制；定义 source event → recipient Human → channel target 的选择规则。目标地址映射仅用于投递，不授予点击者 Human 身份。明确它与现有 notifications/notification_deliveries 的复用和增量迁移关系。
>
> C2 负责一个明确选定的企业微信出站协议、载荷/错误映射/限流/超时处理与登录网页深链。若只需出站，删除入站签名、回调和绑定/解绑测试；保留目标撤销/停用/离队、转发后按当前登录 Human 鉴权和零决策写入测试。如选型确需非决策回调，先列真实端点、用途与 provider 官方协议，才增加对应签名/重放测试，禁止借此实现身份绑定。
>
> 同一 intent/target 只产生一个逻辑 attempt；正常竞争只允许有效持有者处理；旧 fence 的 ack 被拒。外部发送成功但未确认时允许至少一次重送，持久标明结果不确定并提供对账路径，不以“外部只收到一次”验收所有崩溃情形。

将“相反审批”移到未来 C-card；把 C1 的重放测试改成 source-event、fan-out、job、ack 的同体去重/异体冲突和崩溃恢复。ADR 0076 删除 `preset records` 新表字样。补空库、前一生产版本升级、失败回滚、SCHEMA 与 checksum manifest 的验收。

复用必须具体：现有 `apps/worker/src/automation.ts:677–716` 已有带 `claim_fence` 的超时 reclaim，760–784 有 fenced delivered + event，808–823 有独立退避；`schema.ts:534–543` 已有 delivery、fence、effectKey 与按设备 Web Push。它们不等于新渠道已经完成，但也不能只写一句“不是从零”，然后默认另建一套全部相同的 worker。

### F06 **[high] D2 的状态词汇不属于同一个模型，可能把 Human Attention 错画成工作流状态**

- **位置**：#12 D2；#14 D5 的状态化主动作；ADR 0077 的单暖色段。
- **事实**：D2 列出 `pending/running/queued/done/closed/awaiting_review/awaiting_approval` 并要求遍历所有看板状态、只有 `awaiting_*` 着 attention 色。当前 WorkItem category 是 `backlog/planned/started/completed/canceled`；Agent Session 是 `queued/acknowledged/planning/executing/awaiting_input/awaiting_approval/...`，均没有 `awaiting_review` 这个固定状态（`packages/contracts/src/index.ts:146–152`）。`view-model.ts:61–76` 分别保留 statusCategory 与 activeAgentState。需要人处理的 completion_review、clarification、conflict/recovery 则来自 ADR 0050:20–30 的授权投影，并不全以 awaiting 开头。
- **影响**：按字符串前缀写测试会漏掉真正需要人的工作；还可能把 Session 状态回写到 WorkItem 列，破坏 0028 与领域不变量。遍历一个虚构枚举“全绿”不构成产品验收。
- **建议**：保留 D2 与原 D3 的合并，但先冻结实际输入到视觉语义的映射：

> WorkItem 工作流、Agent 执行状态、当前 Human 可见的 Attention 分开展示。attention 色用于已授权投影判定“当前需要 Human 响应”的标识，不以状态名 `awaiting_*` 推断，也不改变工作流列。若本批确实只突出两个人工关口，应显式列出其来源类型与状态；其余 clarification/recovery 的展示另列，不把两关口冒称全部 Human Attention。

覆盖实际 category/session 枚举、多个 Session、无 Session、open/expired/decided Attention、其他 Human 的隐藏 attention。主动作复用 source response descriptor 和既有 command；UI 可用性不授予权限。

### F07 **[high] R1 没承接真正的方案批准，ADR 0077 还否认了对 0064 视觉基线的改变**

- **位置**：#3 R1、#11 D1、#13 D4；ADR 0064:15–17,70–71；ADR 0077 开头及视觉迁移段。
- **事实**：R1 的 DoD 只要求 blocking 有处置，不要求 high 处置和修改后复核；17 条没有明确 `withPlan`。实时 MCP 的 `run_builds` 中 `withPlan` 默认 **false**。`run_review` 只在 confirm/review 关口运行，意见会触发原作者修订；`confirm_builds` 和 `merge_builds` 是人的批准动作。ADR 0064 将既有 HCP tokens/production density 定为视觉 authority，并拒绝新 theme；0077 一方面说不重决 0064，一方面计划替换全站颜色与结构。
- **影响**：仅有一张“独立审查”卡不保证实现会停在方案关口，也不保证后续 diff 被审。对旧视觉决定的实际调整没有得到明确记录，审查者与实现者会按相反标准验收。
- **建议**：R1 改为“事实冻结后的规格裁决”，blocking/high 全部有明确 owner 和处置，修订同步后复核；提出“接受风险”不能自动等同用户批准。0077 增加显式 amendment：本次只替换 0064 的视觉值/卡片与布局目标，保留统一 shell、URL ownership、授权 read model、信息架构；不改变 0028 的 CSS/依赖规则。D0 仍以改前生产 UI 为基线，D1 以人批准的新映射为目标。

将下文每条 `withPlan` 和 review 要求写进派发清单。高风险任务先 confirm，改动后再 review；AI critique 不能代替任一人工关口。无需给只读审查者 push 权限。

### F08 **[high] 本地与远端不是同一份计划，构建所需外部证据也没有可搬运交接物**

- **位置**：全部任务的“本地 source of truth”尾注；#4 S1、#9–#14；本地计划任务图；AGENTS.md 双轨段。
- **事实**：远端增加 P0/P1/R1/S1、合并 D2/D3、丢失 B4，并修改 C/D 依赖；本地 source of truth 仍是旧任务图。统一尾注宣称“本条描述为该任务全文”不能使两个版本相同。D0/D1/D4 依赖 `G:\Projects\MetronX\todos-dev-analysis\...`，它不在 WorkMesh checkout 内。实时 `machines` 报告 build 仓库位于 `C:\Users\xurx\.tds\workspaces`，remote shell off；所有 agent 无额外 MCP connection。官方 GitHub 文档说明每次 build 从 base branch 独立建分支。
- **影响**：某 agent 按本地计划、另一个按远端 spec 执行，会出现不同依赖与 DoD。远端构建能否拿到 ADR 新稿、测量文件、截图尚未证明。不能因机器同名就假定隔离 build 能读 G 盘任意资料。
- **建议**：由 P1/R1 的修订成果提供一个**经批准、可在 build 内读取的交接包**：四 ADR、修订计划、断言表、设计 tokens、卡片规范、必要截图和文件哈希/版本，使用仓库内受控路径或任务附件。核对 main/base 实际包含所需规格；未核对前标“待验证”，本次没有 Git 检查，也不声称文件未提交。

> 本地每个任务用稳定 task key 对应真实 todoId；远端描述保留对应任务完整正文、测试与 DoD。变更两端一起修订并记录版本。AGENTS.md 明指 WorkMesh Project/WorkItem 为控制面；todos.dev 的同名项目不能天然替代它。实施前明确记录本批是“todos 编排 + WorkMesh 追踪”还是经用户批准切换控制面，并提供所需受限连接/交接路径。不要让 agent 为遵守双轨规范临场创造第二套计划。

这是一项执行前资料可达性与责任边界检查，不是建议开启远程 shell 或给所有 agent 团队密钥。

## medium

### F09 **[medium] 已核实的事实仍有两处错误，断言台账也没有稳定编号**

- **位置**：#7 B3、#10 D0；#2 P1；本地计划“审查撤回”与事实表。
- **事实**：`limiter.ts:122–126` 的失败 key 为 `operationId + clientIp + subject`，故 #7“共用失败退避”错误；endpoint 与 subject-client 分桶的主结论是对的。#10 称 0071“Proposed 且未实现”，但 `docker-compose.lite.yml`、`infra/docker/lite.Dockerfile`、`scripts/validate-lite-compose.mjs` 都存在且有实现，`package.json:17,36–37` 已接验证器。确实仍缺 `docs/operations/lite-footprint.md`，`deploy/lite` 只有 README。P1 写 16 条，用户描述 18 处，而本地计划事实表 77–98 行实际是 22 个事实条目（不是 22 个独立代码定位）。
- **影响**：第三次事实核实可能继续只检查旧计数；错误退避测试会要求改对的实现；把未验收说成未实现会导致重复开发 Lite。
- **建议**：替换为：

> endpoint 桶、subject-client 桶及失败退避均包含 operationId，按操作隔离；socket/client-IP 桶跨操作共享。固定时钟、保持共享桶未耗尽，单独验证一操作失败退避不抑制另一操作；再单独验证共享桶影响两者。无需拆 endpointClass。
>
> ADR 0071 状态仍为 Proposed，但 Lite Compose、镜像与静态验证入口已有代码；足迹验收与指定备份/恢复/测量脚本尚缺。本次不判定 Lite 已部署或已验收。0072 默认 Redis 依赖仍存在，不能据此承诺无 Redis 可运行。

P1 标题改“核实本批所有事实断言并冻结证据台账”。用断言 ID、原句、来源任务、当前代码、结论、修订、复核日期闭环，不以写死 16/18 作为验收。下文给出第三遍核对结果。

### F10 **[medium] A2 的消失条件与 Runner 恒 unknown 未定义，容易得到永不消失的横幅**

- **位置**：#8 A1、#9 A2；ADR 0074 的三态表和首跑面。
- **事实**：A1 明确 Runner v1 恒 `unknown`；A2 的 e2e 是“逐项补齐→横幅消失”，但未定义 unknown 算不算 unmet、如何计数；A1 约束还使用没有列入响应枚举的 `unmet`。这不是 Runner 必须报 ready 的证据。
- **影响**：一个实现把 unknown 算待配置会永远无法通过验收；另一个完全隐藏 unknown 又背离“平台不知道时明说”。
- **建议**：明确：`blocked` 进入待配置计数及操作清单；`not_applicable` 不计数；`unknown` 展示中性说明，不算待完成项、不阻止工作、不触发强制 setup。所有 blocked 清零时缺配置横幅消失，Runner 的未知说明仍有可达位置。四态之外不输出 `unmet`；该词仅作为 UI 对 blocked 的文案概念。再补换 Team/登出清缓存、撤权后重读、旧请求迟到不得覆盖新上下文、重启重建投影的验收。

### F11 **[medium] 测试模板混淆领域矩阵与行政验收，缺口集中在恢复、并发和提交失败**

- **位置**：全部“测试清单”；重点 #5/#6/#8/#14/#15/#16；详见后面的逐项矩阵。
- **事实**：所有任务都要求“逐条填测试文件与用例名后方可开工”，包括管理员授权、事实探索与只读审查。新实现任务多数没有命名映射；C1 的崩溃测试不能代替每阶段 SQL 失败回滚；D5 没写非法业务状态、并发移动、失败回滚与事件重放收敛；A1/A2 没写 freshness 和资源切换竞态。B1 本地计划九类矩阵中的 revoke/rotate、失败注入、并发与 job 重放没有完整搬入远端。
- **影响**：行政任务会被无意义的“测试文件名”卡住；实现任务却可能凭旧套件全绿过关，遗漏新保证。C2 甚至测试一个 v1 不应存在的回调。
- **建议**：行政/文档/视觉资产用可重放核对清单。实现任务在方案确认前补“九类 → 新用例/复用用例/不适用及原因”。下表的缺口直接写回相应任务，新增用例明确标为待实现，勿伪装成已有测试。五个 required checks 仍作为代码交付回归门槛，不能代替新增断言；本次审查不运行它们。

## low

### F12 **[low] 部分 UI DoD 缺数值与持久化作用域；平台环境被混入产品实现约束**

- **位置**：#12 D2、#13 D4、#6 B2、#17 C3。
- **事实**：D2“blocked 色与 attention 色距离超阈值”未写算法/阈值；“两行截断且高度不变”未定义比较一行与两行还是两行与超长。D4 未定义布局状态存储 key、默认值、作用域及损坏回退。B2 夹有“不引入 Tailwind/暗色”，对纯连接器无针对性。C3 将“本机 DeepSeek 4 模型”混进 WorkMesh 产品预置约束，而这是 todos 团队运行环境事实。
- **影响**：不同 agent 会交付不同“通过”标准；容易把编排平台的模型配置误当成 WorkMesh 功能依赖。
- **建议**：D2 优先用已批准的 semantic token 映射精确断言；如需色差，方案阶段确定算法与阈值。固定标题槽为两行 line-height 时，比较短/两行/长标题卡片高度；否则只断言超过两行不再增高。D4 明确按 Human/workspace（必要时 Team）隔离布局偏好、窄屏临时回退不覆盖桌面偏好、损坏存储复位和键盘 splitter 操作。移除 B2 无关 UI 约束，将 todos 模型池事实移到运营预检。

## nit

### F13 **[nit] “六项重权限”实际把两个 Skill 开关合并了；ADR 0028 引用不唯一**

- **位置**：#1 P0、#3 R1、#10 D0。
- **事实**：官方权限表分 `Create skill` 和 `Update skill`，总计七个开关；本次 `tools: none` 足以证明都没授权，不影响“全关闭”的结论。仓库同时有 `0028-declarative-route-policy-and-event-audience.md` 与 `0028-kaneo-frontend-architecture-and-dependency-policy.md`。
- **影响**：管理员可能按错误字段清单操作；审查者可能打开错误 ADR。
- **建议**：P0 列出七个真实开关；引用 0028 时给完整文件名。D2 合并原 D3 后保留 D4 编号没有问题，不必为了连续编号破坏稳定任务标识。

## 17 条逐项：可指派性、角色与两个关口

以下是修订后的建议，不表示本次已派发。`withPlan=true` 表示请求平台先生成可审方案并停在 confirm；所有代码变更仍在 review 等待人审核。只读报告的接受不能机械使用 merge。角色 ID 已实时回读。

| 原任务 | 单 agent 可接性与粒度 | 建议角色 | 方案关口 | 改动/成果关口 |
|---|---|---|---|---|
| #1 P0 | 行政预检，不应派 agent 自我授权 | 管理员；总管跟踪 | 人确认权限范围 | 回读权限/交付路径，不跑代码 build |
| #2 P1 | 可独立；需提供全部断言清单及资料包 | 代码探索 | 可直接只读探索；修规格有歧义时停 | 独立审查核对事实，管理员接受修订 |
| #3 R1 | 可独立，但必须在 P1 事实冻结后收口 | 独立审查 | 本身是方案裁决材料 | 人处理 blocking/high，更新 spec 后复核 |
| #4 S1 | 可独立维护共享流程；不是业务实现前置 | 快速修复产稿，管理员导入 | 范围冻结后可直做 | skillId + 默认/显式加载 + 真实复用 |
| #5 B1 | 模块可独立编码，但当前无法证明独立用户交付 | 主力开发，合入 #6 | **true**：持久化、ACL、并发、恢复窗口 | B1 内部持久化检查点；随连接器验收 |
| #6 B2 | 与 B1 同一新包、同一崩溃恢复边界，合并合理 | 主力开发 | **true**：协议与安全提交顺序 | 独立审查校验与秘密处理，人批准 diff |
| #7 B3 | 可独立服务端增强，不必等 B2 完整结束 | 快速修复（契约已冻结后） | 默认 **true**；字段与映射已批准可 false | 审错误语义、无泄漏与限流隔离 |
| #8 A1 | 只读 API 边界清楚，保留单项 | 主力开发 | **true**：schema/可见性/四态 | 探索者复核作用域用例，独立审查差异 |
| #9 A2 | 可独立前端消费 A1，保留单项 | 快速修复 | 四态及计数已冻结则 **false** | 人看真实 empty/unknown/窄屏与路由 |
| #10 D0 | 可独立资产/夹具任务，不合并到 D1 | 代码探索 | 固定采集清单后 **false** | 人接受基线与重放条件，之后才改 token |
| #11 D1 | 可由一人负责，但“全部面”不宜一轮大构建 | 主力开发 | **true**：新映射与 0064 amendment | 每面视觉 diff；最后统一删旧值 |
| #12 D2 | 结构+色彩同组件合并正确 | 快速修复 | 状态语义未冻结前 **true**；冻结后可 false | 真实 DTO 的渲染矩阵与截图 |
| #13 D4 | 一组一致布局功能，保留一项 | 主力开发 | **true**：布局/URL/持久化归属 | 人审桌面/窄屏/键盘；与 A2 集成 |
| #14 D5 | 当前过宽，拆 D5a/D5b；原子批量另案或删 | 主力开发；草稿引用可由快速修复承担 | **true**：动作→命令与失败语义 | 独立审查权限/并发，人工验交互 |
| #15 C1 | 可由一人完成 fake sink 纵向切片；契约必须先定 | 主力开发 | **true**：复用、target、迁移、发送栅栏 | 九类、迁移、提交后外发、故障注入 |
| #16 C2 | C1 后可独立适配器；先明确出站协议 | 主力开发或熟悉渠道的快速修复 | **true**：provider、目标与秘密供给 | fake provider 必过；真实渠道证据另记 |
| #17 C3 | 独立、可早发；不要依赖 C2/S1 | 快速修复；代码探索查官方目录 | schema/加载规则已定则 **false** | 来源、日期、替换规则、零出站断言 |

角色分工不是把一项工作同时分给五个人。每个 build 一个负责人；代码探索交事实，主力实施，快速修复接冻结的小面，独立审查在 confirm/review 给 critique，总管核对依赖与交接证据。`run_review` 是平台已有能力，优于为每个 PR 复制一个永久 backlog“审查任务”。需要人的显式启动/批准时按平台工具约束执行；本次没有启动任何 build/review。

## 九类测试：逐条对照

记号：`有`=任务写了针对性断言，尚未运行；`缺`=适用但没写；`部`=只有一部分或表述不够；`—`=本任务无对应领域写路径，合理不适用。顺序：H happy path；U 未授权；S 非法状态；I 幂等；R 陈旧 revision/freshness；T 事务失败；J webhook/job 重放；C 并发；O 重启/outbox 恢复。GET/展示任务不能为了填表发明 mutation；领域复用测试可明确引用，不强迫复制九套。

| #任务 | H | U | S | I | R | T | J | C | O |
|---|---|---|---|---|---|---|---|---|---|
| 1 P0 | 有 | 有 | — | — | — | — | — | — | — |
| 2 P1 | — | — | — | — | — | — | — | — | — |
| 3 R1 | — | — | — | — | — | — | — | — | — |
| 4 S1 | 有 | 有 | — | — | — | — | — | — | — |
| 5 B1 | 有 | 部 | 部 | 部 | 缺 | 缺 | 缺 | 缺 | 部 |
| 6 B2 | 有 | 有 | 部 | 部 | 缺 | — | — | 缺 | 部 |
| 7 B3 | 有 | 部 | 部 | 缺 | — | — | — | 缺 | 部 |
| 8 A1 | 有 | 有 | 有 | — | 缺 | 有 | — | 缺 | 缺 |
| 9 A2 | 有 | 缺 | 部 | — | 缺 | — | 缺 | 缺 | 部 |
| 10 D0 | 有 | — | — | — | — | — | — | — | — |
| 11 D1 | 有 | — | — | — | — | — | — | — | — |
| 12 D2 | 部 | — | 部 | — | — | — | — | — | — |
| 13 D4 | 有 | — | 部 | — | — | — | — | 部 | 有 |
| 14 D5 | 有 | 有 | 部 | 有 | 有 | 缺 | 缺 | 部 | 缺 |
| 15 C1 | 有 | 部 | 缺 | 部 | 部 | 部 | 部 | 部 | 有 |
| 16 C2 | 部 | 部 | 部 | 缺 | 缺 | — | 部 | 缺 | 缺 |
| 17 C3 | 有 | — | 部 | — | 缺 | — | — | — | — |

逐条补充/不适用理由（可直接作为任务修订清单）：

- **#1**：行政开关回读足够；双开关仅用于 remote shell。禁止为了验未授权而未经批准尝试真实推送。可核对工具不可用/平台拒绝证据，不把仓库九类要求套到第三方权限系统。
- **#2**：九类不直接适用；验台账穷尽、替代定位、检索范围、两端修订。不要要求探索前就知道测试文件名。
- **#3**：九类不直接适用；审查是否逐项映射九类，不能用“所有类别已读”代替实现断言。补 P1 输入版本及 high 处置。
- **#4**：九类不直接适用；已有加载/无权限检查，补管理员代建真正完成和新任务复用。不要把团队写 Skill 权限测试做进 WorkMesh 产品测试。
- **#5**：补 consumed/new-key 拒绝的明确断言、原 key 同体无第二凭据/事件/outbox；revoke/rotate/overlap 与重放的实测边界；credential/consume/event/outbox/replay 分阶段失败回滚；擦除/轮换 job 重放；双进程竞争 pending、双 claim、与清理交错。重启已有，但缺不重复领域事实与 outbox 恢复断言。服务端不改不代表可凭空承诺它具备新语义，复用当前 integration 夹具冻结真实边界即可。
- **#6**：补旧 overlap/已撤销身份拒绝、校验后到正式配置提交间失败补偿、秘密存储失败、并发命令、重启后恢复阶段。仅“同 code 连跑两次”不够，明确复用 key/body/context 与新 key 拒绝。无新增数据库事务/job，相关领域回归由合并后的 B1 承担；本地文件故障不是数据库事务失败。
- **#7**：补错误 metadata 不泄露绑定的 slug/Human/隐藏资源、错误返回不改变旧生命周期、同 key 重放仍符合既有响应契约、并发限流维度、失败退避隔离与 store 重启/不可用行为。无新 revisioned 资源/DB 事务/job，关联兑换回归复用 B1。
- **#8**：已有无状态/event/outbox/receipt 写入断言，这是正确的 T 替代；补 freshness 标识/缓存失效、换 Team/撤权并发重读、API 重启重建事实。GET 无幂等写与 outbox 生产者。不要要求“四项各有 ready”，Runner 应始终 unknown。
- **#9**：补隐藏/跨 Team 数据不会由旧响应重新出现、unknown/not_applicable 计数、切 Team 慢请求乱序、重复 invalidation 只重算、刷新/重开后重读而不依赖 seen。无业务事务与写幂等路径。
- **#10**：不适用领域八类；补采集时点/代码版本、固定数据/时钟/字体/视口/浏览器、禁用动画、两次重放判据。捕获截图是资产输出，“不写实现”不应解释为不能配置可重放夹具。
- **#11**：不适用领域八类；覆盖 token 消费方扫描、逐面 diff、可访问文本/焦点与旧值删除门禁，列明“全部面”的固定清单。
- **#12**：补真实状态输入映射，见 F06；视觉状态不是领域状态转换，不要求新增 API 幂等/事务/job 测试。明确颜色阈值与高度基准。
- **#13**：补损坏/缺失布局存储、登出/换用户作用域、异步 A2 结果与布局交错、键盘 resize；现有“跨会话保持”覆盖布局恢复，不等于服务器 outbox 恢复。窄屏适配不能改工作流事实。
- **#14**：补当前 actor 不允许的实际转换、Stop 后动作拒绝（仅适用会触及 Session 的动作）、部分网络失败/服务端失败后的逐项恢复、双 Human 移动与 stale revision、重复 SSE/outbox 不重复乐观变更、页面/API 重启后重新取权威状态。若保留批量原子设计，必须增加新后端事务失败、全批回滚与锁顺序测试。
- **#15**：补配置 CRUD 的未授权/跨 Team、禁用或过期目标、旧 fence；target mutation 的重复 key 与 stale revision；intent/attempt/checkpoint SQL 失败回滚；源事件、fan-out、job 重放；两 worker 正常竞争、超时 reclaim 后旧 ack；确认成功但 ack 丢失的至少一次边界。删除“相反审批”与未定义卡片 callback。现有崩溃恢复要求保留。
- **#16**：补 fake provider 成功的请求/载荷断言、错误码/429/超时/不确定送达、脱敏、目标被禁用时零外发、与 C1 的竞争和重启恢复。v1 无决策回调则签名/重放/绑定/解绑不适用，删除而不是造接口。深链旧 revision 只导航，真正写入由网页既有命令重读授权/revision。若 provider 不支持幂等，测可解释的重复，不要求恰好一次。无新 DB 事务时引用 C1 的提交边界验收。
- **#17**：纯文件目录无 mutation key/DB 事务/job；补非法目录/缺字段/重复 ID/禁用与整文件替换的确定行为、目录版本变化后表单引用不悄悄覆盖用户输入。既有保存连接如被本次 UI 调用，复用其未授权/revision/幂等测试；不必把只读目录做成版本化可写聚合。

建议在确认方案时列真实测试文件与拟新增 `it` 名；目前明确读到的可复用入口包括 `apps/api/integration/stage5-agent-connections.integration.test.ts:323–335`、`apps/worker/src/automation.test.ts`、`apps/web/features/work-items/work-item-adaptive.test.tsx`、`apps/web/e2e/theme-unification.spec.ts`。这不代表这些文件已经覆盖上列全部缺口。

## 第三遍事实核对台账

逐行核对本地计划 77–98 的 22 项事实，并覆盖回读中额外的 claim 入参、熵与 P0 平台断言。这里没有把“file:line 出现次数”冒充事实数量。

| ID | 原断言/主题 | 本次结论与当前证据 |
|---|---|---|
| E01 | 兑换响应已有加密重放、到期擦除 | **成立**。`auth-idempotency.ts:128–144,319–339` AES-256-GCM 加密 envelope；`session-lifecycle.ts:672–690` 清掉 cipher/IV/tag 等字段。不是仅在响应存在。 |
| E02 | 重放需同 key、subject/op/body/context | **成立**。`auth-idempotency.ts:205–216,285–304,343–352`。context 为 origin/userAgent；exact retry 不再执行兑换 handler。 |
| E03 | 已消费 code 换新 key 不可恢复 | **成立，需限定对象**。`agent-connections.ts:513–528`；丢请求身份后无法恢复这次 claim，不是管理员永远无法重新配对。 |
| E04 | 接入提示七步 | **成立**。`mcp-onboarding.ts:141–147` 七个编号完整存在。 |
| E05 | 四步完整性校验不能删 | **方向成立，计数不如清单可靠**。discovery、指纹、原始 Skill、最终 MCP 身份比较；0046:52 另要求 get_workmesh_context 在提交配置前。B2 当前遗漏顺序，见 F01。 |
| E06 | 两 redeem 限流按 operationId 隔离 | **部分成立**。`inventory.ts:36–37` 两 operation；`limiter.ts:129–159` endpoint/subject-client 隔离且 socket/client 共享；`122–126` 证明失败退避也隔离。#7 及 ADR/计划的补充句错误。 |
| E07 | attempts 只在已知身份不匹配递增 | **成立**。`agent-connections.ts:511,521–525,561–562`：Zod 先解析，已知 type/slug 不匹配触发 catch 递增；未知枚举先失败；随机有效形状错误 code 查不到 pairing。8 次阈值锁定。本地计划演示“猜错已知类型不计锁定”不成立，须改。 |
| E08 | enrollment 默认、pairing 恢复 | **成立**。ADR 0062:33–35,48–49；B 仅做 pairing 纵向修复不等于反转默认。 |
| E09 | enrollment 输入更多且写 redemption | **成立**。contracts:2918–2930；agent-connections:943–948 插 `agent_enrollment_redemptions`；870–891 检查并递增额度。重放不再执行该 handler，勿再扣额。 |
| E10 | POST connections 也创建 Agent | **成立**。`agent-connections.ts:443–469` 未找到定义时插 actors/agent_definitions；不得文档化成只能绑定已有 Agent。 |
| E11 | 无空闲 Runner 在线事实 | **在本次核对的 Runner 协议路径成立**。`run-session.ts:332–357` 进入有效 Session 后 heartbeat；`workbench-runner.ts:88–109` 查询 assignment；`schema.ts:316–324` heartbeat 属 Session。DarkFlame 在线是 todos 机器事实，不能据此把 WorkMesh Runner 改 ready。 |
| E12 | 模型需 active + enabled | **成立但非充分授权**。`workbench-conversations.ts:150–166` 除这两项还查 workspace、personal owner、team；A1 必须复用可见性边界，不能只计数量。 |
| E13 | 项目不是所有工作的前提 | **成立，原引用不够直接**。ADR 0004:7 明确 project-optional；`pi-workbench-contracts.ts:76` projectId optional/nullable；AGENT_PROTOCOL:1746–1756 主要在讲 Runner 协议，不宜作为唯一依据。 |
| E14 | 保存模型不出站 | **成立**。实际读取 `workbench-llm-connections.ts:176–200,220–246`：normalize、授权、加密入库、事件，无 provider 调用。49–69 的 normalize 自身只校验 URL，并不足以独自证明整个保存路径。 |
| E15 | Human Attention 无表/outbox/scheduler | **成立于投影自身**。ADR 0050:15–18,58–61；源事实有事件，通知系统另有持久队列。不能推导平台没有 durable delivery。 |
| E16 | Redis sink 是裁剪 wake hint | **成立**。worker/index:249–258 仅 `{cursor,workspaceId}`；291–325 PostgreSQL claim/mark delivered。 |
| E17 | 已有 Web Push 与 notification channel/delivery 表 | **核心成立，名词应修正**。`automation.ts:130–133,744–758` 调 `webPush.sendNotification`；`schema.ts:534–543` 有 deliveries/subscriptions。旧 migration 0016:6 是 `notification_channel` 枚举，不是独立 channel 表；85–103 是 delivery 表。不可凭这句假定已有 channel target CRUD。 |
| E18 | 默认限流仍构建 Redis store | **成立**。`auth-rate-limit/plugin.ts:53–59`。支持“当前默认不可直接去 Redis”，不能仅凭这一处断言所有实验能力都不存在。 |
| E19 | 锁清单含 statementId/owner/SQL hash/rankSequence | **成立**。`agent-lock-order-inventory.test.ts:141–167,373–392`；本次只读，未运行生成器。 |
| E20 | route-policy 由脚本生成 | **成立**。`package.json:29–30`；`scripts/generate-route-policy-artifacts.mts:167,189–190` 有生成声明和输出。 |
| E21 | 0071/0072 都 Proposed | **状态成立；“都未实现”不成立**。两 ADR 标 Proposed。Lite 已有 Compose/Dockerfile/validator；0071 的脚本与 footprint 缺失。不能用状态标签代替实现盘点/运行验收。 |
| E22 | 没有国内渠道 adapter | **当前检索未找到**。检索 `apps`/`packages` 中 `wecom/wechat/weixin/dingtalk/feishu/企业微信/钉钉/飞书/小程序` 无命中；既有 Web Push/通用 webhook 已找到。正常 rg 遵循忽略规则，未扫描生成物、依赖、外部服务，也未声称全世界不存在；结论限本仓库实现面。相关 docs/ADR 已读，命中设计文档不算实现。 |
| E23 | redeem 无额外 claim ID | **成立**。contracts:2711–2723 strict object 只有 pairingCode/agentSlug/client；幂等身份在 header，不能把“body 无 claimId”推导为“无恢复身份”。 |
| E24 | code 为 32 随机字节、43 字符 | **成立于 payload**。db/index:41 `randomBytes(32).toString('base64url')`；contracts:2713 要完整 `wmp_` + 43 字符，共 47 字符。任何 CLI 例子的“43 字符 code”应说明接收完整前缀，不能把前缀丢掉。 |
| E25 | 十分钟覆盖整个流程 | **错误前提已正确撤回**。agent-connections:358–365,523 是首次兑换 TTL；auth-idempotency:6,298 是 15 分钟重放窗口。首次请求尚未成功就崩溃的场景不存在“既有同一枚凭据”，应验“同请求身份且最终至多一个凭据”。 |
| E26 | 当前 MCP 无关联关系工具 | **本次工具集成立**。实时 tools/list 共 31 项，无 relation 工具；不外推成平台永久不支持。 |

额外已确认：ADR 0073 虽 Proposed，`schema.ts:102`、`migrations/v1/0013_work_item_board_rank.sql`、contracts:173、commands:924–933 已有 board_rank/placement 实现；不能为了 D5 再做一遍排序后端。`theme-unification.spec.ts` 也确实存在。D0 将 Proposed 当未实现的判断方式不能复用到这些领域。

## 必须改清单（blocking + high，按执行顺序）

1. **F08/F03**：先冻结可在 build 读取的输入版本，校正本地/远端任务映射，补 B-ship/B4、删 C4 和无关依赖。P1→R1 必须形成直接门禁。
2. **F01**：统一连接器秘密存储、完整 code、重放身份、配置提交顺序；合并 B1/B2，撤回未成立的“B1 模块独立发布”与撤销后绝不重放 secret 的假定。
3. **F02/F06**：D5 采用逐项批量语义或另立事务设计；区分本地交互/领域 Command；D2 用真实 workflow/session/attention 映射。
4. **F05**：C1/C2 指定 target CRUD 和投递映射归属，冻结一个出站协议，删 v1 不该有的决策 callback 测试，明确至少一次与现有 delivery 的复用。
5. **F07**：明确 0077 对 0064 视觉 authority 的窄范围修订；填 `withPlan` 与 review 条件，blocking/high 处理后由人批准相应方案。
6. **F04**：管理员落实实际发布者的最小权限/交付路径；Skill 不再挡业务实现，管理员代建要有 owner 和验收证据。

## 建议合并

| 项 | 修订 | 理由 |
|---|---|---|
| #5 B1 + #6 B2 | 合为“可恢复且可验证的 pairing connector”；内部保留持久化与协议校验两个检查点 | 同一新包、同一请求身份/秘密/崩溃恢复边界；当前没有独立消费者支撑 B1 先发 |
| 缺失 B4 + 新 B-ship | 一个“连接器分发、安装与接入文档”任务 | 文档必须引用真实可安装版本，同一干净无源码设备演示可验两者 |
| #12 已合并 D2/D3 | **维持现状** | 同一组件层，结构与颜色共享视觉回归；修真实状态映射即可 |

不建议合并 P1/R1：独立事实搜集与独立裁决职责不同。也不建议把 A1/A2、C1/C2 强行合并：其接口边界足够清晰，后者可各用 contract fixture/fake sink 独立验收。

## 建议拆分

| 项 | 修订 | 理由 |
|---|---|---|
| #14 D5 | D5a 菜单/主动作；D5b 拖拽/多选/草稿引用；原子批量若坚持则独立 ADR/后端任务 | 独立交互与新事务语义不能在“表现层集合”里混验 |
| #11 D1 | 两个执行任务：D1a 并存 token + 首个代表面；D1b 其余固定面逐面迁移 + 无消费方后删旧 | D1 当前含全站多个可独立评审面；首面验证映射后再推广，避免一次大 diff。两个任务同一主负责人 |

C1 暂不按表/API/worker 拆；先通过方案关口确定复用后的真实增量。若仍超出一轮，按可运行纵向检查点拆，避免先做孤立表再重新发明业务语义。

## 建议删除

| 项 | 删除内容 | 理由 |
|---|---|---|
| #17 C3 | `blocks C4`，以及对 C2/S1 的实现依赖 | C4 无定义；目录与渠道/Skill 无运行依赖 |
| #14/#16 | `D5 blocks C1`、`C2 blocks C3` | 与本地计划独立链冲突，只拖长工期 |
| #4 S1 | 对 B1/A1/D1 的硬 blocks | AGENTS.md 已提供规范；空技能库不妨碍实现，入库权限还未落实 |
| #1 P0 | 审查者 push、默认 tag、通用“双开关”测试 | 不符合实际职责与平台权限语义 |
| #15/#16 | v1 卡片决策 callback/绑定/相反审批测试 | 已明确延期的身份系统，不应从测试清单偷偷带回 |
| #14 D5 | v1“批量原子性”；为复制/草稿插入要求写请求 header | 超出当前 API 和纯展示边界 |

**不建议整批删除 S1 或 P0**：前者是有价值的共享资产，后者是有价值的管理员检查；删除的是不合适的执行方式和硬依赖。

采用上述两个合并（B1/B2、B4 纳入 B-ship）、两个拆分（D1、D5）、新增一个 B-ship 后，原 17 条会成为 **19 个跟踪项**；其中 P0 是行政项、S1 可选，不是 19 个都等价的 coding build。无需把“恰好 17”当设计目标。

## 替换依赖图与任务描述模板

```text
P1 事实/输入冻结 → R1 规格裁决 + 人工确认 → 放行相关实现
D0 可先做 → D1a → D1b → D2 → D4 → D5a / D5b
A1 → A2
B-connect（B1+B2） ─┐
B3 错误契约 ────────┴→ B-ship（含 B4 文档与无源码安装验收）
C1 durable delivery + target 配置 → C2 企业微信
C3 预置目录独立
S1 流程资产可并行，不阻塞上述链
P0 约束实际发布/合并动作，不阻塞只读探索
A2 + D4 → 组合验收检查点（两者未齐前不得声称组合通过）
```

上图保留 D 链现有大顺序以减少同组件冲突，并非断言所有 UI 任务存在技术依赖。B3 的 metadata 消费在 B-connect 最终验收前合入；两者可先依冻结契约分别实施。若用户不接受部分失败式批量移动，D5b 的批量部分需等待独立事务设计。

建议每条描述开头使用固定结构，不把前置状态写入不断漂移的标题：

```text
task_key: WM-ACTIVATE/B-CONNECT
owner: 主力开发（具体 agentId）
spec: docs/adr/0075-...md @ 已确认的输入版本
requires:
  - <P1 todoId>: 指定版本事实台账已接受
  - <R1 todoId>: 本任务 blocking/high 已处置且人已确认
blocks:
  - <B-ship todoId>: 需本任务合入 base 后才能最终验收
dispatch: withPlan=true
confirm_gate: 秘密存储、ACL、并发/恢复、验证与提交顺序已批准
review_gate: 列出的新断言 + required checks + 脱敏演示 + 精确变更版本
handoff: 代码/文档位置、测试证据、已知限制、下游可用条件
```

标题保留 `[B-CONNECT]` 等稳定代号；临时 #编号仅供本报告定位。无 relation MCP 时，双向引用 + 总管派发前读回 + 明确工件门禁足够执行，但它仍是人工/agent 流程约束，不能宣称平台会自动禁止越级启动。分项目会削弱共同上下文，不解决这个问题。

## 这 17 条没有吃满 todos.dev 的地方

1. **角色没有变成派发规则。** P1/R1 已有良好的角色暗示，并非所有任务都只能主力开发；但多数正文没指定 owner、输入交接与 review agent。按上表分工，快速修复接 C3/A2/冻结后的 B3/D2，探索接事实与基线，主力接跨模块实现，总管管图与验收，避免五人同改 `contracts/index.ts`、OPENAPI、tokens 或同一文档。
2. **两个关口没有被显式选用。** `withPlan` 默认 false，标题写“ADR”不会自动停在 confirm。安全/迁移/布局/批量语义用 true；已冻结的目录、文案、基线和简单呈现可直实现。高风险任务在 confirm 和 review 分别请独立审查，利用平台自动把 critique 送回原作者的能力，不让用户手工转述。
3. **Skill 的共享能力值得用，但不应成为仪式。** 空库不意味着必须先造 Skill 才能写业务。先把 P1/R1 中确实可复用的断言核对、矩阵适用性判断、双轨同步、生成器检查固化；引用 AGENTS/ADR 原文而不复制版本号。经一次真实使用修正后导入共享库并配置默认使用。用户明确希望尽早建立团队流程时，保留 S1 独立任务也合理。
4. **独立记忆应积累稳定方法，不承担交接。** 实时记录：总管 memory 1，其他四人 0。让探索记“在哪查事实”，主力记稳定调用边界，修复记常见生成器陷阱，审查记经证实的失误类型；新事实仍需按当前代码刷新。跨角色共识放 spec/Skill，不能以“某 agent 记住了”代替任务描述。记忆属于各 agent，互不可读，官方说明也要求不写秘密与任务瞬时细节。[Memory 文档](https://todos.dev/docs/memory) 本次未写任何 agent 记忆。
5. **适合 schedule 的是稳定只读检查，不是当前开发任务本身。** 现无 schedule。可在本批落地后单独建立“每周官方预置来源/目录漂移检查”“按冻结夹具做视觉回归比较”“关键代码事实漂移复核”，只出报告，不自动更新 goldens/spec、不真调付费模型、不改权限。不要定时重跑 D0 去覆盖基线，不要对尚在实现的 P1/C1/B-connect 加 schedule：本次 MCP 的说明明确每次到点会取消未完成的上一轮并重新开始。周期/时区/机器由 owner 明确后再配置，不能因建议就启用。
6. **backlog 起点本身没有问题。** 权威回读 Phase 为 `todo`，平台创建即 backlog。P0 可保留为 `[Human]` 待办；不能伪造为 confirm。得到启动授权且前置可达后，P1/D0 可先运行，R1 在事实冻结后执行；方案真正产出才进入 confirm，diff 真正产出才进入 review。依赖未就绪继续 todo 并写清 blocked reason；不要把 `planned/blocked/awaiting_review` 等 WorkMesh 名字直接写成 todos 的 phase。

## 环境前提缺口

| 事项 | 本次证据/状态 | 让任务真正跑通所需修订 |
|---|---|---|
| 项目与分支 | `projects` 实时：WorkMesh，`DzkLDn6UW-IbfoTJzN9Ro`，xurunxin/WorkMesh，main | 无需改项目；还需实施时核对 base 含所需规格与上游改动 |
| Agent 运行供给 | 五个 agent 均 Codex：主力/总管/审查 gpt-6.1-sol，探索/修复 gpt-6-luna，thinking high；均 idle | 供给存在不等于所有测试依赖齐备；不要为本批改变模型池 |
| 机器 | DarkFlame 在线、accepts builds、Windows x64，remote shell off；机器上 Codex pro、OpenCode 显示 no plan limits | remote shell 保持关闭可工作；其 off 不是 WorkMesh Lite 档位的配置证据，两系统不可混写 |
| 推送交付 | 五人 tools none；官方明确无授权只在 checkout 工作 | #2 若要求文档合入、#10 若基线入库、#5–#9/#11–#17 的代码成果均需实际发布者 push 或明确人工代交；并非只有 P0 列出的 B2/D5/C1 受影响。#3 纯报告、#4 本地 Skill 草稿可先产出，但 #4 入库 DoD 仍需人/权限 |
| merge/tag | 当前均无 | 人审核与 GitHub 分支保护是独立门禁；只给真实执行者必要权限。普通功能开发不先开 tag |
| 技能与连接 | `skills` 为空；`mcp_servers` 为空 | S1 有指定管理员导入路径；双轨若仍要求 WorkMesh MCP，需明确谁能连接/同步，不把本批控制面全部隐含在一个绝对路径里 |
| 资料可达性 | 本地 G 盘外部参考存在；build checkout 在另一根目录 | 用附件/受控仓库材料交付设计输入；尚未独立验证每个 build 能读 G 盘，不能宣称已有访问 |
| 测试环境 | 本次未测试。`package.json:11–15` integration 多次 `test:reset` | 各并行 build 独立测试库、Redis/对象存储命名空间与端口；隔离未就绪时串行测试。没有证据表明现在已隔离，也没有证据表明现在在共用；标待验证 |
| Lite 验收 | 实现文件存在，footprint 和 backup/restore/measure 脚本缺 | 使用真实已有 Lite 入口做 A2/B-ship 验收；镜像可用、配置、目标设备验收另列证据。不要把 Lite 完整建设塞进本批，也别称未实现 |
| C2 真渠道 | 无提供方凭据/应用/收件目标的本次验收证据 | 方案选择出站协议；管理员配置最小 scope 的应用/目标/秘密，fake provider 与真实渠道验收分开。无真凭据可完成确定性实现，但不能宣称真实企业微信已打通 |
| connector 发布 | 原 17 条无人负责二进制/平台支持/版本工件 | B-ship 定 supported OS/arch、下载与校验、无源码安装、升级/回退和 smoke；具体发布权限放该项处理 |

**DeepSeek 要不要另加任务？** 本次 `machines(full=true)` 确认模型池有四个 1M 条目：`deepseek/deepseek-flash`、`deepseek/deepseek-v4-flash`、`deepseek/deepseek-v4-flash-vision-exp`、`deepseek/deepseek-v4-pro`；`agents` 确认五个 agent 都用本机 Codex，没有选这些条目。目录信息不证明真实可调用、质量、延迟或费用。本批没有模型容量阻塞证据，**不必新建“接入 DeepSeek”开发任务，也不动现有 agent 配置**。若要做经济性比较，另开可选运维评估：同一只读事实任务、固定输入、质量/成本/时延标准，管理员选定试点 agent，再决定是否切换；它不依赖 WorkMesh 的 C3，也不应阻塞本批。

## 明确没有问题的设计

- 保留服务端已有加密重放，在客户端固定请求身份，而不是新增第二套 pairing 密文表，方向正确。
- 不拆 `endpointClass`、保留来源共享预算，正确；只需修失败退避的事实句。
- A1 纯查询、按调用者/Team 作用域、Runner unknown、非仓库项 not_applicable，不把 View Model 当授权，正确。
- C2 v1 只提醒并深链，把 OAuth 首管理员、卡片直接决策、小程序和真实模型 probe 延后，符合现有边界；错误在残留测试与未分派配置交付，不是范围缩减本身。
- 目录只填可编辑配置、保存不探测、不宣称兼容性，正确。
- D0 独立硬门禁、先新增再迁移最后删 token、保留原 CSS 技术栈与亮色范围、D2/D3 合并，均合理。
- 依赖图没有循环，全部 backlog 不是错误，未分配 DeepSeek 不是缺陷；不为这些点制造问题。

**一句话总评：方向已经收敛，但执行契约还没收敛；先修连接器与批量操作的矛盾、补真实交付和人工门禁，再让五个角色按稳定输入并行工作。**
