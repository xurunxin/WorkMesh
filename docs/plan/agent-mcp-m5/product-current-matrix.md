# M5 当前结果入口

以 [完整交付报告](product-current-report.md)、[OpenCode 原件说明](review-fixes-opencode.md)、[命令实际回执](product-checks.json) 为当前实施入口。旧 product-report/product-gaps 和 ZIP 保持其历史源码/失败含义。本表不替代冻结九类、正式成果独审、最新 Required CI 与 actual Done/main。

| 项目 | 已有实际结果 | 当前边界 |
| --- | --- | --- |
| 原生 OpenCode 私有隔离、准确身份 | actual-identity-v13 exit 0；准确 API/DB/MCP JSON 模型实收、2 skills/85 plugins、归属退出 | 非四主链；关闭 ECONNRESET 原件保留 |
| 大中文模型实收 | native-large-roundtrip-v11 exit 0，288107 bytes 逐值相等 | 模拟数据对照，不代领域事务 |
| 普通 E 撤权/恢复与三项 Pi 受限重放补充 | review-joint-regression 23/23 exit 0 | 新增一致 status 后 review-joint-final-status-combination 23/23 exit 0，211.2798811 秒；源码前后稳定 |
| 安装 target/普通 E、锁清单 | review-guard-unit 14/14，review-lock-manifest-current 8/8，均 exit 0 | 不代 API 全集成 |
| API 原首败 | 275 pass/3 fail/1 skip，exit 1 | 三处边界已改；中断的后续复验 exit unknown，不当通过 |
| status 并发快照/撤权、停止诊断 | review-status-snapshot-real-sequence 1 pass/5 未选择，exit 0 | 实际 PostgreSQL blocker 和两种准入次序；待全套/正式复审 |
| API 最终组合复验 | review-api-status-final native exit 0，27 文件/278 pass/1 skip，353.4233689 秒 | 新组合实际退出；正式复审仍待取得 |
| O-N | joint-o-n-canonical-approval native exit 0，226.6488571 秒 | 真正 O 接单/核心协作、P required child、Handoff 后 P 新 Session 批准等待/完成；原五轮失败和期间源差异保留 |
| P-N | joint-p-n-first native exit 0，166.8814945 秒 | P 核心协作、O required child、O 新 Session 批准等待与完成；准确源前后稳定 |
| O-G/P-G | joint-o-g-null-error exit 0，211.041888 秒；joint-p-g-first exit 0，305.8676238 秒 | 真实 O/P producer 与另一客户端 reviewer、真实 Worker PID 重启、Human 批准、精确 action、父子完成；首轮 error:null 误判保留 |
| 同 Session 两轮 O/P Plan 冲突、Document 竞争 | joint-revision-first native exit 0，149.7402954 秒 | 真实 O/P 两顺序 Plan、共享 Document 冲突与明确合并；不借跨 Session 拒绝，源码前后稳定 |
| OpenCode 事务/身份/Stop | joint-external-stop-discovery exit 0，105.6978124 秒 | MCP/API 真子进程重启、原 receipt、删除/恢复 membership、500 事务回滚与零事实、Stop 普通写拒和原 E ACK/Lease 清理 |
| O/P 事件恢复与协议重放 | joint-events-current-plan exit 0，101.0155179 秒 | 两实际模型收到 durable cursor 恢复/过期错误及 resyncCursor；Room 原消息重复单事实；签名 webhook 同 delivery 回放409/过期401/非法401另列为协议投递 |
| 跨 Team/Session 与并发领取 | joint-scope-project-owner exit 0，100.6174125 秒 | H2 第二 Team Project Document 合法读、O/P 准确拒绝；两个实际 O 模型屏障领取只有一 Session；非法状态零 revision 变化 |
| Pi 原子结算与 warning | joint-atomic-first exit 0，43.5530751 秒 | 第一次500时 Session/Turn/Attempt/消息/完成事实整体回滚，真实 Runner 同 key/body 第二请求200；明确409后只结算 Turn，Session live 和可见 warning |
| 当前完整入口组合 | joint-complete-current 实际四链及五故障阶段全完成，905.7747903 秒，原补充门禁 exit1；joint-combination-evidence-final 证据续接 exit0 | 准确原 stdout/stderr/690 运行源码/945 补充源码核验；原 exit1 保留，单诊断冒证负例拒绝；不是第二次模型运行或原完整命令exit0 |
| 必需集成首轮及续跑 | 原 root exit1；后续 conformance82pass/2fail，修订套件12/12加无变四套件72pass；Worker147pass/1skip exit0，空夹具恢复1/1 exit0 | 原首败和恢复旧桶6版本失败保留；新本人空库/桶先登记，旧恢复原件未删除。review-integration-evidence-final核396前缀消费项及实际回执 exit0；原整条命令不冒exit0 |
| Lite/小团队/企业与其他 OS | 当前为 Windows 本人测试部署 | 未测画像不勾选，旧三 OS/发行门禁保持 |
| 正式成果复审/最新 Required CI/actualmain Done | 未取得 | M5 未验收，不合入或启下一批 |
| 新 status/消费者对应全仓检查 | review-final-root-lint-current/type-current/unit-current 均真实 exit 0；18/18、18/18、32/32 tasks，缓存15/13/28 | root unit 含 MCP51；原实际 E2E70 passed，源码构建18/18、12cached exit0，CI分类16/16/validate exit0；后续变更按消费源码核适用性 |

新资源与退出以 owner 回执核实；登记不是存活或收尾证明。受保护恢复目录、共享缓存、历史拒绝目标及父目录保持原边界。
