# 验证、九类 DoD 与闭合矩阵

所有产品测试均未运行。本轮只能产生静态文件/来源核验。下列文件扩展、用例与命令是实施后要求，不能以旧M0通过或新工具数量计新组合通过。各operation的ALLOW/DENY、逐门禁gateCases及九类适用性在 [结构化映射](operation-decisions.json)，原完整九类正文见 [冻结M1](frozen-M1.md)。

## 九类验收的具体闭合条件

| 类别 / 用例 ID | 测试落点与准确场景 | DoD / 不适用边界 |
| --- | --- | --- |
| 正常 M1-NORMAL / 每operation-ALLOW | execution-recovery conformance：新C配对后工具初始化、claim queued、准确E握手/ACK、planning、Session/context/Plan/版本、整Plan稳定stepID、executing、Lease取/心跳/续/释放、准确批准、artifact或no-artifact、完成；第二链Human Stop→Runner停止→清理→stopAck→canceled | Native HTTP/MCP/Pi三链事实一致；仅tools客户端能读取全部前提，列表至少两页，当前与Plan版本摘要语义准确，Session完成不暗改Issue状态 |
| 越权/撤权 M1-AUTH / 每operation-DENY及GATE | API stage1/stage2+SDK/MCP：准确允许正对照后换Connection/Agent/Session/Team/项目/scope/principal，撤Delegation、Team grant、能力、Connection、membership；reviewer发布Plan拒，Agent decide/force/control拒 | 禁止跨目标Token或Human cookie；同Connection可读另一个合法Session时仍不能拿S1的action/key确认S2；两种安装、C/H读取均各有正负对照，页刷新撤权不能以空列表冒成功 |
| 非法状态 M1-STATE | queued普通GET/写拒而握手允许；stale ACK原兼容；paused/stopping/terminal普通写/GET拒；stopAck只stopping；invalid transition，Human immediate cancel与stopAck竞争 | 不复活E；stopped/terminal诊断heartbeat状态不回升；Human保留路径原行为 |
| 幂等 M1-IDEM | ack、Plan、Approval请求、Lease acquire/renew/release、complete/stopAck同key/body单事实，异体/key绑定冲突；Session/Lease heartbeat K1/K2/K1不回退，稳态无事件放大；新意图同body新key不被旧动作吞 | stopAck/complete重复200不是必需，终态前置拒绝后精确确认；纯GET无写key义务，反复查无receipt/event/outbox |
| 旧revision M1-REV | 两Plan发布旧Session revision不覆盖；Lease renew/release旧Lease版本、complete/stopAck旧Session版本、consumeApproval旧Approval版本拒；SDK/MCP保currentRevision/trace；RunnerPlan/state无前置Activity | Session/Plan/Lease版本分列；GET及heartbeat无If-Match写冲突不适用；失败不能盲写重做 |
| 事务失败 M1-TX / M1-CONFIRM-ZERO | stage1/stage2真实DB故障注入Plan、Lease、Approval request、complete、stopAck的event/outbox写失败，对比state/event/outbox/receipt全回滚；workbench runner原子settle+completion一起回滚；确认成功/各拒绝逐表比内容及数量 | 查询没有新command/job回滚，改验零业务写；authorization_denials原独立INSERT单列；不伪造所有表零写；外部I/O不在本批 |
| 重放 M1-REPLAY | 原outbox/webhook/lifecycle job重复处理不双完成/批准；同key断网重放保正文；Stop重复只有专用事实；确认多次、MCP重新连接不新建C Session；ADR0068外层settle原key重复 | 确认读不添加job；新增Worker等待协调须重复tick/event幂等；新只读投影没有job效果去重需求，重复读零写；内存协议夹具不能冒真实HTTP/Pi运行 |
| 并发 M1-RACE | stage2两Session独占Lease竞争有holder详情；renew与到期job/Plan两版/Stop和complete、普通写、stopAck竞争；live撤权先commit后确认拒；双客户端C各桥接准确E；暂停或撤权晚到poll/steering不再启动模型 | 真实事务锁等待与提交次序证据；观察pg_blocking_pids，不能只delay；READ ONLY查询明确snapshot时点，非持锁召回承诺；M3外发checkpoint不适用本批 |
| 重启/恢复/Stop M1-RECOVERY | API/MCP重启后原事实/cursor/Lease/批准仍可读取；Worker expiry保PG权威；Runner被Stop期间makeTool前置Activity会被拒但受控finally仍成功；timeout/abort/异常/强杀、Token到期、清理失败与未知在途保留 | 清理摘要/residualRisks准确，无新模型工具/Prompt，无普通release；强杀finally不保证执行，记录未确认；不是外部CLI或机器恢复验收 |

逐operation的GATE场景选定实际身份分支后执行：credential → role/state → live definition/Team grant/Delegation → capability → exact subject/scope → revision/key → 该operation特有target事实。条件predicate未触发时标该分支不适用并说明条件，不用通用blocked/pending代替具体拒绝。43条映射包括42个已有REST的适配/回归及1个新增确认提案；其中Human/内部前置不是新Agent工具。

## 终态确认专门用例

| ID | 构造与判定 | 状态 |
| --- | --- | --- |
| M1-CONFIRM-ALLOW | complete和stopAck各读取真实响应后故意在传输层丢弃；原E重放/GET明确terminal拒；live准确C、Connection-backed安装Bearer、native安装及合法Human各确认原key/action，originalResult revision与原DBreceipt相同 | 未运行 |
| M1-CONFIRM-DENY | 另一Connection（包括相同actor/principal对照）、另一Agent、同Agent另一原生installation、S1 key查S2、错action、撤Connection/grant/双Delegation/principal membership/能力、跨Team/project/work_item、错scope、混合凭据、原E Bearer；原生安装不要求不存在的coordinator Delegation，但目标Delegation撤权仍拒 | 未运行；不泄露原真实资源 |
| M1-CONFIRM-RETENTION | receipt不存在、response_body清除、replay过期、完整快照保存后原Token被删除、旧null/unproven来源、Stop摘要丢失/坏JSON、Human cancel终态但无stopAck | 未运行；unavailable或不可见按合同，绝不当未提交 |
| M1-CONFIRM-ZERO | 每个成功/拒绝重复调用前后逐表内容比较，含last_used_at、C Session创建/续期、Token、业务事实及api/auth幂等；原拒绝账本分列 | 未运行；零签Token/续Session/receipt/event/outbox |
| M1-PI-SETTLE-LOSS | Pi原子settle提交后丢响应，同外层key/body既有回执恢复；内部completion key没有独立receipt，查询不得虚构；明确completion失败回滚并保持fallback警告 | 未运行；旧settle语义保持 |
| M1-PI-STOP-LOSS | 真实Pi模型正在合法调用时H Stop；受控finally原E/独立signal发stopAck后丢响应；安装确认；model tools/迟到steering无新执行、准确durable Stop Activity/event | 未运行；不以进程exit0验收 |


## 两项 blocking 定向闭合：原来源与等待续接

全部为实施后真实运行要求，本轮未运行。API execution-result.integration、workbench-runner.integration，Worker stage1-lifecycle.integration、DB migration-baseline.integration 和真实 execution-recovery conformance 分别保存准备/故障/结果/残留，不能只跑单元假poll。

| ID / 九类 | 必须构造与事实断言 | 入口 |
| --- | --- | --- |
| M1-ORIGIN-DOUBLE-C / 正常、越权、并发 | C1/C2同Agent/principal/Team皆live；C2提前refresh目标，C1实际E1提交complete与stopAck；C1确认原revision/summary，C2拒；两边合法自身请求正对照，查询前后无新业务事实 | API execution-result +真实HTTP/MCP/Pi Stop |
| M1-ORIGIN-DOUBLE-NATIVE / 越权 | 同Agent原生I1/I2均获目标Token，E1提交，I1确认I2拒，不以同actor或Session历史Token代来源 | API+SDK/MCP conformance |
| M1-ORIGIN-LEGACY / 状态、恢复 | old null/unproven、安装来源null/歧义、错误组合、另一Session/action/key、回执/摘要缺失；完整快照后原Token删除与同Connection轮换仍成功，撤权/删除拒 | API+DB迁移 |
| M1-ORIGIN-ROLLBACK / 事务、幂等 | 故障注入source/response/event/outbox，原终态/receipt全回滚；两个reserve路径及旧API滚动写过期key新占位清空来源（DB trigger兜底）；原duplicate不改来源 | API stage1+DB |
| M1-WAIT-APPROVAL / 正常 | 真实Pi调用requestApproval取得准确Approval和返回的原action_payload_hash（sha256:<64位小写hex>，不手拼fixture）→等待工具→model idle/lease release→公开reply+Turn/Attempt/wait同commit；超过原模型预算仍无running旧Attempt/租约；Human批准准确hash→唯一续Turn/新Attempt→重新取Lease、合法动作消费批准→完成 | 真实conformance+API/Worker |
| M1-WAIT-INPUT、M1-WAIT-BLOCKED / 正常、状态 | 各真实Pi等待，Human原Session prompt及同Conversation合法消息分别唤醒；公开等待reply在续context，真实trigger ID，无伪Human消息；现行prompt先executing也必须Worker消费wait后claim | 真实conformance+Human原REST |
| M1-WAIT-DENY / 越权、状态、revision | 错Approval ID/hash、其他Session、旧输入边界、Agent/system输入、批准拒/过期/已消费、模型或负责Human资格撤销、来源不同、staleIfMatch、互斥completion/wait、externalEffectsReconciled=false | contracts+API+真实Pi负例 |
| M1-WAIT-LOSS / 幂等、重放 | wait settle已commit传输丢响应，原outer key/body重放仅一公开reply/wait/settled事实，不改key、不Turn-only fallback；内部Pi completion key无独receipt不假认 | API故障代理+Pi |
| M1-WAIT-TX / 事务 | wait/state/message/tool/receipt/event/outbox各失败全回滚；Worker consume/resume/queue中断全回滚，下一tick从pending重做，无漏resume/挂Turn | API/Worker真实Postgres故障 |
| M1-WAIT-RACE / 并发 | 双Worker、重复批准事件/tick/同输入、Human prompt与Worker、queuedHumanTurn复用/创建竞争，只有一续Turn；双Runner claim/current fence只有一新Attempt；观察实际锁等待与提交次序 | Worker+API+conformance |
| M1-WAIT-CONTROL / 状态、越权、并发 | pause后准确触发不创建Turn/启动模型，只有Human合法resume后fresh重验；Stop或撤权先commit零续接，晚到模型工具/poll/steering零新调用；新claim后至start撤权不得启动 | Worker+真实Pi |
| M1-WAIT-RESTART / 重启、恢复 | API/Worker/Runner分别在wait提交前、提交丢响后、trigger消费前后、claim/start间重启；重扫唯一结果、无旧runningAttempt、无重复Attempt；短离线live可monitor，stale明确拒绝且保Human恢复 | 三进程真实重启 |
| M1-WAIT-COMPAT / 兼容、迁移 | 无opt-in旧Runner看不到/claim不到自动或复用续Turn，旧wire不变；Attempt opt-in持久且start不能伪造；旧schema夹具普通写兼容、新合同拒绝；混合旧节点默认不开wait生产 | SDK/Runner+DB+API |

M1-CONFIRM-ZERO逐表对比包括Connection及credential/installation使用时间、C/E Session、Token、Delegation/grant、Plan/context/Approval/Lease/Activity/Prompt、所有workbench表（含wait）、api/auth/heartbeat幂等、domain_events/outbox；拒绝只允许既有authorization_denials独立INSERT。查询并发用单次REPEATABLE READ快照语义，不用SQL行锁伪承诺返回后撤权召回。等待合法恢复有新事实，和确认零写各自统计。

DB DDL的IS TRUE约束要测试NULL绕CHECK反例；各资源复合FK、sourceTurn/Attempt唯一、pendingSession唯一、continuation唯一、触发组合、native/connection原标记不可改、旧数据NULL、迁移整体失败回滚均验证。只静态看SQL不计迁移通过。

Required worker-integration沿apps/worker/integration/stage1-lifecycle.integration.test.ts执行reconcileWorkbenchWaits；Required api-integration沿现有API集成+真实M0/M1 conformance接线；DB集成在根test:integration的db入口消费migration-baseline.integration。不得仅改include不改ci-policy逐套件负例，不新增空套件/skip或改变Required门禁。


## 当前仅两合同项定向复审与验收补充

原来源方案层面已闭、等待自动续接路径已明确，依据 [独审原文](review-feedback-contracts.md)；本轮不重开无变化合同。以下产品场景仍全部未运行，不以源码正则/元组演算计数据库迁移或真实批准等待通过。

| ID | 实施后真实正拒与事实 | 必需落点 |
| --- | --- | --- |
| M1-WAIT-HASH-SOURCE | requestApproval真实HTTP响应返回原action_payload_hash→SDK/MCP/Pi等待DTO→Zod→DDL保存→Worker读取/完整比较→consumeApproval；字节一致保sha256:前缀，后续公开续Turn完成 | API workbench-runner +真实conformance |
| M1-WAIT-HASH-DENY | 裸hex、错误前缀、大小写/长度错误被DTO/Zod/DDL拒；格式合法但与准确批准原hash不同由Worker/实际消费拒绝；不能strip前缀恢复 | contracts+API/Worker+DB |
| M1-WAIT-PROMPT-FK | 准确Session prompt对应FK与领域正例；同workspace另一Session prompt同时被复合FK及锁内领域拒绝；同Session请求但错误workspace/live授权拒，服务不靠FK授权限 | API/Worker+DB |
| M1-WAIT-PROMPT-UPGRADE | clean DB及上一增量升级：先ADD UNIQUE(session_id,id)再CREATE wait/FK；旧prompt完整内容/行数不变，无新增workspace列；同id重复仍旧PK拒；重复tick/input不双建续Turn或Attempt | DB migration-baseline+Worker |
| M1-WAIT-PROMPT-ROLLBACK | 注入unique建立后/wait建表或FK建立时失败，整次增量事务回滚，新unique/wait/FK均不残留且旧prompt不改；重跑沿真实migration ledger一次登记；wait触发事务故障全回滚 | DB migration-baseline+API/Worker |

当前静态命令static-check.py调用check-wait-contract-source.py：从Git源码提取canonicalPayloadHash前缀、request/consume Zod regex、原完整相等谓词与prompt实际列/主键，匹配提案pattern/新unique顺序/FK。构造旧裸hex CHECK、strip前缀、旧workspace FK、删new unique和仅id FK真实变异，每一变异须确实改变文本并被源规则拒绝；源格式算法样本与准确/其他Session元组关系只证明静态兼容，不是实际requestApproval返回、Zod执行或Postgres约束运行。scope/live/锁/回滚均在未来真实测试证明，未跑保持未测。

## 实际入口与测试文件

扩展 `packages/contracts/src/route-policy.test.ts`、`client-profile-contract.test.ts`、`agent-discovery.test.ts`，新增 execution-contracts DTO测试；SDK index/discovery测试核具名方法、Zod响应、key/If-Match和exact安装slot零refresh；MCP index/http/recovery测试核名单、mode、输入及structured error；Runner workmesh-tools/runner-api/permission矩阵及新增execution-lifecycle测试覆盖闭门和finally。API扩展stage1、stage2及workbench-runner.integration，新增 `execution-result.integration.test.ts` 做逐表零写与所有确认拒绝，均沿现有api integration include运行。

新增 `packages/conformance/src/execution-recovery.conformance.test.ts`、`execution-recovery.fixture.ts`；复用M0完整真实fixture的API/MCP HTTP、MCP SDK客户端、testDB保护和假HTTPS模型Pi驱动，在M1fixture扩展生命周期需要的setup与故障注入，保持M0文件和原用例。服务、客户、模型请求、tools/list、模型实收tools、调用结果、Turn/Plan/Lease/Approval/Stop事实分别保全。不新增厂商真实客户端、外部秘密或外发。

`packages/conformance/vitest.integration.config.ts`明确include M0与M1两个文件，串行、passWithNoTests=false。根 `vitest.config.ts`必须排除新真实套件，不能让pnpm test中的无服务运行碰真实DB。`scripts/ci-policy.mjs`的validateMcpConformanceEntrypoints与测试改为逐必含套件校验，删除任意套件/include/根入口、改passWithNoTests、移除pipefail/always上传或continue-on-error都失败；旧精确字符串replace在列表扩展后不再有效，负例须证明实际删掉了目标套件。

根既有 `test:integration` 已含 `pnpm test:conformance:integration`；后者先require-integration-env、专用testDB reset、再conformance package integration config。沿现有Required `api-integration`先API集成后 `Run real MCP and Pi conformance`，日志继续进入 `ci-logs/mcp-coverage/`并always上传。新M1证据用此目录内独有文件名/子目录，不能被M0覆盖。未修改CI分类或添加skip豁免。

## 产品阶段准备、命令、首败和收尾

先核精确main与消费者差异，登记独有Postgres/Redis/RustFS tmpfs容器、bucket/监听端口、进程及temp目录。沿 `m0-run-services.py/m0-run-check.py` 已核准备/记录模式新增M1专属记录入口，不复用M0受测归档；随机秘密只在子进程内存，master key为准确32字节，RustFS tmpfs可写、CreateBucket+HeadBucket实际ready，数据库名称满足test保护。API服务用development，单元test；Windows精确Node/.node-version、pnpm入口、npm_execpath按现有运行要求仅对子进程配置，测试环境不得污染单元fetch。

专用服务环境先定向SDK/MCP/Runner/合同/API新场景，再按以下根脚本执行（本轮未运行）：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm check:route-policy
pnpm check:runner-skill
pnpm ci:validate
pnpm ci:test
```

根integration实际包括DB/API/真实M0+M1conformance/Worker/Recovery，不另拿M0旧检查代新组合。每条保存完整命令、exit/runtime、Node/pnpm、passed/failed/skipped数量、真实开始结束输入指纹、运行字节与Gitblob差异及skip原因；不重跑已通过无变化套件。首败无损保存后另编号重跑；对已被测试期间改动的源码分开绑定，不能冒最终字节早已通过。

finally保全必要脱敏原输出ZIP和可读副本，再按确切ID/owner label/absolute path核己有闲置对象逐项stop/rm/删除，保存实际退出与剩余原因。Windows递归前核workspace/批准明确Temp父范围、realpath/link/活动引用/逐path保全依据；已拒G1/D0/C3目标不碰、不换工具/force/改ACL/父删绕。当前和恢复目录保留，旧worktree只有actualmain、保全齐且无人引用才能正式清理。RequiredCI/独审或资源夹具无法运行时实际记失败/未测，不删除門禁。

## 本阶段结论与后续门禁

仅静态：完整计划一致、来源217个Git全文、当前42已有operation与1新增提案映射、参数/返回/源码锚点、九类矩阵、文档链接/空白/实际CI分类。实际回执见 [review](review.md) 与static-checks；无产品服务、无产品test、无迁移、无API/event修改。JSON/ZIP/脚本使本PR按当前ci-policy可能full，分类如实记录，不借文档阶段改变门禁。

提交准确head停confirm → 平台另一Agent完整合同/方案独审 → blocking/high闭合 → Chief confirm才实施 → 新产品完整适用checks与独立成果审查 → 最新PR RequiredCI → todo实际done/main。文档合入或静态通过不完成本卡。
