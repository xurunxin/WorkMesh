# REST、SDK、MCP、Runner 消费者兼容合同

本批仍未实现；以 [逐操作矩阵](operation-matrix.md)、[完整现行规则](operation-decisions.json)、[安全合同](safety-contract.md) 为一套操作集合，不另造“工具全面支持”口径。

## DTO 与传输

保持既有 REST path、operationId、HTTP method、top-level 字段及错误 `{error:{code,message,details,correlationId}}`。新增共享 `optional-domain-contracts.ts` 提供具名 Zod schema/type，SDK 用 `validateResponse`；原接口里 PostgreSQL bigint/numeric 字符串不经 Number/parseFloat。run 的 effect checkpoint、rule current version/condition/actions、Loop template pin/recent_runs、Template body/version以及 view过滤不能在schema中丢字段；对既有扩展对象用契约限定的 passthrough 保前向兼容。已知固定核心字段仍严格校验。

分页沿 `apps/api/src/pagination.ts` 的 signed cursor、limit、绑定 filter/sort 和 `items/nextCursor`；SDK `pagedPath`，不发明offset。同页可验证全部记录与cursor，跨filter/team cursor被原合同拒。单资源 GET 参数、响应不伪装集合页。usage 所有过滤显式在 OpenAPI/schema/SDK/MCP一致，保持 from包含/to不包含，合法空和拒绝分开。currency字段保原币种，known subtotal与unknown计数/标记同时返回；模型须说“没有成本观测/含未知”，不补缺失usage为零。

既有 `getProjectHealthHistory/createProjectHealthUpdate/suggestCompletion` 允许泛型与 RequestOptions 调用形状不破坏；补具名默认返回、响应验证及联用回归，旧Consumer仍可编译。Health source固定agent，projectId准确，If-Match沿原资源revision；publication exact Human approval hash/source有效性不变，suggestion不自行transition WorkItem。

## 逻辑写调用与恢复

SDK 每个新的逻辑动作产生或接受一个key，同一动作的底层传输重试保相同method/path/key/body/If-Match及原凭据；新动作不能从session+command常量推同key。MCP写input允许caller key；Runner使用 `operationKey(sessionId,attemptId,toolCallId,operationId)`。Loop工具/具名SDK调用明确提供 occurrenceKey 与 scheduledFor，后者不在每次重试重新生成；旧 REST optional scheduledFor默认行为保留。Usage dedupeKey、occurredAt、currency/source、准确session/agent/project与body不在重试时补不同值。业务dedupe与Idempotency-Key各自验证同key同体、异体冲突及一次event/outbox。

不得新增自动再发白名单。Runner沿 ADR0084原三动作受限 transportReplay；M4写不加入。SDK原请求层刷新规则保留现有消费者，但新操作的scope拒绝不触发401/403刷新绕过；真实授权变化需新的已准入intent。写响应丢失/unknown只能读准确本人run/usage/domain事实对账，不能生成新key把同effect再执行；查不到不代表未执行。C当前查询、C明确target E变体、安装handoff与普通E互不替换；不得改共享clienttoken或用Human cookie。

## MCP 与 Runner

复用 `apps/mcp/src/index.ts` 的 `tool`：成功 text JSON 与 structuredContent.data一致，失败保 code/details/correlationId/safeNextAction。只读模式仅读工具；写工具read-write才注册，discovery只投影真实binding。四投影在后端合同未落地前继续 `DOMAIN_QUERY_NOT_AGENT_ALIGNED`；解除后也可能 requires_target_check，展示scope/pin/target facts，调用仍REST重核。

[受控M4增量](product-discovery-decisions.json) 与 [发现合同](discovery-contract.md) 定义16个新工具E/C current_session绑定、targetParameter=null、installationBridgeRequired=false；输入resourceId/sessionId不变成另一Session bridge。原3项health/completion绑定及全部旧138 bindings、137 mappings和identityVariants完整保留。四项规则通过M4增量替换旧Human谓词，feature/状态/能力可判blocked、合法未知目标列精确pendingChecks；既有Human REST读不依Agent manifest放行。registry实际证据当前为空，未来用原register调用捕获，不把公开tools/list当全集；缺注册不能生成。分别生成discovery、route-policy、RunnerSkill并复生成零diff，防止SDK/MCP已注册却被旧生成输入删除。以上兼容验证尚未运行。

Runner内嵌Pi工具只支持准确 executing E 的 qualified manifest；SDK/HTTP MCP再覆盖C允许的当前查询模式。C不可借Runner claim有执行E权。`recordUsage` 不附额外Activity，原命令append-only usage/event/outbox及tool result是证据；可运行Runner本身的既有生命周期权限另行测试，不用一个work:read工具正例冒整个read-only Runner准入。

已有50,000字符摘要不能吞本批run/effect、rollup/usage、Template正文或A2A events/cursor；本批具名受保护读取沿既有12,000,000字符边界完整返回，超界抛明确失败且不给“已消费”cursor。普通items分页继续同cursor缩小limit，最多8次；不能完整返回的单大页明确失败。真实Pi及native OpenCode的私有 max_bytes/config 只在本卡私有目录设置，并实测完整UTF-8原HTTP实收与模型结果逐值匹配，不能从磁盘读全文冒模型实收。

health/completion沿现行草拟、精确批准和Human决定；Stop/terminal后普通工具拒，原准确E的Stop_ACK/heartbeat/receipt专用恢复沿ADR0085不被本批普通feature/discovery屏蔽。GET不加Activity，A2A派生delivery是明确唯一例外，仍不新增领域command事件。

## A2A checkpoint

REST原 `streamA2ATaskEvents` 是已存在有限JSON页；新 `getA2ATaskEvents`、MCP `get_a2a_task_events` 和 Runner `workmesh_get_a2a_task_events` 同一单页操作。保 decimal bigint after/cursor与原事件payload，扫描最多200，不无限轮询或订阅。每个(bindingId,taskId)独立保存最后扫描checkpoint，空映射页也可推进；与listEvents durablecursor、list pager完全隔离，不猜两个数值相同就通用。

adapter协议版本沿源码已有pin，不新增版本兼容承诺。受控 fake A2A 正反协议夹具和真实目标E模型读取分开；Human接受task、外部account/provider不是Agent新权限。原deriveddelivery唯一约束和replay保留，新finalgate防中途撤权写入；不得把read-onlyMCP误报成零数据库事实。
