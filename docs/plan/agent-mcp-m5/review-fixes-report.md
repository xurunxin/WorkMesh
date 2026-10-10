# M5 正式成果审查后的实施接续

本报告保留从 `aa324caa769b472209c35288ee59d837144bb737` 到中间 checkpoint 的修复过程。当前完整结果见 [产品交付报告](product-current-report.md)：真实四条 O/P 主链和九类阶段已执行，原组合补充门禁 exit1 保留，精确证据续接 exit0；补充各阶段均已实际通过并核消费源码。以下较早“待运行”描述只属于当时进度，不代当前结果。原 [产品报告](product-report.md)、首败、规划和原件保持历史含义。正式 `_oY` 复审、PR Required CI、actual Done/main 尚未具备，M5 未验收。

## 实时资格修复与实际证据

普通 E 使用已有 `principalTeamAuthorityPredicate`：活跃 Human，且为 workspace admin 或拥有准确 workspace/Team membership；不允许失权主体读取旧回执。无新增角色、公开参数、事件或迁移。

- `apps/api/src/authz/authorize.ts:loadAgentFacts` 在普通 E 的事实查询中加入 `principalTeamAuthorityPredicate('d.principal_human_actor_id', 's.workspace_id', 's.team_id')`。
- `apps/api/src/agent/guard.ts:assertAgentPrincipalInTx` 对原 principal actor 与准确 membership 取 `FOR SHARE`，随后重新消费实时资格；保留原 ranked Agent 锁计划，不额外锁 Team。
- `apps/api/src/commands.ts:mutate` 与 `apps/api/src/agent/commands.ts:agentMutate` 在有效原回执返回前及新 handler 前执行 `await assertAgentPrincipalInTx(...)`。回执的 operation/hash/expiry 校验仍先执行，不能因 handler 被跳过漏掉撤权。
- `apps/api/src/workbench-runner.ts` 的 status GET 用相同 predicate，保持纯读；Stop、终态 settle 的专门恢复规则不改为普通 E 写入口。

`packages/conformance/src/joint-clients.conformance.test.ts` 新用例明确断言 `status: 403`、`code: 'SESSION_SCOPE_DENIED'` 及 correlationId，不能把 500 当授权拒绝。真实 Pi 首 Document commit 后失响应，删除原 principal 的准确 membership，原 E 的 Document GET/status/同 key 回执/新 key 写入全部拒绝；恢复原成员后原正文和回执返回，Document/event/outbox 各一次，Attempt 的 `external_effects_reconciled=false` 保留。模型错误实收、显式测试侧对账、代理观测与 Runner 实际业务请求分列，代理不替 Runner 发送第二请求。

独立实跑包括 inactive principal、管理员降级、活跃 admin 无 membership 合法，以及 `pg_blocking_pids` 观察到 membership 删除等待授权事务提交。Document GET/status 在撤权前与恢复后返回相同事实，读取没有增加领域 event/outbox。

新完整补充套件 `review-joint-regression` 实际 native exit0，23/23 通过，0 跳过，runtime 223.2792435 秒。其全仓 source digest 变化来自并发 OpenCode driver 修订；受测 API、Pi fixture、测试源码前后逐文件稳定，不能把整个 digest 宣称未变。过滤运行 `review-membership-real-member-exact` 是 1 通过、20 未选择，不能与完整 23 项相加。

## 客户端门禁与未完成项

当前安装的 OpenCode 原生 CLI 的 `serve --stdio` 和 `run --server` 已实跑。`actual-identity-v13` wrapper exit 0：真实 API/DB/MCP 完整 JSON 模型实收，准确 connection、Agent actor、principal Human、client type 和 bootstrap verified 均通过。私有同 location 配置及 hydration 清单为 2 个内置技能/85 个 active 内置插件，compatibility 缺席；原生父子退出、监听关闭、用户元数据不变、拒绝代理零请求均有实证。临时服务密码只在进程环境，签名传输两 tools 仍禁。详见 [原生客户端实证](review-fixes-opencode.md)。`native-large-roundtrip-v11` 的 288107 bytes 中文 JSON 模型逐值相等；它是模拟数据传输对照，不能代四链领域验收。v12 actor ID 脚本误用首败及 v13 关闭阶段 ECONNRESET 均保留。

`joint-o-n-canonical-approval` 已实际 exit 0，runtime 226.6488571 秒。真实 OpenCode C 验证/接单/ACK、准确 E Plan/Document/Lease/Room、Pi required child Inbox 领取/回复/完成、仍 live 父查询子结果和更新 Plan、H2 Handoff 后 Pi B 新 Session 本人 Plan/批准请求/公开等待/H2 决定/消费/证据/完成全部执行；旧 A Delegation completed、原 E 拒绝及 B 终态由真实 REST/DB 核对。普通 child 没有 artifact:write，以可见 Inbox 回复和 noArtifactReason 完成，不补权限。原生 MCP 使用独有真实子进程，插件与 MCP 工具发现分别等待实际非空 readiness，曾有模型仅辅助请求的失败不借 captures0 当零 HTTP。Pi 等待后原 Worker EOF 退出，两个新真实 Worker 竞争恰一 durable continuation；新 Runner PID 消费同一 conversation 中的 Worker Turn。该条无 Git，不冒 fakeGit/全部恢复通过。

P-N 的 joint-p-n-first 实际 native exit 0，runtime 166.8814945 秒；joint-revision-first 实际 native exit 0，runtime 149.7402954 秒，完成真实 O/P 两轮同 Session Plan 与共享 Document 冲突/显式合并。新增 status 后 review-joint-final-status-combination 23/23 exit 0、runtime 211.2798811 秒。三次整体源码指纹均前后稳定。O-G 的 joint-o-g-null-error exit 0、211.041888 秒，P-G 的 joint-p-g-first exit 0、305.8676238 秒，实际 producer/reviewer、三类审查证据、Human 批准、真实 Worker 重启与父子终态均核持久事实。成功投影 error:null 曾被测试适配器误当错误，其首败保留。四链完整入口 joint-complete-current 仍在运行，不借独立诊断提前标全批通过。首次工具 get_session 映射、child Artifact 越权、MCP 异步发现、私有子进程早期 import 和未规范化 approval hash 五轮失败各自保留。外部两个签名传输工具保持禁止，双 Pi/SDK 补充不能替代 OpenCode；未测画像与原发行门禁保留。

## API 集成首败与边界修订

`review-auth-api-integration` 已实际退出 1：275 通过、3 失败、1 跳过，runtime 369.2798902 秒，原 stdout/stderr 和源指纹保留。三处失败为安装目标 Handoff 拒绝入口被普通 E 守卫误挡、失权 ProviderAction 未维持隐藏资源 404，以及失活 principal 提前返回准确 403 `SESSION_SCOPE_DENIED`。

`assertAgentPrincipalInTx` 仅将 `installation_target` 留给既有准确 target 专用授权，无 Session 的普通 E 仍拒；`getProviderAction` 缺资格事实返回结构化 `NOT_FOUND`，真实终态保原状态拒绝。Inbox 测试对失活 principal 精确断言 403，同时新增不同 Human source 失活的准确 404/零投影副作用，保持来源守卫独立覆盖。新守卫/锁顺序单元实跑 14/14，普通 lock inventory 实跑 8/8。`review-api-boundary-recheck` 在用户回合中断后进程不存在、没有完成退出回执，实际结果 unknown；持久部分输出和原日志指纹保留，不计通过。

## status 一致查询与真实并发

内部只读复核指出原 status 的多个独立 SELECT 存在资格检查后再读 steering 的窗口。`apps/api/src/workbench-runner.ts` 现将准确 Attempt/Turn/Session/Agent actor、实时 principal 资格与 steering 的 LATERAL 读取放在一个 SQL statement snapshot；无写锁、Token 刷新、回执或领域事件。现行路由对终态普通 E 的拒绝不变，Attempt/Turn 非 running 时仅 steering=null；原 settle 专用门禁不改。

`review-status-snapshot-real-sequence` 实际 exit 0，1 通过/5 未选择，runtime 5.518322999996599 秒。真实 route preflight 后、最终 statement 前设置屏障，分别提交 inactive principal 和 membership 删除，再释放查询，均准确 404 `NOT_FOUND`/correlationId/零正文。另一方向用 PostgreSQL test-only advisory 屏障，经 `pg_blocking_pids` 实见 holder 606、blocked 607，确认最终 statement 已开始，再提交 membership 删除与新的 fixture steering；首响应 200 只含原快照正文，新的撤权后正文不泄露，下一请求准确 403 `SESSION_SCOPE_DENIED`。领域 event/outbox 数量不变，Stopped Turn/aborted Attempt、Session executing 的 status 200 且 steering=null。SQL 注入屏障和 unconsumed message 为明确测试准备，不是生产写锁或模型代言。

本次首运行误将调用插入 beforeAll，typecheck exit 2、测试 exit 1；随后 fixture 手工消息未同步 next_message_sequence 导致后续新 Turn 409，exit 1。已修正调用位置和测试序列分配，所有首败保留。新 `review-api-status-final` 全 API 复验实际 native exit 0，27 文件通过，278 通过/1 环境跳过，runtime 353.4233689 秒。全仓指纹因并行消费者 fixture 改动而不同，API 受测文件按逐文件指纹另核，不宣称全仓字节未变。源前指纹现在在命令启动前持久化，避免中断丢失；历史缺失不倒填。

当前结果逐行入口为 [现时矩阵](product-current-matrix.md)。为不让 API 全套与真实主链的 truncate 互相干扰，已先在同一本人 Postgres 内登记并创建独立 `m5_5dbe32e19a_joint_test`；owner、准确 container ID、createdb exit 0 与保留边界见 product-owner.json。私有联合 profile 不进入仓库，恢复库及共享服务不删除。

## 检查、来源和资源

真实命令、native exit、runtime、数量、skip 与源码前后绑定见 [命令回执](product-checks.json)。旧全仓检查仅适用于其原受测字节，不证明新增鉴权修复。中断后已不存在且未有完整退出回执的检查见 [unknown 记录](review-fixes-interruption.json)，不计通过；回执脚本现在即时写私有原输出，结束后才生成脱敏公开副本。

本人容器恢复的精确 ID/owner/start 结果见 [资源恢复](review-fixes-resources.json)。登记不证明当前运行或收尾；最终健康检查实际退出、进程/端口读回及停止结果另落回执。当前恢复目录、共享镜像/网络/卷、G1D0C3 与他人目录保持保护。新已运行项逐项见 current 矩阵，未退出项不提前写通过。

## 真实 Worker 与事件读取实施增量

fake provider 的内存状态留在本任务 loopback 后端，实际 provider Worker 子进程复用现有 createProviderActionWorker 和逐请求 guardedGitProvider；guard 缺失失败关闭，不重试 RPC。commit 后关闭旧 Worker 的 owned stdin，启动新 PID 继续准确动作确认；准备 context 的原 in-process Worker 单列为准备。新增 test-only provider fixture 排除生产构建，仍参与 lint/typecheck。

Pi 新 workmesh_list_events 消费已有 listEvents/decimal cursor 只读合同与 qualified manifest，不新增 REST、角色、权限、领域或事件。页面完整返回并限证据上界，GET 不追加 Activity；joint-events-current-plan exit0、101.0155179 秒，真实 O/P 模型均收到 CURSOR_EXPIRED/resyncCursor 与恢复结果。Room 重复原 key 单消息事实、MCP 重启恢复和独立签名 receiver 的同 delivery 409/过期401/非法401证据分列，retention floor 为明确本人 DB 注入且实际恢复，不删除事件。对应消费者回归74/74 exit0，最终 conformance typecheck exit0。

## 组合故障及检查续接

joint-external-stop-discovery exit0、105.6978124 秒：真正 OpenCode 的 MCP/API 子进程重启后原 receipt、membership 删除后的正文/旧回执/新写准确拒绝、恢复后单事实，Plan outbox trigger 故障500与零业务结果，以及 Stop 普通写拒绝、原 E Stop_ACK/Lease 清理通过。原客户端缓存列表没有 stop_ack 的首败保留；MCP discovery 现在仅为持原 E 的读写客户端列出明确 stopping/live 前提的恢复入口，stopping manifest 不可用时只列此入口。C、只读和实时撤权不得借恢复降级；普通终态读写不放宽，MCP51项真实单测与原生 Stop 场景均通过。

joint-atomic-first exit0、43.5530751 秒：真实 Pi 普通工具 completion intent 之后，首次原子 settle 500时数据库证明 Session executing、Turn/Attempt running、消息与完成事件0，真实 Runner 原 key/body/headers/E 第二次 settle200，最终完成事实1。该恢复属于既有外层 settle，与三白名单重放分列。第二例完成409 REVISION_CONFLICT 后仅 Turn/Attempt settled、Session仍 executing、team 可见 warning1。joint-scope-project-owner exit0、100.6174125 秒：两 Human/两 Team/两 Agent 正对照、真实 O/P 跨范围拒绝、非法状态零revision变化、两个真实 O 模型同时领取恰一 Session。

review-combined-integration 的实际整体 exit1、1601.9551046 秒：DB81通过、API278通过/1环境skip，conformance83通过/1失败，Worker/recovery未执行。原失败是 M3 Pi membership 用例在 started Activity 前撤权，只证明 Activity 拒绝，却仍要求三个业务拒绝；改为代理在业务原请求前提交撤权，收到准确403/404后恢复以便模型实收。专项复验exit0、1通过/19未选择，30.8095931秒。按已批准不重复充分无变检查要求，product-integration-resume.py 先核原日志hash和 DB/API 每个消费文件前后/当前hash，再实际续跑失败的全 conformance 与未运行的 Worker/recovery；原完整命令exit1始终保留，不冒完整重跑exit0。当前续跑未取得最终退出。

最新 root lint/typecheck/unit 均exit0，18/18、18/18、32/32任务，缓存15/13/28；新 E2E 70 passed/exit0，407.1569665秒；源码构建18/18、12缓存exit0，96.1832202秒。新增鉴权/Runner/MCP按实际消费字节复核，不借旧aa324通过。构建期间仅接受排除生产构建的 native acceptance 文件差异，跨包 provider fixture 的生产排除与 typecheck/include 保持。

## 本任务增长组成与最小保留

只读组成见 product-resource-current.json 和 product-resource-file-identities.json。首次全工作区逻辑盘点包含 pnpm 的 junction 路径重复，不当物理量或全部本人可删。精确 .tmp/m5-runtime 抽样3876文件、16103049467逻辑bytes；按设备/文件ID去重复后1010786787 bytes，仍不等于分配的物理占用。72个服务EXE名称均为同一个212567080 bytes文件的硬链接，系统报告75个链接；这些别名贡献15092262680逻辑bytes，不能宣称回收同量磁盘。该采样与Chief较早采样方法/时点不同，缺少原逐文件基线，不能把整段+4495903196B精确归因。

源码快照156311253 bytes/110文件保留各命令的实际受测边界；原捕获、stderr/首败、模型完整JSON及SQLite恢复数据、私有认证/配置原件继续本机保留，不进入公开ZIP。公开ZIP只收脱敏原件与逐member指纹，不再为相同runtime保存整份EXE。驱动在所有本人子进程退出及监听关闭后保全一个任务私有内容寻址EXE硬链接与每原路径file ID/hash映射，才非递归unlink其派生服务名字；失败即停、记录原因、不Force/改ACL/换法。当前整worktree/.tmp恢复根、用户原安装、共享缓存/镜像、其他任务和历史拒绝目标均不删。此机制是本任务 foreground close，不是后台清理或扩大删除授权；逻辑减少与物理净释放分列为未知。历史别名待逐root归属、退出、保全验证后才可收尾，不能把所有缓存与DLL一概可删。
