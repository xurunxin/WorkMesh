# 联合验收安全合同

## 身份和发现

权威为本轮 main 的 `CONTEXT.md`、`AGENT_PROTOCOL.md`、完整 `OPENAPI.yaml`、`SCHEMA.sql` 引用的全部 DDL 和现行 ADR。M0 冻结 `operation-decisions.json` 保持历史；当前 `agent-discovery-rules.ts` 合成 M1／M2／M3 受控增量，280 operation／138 binding 只是来源统计，不是验收数量。

| 身份 | 允许用途 | 必验拒例 |
| --- | --- | --- |
| C／Connection installation | bootstrap、Team 协调 CRUD、领取；`WorkMeshClient.forExecutionSession` 为明确目标创建本次局部 E client | 另一 principal／Team／Agent 的 target、撤销或过期、轮换 confirm 后旧 fingerprint；HTTP 每请求新 client／server，不借前次 Token |
| 准确 E | 当前已授权 Session 的 Plan／文档／Room／Git／证据；直接本人读取不要求 C bridge | 其他同 Actor Session、父／子 scope 不等、paused／terminal、Stop／撤权、能力／feature／Lease／批准不满足 |
| 原 installation 只读确认 | `getAgentSessionExecutionResult` 原 action＋operationKey、原提交来源；旧 null／unproven 对 Agent 隐藏 | 另一 Connection 即使同 Agent／principal／Team、普通终态 E、不存在来源证明；unavailable 不等于未提交 |
| Human H1／H2 | 独立 cookie／CSRF 请求执行准备、信号、Handoff accept、批准、结果裁决 | Agent Human-only工具、越 Team、原 principal 已失成员资格；管理员准备不豁免后续实际 membership |
| Runner service／Attempt | list／claim／credential／start／settle，按 durable Attempt fence 和新 Turn 准入 | 旧 fence、双 Runner writer、失权 queued Turn、Stop 后模型续接 |

`installDiscovery` 的当前 manifest 每次核 live authorization，`supported`／`eligibleByCapability` 不授资源权。缓存工具调用也拒绝 Human-only与只读写；分页每页授权，event decimal cursor 与签名 collection cursor 不互换。stale ACK、诊断 heartbeat、Stop_ACK 走已落专用恢复入口，不先经普通 manifest 拒绝，不用受保护 401／403 refresh 重发绕门禁。

## 写、异步与完成

同 logical intent 在网络失响应／重连／重启前先持久 key＋精确 body；同 body 原 key 重放，改 body 新 key，同 key 异体冲突。Pi `makeTool` 使用 session／attempt／toolCall／operation 派生 key，不支持模型任意指定 mutation key：同一次工具调用的实际 HTTP 重试复用 key，新 Attempt 先读 durable 事实再继续，不能把新 toolCall 当原 intent 重发；R 对原回执的独立重放验证不冒 P 模型重新发送。外部 OpenCode 使用 MCP 输入中原 idempotencyKey，模型脚本持久化该值。Plan／Document／Issue 按原 If-Match 实际版本，冲突先取最新值、明确生成合并版本；不自动覆盖，不凭模型文字生成 passed。

`getProviderAction` 查询准确 requester／Session／principal／Team／repository／context／feature，普通 terminal E 拒绝，合法 Human 可诊断。白名单结果不暴露 payload、原 provider 错误、worker 身份或秘密，读取不领取／续 action 或追加业务事实。`unknown` 只对账，不新 key 重发；合法 checkpoint 仅本地恢复；当前 default branch 与成员资格每写 HTTP 前锁后重读。先提交 Stop／撤权零新写，许可先提交仅在途不可召回，下一写再授权。

`createReviewDelegation` 显式 repositoryIds 受父 Delegation、definition、Team grant 三方 repo:read 交集及共享 context 限制；省略保持 M2 三项能力，reviewer 无 repo 写／plan:write。旧 key 重放在完整父子锁计划后 `authorizeReplay` 重验；零新 child／reservation／Lease／delivery。父只能用 `listAgentSessionChildren` 读真实直接子最小状态；required child 未 completed 阻父完成。子累计上限含终态，父／step 正常用 DB 默认，测试低限额只能明确特权夹具，不伪客户端上限。

Pi completion 由 `executeTurn` 的稳定外层 settle 将公开回答、Turn／Attempt／Session、event／outbox 一起提交；明确 completion 拒绝后独立 Turn-only settle 必须可见 warning，Session 不能冒 completed。失响应沿原 settle key／body 重放，不拿内层 completion key 假查原回执。`sessionWait` 公开等待后释放旧 Attempt，`reconcileWorkbenchWaits` 消费真实合法触发，双 Worker 至多一个续 Turn；pause 不自动解除，Stop／撤权先提交不启动模型。

## 运行数据和保全

固定本机模型／fake Git／独有对象存储 origin；不接真实账号、不发布公共 Skill，不向 Agent 注入 Human cookie，不输出 secret 值、签名 URL／headers、exchange Token。受控模型捕获只保公开 operational rationale 与 tool action／结果，不读取或保存 reasoning／thinking 内容。原客户端 JSON 输出先过滤隐藏思维事件及敏感字段再归档；过滤前临时内容限制在 owner buffer，不入 Git，核可保全内容后按资源规则处置。

原 MCP 上传／下载返回签名材料的外部模型限制明确保留：不新增投影、不给模型这两工具许可；不能以 Pi 安全传输或协议对照冒 OpenCode 模型上传通过。该边界不阻四条规定的核心／metadata Git 证据主链，但阻“全部上传功能已在外部模型验证”的宣称。

授权拒绝保留现行独立审计例外；只读零写断言针对业务 state／receipt／activity／event／outbox／Token，不错误要求既有 security denial audit 为零。
