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

同 logical intent 在网络失响应／重连／重启前先持久 key＋精确 body；同 body 原 key 重放，改 body 新 key，同 key 异体冲突。Pi `makeTool` 使用 session／attempt／toolCall／operation 派生 key，不支持模型任意指定 mutation key。当前 `makeTool`→`RunnerApi.request` 只有一次HTTP，重复执行相同toolCall的单元测试仅证明key稳定；普通传输重放是本包未来修复提案，精确合同如下。新Attempt先读durable事实，不把新toolCall当原intent重发；R手工回执重放不归Pi。外部OpenCode使用原MCP idempotencyKey。Plan／Document／Issue按原If-Match冲突后明确合并，不自动覆盖。

### Handoff与保留父权限

`apps/api/src/collaboration/routes.ts:acceptHandoff` 在接受事务内将来源Delegation改completed并创建承接新Delegation／Session；新Session沿原H1 principal。剩余执行只由B的新Session处理，B从授权handoff/context与Room/Documents取得剩余工作，创建本人新Plan，不能读写旧A Plan。旧A的准确E分别发普通读取、Plan、requestApproval、complete请求，按实际入口记录结构化拒绝；无相应新业务事实。Human读原Session实际state和sourceDelegation=completed，不能推断sourceSession已completed。独立父子场景用 `createChild`，parentDelegation始终active、required child完成前父拒、子完成后父读最小状态并完成；Git review仍按原双证据合同。

### 同一Plan的两个合法消费者

F5独立夹具的owner固定B／Session S／合法executor。Human经原REST批准B的Connection、definition／Team grant／Delegation范围与plan:write；驱动仅通过B原installation refresh S取得给静态MCP后端的E，外部进程只拿该listener access Bearer。Pi用B同installation、WORKMESH_AGENT_SESSION_ID=S，正常refresh取得另一个同S准确E，不共享可变SDK token，也不向模型传E／安装／service／fence。两E可以不同字节，但都须来自同installation、绑定同S及同B；证据只保凭据指纹。

Pi经真实claim／credential／start，service token与fence只走原控制入口；ordinary Plan仍用准确E授权，不能声称服务fence对OpenCode跨客户端写施加新互斥。一个current Attempt running之后，两模型读同S Session revision及Plan；暂停第二个业务发送直到第一成功事务commit，分别跑O先／P先。publishPlan原recordStart=false；其他Activity可能推进Session revision，按原来源单列，不伪零全库写。失败方得到revision冲突而非身份拒绝，再读最新Session revision、Plan与stable step ID，new intent明确合并。原Attempt durable settle前不创建下一Attempt；另用旧fence向原start/settle入口验证拒绝。两个不同Session各自E写对方Plan归F2，不能替F5。共享Document需双方资源范围正例；Issue双C只归R，Pi固定E角色拒绝保留。

### 普通工具一次有界传输重放提案

仅createDocument、publishAgentPlan、postWorkRoomMessage进入新机制。执行一次makeTool，started Activity只一次；在一次RunnerApi.request内完成原请求和最多一次重放，不重复toolCall、不重入makeTool。首次前置refresh后冻结method/URL、JSON序列化body、If-Match、operationKey、准确E及其expiresAt、headers；第二次不得refresh或借后台更新的Token。总截止=第一次业务发送时点+三十秒；每次HTTP最多十五秒并受剩余总预算限制，准入GET与第二次同deadline及工具/shutdown signal，当前信号取消或deadline用尽零第二业务请求。普通GET/准入GET不写Activity，最终succeeded或failed Activity最多一次；活动与业务state/event/outbox分账。

可重试白名单：cause链的UND_ERR_SOCKET、ECONNRESET、EPIPE、UND_ERR_CONNECT_TIMEOUT、UND_ERR_HEADERS_TIMEOUT、UND_ERR_BODY_TIMEOUT、ETIMEDOUT；或本请求自有timeout signal已中止且reason=TimeoutError、同时工具/shutdown未取消。请求自身超时导致流读取AbortError时也只凭上述自有signal判定，不泛认AbortError。单纯TypeError、ECONNREFUSED／DNS／TLS／URL/header错误、JSON SyntaxError、所有完整HTTP拒绝含5xx不重发。成功响应body传输中断按白名单判定；业务错误不变成transport错误。

重发前原冻结E只读原Attempt status（不经RunnerApi自动refresh），要求Attempt／Turn running、Delegation active、Session planning/executing；失败、unknown、signal/lifecycle关闭、E过期、预算用尽均停。准入后服务器仍按原锁内live授权处理Stop／撤权，不能以本机status读取替授权或宣称普通写已有Attempt fence事务。第二次任何失败（包括401/403/409）保留首次transport cause，Pi模型收到原结构化拒绝，ExecutionLifecycle.uncertainCause沿cause链保持unreconciled；不能将第二次拒绝当第一次未commit。没有第三次发送或自动completion。原settle独立重放／terminal权限／Stop finally原E保持。

真实Pi代理在首次业务commit后仅销毁响应，再观测Runner同toolCall发出的第二个原业务HTTP及模型实收；三项白名单分别跑，无签名/provider写。API可在首次commit与再次准入间真实重启，保持原Runner进程、Session、Attempt、端口/DB及预算；超预算真实失败不冒成功。OpenCode另跑MCP真实重启/原key重连，Pi直连不借此证明。两次失响应、第二次授权拒绝、Stop/撤权、旧Attempt、logical新intent新key各自断言，R手工replay不能冒厂商实收。

`getProviderAction` 查询准确 requester／Session／principal／Team／repository／context／feature，普通 terminal E 拒绝，合法 Human 可诊断。白名单结果不暴露 payload、原 provider 错误、worker 身份或秘密，读取不领取／续 action 或追加业务事实。`unknown` 只对账，不新 key 重发；合法 checkpoint 仅本地恢复；当前 default branch 与成员资格每写 HTTP 前锁后重读。先提交 Stop／撤权零新写，许可先提交仅在途不可召回，下一写再授权。

`createReviewDelegation` 显式 repositoryIds 受父 Delegation、definition、Team grant 三方 repo:read 交集及共享 context 限制；省略保持 M2 三项能力，reviewer 无 repo 写／plan:write。旧 key 重放在完整父子锁计划后 `authorizeReplay` 重验；零新 child／reservation／Lease／delivery。父只能用 `listAgentSessionChildren` 读真实直接子最小状态；required child 未 completed 阻父完成。子累计上限含终态，父／step 正常用 DB 默认，测试低限额只能明确特权夹具，不伪客户端上限。

Pi completion 由 `executeTurn` 的稳定外层 settle 将公开回答、Turn／Attempt／Session、event／outbox 一起提交；明确 completion 拒绝后独立 Turn-only settle 必须可见 warning，Session 不能冒 completed。失响应沿原 settle key／body 重放，不拿内层 completion key 假查原回执。`sessionWait` 公开等待后释放旧 Attempt，`reconcileWorkbenchWaits` 消费真实合法触发，双 Worker 至多一个续 Turn；pause 不自动解除，Stop／撤权先提交不启动模型。

## 运行数据和保全

固定本机模型／fake Git／独有对象存储 origin；不接真实账号、不发布公共 Skill，不向 Agent 注入 Human cookie，不输出 secret 值、签名 URL／headers、exchange Token。受控模型捕获只保公开 operational rationale 与 tool action／结果，不读取或保存 reasoning／thinking 内容。原客户端 JSON 输出先过滤隐藏思维事件及敏感字段再归档；过滤前临时内容限制在 owner buffer，不入 Git，核可保全内容后按资源规则处置。

原 MCP 上传／下载返回签名材料的外部模型限制明确保留：不新增投影、不给模型这两工具许可；不能以 Pi 安全传输或协议对照冒 OpenCode 模型上传通过。该边界不阻四条规定的核心／metadata Git 证据主链，但阻“全部上传功能已在外部模型验证”的宣称。

授权拒绝保留现行独立审计例外；只读零写断言针对业务 state／receipt／activity／event／outbox／Token，不错误要求既有 security denial audit 为零。
