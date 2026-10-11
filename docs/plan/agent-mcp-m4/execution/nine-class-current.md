# 六域九类用例与适用边界

原九类全文和原 DoD 保留在 `../input/frozen-m4.md`；本表只映射当前源码及新证据。完整命令的退出、首败、skip、缓存和源码前后指纹查 `checks/`，不能把本表或局部内部审结论当产品验收。

| 类别 | 本批新用例与实际证明 | 保留回归与不适用 |
| --- | --- | --- |
| 正常 | stage4 四读非零 rollup、排除其他 linked scope、Human 对照、200 项上限、多币种/unknown；optional 套件真实 cycles/Initiatives/View/results/Rules/Loops/run/pin/usage/A2A，SDK→HTTP MCP→真实模型→DB | Template 只返回当前执行 pin；C 无项目的 rollup 为隐藏目标，不虚造项目；金额不经 Number |
| 越权/撤权 | A2A E/C/Human 扫描后到期与 overlap 到期，grant 已提交撤权，空/非空页最终拒绝；其他三读真实 PG 语句前/后撤权；origin 读 target 拒绝，private owner 与显式 usage 异过滤拒绝；六 feature 关闭 REST/MCP 拒绝 | Human 管理未授 Agent；四项 target 未知仅 pending，调用再核；原列表后撤权不能以零聚合掩盖 |
| 非法状态 | paused Loop 结构化 INVALID_STATE；no-overlap 与硬预算拒绝；Stop 后普通 run/usage 拒绝，发现非法状态拒绝；未批准与改体 health publish 拒绝 | 纯 GET 无状态迁移命令；验证停止后的资格，不创造新的写 transition；项目less Loop Workbench 保持不支持 |
| 幂等 | MCP/SDK saved-view 与 usage 相同 key/body 复用、异体 KEY_REUSED；Loop 同 key/body 和 occurrence 回执，A2A 同页并发/重读仅一份派生 delivery | 纯 GET 无 Idempotency-Key；A2A 原 binding/event 唯一约束不替换成新 receipt；Runner 不扩大自动 replay |
| 旧 revision | health 原 If-Match 旧 revision 拒绝，精确 approval payload hash 才可 publish，completion 建议保持 workflow 状态 | 非 revisioned saved-view/runLoopNow/usage 和普通 GET 不新增 If-Match；Human Rule/Template 管理沿原 Stage4 回归 |
| 事务失败 | 真实 PG usage INSERT 触发器错误，usage/event/outbox 零新增；真实 Loop Session INSERT 故障，run/session/delegation/reservation/receipt/events 全回滚；A2A 最终 INSERT 后真实 SQL 错误全回滚；saved-view/health/completion 在 outbox AFTER INSERT 真实故障后领域事实、project revision、event/outbox/receipt 全回滚，同 key 恢复和异体拒绝 | 其他三个投影不写领域状态，写回滚不适用；准确批准与故障回滚分列，不把草拟故障称已覆盖发布批准每种故障 |
| job/outbox 重放 | 原 stage4 与 worker 集成检验 existing rule/effect/checkpoint/fence/Loop reservation，A2A 原 derived delivery 复用；fake Agent HMAC smoke 拒重复 | 本批有限读不产生新的 jobs；不进行真实外发、不验证 TA 新任务或无限流；根 Worker 结果按实际回执单列 |
| 并发 | 两个合法新请求的 no-overlap、成本及 Token reservation 竞争，真实数据库屏障撤权已 commit 后才释放，A2A 同页并发去重；旧 RR/now 负例与显式 RC/statement 时间正例分列 | 不把顺序调用称并发；纯 GET 无 OCC 写冲突、无新读锁；旧 Loop admission 锁序与 Human pause 保留 |
| 重启/恢复/Stop | optional 重建 owned API，从持久 A2A cursor 恢复，精确旧 E 在 Stop 后拒绝；native daemon 归属 stdin/EOF 关闭；原 M5 核心恢复入口保持 | API fixture 重建不是 OS PID 重启；没有新增机器/命令恢复权限；整库恢复套件的独立环境缺失则如实列 skip，不能推为已验证 |

纯 GET 不适用写 revision、receipt 和 event/outbox 回滚，但逐次实时授权必须测试。A2A 有派生写，单独适用最终授权、事务回滚、并发与 delivery 去重。未选的 Human 管理、真实出站、其他 OS、真实 provider 和发行门禁均不从旧绿色继承。

完整根集成本次退出 0：DB 81、API 291、六套 conformance 97（含完整 M4 13）、Worker 147 passed。API workbench-runner、Worker retention-upgrade-barrier、整库 recovery 各保留 1 skip，具体准入开关及未测理由在当前检查报告中单列；不以 616 passed 消除这些缺口。M4 无迁移/retention 升级，API 重建/领域 Stop 恢复实证不冒整库备份还原或真实 provider 验收。
