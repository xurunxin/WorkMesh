# M2 产品成果报告

> 当前成果独审两项 blocking 已修复并实跑；本轮候选以[修复报告](product-review-repair-report.md)及[最终源码/回执绑定](product-review-repair.json)为准。下文原交付结果属于旧候选，原全文与Git/Windows字节在[旧报告保全索引](product-evidence/product-before-review-repair.json)保存，不冒当前guard和大正文修复已通过旧head。

本卡按已审方案完成既有规划协作、普通child与独立reviewer消费者补齐及安全闭环。本机运行结果如下；停正式成果review，尚无本候选平台独审、最新PR Required CI或actual Done/main验收结论。M1不重开，规划历史通过不冒产品通过。

## 产品与合同

- 新增有界 `GET /api/v1/agent-sessions/{id}/children` / `listAgentSessionChildren`，父live准确E/原Connection/principal/membership/授权和历史Plan/version/stable step绑定每页重验。允许子终态，拒父终态/撤权/错Team或child，包括空页。只返回白名单状态/绑定/授权结果Artifact ID，无Token/prompt/正文和22表业务写。通用get权限保持。
- 两创建共用准入、稳定step跨版本限额及真实三方能力交集；保DB父累计总量与API活跃层，终态不释放累计槽。正常父/step用DB默认8，没有客户端上限DTO；较低上限仅特权测试夹具。可选reviewer `budget` 是已明确批准合同，省略维度继承，有效执行预算/继承预算/reservation同值，超cap或累计余额不足拒，既有reservation不释放。活跃legacy review无reservation按原预算补计，新reservation只计一次。
- 两创建专用passthrough响应保 `parent_session_id`、`plan_step_version_id`、`required_for_parent`、`inherited_budget`、`max_child_sessions` 和任意numeric预算维度/额外字段，review wrapper/Lease保留。真实Pi调用两创建，解析模型实收原创建输出，与REST/DB比值；GET不替代模型收到的创建输出。
- reviewer无plan:write、无自动发布；必须本人Room review_result和本人code_review，父/他Actor/他Session/Activity/structured review/noArtifactReason均不能替。required全部12种非completed状态准确blocker IDs阻父，nonrequired同状态有完成正对照。
- SDK/MCP/Runner补全分页与Document/history/diff/restore/export/Guidance读、层级relation、合法Decision、评论读、Room/Inbox/Handoff。Runner新增具名计划评论/assignment proposal/context delta/fail，固定自身E；Human-only评论写、Guidance发布、Decision finalize及Handoff accept保持Human权。安装准确target inspect/reject、宿主ACK/heartbeat/Stop/origin确认和alias在91表分列。
- SDK独立写调用/Lease maintenance生成新默认key，单次网络重试保同key/body，显式key原样。MCP结构化拒绝保持code/details/correlationId。发现由M0/M1受控增量合成M2；manifest不代领域授权。公开Skill按原发行流程，内嵌Runner pin同步。
- 微秒分页按PostgreSQL `created_at::text` 和id排序/签名边界，不把微秒降成JavaScript毫秒；内部cursor列不外泄。原格式cursor继续接受，旧毫秒cursor丢失精度无法补回，需首屏重新遍历。五个同毫秒不同微秒真实多页/后页撤权已跑。
- 八HTTP图写及Automation Worker create_work_item新事务，在业务/authority/idempotency/行锁前取workspace KEY SHARE与现有workmesh-planning advisory；实际barrier/pg_locks/pg_blocking_pids覆盖反向cycle及正常恢复、撤权先提交和Human Team删除。workspace排他边界用特权SQL锁夹具，现API无workspace DELETE，未虚构入口。无关cycle/labels/status/boardrank不扩入此修复；不据局部前置锁宣称全系统无死锁。
- Worker实际到受控本机HMAC receiver后exchange/ACK，真实重放/新Worker、过期claim/fence与撤权Stop零HTTP。无nonce selfclaim通知准确Token ID由创建事务保存，错来源/旧缺ID失败关闭；原准确C与未失效claim receipt可exchange/ACK但不修复旧通知，原receipt或来源不可用时无合法自动恢复。不填历史猜测绑定。250ms/NOWAIT是有界回滚重试，不是消除所有循环；许可checkpoint commit后在途HTTP不能召回。
- Pi fail先settle失败Turn/Attempt，后独立 `/fail` 使用准确ifMatch/key/body；两个事务成功/拒绝/失响应各记事实。Stop/撤权优先，completion/wait/failure互斥，外部效果标志来自实际quiescence。Session failed与Turn failed分别核。崩溃或后事务未知不自动恢复、不重复settle/Stop cleanup，不扩新恢复域。

无数据库迁移、已应用迁移改写或新增事件类型；现行持久表/事务事件/outbox复用。代码/协议/CI/测试逐文件双字节见[source manifest](product-source-manifest.json)与[完整源码ZIP](product-source-snapshot.zip)。现行ADR0082说明安全/兼容取舍，原Proposed方案及旧5356/2b8源不改写。

## 实际验证

| 精确命令入口 | 原回执 | native exit | runtime秒 |
| --- | --- | --- | --- |
| pnpm.cmd lint | run-124.json | 0 | 22.637 |
| pnpm.cmd typecheck | run-123.json | 0 | 22.444 |
| pnpm.cmd test | run-120.json | 0 | 25.754 |
| pnpm.cmd test:integration | run-099.json | 0 | 554.243 |
| pnpm.cmd test:e2e | run-106.json | 0 | 261.841 |
| pnpm.cmd build | run-121.json | 0 | 92.531 |
| pnpm.cmd check:route-policy | run-068.json | 0 | 2.503 |
| pnpm.cmd check:workmesh-skill | run-071.json | 0 | 0.526 |
| pnpm.cmd check:runner-skill | run-119.json | 0 | 0.650 |
| pnpm.cmd ci:test | run-069.json | 0 | 1.228 |
| pnpm.cmd ci:validate | run-116.json | 0 | 2.013 |
| pnpm.cmd smoke:agents | run-102.json | 0 | 5.227 |

以上命令实际argv/cwd/起止时点/退出和原输出SHA在[全部检查结果](product-check-results.json)及product-evidence/run原件。Turbo cache命中明确保留，不把缓存日志重复计数；逐套件Tests/Test Files、skip和node:test汇总从stdout原行提取，不从exit猜数量。根集成真实包含M0/M1/M2，逐套件删除include的CI负例仍在；旧main checks不替新组合。之后仅增补M2测试体时单独跑当前M2组合，[运行前后源码差异](product-run-source-binding.json)分列，不声称全局字节不变。

根run099原汇总：DB 81通过；API 270通过/1 skip；M0/M1/M2 39通过；Worker 120通过/1 skip；recovery 1 skip。E2E run106为70通过。最后M2补测run113为11通过/无skip；Skill EOF修正后根run122 `pnpm.cmd test:conformance:integration` 实际exit 0、278.921秒，M0 12/M1 17/M2 11合计40通过/无skip，使用当前内嵌pin。unit/build/lint/typecheck当前回执分别为run120/121/123/124，不冒旧pin已受测。根integration/E2E后的实际增量只在M2测试体和Skill EOF/生成pin，UI/API/SDK/Worker业务源码保持；新pin由三套真实Pi消费者组合验证，不为文档回执再重跑无变化的其它根套件。

18条冻结行九类正拒、幂等、版本、回滚、重放、并发及恢复分别见[闭合矩阵](product-closure-matrix.md)。其中API以Fastify真实路由+PostgreSQL断言，conformance以实际监听HTTP/MCP、受控HTTPS假模型和真正Pi子进程，Worker到真实受控receiver；都不是真实外部WorkMesh平台数据。[91操作结果](product-operation-results.md)分REST完成回执、SDK、MCP具名绑定、Runner动态/alias/宿主/Human与安装边界。注册数量只用于一致性核查，未声称91×全部身份×三个消费者穷尽。

原skip保持：API workbench-runner一条live MiniMax需要RUN_WORKBENCH_LIVE和团队secret，Worker retention-upgrade-barrier需要RUN_RETENTION_UPGRADE_INTEGRATION专门并发升级环境，recovery真实备份/restore演练需要RUN_RECOVERY_INTEGRATION及source/target test库、工具容器和S3；本批未缩减原门禁或拿skip冒通过，M2假模型真实Pi链不依赖这些skip。现有#5三OS/版本发行门禁未缩减；本轮仅Windows当前构建，不冒Linux/macOS或新版本分发验证。

## 首败、准备与资源

全部失败和unknown回执保留，不删断言、不放宽skip/权限。原001–020 privileged DB读取payload且127.0.0.1:9999无receiver只为历史夹具，不证明真实投递。原root039、065失败；067越rootDir生成122叶文件已在failed-build-emitted.zip逐字节保全，逐path核绝对workspace/link/活动引用后清理，清理不能算build通过，随后干净source build才取0。原082是真实PostgreSQL层级40P01死锁；原“消除循环”推断纠正为局部图锁前置和发送锁有界回滚重试，原失败日志保留。Activity progress不合法、/stop错入口、resolve缺If-Match、API config导入、两次授权永久撤权/创建command返回误判等夹具首败见每run原输出，未回写成通过。旧run073只有running记录、无最终exit，保持unknown，不补码。

本轮补测run107的member合法写正例被现行role policy拒绝，保首败后使用明确maintainer特权夹具；run108缺MCP Room必需sessionId，保原structured拒绝后按合同补准确父身份。完整main范围run117空白检查native exit 2（工具外层退出显示另分列），仅多余Skill EOF空行，原Git/工作树字节ZIP保全后删除空行并生成新pin；原规则未放宽，后续完整范围diff --check真实0。旧资料服务日志可读本规范化之前在service-logs-raw.zip保无损脱敏原件，旧内容不倒写为新运行。

测试服务通过product-checks独有owner标签/容器ID，32字节临时主密钥只入进程，S3独有tmpfs bucket先Create/Head验证；原secret长度/RustFS权限首败保留。健康长命令实际退出后才保全脱敏service日志原字节及逐命令准备/恢复/清理原件。共享镜像、store、服务、当前恢复目录及G1D0C3拒目标保留，没有global prune/换工具绕拒。[资源结果](product-resource-results.json)列每owner、ID、端口、准备与删除exit；原登记缺逐命令原件如实标记。Pi/HTTP/MCPlistener关闭、scratch工作区回执在run输出ZIP cleanup/resources字段，不以总exit猜清理成功。

产品源码冻结于 `b0d46f486a57e3e7723f1f92a7c1e3b89bd64243`。49份变更产品/协议/CI/测试文件的run122运行前后Windows字节、当前工作树、提交原blob及Git clean-filter规范化结果逐项比对见[提交绑定](product-commit-binding.json)；原blob和运行字节分别列出，CRLF差异不冒相等。最后证据提交只改本目录文档/索引，准确最终分支head以交付回复为准。打包辅助读取的相对路径首败和未取得的命令退出记录见[打包事件](product-packaging-events.json)，不混入产品测试通过数量。

## 演示与审查入口

在新独有test服务环境执行product-checks.py all，可顺序重现根integration/E2E；无需提供聊天凭据。当前M2真实套件执行 `pnpm.cmd -C packages/conformance exec vitest run --config vitest.integration.config.ts src/planning-collaboration.conformance.test.ts`。先看pi-creation-response-and-restart/finite-budget-chain，再看selfclaim/projection、document/import、Inbox/Handoff和pi-session-failure实收JSON，最后核源码指纹与原stdout。原来源877条、18冻结行及平台saved copy/独立implementation原件未取得的限制仍保历史含义。

本候选到正式平台_oY成果独审后须闭blocking/high，再核最新PR Required CI与actual main/Done；本报告不自审、不自confirm、不merge或开始M3。UI/F/TA、真实外发/公共发布/团队凭据扩权不在本卡。
