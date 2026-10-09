## M1：现有执行、批准、租约与 Stop 恢复闭环

**范围**：补允许的Session get/list、Plan/context读取及版本列表、Approval list/get、Lease list/heartbeat/renew/release、Recovery list/get、专用stopAck工具；补欠缺具名/typed SDK并沿现有 `mutateLease(action)`复用。Runner只补自己精确E授权下的工具；生命周期握手/token刷新/Stop清理由受控adapter承担。保留H pause/resume/stop/retry、force-release及批准决定。

Stop清理不能直接复用默认 `makeTool`：它会先写普通Activity且检查已abort signal；停止时这些写已被拒绝。推荐受控Runner生命周期finally路径单次提交专用cleanupSummary/residualRisks，不启动模型继续执行、不任意替别的Session确认。服务器Stop已释放Lease；不能拿停止Agent普通lease release来替代该机制。

**文件**：contracts/SDK/MCP/Runner/conformance与API现有查询合同；`apps/api/src/agent/routes.ts/commands.ts`、`collaboration/routes.ts`、`recovery/routes.ts`用于一致性检查。不新增状态机、权限或表；只有准确typed适配缺口，如发现现行查询缺字段先契约更新。

**终态失响应的实际缺口与最小设计建议**：main的 `authorize.ts` 在stopAck只允许stopping；成功后已canceled，complete后已completed，原key重放可能在到达幂等账本前被拒绝。`getAgentSession`等读取也有active Session前置，不能声称同一终态E token还能GET确认。ADR0068仅对既有settle提供有限重放例外，不能泛化给所有命令。

推荐M1增加一个**精确执行结果只读确认合同**（新增查询范围，先ADR/安全合同评审）：由仍有效的Connection/安装身份或Human发起，重新验证live身份、Team grant、principal/delegation关联及准确session/action归属，只返回该主体可读的终态、revision、原command/event/result引用与清理概要，不签新执行Token、不续Session、不改变receipt/event/outbox。Coordination读取执行结果也必须验证上述绑定，不能只因当前C Session活跃就读任意E结果。Runner由受控认证adapter提交settle后沿既有协议重放；独立静态E未配置可用确认身份时明确待H查询，不能偷偷借Human cookie。查询路径/operationId/DTO在M1方案冻结时确定；本卡不创造一个已实现端点名。

另一项是为complete/stopAck设计只返回**已提交的精确同key同body结果**的有限重放路径；它涉及终态/撤权的安全语义，必须独立裁定、验证无新写，不推荐直接放宽terminal active gate。采用只读确认建议时，下表duplicate判定是“无双写、拒绝能准确确认原结果”，不要求每次普通命令重放返回200。这是新增最小查询与现有门禁适配，非纯工具别名，不能套“不新增权限/合同”的一般描述；仅新增这一明确确认读范围，普通命令权限和状态机保持。

**真实客户端链**：C接单得到queued Session事实及E bridge→E能力握手（queued允许）→ACK→转planning→读Session/context/revision→发布整Plan→进入合法executing状态→读当前revision→取Lease→heartbeat/renew→请求准确批准→等待H/既有授权策略→执行允许动作→释放Lease→publish evidence→complete。另一场景Human stop→客户端停止普通写→专用清理确认→canceled；Session完成不自动Issue done。

**测试落点**：MCP/SDK/Runner既有单元；扩展 `apps/api/integration/stage1.integration.test.ts`（现有）、已有Lease/Approval集成；`packages/conformance/src/execution-recovery.conformance.test.ts` 待创建。纯读恢复的事务/job负例不能套写命令统计。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 从新Connection接单到Plan/Lease/证据完成；只消费tools的真实客户端能读所有前提；Plan稳定step ID跨版本不变，批准仍准确hash |
| 越权/撤权 | 别的Session不能stopAck/续租/读Inbox细节；已取Lease后撤Delegation/Team/能力不再写；批准不可自决 |
| 非法状态 | invalid transition拒绝；paused/stopping/terminal普通写拒绝；stopAck仅允许stopping专用例外，不允许重新executing |
| 幂等 | ack/Plan/Approval请求/lease维护/complete/stopAck同key重复不增事件；异体冲突；K1/K2/K1 heartbeat不回退诊断投影 |
| 旧revision | Plan更新冲突不覆盖；lease renew/release/complete/stopAck用旧revision拒绝；错误包含准确新版本读取方式 |
| 事务失败 | Plan、lease、批准请求、completion、stopAck注入事务失败，领域state/event/outbox全部回滚；只读list/get不产生新领域事实，拒绝审计例外单独核 |
| 重放 | outbox重复不能再完成Session或重复批准；lost response重放沿原key；Stop清理重复保持一个专用事实；heartbeat稳态无事件放大 |
| 并发 | 独占Lease两Session竞争、续租与过期job、Plan两个版本、Stop与complete/普通写竞争按提交次序裁定；Lease holder详情可理解 |
| 重启/恢复/Stop | 重启保Lease/PostgreSQL事实、durable cursor和未完成批准；过期Lease停止受保护动作；默认Activity已失权而stopAck成功；外发checkpoint的Stop前后竞争由M3追加验证 |

**任务DoD**：执行和停止两条链均通过Native HTTP/MCP及Pi实际适配；没有H控制动作偷渡，没有Plan前置Activity破坏revision，完成材料/显式no-artifact遵循现行合同。

终态确认另须覆盖：stopAck/complete提交后丢响应、同key重放被前置终态门禁拒绝、仍有效准确C/安装身份查原结果成功、不同Connection/其他Session/已撤权或越scope身份读不到、不建新执行事实。原E GET终态拒绝是正负对照；若未具备确认身份/合同则记闭环未验收，不宣称无障碍恢复。
