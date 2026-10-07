<!-- WM-ACTIVATE-20261007:ROADMAP -->
# 工作台就绪面、可证明的接入恢复、一个通知渠道与国内模型预置

## 本批执行记录例外

经用户于 2026-10-07 18:38（Asia/Shanghai）明确批准，本批仅以 Todos 编排、以仓库保存
规格和执行证据，替代本仓库 `AGENTS.md` 对 WorkMesh Project/WorkItem 双轨记录的要求。
此决定覆盖此前「Todos 编排 + WorkMesh 追踪」的答复；不声称已创建或同步 WorkMesh 记录，
也不改变 WorkMesh 产品自身的领域控制面。其他领域、安全、测试、审批和交付约束继续有效。
总管已按 G1 交接映射同步 #5–#17 与 #20–#22 的完整 spec（包括已关闭的 #6）；本地证据记录
逐项核验结果。本例外只适用于本批 Todo #18 及其映射的批次任务。

状态：Proposed，五条链均未开工。本稿是 gpt-6-astra / high 对抗式审查后的**第二版**，
第一版的结论与被撤回的主张记录在
`docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.review.md`。

**source of truth**：`docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md`、
`docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md`、
`docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md`、
`docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md`（D 链 UI 重构）。

## G1 输入可达性门禁

本计划与四份 ADR 在原主分支基点 `32789cec4d50db0b85a63d91049cc425d9e917a2` 可读；本 G1 分支首阶段提交
`ef264842a8e0dcd215151fd2e2d7c0dc7b5d6cdd` 已纳入参考原件，来源与 SHA-256 见
`docs/references/todos-analysis/SOURCE-MANIFEST.json`。该基点的 `.review.md` 是旧审查矩阵，不是 P1 台账。
P1 的 16 条代码事实表位于提交 `c98ec5f538b3acd9ac052c4ef100e1d111232518` 的本计划版本；#2 已执行
`run_review`，目前正在修订并运行检查。P1 合入前置是 #2 自身审查关口通过并按流程合入；#3 是 P1/G1
冻结后的独立规格裁决，不是 P1 合入前置。P1 未合入目标分支前，依赖该台账的 build base 均未满足门禁。

G1 第一阶段仅将材料、来源清单、批次例外及陈旧输入引用修正合入仓库，不表示最终可达性通过。后续继续在
同一 Todo #18 中运行真实隔离 build，以该 build 的 `git rev-parse HEAD` 为唯一验证 base，读取输入正文并核对
Git blob 与 SHA-256，再由独立复核者确认并将结果写入仓库证据。合入后的实际隔离 build 证据未通过前，依赖
输入的任务保持“待验证”。#10 D0 可独立采集当前视觉基线，但不能解除其他任务门禁。

对照物：todos.dev 的任务输入原件保存在 `docs/references/todos-analysis/`，含
`ui-inventory.md`、`design-tokens.md`、`kanban-cards.md`、引用的测量 JSON、截图索引和
28 张截图；#19 索引引用的完整审查原件也保存在 `reviews/todos-review.md`。原始字节来源及哈希见该目录的
`SOURCE-MANIFEST.json`。通用分析 README 和其他采集工具不属于本批交接输入。

> 注：ADR 0074/0075/0076 的文件名已按审查结论改过（去掉与实际内容不符的
> "activation gate"、"recoverable"、"identity" 等承诺性词）。旧文件名不再使用。

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
   operationId 不同；真正共用的是 socket / client-IP 桶与失败退避。数据库
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

## 现状与证据（已核实，含被撤回项）

| 事实 | 证据 | 对计划的影响 |
|---|---|---|
| 兑换响应已有加密重放 + 到期擦除 | `auth-idempotency.ts:128-144,218,319-339`；`session-lifecycle.ts:672-690` | B1 改为纯客户端改动，**零迁移** |
| 重放需同 key + 同 subject/op/规范化 body/客户端上下文 | `auth-idempotency.ts:205-216,285-304,343-352` | 缺口=客户端丢请求身份 |
| 丢身份后不可恢复 | `agent-connections.ts:522` `PAIRING_CONSUMED` | 这就是要修的那一个失败 |
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
| 无企业微信/钉钉/飞书/小程序适配器 | 显式纳入 `docs` 后检索 | 渠道面是空白面 |

## 任务链与依赖

```
B1 客户端请求身份 ──▶ B2 connector ──▶ B3 错误分类 ──▶ B4 文档
   （零迁移，可独立先发；不依赖 A、C、D）

A1 就绪投影 ──▶ A2 首跑面
   （零迁移，可与 B 并行；不被 C 阻塞）

C1 投递契约 ──▶ C2 企业微信适配器
C3 预置目录（只读，不依赖 A）

D0 视觉基线 ──▶ D1 token 值迁移 ──▶ D2 卡片结构契约 ──▶ D3 单暖色不变量
              ──▶ D4 三栏工作台布局 ──▶ D5 卡片交互集（全部走受治理 Command）

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
  列表/详情、设置），固定视口与明暗（当前仅亮色）。
- **约束**：D0 未完成前**禁止**任何 token 值变更。没有基线就没有评审视觉回归
  的依据，这是本链唯一的硬门禁。
- **测试**：基线本身可重放（同一视口两次产出可重复）；基线纳入 e2e 资产。

### D1 — token 值迁移（沿用 0045 的命名空间）

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

## 延后项（保留任务边界，不进 v1）

| 项 | 前置 |
| --- | --- |
| C-identity 目录首管理员 | 必须先显式修订 ADR 0031：预授权 tenant+subject、OAuth state/回调约束、两入口进同一 singleton 锁与同一原子安装事务、安装后永久关闭、账号后续登录/解绑/应急恢复、审计保留真实 auth method |
| C-card 卡片内直接决策 | 必须先有身份绑定 ADR：`(provider, tenant, app, subject)` 复合键绑定已验证 Human；绑定/解绑只由活跃 Human 会话发起；每次回调重查绑定/活跃/workspace/Team/精确 recipient/源 revision/Session Stop；持久 delivery id + 请求摘要防重放 |
| C-mp 小程序 | 先只读 + 认证兼容 spike（ADR 0005 的 cookie/CSRF 路径能否在该客户端成立需先证明），不预先承诺"零新端点"；恢复时只对**已确认提交、同一 Human/workspace、body/revision 不变且结果未知**的操作复用原 key；未提交草稿或 stale preview 必须重新显示并由人确认（`CONTEXT.md` Draft 与 ADR 0055） |
| C-probe 真实模型探测 | 独立设计：受控 runner/worker、在任何数据库事务之外、绑定精确 connection+model revision、走既有出站策略、定义超时/费用上限/秘密脱敏/verified-failed-unknown |
| C-dingtalk / C-feishu / C-smtp | 各自独立 adapter 与验收，不得用 C2 冒充四渠道覆盖 |
| D-dark 暗色主题 | 0045 明确只做亮色；参考实测的暗色值已在 ADR 0077 预取，后续 ADR 直接继承，无需重新测量 |

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
