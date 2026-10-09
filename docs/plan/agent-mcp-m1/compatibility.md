# 消费者兼容与安全边界（Proposed）

当前 main 来源在 [来源](sources.md)。M0 产品已落，但不能拿 M0 检查替 M1 新组合。本轮产品未改，以下为独审后的实施约束。

| 消费者 | 保留行为 | 本批增量/限制 |
| --- | --- | --- |
| REST/Zod | 原 route-policy、分页 cursor/null、Session revision、Plan step ID、Lease version/revision、错误 code/details/correlationId | 新确认 route/policy 先合同独审；typed读取仅共享 schema，不能写虚构 getLease 或 context history |
| SDK | E 优先普通调用、明确安装用途 slot、原 key/body 和 If-Match、401/403拒绝不换身份 | 新具名 reads/Lease 方法复用原请求与 mutateLease；确认显式安装请求，不修改共享 Session Token、不先 manifest/refresh |
| MCP | M0 Session/context/Plan tool/resource 名称和schema、只读模式、结构化拒绝、原ACK/heartbeat恢复分支 | stop_ack 独立原 E，确认安装用途分支；HTTP每次重建 client 无跨请求 E，C停止后不能refresh弥补此限制 |
| 精确 E Runner | 现有模型隔离、secret no-store、Pi实际工具/公开回复、单Turn预算、fence和ADR0068 | WAIT_REQUESTED 不走普通 RUNNER_ABORTED 跳settle；模型关闭→原子等待settle→无Lease monitor→唯一续 Turn重新claim/start |
| 旧 Runner | executionWaits 默认false、普通请求/旧credential字段、原模型消息路径 | 不接 pending wait/自动续 Turn或被复用的续接 Human Turn；新服务 list/claim/start三处强制门禁；opt-in持久记录在Attempt |
| 数据库与事件 | 已应用迁移不改；旧写默认null；既有事件类型与消费者忽略未知字段 | 增量来源与wait提案、schema-aware旧夹具、零历史推测；不在混合不支持新admission的旧节点期间启用新等待生产 |
| Human | 原批准决定、prompt、pause/resume/stop、retry、force release、成员/管理员合法读取 | 不授Agent Human、不注入cookie、不自动解除pause、不以自动continuation伪造Human新发言 |
| 原settle | 外层 runner-settle-{attemptId}回执、明确失败后的ADR0068回退 | sessionWait与sessionCompletion互斥；丢响应不得Turn-only回退；Pi内部 completion没有独立receipt，新GET不假确认 |

## 准确来源与恢复

新确认只允许实际原动作提交 E 的持久来源：C/Connection-backed安装必须等原Connection，native必须等原installation ID；同Agent/principal/Team或任意历史Token不能替代。来源写在原complete/stopAck事务，旧null/unproven失败关闭。完整快照可跨原E Token删除、同Connection合法轮换；撤销/删除Connection、安装无效、principal/grant/目标Delegation或scope撤销仍拒绝。native不凭空要求coordinator Delegation，Connection还需重验它。

只读受限身份解析绕过resolveCoordinationIdentity的usage/create/renewC Session，成功与拒绝均无签Token/续Session/receipt/activity/领域event/outbox；原authorization_denials独立审计例外保持。Agent缺来源证明隐藏拒绝；合法Human可按原合法历史读取取得不可确认状态，不能以此宣告原命令没提交。

等待需新opt-in和完整可证明来源，legacy来源未知不登记自动恢复wait，原普通操作/手动合法恢复不回归。批准/input/blocked具体字段及context在 [等待合同](wait-contract.md)，迁移与滚动开关在 [迁移合同](migration-contract.md)。新内部WORKMESH_EXECUTION_WAITS_ENABLED默认false，先所有API/Worker节点完成升级与能力核验，再启新Runner；不宣称现有此配置已实现。无混合集群安全证明就不开等待生产。

监测没有旧运行Attempt或Lease。Runner短时重启且Session仍live可恢复持久监测；离线stale、强杀/未知外部效果、过期Token或撤权不保证自动恢复，必须真实记残留。等待条件到达时paused不续接，Human合法resume后重验；执行前始终fresh state/live授权/模型/fence/动作批准。

仅UI重设计、F/TA新域、发行外发与团队权限扩展不在本批。

本轮仅两合同兼容修正：等待hash沿原sha256:前缀/完整比较，不要求旧批准改格式或回填；prompt无workspace_id，新约束(session_id,id)不改旧行，准确Session FK加现行锁内workspace授权。clean/升级/失败回滚均未来实测，不以静态匹配标产品通过。
