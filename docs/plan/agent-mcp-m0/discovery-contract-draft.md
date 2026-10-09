# 工具发现、资格披露与恢复合同决策草案

## Status

Proposed。仅M0受控独审输入，未写入产品合同，未标Accepted。正式ADR在合同独审后于docs/adr分配实际未占编号，承接ADR0012、0042、0067；本轮不修改该目录。

## Context

现行manifest表示feature和能力交集；MCP注册与mode、Runner实际具名工具、Session角色及目标状态分属不同层。API没有adapter配置；安装用途没有Session；C manifest不代表执行工具参数中的目标E。完整证据与输入见source-manifest.json和逐operation表。

## Decision

采用显式qualified协商；省略参数仍返回旧strict响应。API只输出精确Session的live资格，adapter独立用实际注册表和部署配置投影。registered/discoverable名单字段不进入API；Context.allowedOperations用同次投影，只含当前身份eligible且可发现的API操作。条件目标模板不算可执行。

安装target用途使用null身份联合，不manufacture Session。目标E bridge按准确ID一次refresh、以返回Token读取目标qualified、再同Token命令；不共享或改写当前C身份。manifest拒绝或目标错配终止，不放宽终态/Stop/queued门禁。完整DTO和调用顺序见compatibility.md。

已知Human/reviewer/Coordination/provider kind门禁逐项表达；未核domain固定blocked。当前binding与拟binding分列，prepare为无REST内部操作，verify与import完整组成。旧名/schema/URI保留，隐藏工具cached call结构化拒绝，不能静默unknown。

Runner401兜底刷新取消；仅请求前已知到期刷新并经live资格。错误、trace、revision和稳定逻辑key保留，不盲重写，不用同正文hash冒新动作身份。真实API/MCP/Pi链进入现有必需api-integration，内存conformance独立保留。

## Alternatives

已排除API猜MCP名单、安装凭据伪Session、C资格代目标E、删除旧schema、401后绕过拒绝和只跑内存CI；这些做法均不满足当前任务边界。

## Consequences

发现资格是已知前提披露，调用授权仍由API/domain在live事实下裁决。目标bridge增加一次qualified读取，撤权可发生在读取与命令间；最后请求仍拒绝。多个客户端各自投影，不能使用缓存名单作权限依据。

## Migration

无数据库迁移、新领域事件或新job。旧响应/URI默认保持；新的字段先合同独审，工具过滤及隐藏兼容公告进协议/客户端guide。M1–M4入口不抢实现，既有SDK/REST专用ACK/Stop路径保持，受manifest拒绝的bridge不伪称恢复成功。

## Spec changes

产品轮同步contracts、OpenAPI、Agent Protocol、client guide、route-policy生成物及必要消费者检查；当前仅中文受控提案。四项blocking由另一Agent定向复审，Chief confirm前不产品实施、不merge文档完成整卡。
