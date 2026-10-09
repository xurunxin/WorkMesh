# 精确 Session 资格与 adapter 工具发现及恢复契约

## Status

Proposed。受控方案已独审通过并获本轮实施指令；本 ADR 记录实现合同，保留独立合同复核及最终验收门禁。

## Context

承接 ADR0012、0042、0067。旧 manifest 只表示部署 feature 与能力交集，不能表达 Session 角色、凭据用途、领域状态及 MCP 的只读部署。受控操作审计见 `../plan/agent-mcp-m0/operation-decisions.json`；原件与旧失败回执保留，不将静态工具数量计作产品验收。

## Decision

`GET /api/v1/agent-capabilities?discovery=qualified` 显式增加 strict `discovery` 对象；省略参数保持旧 manifest 的结构与字段含义，未知参数失败关闭。API 只返回精确 Session 身份、逐操作与变体的规则和资格，不接收或猜测 MCP mode、注册表或 transport。

资格为 `eligible`、`blocked`、`requires_target_check`，分别含机器原因与待核谓词。目标 scope、批准、Lease、revision、幂等键及领域事实仍在调用时由服务端裁决；资格不是授权令牌。已知拒绝不能由 feature 或未知目标覆盖。安装用途没有 Session、Delegation 和 manifest，不伪造协调身份。

adapter 以真实 callback 注册表、mode、transport、coordination 配置及 API 资格投影 registered、deploymentSupported、discoverable 和 tool/resource 名单；Context 使用该次投影。只读缓存写调用拒绝，Human-only 旧名/schema 保留但隐藏，旧调用明确 FORBIDDEN。旧 resource URI 与默认 capabilities 内容保持；增加对应读取工具。

verify 无参数且使用当前 C；claim 的返回 Session ID 不是输入。直接 E 凭自身 Token 读取自身，异 Session ID 拒绝且不换身份。C 带精确目标 E 的变体仅在安装 bridge 配置可用时条件广告；取得目标 Token 后读取目标资格，再以同一 Token 调用，不修改共享客户端，未知目标不计入当前 allowedOperations。两层 manifest actorId 一致，目标 actor 等于当前 C actor；可选 Room 目标省略时使用当前 C，其 Team scope不能代替 exact owner。条件分支事实未知时保留前提，不直接施加尚未选中的 reviewer 限制。

受保护请求的 401、角色/撤权/Stop 拒绝及冲突不触发身份刷新或盲重写；请求前已知到期刷新仍通过 live 门禁。显式 stale refresh→ACK 与诊断心跳保持原门禁，不先要求 qualified；Stop 后安装刷新不可走，专用 Stop ACK 使用已有有效 E Token、If-Match 与稳定 key，缺失的 MCP 清理 bridge留给后续批次。完整错误、追踪与 currentRevision 保留。同一逻辑调用的传输重试、重连保持 key/body；新动作或改变正文使用新身份。旧省略 key 的内容 hash 限制公告，复合 import 保留部分提交与各命令重放。

## Alternatives

已排除 API 猜 MCP 配置、C 资格代替目标 E、删除旧 schema、401 后换身份重试以及内存 conformance 代替真实客户端验收。

## Consequences

每次发现重新读取 live 身份；发现后撤权仍由 API 拒绝。MCP 两种 mode 只影响名单，不改变领域授权。新增资格读取增加一次往返；错误原样终止，不以旧资格降级。

## Migration

无数据库迁移、新领域事件或 job。旧客户端无须升级才能读取原 manifest。保留全部兼容名称与参数；新语义在 Agent Protocol、OpenAPI 和客户端指南公告。M1–M5 未适配入口继续披露，不在本批实现。

## Spec changes

更新 contracts、OpenAPI、API manifest、SDK、MCP 和 Runner 发现与错误恢复；真实 API/MCP/Pi conformance 接入现有 Required `api-integration`，保留内存套件独立运行。完成产品检查、独审、最新 Required CI 与实际 main 合入证明后才验收 M0。
