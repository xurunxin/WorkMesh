# M1 产品九类 DoD 与兼容闭合矩阵

最新真实 `/turns` 失权作者排队路径、正式终态结算和 claim 前序门禁的九类差分见 [本轮修复报告](product-queued-author-repair-report.md)。前轮 [修复报告](product-review-repair-report.md) 的 27 conformance / 120 Worker 保留历史：第三项旧消息夹具没有覆盖同时创建 queued Turn 的路径；原前两项已由另一 Agent 确认闭合。以下原矩阵保留 `6e90926e…` 历史证明范围，新组合以本轮原回执为准。

这是主执行 Agent 的产品证据索引，与冻结规划的未来测试清单分开。实际命令、退出、数量、skip、输入双字节和后来变化见 [运行索引](product-evidence/check-index.md)。下面以具名断言描述范围，不用“场景已接入”或工具数量代替运行结果；最终运行结论见 [主报告](product-report.md)。

## 九类实际落点

| 类别 | 本批具名实际断言与来源 | 结果入口 / 不适用边界 |
| --- | --- | --- |
| 正常 | `execution-recovery.conformance` 具名 Plan/context/版本/批准/Recovery 读取与 Lease heartbeat/renew/release；三个 Pi approval/input/blocked 等待公开结算、Human 精确触发、唯一续 Turn/Attempt、完成；运行中 Stop→finally→唯一 stopAck/canceled | `conformance-revoke-fixed` exit 0 的真实 HTTP/MCP SDK/Pi 子进程，完整 22 pass。HTTPS 假模型是确定性夹具，非商业模型实测；各独立适配方法的单元映射见 43 操作表 |
| 越权/撤权 | 双 C 先 refresh 后另一 C 提交、同 Agent 双 native installation、错误 Session/action/key；E terminal GET/重放拒；principal/grant/scope/安装撤销；Pi 等待后撤 Delegation，MCP 拒绝且零续 Turn/Attempt；Human 批准/控制原路径保留 | execution-result、execution-waits、M1/M0 conformance、stage1/stage2。双同 Agent 来源由明确 privileged test seed 构造，再以真实 HTTP 验证；不声称公开配对 API 允许重复 agentSlug/Team |
| 非法状态 | queued/ACK/普通 active 门禁回归；paused 输入不解除暂停，只有 Human resume 后重新准入；Stop/撤权取消 pending wait 且原 Turn 保持 settled；stopAck 不经普通 Activity，终态不刷新 E 或再次执行 | stage1、API execution-waits、Worker stage1-lifecycle、Pi pause/Stop。未创建新的普通终态重放例外；旧 settle 专用回执语义保留 |
| 幂等 | 原 complete/stopAck 响应被客户端丢弃后原 E 写拒、准确原来源 GET 确认；wait settle 原 key/body 重放同结果；旧 producer 重占过期 key 清空来源，普通 response 更新不清 proof；Session/Lease K1/K2/K1 不回退诊断 | execution-result、execution-waits、stage1 heartbeat、M1 conformance。GET 不要求写 key，也不新增 receipt；不能把 unavailable 当“未提交，可重做” |
| 旧 revision | Plan 旧 If-Match 拒绝；真实 MCP renew 后以旧 Lease version release 拒绝；Human 控制与批准版本沿原协议；Runner Plan/state 无前置 Activity，Lease heartbeat 不追加普通工具 Activity | stage1、stage2、M1 named lifecycle、Runner workmesh-tools 单元。读取和诊断 heartbeat 无写 If-Match 冲突，明确不适用；Session revision 与 Lease version 不混用 |
| 事务失败 | `execution-result` Plan/Lease/Approval/complete/stopAck 每项在 domain_events、outbox_events 两边界注入 PostgreSQL 故障，逐表 fingerprint 全回滚，并在移除故障后验证同合法命令成功；另测 provenance 写入故障；wait 持久化故障同时回滚公开 reply/Turn/Attempt/Session/wait/receipt；原 workbench 原子 completion 回滚 | `atomicity-capability-fixed` / `integration-stable`；workbench-runner。只读确认没有新 command/job，其事务故障 DoD 改核零业务写，拒绝审计账本例外单列，不要求假“所有表零写” |
| webhook/job 重放 | Worker outbox webhook retry/reclaim/重复 delivery ledger；等待双 Worker/重复 tick/重启不双消费、不双建续 Turn；原 settle 同 key 外层回执，不给 Pi 内部 completion 伪独立 receipt | Worker stage1-lifecycle/outbox-recovery、API workbench-runner、M1 conformance。只读投影不生产 job，反复 GET 零新业务事实；不新建 webhook 类型 |
| 并发 | Worker 两实例 reconcile 精确等待条件，sum=1；取消后重复实例零 Turn/Attempt/event/outbox；确认并发读取逐表零业务变化；Lease 独占冲突、现有 authority lock-order 在真实 PG 用 `pg_blocking_pids` 观察等待和提交次序 | execution-result、execution-waits、Worker stage1/stage2、API authority-lock-order/stage2。确认采用单次 REPEATABLE READ READ ONLY，不承诺查询返回后可以召回授权；外发 checkpoint 竞争属后续批次 |
| 重启/恢复/Stop | 实际 API/MCP close/restart 后原 complete/stopAck 结果相同；Pi input 等待重启 monitor 后真实 121 秒无模型/旧 Attempt/活跃 Lease，再触发唯一续接；运行中 Stop 模型闭门，scratch created/removed 原路径不存在；Worker 新实例重扫取消与续接不双执行；真实 backup/restore 根集成 | M1 conformance、Worker、Recovery。强杀无法保证 finally，未知在途/idle 不能确认时保留 residual/scratch；故障分支另有 Runner 单元，未冒每种物理断电/系统杀进程均已实测 |

## 精确来源、迁移与 Stop 定向证据

| ID | 具名测试 / 证据 | 确认范围 |
| --- | --- | --- |
| M1-ORIGIN-DOUBLE-C | conformance `complete/stop_ack 丢响应…提前 refresh 的其他 Connection 拒绝`；`origin-double-connection-complete.json` / `origin-double-connection-stop_ack.json` | 同 Agent/principal/Team 允许正对照，原动作实际 E 来源唯一；query 不签 Token、不新 C Session、不写业务事实 |
| M1-ORIGIN-DOUBLE-NATIVE | conformance `同 Agent 双 native 安装…`，API 来源测试 | 原安装成功、另一安装拒绝；原 E Token 删除后持久快照仍确认；old null/unproven 不推测回填；live revoke 拒绝 |
| M1-ORIGIN-ROLLING | API `clears retained provenance when a rolling old producer reoccupies an expired key`；commands-lock-order 新/旧 schema 分支；0017 reset trigger | 旧 SQL 不认识新列仍在新 schema 清掉旧来源；同原 response 更新保持 proof。测试改变 reserve shape，未以查询补写来源 |
| M1-CONFIRM-ZERO | API fingerprint；conformance `facts()` 比较 | 具体逐表集合由这两个源码函数固定，含 credential/installation usage、C/E Session/Token、receipt/event/outbox；既有 authorization_denials 可增。未声称对数据库所有未知未来表做无限集合证明 |
| M1-WAIT-HASH | 真实 SDK `requestApproval` 返回的原 `action_payload_hash`→MCP get→Pi wait→DDL→Worker→Pi consumeApproval→完成；API 错合法 hash、裸 hex/前缀/NULL DDL 拒绝 | 保完整 `sha256:<64 hex>`，无 strip。Pi 等待工具用实际返回值；批准请求由确定性夹具的 SDK 发起，不冒模型亲自生成请求工具的用例 |
| M1-WAIT-PROMPT | API `rejects another Session prompt…` 与真实 DDL probe；migration-baseline clean/0016 upgrade | 新 UNIQUE(session_id,id) 先于 exact Session FK；同 Session 正例、另 Session 外键拒；workspace 由锁内 Session 授权另核，不给不存在列建 FK |
| M1-WAIT-DDL | API `enforces wait persistence shapes…`；migration-baseline 新升级用例 | wait NULL CHECK、防重复 source Turn/Attempt/pending Session/continuation Turn、origin immutable、准确 prompt；前一增量升级与 clean inventory 相同，after_sql 故障全增量回滚，旧 receipt 来源 NULL，重复迁移幂等 |
| M1-WAIT-CONTROL | API stop/revoke public投影；Worker sourceKind×closure；Pi wait pause Stop 与 delegation revoke | 已结算公开等待 reply 和原 Turn settled 保留，wait canceled/resolved、无 continuation；重复 Worker/restart 无新事实；准确输入不覆盖 pause/Stop/撤权 |
| M1-STOP-FINALLY | Pi `模型运行期间 Stop…finally` + `pi-stop-finally.json`；Runner execution-lifecycle/run-session 单元 | 先模型 abort/idle 再清本人 scratch、独立 signal 原 E stopAck；不能经普通 makeTool，不能拿 ordinary release 代 Stop。未知 idle/cleanup fault 是受控残留分支，不复活模型 |
| M1-WAIT-COMPAT | API old claim opt-in 拒；Pi legacy list 不返回续 Turn；DTO mutually exclusive/feature default；SDK/MCP named adapter 单元 | 旧请求缺字段维持 wire，默认关闭 wait 自动生产；Attempt opt-in 持久、claim/start fresh 检查，monitor 不运行模型 |

真实客户端 JSON 属于每轮 `*-client-evidence.zip`，名称与服务 registry/runId 对应。DB/API 完整通过取 `integration-stable` 的已执行阶段；该根命令原 exit 1 保留，其 conformance 拒绝码断言已修并由 `conformance-revoke-fixed` 完整通过。Worker 取 `worker-complete`，真正启用的 Recovery 取 `recovery-real`，均 exit 0。原首败、被中断 exit 未知、方案历史和不同组合通过不被本矩阵覆盖掉。

## 限制与未测细项

商业模型 live 测试、原 retention upgrade 专用环境测试及 Worker 中已有两项 Linux 专用 FD/flock 单元在当前 Windows 按原配置 skip；精确名称/原因见主报告与完整日志。M1 新用例没有新增 skip。API/Worker 进程恢复、确定性 Pi 子进程退出/重启、事务故障以及锁等待有代表证据；未执行每个 crash 点的真实 OS 强杀、所有凭据过期和文件清理失败的客户端笛卡尔积，也未把 Runner 单元故障注入称为这些场景真实端到端通过。后续发布、三 OS 分发、真实外发与外部 CLI/机器恢复均不由本卡结果保证。
