# 消费者兼容与完整 M1 适配决定

本文件是实施合同提案；所有“增加/修改”均指 confirm 后产品阶段。当前没有执行这些产品变更。

## REST 与 typed SDK

保留所有现有路径、method、字段、默认过滤、分页排序、签名 cursor、null 和错误结构。M0 已提供 `get_agent_session/get_session_context/get_session_plan` 等价只读工具，本批复用，不重复注册。版本读取为既有 `listAgentPlanVersions` 的 Plan 版本摘要列表；context 为当前 Session 固定 snapshot/pins，没有现行通用 context-history endpoint，不虚构历史快照列表。Lease 仅有 list，没有 getLease REST，不新增无授权的详情路径。

SDK 在原 `getSession/getPlan/getSessionContext` 上增加默认具名类型与响应验证，保留既有显式泛型调用签名。主线 getSession/list raw SQL 的 `sequence` 可能为 PostgreSQL bigint 字符串，而 context 用 normalizeAgentSessionResponse 得到安全整数；新增 raw读取 schema 单独接收安全整数或合法十进制字符串，保持 wire 字段，不偷换成 context schema而丢字段。raw Plan current返回原 snake_case steps，context中的 Plan已有 camelCase fields；分别使用 raw Plan读取 schema与现有 `planVersionResponseSchema`，不把两者当字节相同，也不为 typed适配重写旧路由。Plan版本列表没有 steps 就保持摘要，不凭空补历史步骤。

`execution-contracts.ts` 补 raw Session/Plan读取与分页、Lease DTO，验证现有字段并保留 unknown响应字段；新确认 DTO严格最小字段。Approval复用 `approvalResponseSchema`，保留 Human viewer_actionability与Agent省略规则；Recovery复用 `recoveryItemSchema`、freshness和不透明复合ID。leaseResponse 已返回 `version` 和 `revision=version`，两个字段都保留，不将 lease version 当 Session revision。新增 list 参数补 OpenAPI已经handler接受的过滤，不给Agent扩大范围。

具名 SDK：listSessions、listPlanVersions、listApprovals/getApproval、listLeases、heartbeatLease/renewLease/releaseLease、listRecoveryItems/getRecoveryItem、getSessionExecutionResult。Lease写包装委托原 mutateLease，heartbeat无If-Match、renew/release需要Lease版本。旧 mutateLease和 stopAcknowledgement保持，不删默认key兼容；新M1写工具要求显式idempotencyKey，Runner从exact session/attempt/toolCall/operation得到稳定key。旧客户端省略key的限制沿M0公告，不用旧内容hash给每次新操作假幂等。新调用/异体/If-Match变更采用新逻辑身份，传输重试不改变原body/key。

## C、E、安装用途与发现

C自身普通查询只读自身C，不能拿列表过滤查询所有E。C读取目标E的工具变体需明确sessionId与既有installation bridge：同一局部E client读取目标qualified资格并调用，不修改共享client。listApprovals/listLeases/listRecoveryItems目标必须明确，C省略目标仍用自身；按列表对象准确session归属，目标GET再校验，不用Team列表成员资格代替owner。getApproval/getRecoveryItem在C目标E变体需要额外sessionId选择局部身份，REST参数不伪加此字段。

直接E只用自己Bearer与exact session；异session参数拒绝，不刷新更换身份。Readonly部署不注册写工具，缓存写callback仍早拒，Human-only工具不能因feature开启广告给Agent。所有新普通工具沿 `deriveOperationEligibility/projectAdapterDiscovery` 与实际callback注册表产生名单；可发现/部署支持/当前eligible/目标授权分别列。当前core操作feature none/stable，Coordination transport仍要求原beta部署配置。

确认工具独立选安装用途slot（C credential或原安装），其Session/Delegation/manifest身份为null，目标实时校验在新REST受限合同完成。工具调用不得先prepare qualified或verify/current-identity；名单中为requires_target_check，且有凭据配置才广告，不能因为静态E完成后manifest被拒而挡住明确的安装确认callback。只带E凭据没有该入口；C有凭据不代表能确认任意Session。

`stop_ack`为专用写工具，参数 `sessionId,ifMatch,cleanupSummary,residualRisks,idempotencyKey`，只读模式拒绝，仅直接E原有效Bearer可调用。不先manifest、不先Activity、不先refresh；普通输入校验和服务器live门禁保持。C HTTP每请求创建新的client/server，不能凭空取出前次E Token；C不广告可停止后刷新bridge完成ACK。不新增服务端Token签发例外或跨请求Token缓存。本批内置Runner持有自己的精确E生命周期Token；外部E客户端自行按已有协议保留Token并完成清理。

SDK `getSessionExecutionResult` 使用独立安装选凭据 helper，明确 skipTokenRefresh，不能命中 SessionToken 优先分支或 forExecutionSession；即使混合client已持E Token，查询也只按明确安装槽调用，共享Token不改。401/403不刷新重发，409返回准确currentRevision及允许的读取途径；终态恢复提示指向只读确认或Human。

## Runner 与历史兼容

Runner普通模型工具仅绑定 `api.sessionId`，当前manifest执行角色且逐操作eligible。只新增精确读取、Plan版本、Approval读取、Lease维护、Recovery读取和普通E合法状态转换；不提供pause/resume/stop/retry/force-release/decideApproval，reviewer继续不能publishPlan。Session列表不变peer名单；Plan不可因前置Activity而消耗用户读取的revision。

heartbeatLease不写普通Activity。release工具已有，但停止时只能受控stopAck。complete模型工具仍提交 completionIntent，再由executeTurn原子settle；不直接先complete后写Turn。受控finally、失败残留和Stop竞态见 [生命周期](lifecycle.md)。

ACK的acknowledged同key回执、stale ACK、终态诊断heartbeat、安装handoff路径及错误correlationId保持M0产品行为；不修改M0已审文档、规则原输入或原报告。生成器加载冻结M0清单加本批受控增量，校验全集/重复operation/binding后重生成；历史清单仍可单独核验。内嵌Runner技能描述随工具同步pin，不发布或改原公共签名Skill。

回执和历史Token关联有保留边界；unavailable不是未提交。没有可用确认身份、归属原件或原回执时如实报告限制，不能宣称无障碍终态确认。独立静态E等待合法Human读；强杀后的清理仍由既有Human/恢复流程承接，不能假称finally必然运行。
