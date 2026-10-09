# M1 成果独审三项阻塞修复

本轮从 `6e90926e768290c85863c35c400aa6866e4d1f12` 同分支继续实现。修复三项独审意见，完成本轮实际运行和受控归档，提交后停平台另一 Agent 成果复审；本报告不宣称独审已闭、PR Required CI 已过、main 已合入或整卡验收。真实 `refs/heads/main` 仍为 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`，工具原返回见 [主线观察](product-evidence/review-repair-main.json)，原生退出字段未提供，保持 null。

已审 `938f67f…` 方案、安全合同、来源确认裁定和等待自动续 Turn 裁定继续适用。旧候选、规划历史、首败、原 product-report 主体、78 源码/93 归档绑定与运行索引保留历史含义，不能将其当成本轮修改后字节的通过证明。

## 修复与源码依据

| 独审项 | 更新后的实际代码 | 验证 |
| --- | --- | --- |
| 复用 queued Turn 的上下文 | `packages/db/src/workbench-execution-waits.ts` 在 `const turnId = queued?.id ?? …` 之后，无条件插入准确 trigger 的 service/system 消息，使用 `conversation.next_message_sequence`；Conversation `next_turn_sequence` 仅按 `queued ? 0 : 1` 增加。消息事件与 outbox 同事务提交；`if (!queued) await appendEvent(… 'workbench.turn.queued' …)` 保证复用不伪建第二个 queued 事件。credential 原来的按该 Turn 最大消息 sequence 截断现在包含源 Turn 的公开 assistant 等待回复和准确真实触发内容，不放宽 context 限额。 | 新增真实 Pi prompt/approval 两正例：源 Turn 已 running 时通过真实 Human HTTP 提前排队，wait 后不满足条件不能恢复；准确 prompt/原 requestApproval hash 的批准触发后复用准确 queued ID。模型实收内容含公开等待回复及准确触发；最终恰好两 Turn/两 settled Attempt，queued 事件仅一个。 |
| pending 扫描饥饿 | `apps/worker/src/session-lifecycle.ts` 每轮先固定 `(created_at,id)` 最大上界，用 `created_at::text` 保全 PostgreSQL 微秒精度，按 `> cursor`、`<= upper` 做 keyset 分页直至边界。每页最多 100，逐候选仍独立事务并重验 live 权限；`limit` 是本内部 helper 的页大小，单次 changed 总数可超过页大小。重启无需保存内存 cursor，每轮均可走到最老页面之后。新到且未纳入边界的记录由下一轮检查。 | Worker 新数据库用例有 100 条真实 pending/paused 记录在前，第 101 条真实合法输入满足；双 Worker sum=1、前 100 仍 pending，Worker 重建再扫零新续 Turn/Attempt，已有授权、Stop/撤权与取消测试照常执行。 |
| 失效输入遮挡 | `packages/db/src/workbench-execution-waits.ts` 的 `selectValidWaitInput` 按事件 cursor 分页 prompt，逐条复用 `validWaitTrigger` 当前合法 Human 谓词；拒绝后推进 `eventCursor = prompt.cursor`，而不是返回整个 reconcile。没有合法 prompt 时清 `trigger_prompt_id`，按 message sequence 分页并同样跳过拒绝者。保留原 prompt 优先、再 Conversation 消息的顺序，最终提交前再次验证准确 trigger；错误候选无新事实。 | 新增真实 Pi 三路径：旧 prompt→合法 prompt、旧 prompt→合法 Conversation message、旧 message→合法 message。旧作者先具 Team membership 的显式 privileged 对抗夹具，随后实际删除 membership；合法后续输入用原合法 Human HTTP。旧候选单独存在时不恢复，双 Worker/重启唯一续接，持久 trigger 指向准确新输入，模型实收合法输入并完成。 |

生产改动仅上述 helper 与 Worker；更新 `packages/db/src/agent-lock-order-manifest.ts` 两处行位置，由现有 `UPDATE_AGENT_LOCK_MANIFEST=1` 生成器产生，SQL 哈希、锁等级及例外未变。测试改动为 Worker stage1、M1 conformance 和其 HTTPS 假模型夹具；夹具新增公开消息实收记录与在首次 wait 工具前的排队钩子，不改生产模型时限。`scripts/m1-review-repair-evidence.py` 只做本轮受控证据生成与只读资源检查。

本轮无新迁移、DTO/path/operationId、事件类型或权限策略。原 0017、终态只读确认、Stop 专用 ACK、旧 key 来源清理、普通终态 E 禁写、Human pause/resume/批准权限保持原合同；不补写历史 provenance，不伪造 Pi 内层 completion receipt。REST/SDK/MCP/Runner 的 [43 操作表](product-operation-matrix.md) 保持原映射字节，新增验证对应 wait settle、prompt/approve、assignment/claim/start/credential 及 Worker 续接消费者，不声称逐 43 操作重新做了一套独立 HTTP 实测。

## 实际命令及结果

全部使用受控 Node `22.19.0` / pnpm `9.15.4`，原命令、实际退出、运行时、每 workspace 数量/skip、输入 ZIP 和前后变化见 [本轮命令索引](product-evidence/review-repair-check-index.md)及 [JSON](product-evidence/review-repair-check-index.json)。每个健康运行均在本轮取得最终退出后才收尾。

| 实际入口 | 退出 / 秒 | 实际数量与限制 |
| --- | --- | --- |
| `pnpm typecheck` | 0 / 31.401 | 全仓 18 tasks；15 cache。派生清单生成后另跑 DB typecheck，退出 0 / 34.118 秒。 |
| `pnpm lint` | 0 / 30.318 | 全仓 18 tasks；15 cache。后续清单仅改变两处位置字符串，由标准 unit/DB 编译/build 验证。 |
| `pnpm test` | 0 / 131.908 | 全仓 32 tasks；Runner 67、DB 28、Worker 211+2 原 Windows/Linux 条件 skip、API 180、SDK 52、MCP 50，其他 workspace 小计保存在完整日志，不能相加冒无 skip 总数。 |
| `pnpm test:integration` | 0 / 553.942 | 根入口从 DB→API→M0/M1 conformance→Worker→Recovery 实际贯通。DB 81/17 files；API 257/27 files+1 商业凭据未启用 skip；conformance 27/2 files，零 skip，含真实 121 秒等待、Stop/失响应/双来源拒绝和本轮五 Pi 回归；Worker 120/8 files+1 retention 升级夹具条件 skip；Recovery 根入口 1 条未启用 skip。 |
| `pnpm build` | 0 / 153.722 | 全仓 18 tasks，5 cache；没有再产生 apps/packages 源目录溢出 JS/d.ts。 |
| 首轮定向 conformance | 0 / 52.322 | `-t '提前排队\|失效旧输入'` 筛选五条新增测试通过、22 条因筛选 skip；只算定向证据，完整套件由上面的根入口验证。 |
| 首轮完整 Worker | 0 / 57.566 | 120 pass+1 原条件 skip；修改 scanPrefix 的类型收窄后，最终组合再由根入口完整验证。 |

不重复无变化且已充分绑定的 E2E 70 pass、真实 Recovery 专项 1 pass、route policy/Runner skill/CI validate/CI policy/smoke 等原通过检查：本轮未改这些入口或其合同输入；Web E2E 无 executionWaits/sessionWait/workmesh_wait 路径。原 `recovery-real` 真正配置源/目标数据库与桶的专项结果保持原证明范围，不把本轮根 Recovery skip 冒作再次通过。普通 UI/发布/三 OS 分发、商业模型、全状态物理强杀组合仍保留 [原报告限制](product-report.md)。

首轮 typecheck/lint 均 exit 2，原因为新 testCase 可空 `scanPrefix`；显式收窄为数字后修复。首轮 unit exit 1，原因为 helper 插入函数使锁清单 siteKey 从 `166:75`/`363:77` 移至 `198:75`/`385:77`，没有删锁断言或增例外；用现有生成器更新后标准 unit 通过。三份首败及完整原输入均保留。原生成命令明确先设置 `UPDATE_AGENT_LOCK_MANIFEST=1`，该运行只证明清单生成，不替代随后非 UPDATE 模式的标准 unit。

临时终端读取新索引时未指定 UTF-8 导致 GBK 解码失败，后以 `-X utf8` 实读成功；不是产品测试失败，没有独立实时诊断回执，该缺口不补造。第一次证据生成 69 文件仅捕获 apps/packages/scripts，随后补足原 78 成员的合同/协议/根配置，加新证据脚本共 79；第一次生成输出保留于 `review-repair-first-evidence.zip`，不冒其已含最终完整范围。

## 九类 DoD 与差分闭合

原 [九类矩阵](product-closure-matrix.md) 的逐场景正拒断言保持历史。本轮新增与受影响组合如下；矩阵数量与所有实际 skip 都取原日志。

| 类别 | 本轮对应真实证据 |
| --- | --- |
| 正常 | 两条 queued 复用 Pi +三条失效输入 Pi，完整 conformance 27 pass；模型实收公开回复和准确触发。 |
| 越权/撤权 | 旧作者失去 membership 后跳过，另一合法 Human 输入生效；准确来源/双 C/双 install/撤权负例仍在完整 API/conformance 中。 |
| 非法状态 | 最老 100 条 paused wait 保持 pending，不自动解除 pause；原 Pi Stop/撤权/公开 reply、Turn settled、零新 Turn/Attempt 回归。 |
| 幂等 | Worker 双实例/重复 tick/重启 sum=1；queued 原事件只一个；原 wait settle 与终态只读确认/旧 key 来源清理回归。 |
| 旧 revision | 原 wait If-Match、Plan/Lease/批准旧 revision 正拒仍在完整 API/conformance；本修复未新增忽略 revision 路径。 |
| 事务失败 | 原 wait/reply/Turn/Attempt/Session 回滚、动作 provenance/event/outbox 原子性用例由完整 API 回归；新增续接消息仍在既有 withTx 中与 wait consumption 一起提交，不引入外部副作用。 |
| job/webhook 重放 | 完整 Worker/outbox suite；恢复 Worker 重扫 101 条和三个输入路径不重复继续。 |
| 并发 | 两实例争同 wait、准确 queued ID 复用，不双建 Attempt；所有 authority 锁顺序/负例 inventory 标准 unit 通过。 |
| 重启/恢复/Stop | 101 条公平扫描无内存 cursor，重建 Worker 不增事实；完整 Pi 121 秒等待、monitor 重启、finally Stop、HTTP/MCP 重连。Recovery 未启用 skip 与原专项通过分别保存。 |

## 原件、运行绑定与资源

本轮 12 份检查原输入 ZIP 保存运行工作树与 `6e90926e…` Git blob 双字节，含真实 post fingerprints；最终 [79 成员源码索引](product-evidence/review-repair-source-index.json) / `review-repair-source.zip` 将新工作树与原候选 Git 字节分列，不把 Windows LF/CRLF 或已提交对象与运行字节混同。ZIP 逐 member SHA-256 与 CRC 核实，完整索引见 [18 份新归档](product-evidence/review-repair-archive-index.json)。

完整原日志在 `review-repair-raw-logs.zip`，内容寻址索引记录原 bytes/SHA-256；可读副本仅规范尾随空白/末空行，不改原归档，也不改 .gitattributes 或 CI 门禁。旧 log/ZIP/index/candidate binding 不覆盖。

最终 [静态/暂存对象核验](product-evidence/review-repair-static.json) 已实核完整 main→候选范围 `git diff --cached --check` exit 0、79 成员暂存 Git 与运行工作树分别绑定、18 新 ZIP 暂存与工作树二进制一致并 CRC 正确、43 操作映射及七份已审规划原件未变；这只计静态结果，不据此推断产品测试通过。

本轮根集成运行期间仅派生锁位置清单变化；两个 SQL 哈希和锁等级未变，实际执行 helper/Worker/客户端测试源字节没变。生成后标准 unit、DB 编译及 build 另核新清单。unit-fixed/build/derived-types 运行期证据脚本仍在完善，属于非产品运行输入；该脚本最终实际生成两次均退出 0，首生成原件单列保全。前后变化完整逐路径写入索引，不称运行期间全树零变化。

三个服务运行各创建 PG/Redis/RustFS 独有容器，共九个；随机端口、tmpfs、专用 DB/桶、ready 与必要脱敏日志/客户端实收 ZIP 在原 registry 与每轮 client-evidence.zip。helper finally 先保全，再核准确 ID/name/owner label 后 stop/rm，成功退出才记 cleaned；其原实现没有逐命令 stdout，诚实保留该限制。最终 [资源回执](product-evidence/review-repair-resources.json) 核九个 cleaned、本人容器零残留、本轮受测 PID 无同工作树活动引用。共享服务/镜像/默认网络、G1D0C3 已拒目标、当前工作树/恢复目录、Node 运行时保持；未进行全局 prune 或递归路径删除。

## 复现与交审

使用 `scripts/m1-run-services.py <新的唯一名称> pnpm test:integration` 启动独有测试服务并运行根入口；用 `scripts/m1-run-check.py <新的唯一名称> pnpm test` / lint / typecheck / build 保留新结果，不能复用旧名称覆盖回执。真实 Pi 使用 HTTPS 确定性假模型和实际 Runner 子进程，不需要聊天凭据。新增测试中的旧作者和 100 条 pending 是显式 privileged 对抗数据库准备，合法触发与执行用真实 HTTP/MCP/SDK/Pi。

准确新提交 SHA 由主执行回复给出，避免把文件自身未来 SHA 写回造成循环。成果复审须基于新候选完整源码与本报告/矩阵/原件；闭合后再走 latest Required CI 与实际 main/Done 门禁。本轮仅提出三项修复证据，不代另一 Agent 宣布成果审查已闭。
