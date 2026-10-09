# 适用测试、九类验收与DoD映射

所有产品用例均为待实现/待运行。本轮只执行文档静态核验；不把库内存夹具、静态工具数量、源码注册或旧PR绿色记为M0端到端通过。每条operation的acceptanceCases指向本文件，同一类对该操作的适用性由现行method/合同/批次决定；不是要求277条全部执行九类新产品用例。

## 九类验收映射

| 稳定case ID / 类别 | 具体测试落点 | 真实判定 / 不适用边界 |
| --- | --- | --- |
| M0-DISCOVERY / 正常 | contracts/src/route-policy.test.ts、client-profile-contract.test.ts；mcp/src/index.test.ts、http.test.ts；conformance/src/mcp-coverage.conformance.test.ts | 全集双向相等；旧默认响应strict schema仍可读；qualified增加字段正确；C只读/读写和E分别initialize/listTools/listResources/listResourceTemplates；resource与仅tool前提相同；真实Pi模型输入仅实际适配且具角色资格工具。每条静态工具有输入及返回出处；未适配项明确不支持 |
| M0-ROLE / 越权、撤权 | apps/api/integration/route-policy-authorization.integration.test.ts、stage5-agent-connections.integration.test.ts；MCP/SDK/Runner测试及真实conformance | 缓存Human工具call返回结构化FORBIDDEN；createComment/updateComment仍不可Agent写；E Project/Issue/Milestone/relation写不因work:write广告；发现后分别撤grant/delegation/connection再call，原拒绝不刷新、不重发；跨Team NOT_FOUND不泄露；允许读正对照继续成功 |
| M0-STATE / 非法状态 | contracts/client-profile-contract.test.ts；API route-policy集成；Runner permission-matrix.test.ts、workmesh-tools.test.ts | queued manifest允许但context拒绝；ACK后允许前提读取；paused/stopping/terminal按现行门禁披露或拒绝；feature开启不覆盖状态；profile不支持和混合credential失败关闭；精确Session/kind/actor错配不能复用缓存 |
| M0-IDEMPOTENCY / 幂等 | packages/agent-sdk/src/index.test.ts；MCP index.test.ts；真实conformance与API数据库事实 | 在现有代表写append_activity提交后丢响应，同key/body重放只有一次领域事实；同key异体冲突；重连/重新发现后逻辑身份保留；同正文新动作的新key产生新事实；导入同hash/plan恢复同mapping，现有再次相同import限制单列 |
| M0-REVISION / 旧revision | MCP/SDK测试；真实conformance调用现有transition/plan命令 | 用旧If-Match得到原structured error及可读currentRevision（按现行具体命令）；command状态不改、event/outbox不增。客户端显式读回后重建意图，用新身份提交；不能先盲改再冒成功。只读操作不适用If-Match |
| M0-TRANSACTION / 事务失败 | API权限集成＋真实conformance现有append_activity失败注入 | 在代表下游写的event/outbox位置注入本机测试失败，状态/receipt/event/outbox回滚，MCP/SDK/Runner保留原错误。M0没有新领域command，新增command事务回滚不适用；Human-only身份解析前拒绝不创建/刷新coordination及last_used_at；独立authorization_denials允许；合法Coordination派生事实分列 |
| M0-REPLAY / 重放 | MCP连接测试、SDK错误测试、真实conformance | initialize、rediscover、重连不复制领域业务事实；Coordination初次派生/续期的允许事实单列并验证并发收敛；resource读取没有receipt/outbox；network/429/5xx重试保留key/body/trace与最终完整envelope。M0没有新job，新增job去重不适用 |
| M0-CONCURRENCY / 并发 | API stage5连接/权限集成；MCP http.test.ts；真实conformance | 两客户端同Connection使用不同精确execution bridge，活动归属各自Session、不串Token；发现与撤权/feature改变竞争仍经服务端拒绝；同key/body并发只有一次领域事实；不能用静态manifest代锁后授权 |
| M0-RECOVERY / 重启、恢复、Stop | 真实conformance＋现有SDK stopAcknowledgement；Runner权限测试 | API和MCP分别重启，客户端重新initialize并从持久cursor恢复；Stop后普通工具拒绝；既有SDK/REST Stop ACK仍可达，不经过普通活动前置。终态E读取/普通重放受原门禁拒绝；MCP/Runner Stop专用适配和终态确认仍记M1未实现。外部CLI机器恢复不在本批证明 |

路径表中的短路径分别相对packages/contracts、apps/mcp、packages/conformance、apps/agent-runner；完整可执行路径以savedplan及operation-decisions来源为准。新增真实conformance文件当前不存在，不能冒称已有测试。

## DoD与误广告证据

| DoD | 文档输入 | 产品验收必须补的证据 |
| --- | --- | --- |
| 实际operation全集无遗漏 | operation-decisions.json每条完整请求/返回、原索引、policy及分类；archive-check.py集合核验 | 最新main重新全集核对；新增/删除差异有明确处理，非固定数量断言 |
| 角色发现与领域一致 | Human corrections、Team协调写、provider variants、Loop及rollup差异行 | 每项发现输出与对应服务端允许/拒绝并列；误广告项不可只改描述；当前删除Project/WorkItem已明确C coordinator/team scope和E拒绝；99条既有领域规则均附实际锚点/正反例 |
| 旧客户端兼容 | compatibility.md、旧schema/URI/名称表、旧默认响应 | 旧客户端未协商读取无新增字段；隐藏工具直接call有角色拒绝；新只读alias不破坏resource |
| 资源客户端、仅tool客户端、Pi | 真API/MCP流程与模型tools请求抓取方案 | 完整初始化/发现/读取/故意拒绝/继续读transcript、版本与输入源码绑定；不能只看REST manifest |
| 错误与恢复 | Runner401、SDK/MCP envelope、稳定身份与导入限制 | 错误所有字段不丢；自动refresh/retry计数为零的拒绝案例；传输重试单事实；Stop既有入口可达 |
| 完成门禁 | 本轮只补文档；平台独审/Chief确认/产品检查顺序 | blocking/high由独审闭合、最新候选PR RequiredCI及实际main合入证明；文档核验不代产品检查 |

## 产品实施后的准确运行入口

按仓库规定runtime安装依赖：`pnpm install --frozen-lockfile`。依次执行`pnpm generate:route-policy`、`pnpm check:route-policy`；定向运行contracts、MCP、SDK、Runner现有测试。新增真实套件通过根`pnpm test:conformance:integration`及包`pnpm --filter @workmesh/conformance test:integration`执行，串入根`pnpm test:integration`并显式接现有Required `api-integration` job；完整service准备、pipefail、always证据上传、fixture finally和防漏接检查见 [ci-integration.md](ci-integration.md)。该脚本是待产品新增的入口，不宣称当前package.json已存在。

产品候选执行`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm test:conformance`。单独conformance内存结果单列。Web消费者兼容按现行必要检查验证，不设计UI、不借UI延后跳过合同消费者回归。

integration必须RUN_INTEGRATION=1及本任务含test的专用数据库，按config提供随机有效bootstrap/session/master key、Redis与S3；主密钥必须32解码字节，S3创建并HeadBucket验证专属bucket。秘密只在进程环境，不进日志。API/MCP/Runner使用本轮独有端口及进程，Windows pnpm.exec沿真实pnpm入口，E2E run目录为绝对路径；integration结束后E2E顺序运行，避免共享.next并发。

recovery默认可选skip如实记未验收，不计通过；适用必需用例缺环境不能静默skip。受测源码、运行换行映射、准确命令/退出/版本/首败、服务准备和清理在产品轮记录；本轮不预填产品运行资料。

## 本轮文档检查

本轮运行`python -X utf8 -B docs/plan/agent-mcp-m0/audit-generate.py`生成结构化全集、binding和来源，再运行`python -X utf8 -B docs/plan/agent-mcp-m0/archive-check.py`核对文件、字段、来源与链接。暂存后执行`git diff --cached --check`和完整范围`git diff --check <来源head> HEAD`；对实际Git blob与工作树字节分别核验。

CI分类调用当前`classifyChanges`实读，不改policy/属性豁免。所有真实结果与首败保留在review及sync-check-receipt材料；旧check-receipt保持历史语义；不运行全产品tests，结果不写成产品通过。

## 四项定向复审的精确案例

| ID | 落点 | 输入与具体判定 |
| --- | --- | --- |
| M0-MODE-PROJECTION | contracts/client-profile-contract.test.ts；MCP index/http.test.ts；真实conformance | 同Connection/Session同时接read-only/read-write：API qualified结构/资格相同，不含registered/discoverable/mode；adapter写工具名单不同；只读cached写call拒绝，服务端写事实不增 |
| M0-CONTEXT-PROJECTION | MCP index.test.ts、coordination-product调用测试 | 同次prepare得到的manifest和projection传给context，allowedOperations严格等于当前Session变体、discoverable、eligible API绑定的去重集合；没有额外manifest请求，不含target_execution条件模板、adapter_internal或全API未适配项；两独立请求只在固定live事实下比较 |
| M0-INSTALLATION-NO-SESSION | contracts/SDK/MCP测试；真实conformance | installation_target无agentSessionId，adapter null联合；Session manifest仍被拒绝，不伪造Delegation、不隐式派生C；exact-target handoff沿自身installation入口验证 |
| M0-TARGET-UNBOUND | MCP index/http.test.ts | C有安装bridge、写模式允许且E callback实现时，未给目标只条件广告requires_target_check，不进入allowedOperations；缺bridge blocked，缺必填ID输入失败，无token刷新 |
| M0-TARGET-QUALIFICATION | SDK index.test.ts；MCP http.test.ts；真实conformance | C指向准确E后：一次refresh→目标Bearer qualified→同Token命令；断言manifest确为目标E而非C；角色/state/caps取E值。目标错kind/ID、跨Team/撤权、refresh或manifest失败均终止，不降级、不换身份 |
| M0-TARGET-CONCURRENCY | SDK/MCP真实conformance | 两客户端同Connection并发指向不同E，捕获Authorization与Session ID绑定，活动各自归属；资格读取后撤权依旧命令拒绝；shared client Token不变 |
| M0-E-CONNECTION-IDENTITY | contracts/MCP与真实conformance | 普通E Bearer查询current identity固定credential blocked，真实API UNAUTHENTICATED；合法C正对照成功 |
| M0-REVIEWER-PLAN | contracts/Runner/MCP与真实conformance | reviewer持plan:write、active state仍blocked/ROLE_REQUIRED，真实publishPlan FORBIDDEN；非reviewer仍须revision、scope及awaiting_approval批准，不把正对照扩为无门禁 |
| M0-BINDING-prepare_project_import | contracts/coordination-product测试 | 当前listProjects映射仅历史；拟内部binding operationIds=[]，prepare不调用REST，read-only可本地规范化；不把prepare计为Project读取资格 |
| M0-BINDING-verify_connection | MCP index.test.ts | manifest/current identity/listTeams三组成齐全；任一读取失败不能verified=true，不遗漏Team probe；E credential反例拒绝 |
| M0-PROVIDER-OPEN-PR-CAPS | contracts/MCP/真实conformance代表provider夹具 | kind=open_pull_request仅repo:write_branch不足；联合repo:write_branch+repo:open_pr和context open_pr仍保留Lease/pinned branch/target检查 |
| M0-DOMAIN-每operation | contracts/route-policy.test.ts；真实conformance | 原99条已核credential/kind/role/state/scope/variant；每条positiveTests逐谓词允许、negativeTests单独破坏每个门禁；六项具体差异的发现拒绝/精确列表正对照单列，不允许通用pending测试 |
| M0-RUNNER-401 | Runner permission-matrix/workmesh-tools及run-session测试 | 本地到期仅请求前refresh；受保护401、撤权、Stop、错profile之后refresh与重发计数均零；refresh拒绝原envelope及trace不丢，failed活动失败不覆盖它 |
| M0-CI-WIRING | scripts/ci-policy.test.mjs、validate-ci.mjs及隔离负例 | 四包单文件改动必选api-integration；删除CI调用/根串接/include时检查非零；fixture失败或零测试非零；选中job失败/意外skip聚合失败；always上传包含execution、模型tools和脱敏组件日志 |

逐条negativeTests是待创建/扩展的稳定用例名与断言，不冒称目前已有或本轮运行。静态检查核每项内容，而不是只核数组非空；没有真实Token、数据库、Pi或RequiredCI结果预填。已闭1/API与adapter、2身份路径、4/RequiredCI接线保持；本轮两blocking等另一Agent定向复审。

## 本轮两阻断的具体正反例与静态语义验证

- M0-VERIFY-C-NO-TARGET：合法C、不配置独立安装bridge、{}输入；三项调用均当前C，刷新计数零；E无Connection或listTeams失败反例不得verified=true。
- M0-CLAIM-C-RETURNED-ID：正常HTTP/stdio同Connection凭据两个SDK用途槽，先C claim再返回nonce交换；断言返回id不在inputSchema、没有任意输入目标、无另一安装配置；只有coordinationToken槽的SDK反例兑换错误保留，不冒成通用目标bridge。
- M0-SELF-E-READ：仅Session Token的E，在两个mode读自身Session/context/plan/activity resource及等价tool；自身manifest资格、刷新零；异Session输入拒绝后自身读取仍可走。C→目标E独立按目标manifest/Token/state求值，无目标仅条件入口。
- M0-DOCUMENT-OWNER：三种准确owner分别允许；只有Team scope、同Team异owner、project文档但work_item不在live scope分别拒绝。当前归档读取允许、归档写拒绝，base revision/hash及restore相同内容反例按实际handler。
- M0-INBOX-RECIPIENT：exact recipient与claimant详情允许；同actor另一Session/未领取详情拒绝；actor目标open仅有限列表，claim后本Session可读；ack work:read、reply work:write，review_request追加reviewer/artifact与准确源收件检查。
- M0-LEASE-HOLDER：准确work_item/委派step/current与parent current step分别允许；异scope/持有Session拒绝，renew active且未过期、release active+If-Match，heartbeat当前不额外核expires_at。Human force-release正对照与Agent拒绝另行保留。

archive-check.py独立从不可变main解析OpenAPI和MCP参数/SDK方法；校验99规则覆盖与源码锚点、逐operation允许/拒绝事实求值。检查binding输入必须含显式目标字段或resource URI参数，verify/claim语义固定；将verify改成目标bridge或让self_execution要求bridge的内存变异必须被拒绝，在callback仅加入返回sessionId不改变分类。用同一文档投影对象验证read-only/read-write名单及Context.allowedOperations；这不是实际客户端运行。

本轮静态检查还解析SDK request实际布尔条件并求值64组合：有自身E Token而无Connection时不安装刷新，C带准确目标且安装用途槽可用时才局部刷新；未知运算/字段失败关闭。Workbench settle的route非active标记仍受domain普通写状态交集，credential入口仅executing；不是新增终态权限。

直接E在initialize/list阶段尚无读取参数时，self_execution的准确自身id已由manifest确定，可披露自身读取；只有C target_execution无目标才是条件入口。实际调用缺必填id仍按旧schema拒绝，异id拒绝且不刷新。静态检查分别断言发现无参数允许与调用异id拒绝，不把输入必填误当所有发现都需安装bridge。
