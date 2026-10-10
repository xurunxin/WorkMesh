# M5 实施与实际运行报告

M5 联合验收尚未完成。本轮落实已确认的 Runner 消费者最小修复、真实 Pi 故障／交接／fake Git 补充用例及检查接线。实际 OpenCode 隔离门禁失败，仅停止外部子流程；没有把协议 fixture、MCP 握手或两个 Pi 的补充链当作 O/P 四条联合主链通过。正式成果独审、最新 PR Required CI、actual Done/main 尚未具备。

## 来源与实现

实施依据为已独审规划 `ddddcfca8d7ef387df58be993c88ffe7d62391dd`。本轮开工 HEAD 为 `9051da511d0e844a5e57b6263c23f643689bc879`，包含之前 checkpoint 的 Runner 六个源码／测试文件、ADR 和资源登记；之前局部 review 引用的 65 条结果不计本轮运行。当前实际 main 观察及 parents/tree 见 [原回执](input/product-main-observation.json)，未借 M3 的旧 CI 证明新组合。

[当前实施规格](product-spec.md) 来自本轮 Todos 完整 Spec；[平台读回](input/product-platform-todo-readback.txt) 中 Saved plan 仍截断，不冒独立 doc 全文取得。冻结 M5、原规划、原候选 Git/worktree 原件及首败保留历史含义。

平台读回原字节另保存在 [无损原件](input/product-platform-todo-readback-raw.zip)，[双指纹说明](input/product-platform-readback-provenance.json) 区分它与只规范化行尾空白的可读副本；暂存空白首败 native exit2 和修正后 exit0 保留。未更改规格正文或放宽 Git 空白门禁。

`apps/agent-runner/src/workmesh-tools.ts` 的 `makeTool` 只给 `createDocument`、`publishAgentPlan`、`postWorkRoomMessage` 传内部重放参数和 tool signal。`run-session.ts` 的 `RunnerApi.request` 首次 refresh 后保存同 method/URL/序列 body/key/If-Match/E/headers，最多第二次业务发送，共用三十秒截止、十五秒单次 HTTP、取消和原 Attempt 准入。状态 GET 不 refresh、不写 Activity。HTTP 拒绝、JSON、DNS/TLS、GET、provider intent、签名传输、控制、settle 和 Stop finally 不进入机制。`execution-lifecycle.ts` 保留首传输失败 cause／unreconciled，后来的明确拒绝不证明第一次没 commit。合同见 [ADR0084](../../adr/0084-runner-tool-bounded-transport-replay.md)，保持 Proposed，待产品成果审核。

新增 `packages/conformance/src/joint-clients.*` 复用真实 API、Worker、受控模型、签名 webhook 与 FakeGitProvider，增加原生 OpenCode 私有启动 driver、真实 Pi/HTTP 故障代理、独有子进程登记及证据 reporter。新套件纳入 integration include、根单元 exclude、CI 必含校验和逐套件删除负例；跨包 fixture/helper 只从生产构建排除，lint/typecheck 和真实 integration 继续覆盖。没有服务端授权／公开合同／迁移／新业务域改动。

## 实际客户端与领域证据

Windows、Node/pnpm/Pi 的实际版本见 [环境回执](product-environment.json)。OpenCode 原生 executable 与 PATH 上 Bun shim 区分，原生文件 SHA256 `e13e57a7f6b7abddec887e0b2d912d22484077c50dff5bed4f3199bcf63b6088`。独有 XDG config/data/state/cache、APPDATA/LOCALAPPDATA、空工作目录、配置来源及关闭私有 debug daemon 均有实际日志；HOME/USERPROFILE 未改，用户 service.json 仅元数据前后核对且未变化。代理实际拒绝外部模型目录 CONNECT；不据此声称覆盖所有潜在出网路径。

最终实际启动门禁 `M5_OPENCODE_USER_SKILL_DISCOVERY`：私有日志仍订阅用户 `.agents/skills`，未能证明仅私有技能／插件发现，模型运行前停止。此前两次 `run --standalone` 各在有界等待后超时，受控模型零请求；有 MCP 握手／tool 列表连接，没有模型工具结果实收。官方配置入口与实际 runtime 的差异不能用安装或文档替代。对应诊断、实际退出与用户配置保护记录保存在脱敏原件中。

此前 `product-opencode-timeout.json` 的初始超时归因不准确：原生 debug config 已返回，随后私有 daemon 的 CONNECT 清理挂住。只停止经 PID／命令行确认的本人私有 daemon 后改进连接收尾；初始回执保留，不倒写成 debug 未返回。其后不支持的 debug 参数、临时脚本编译首败、standalone 超时和最终门禁失败分别记录。

真实 Pi 新运行包括三个白名单单 toolCall、两个相同 key/body/完整 headers/E/If-Match 指纹的业务 HTTP、一次业务 state/event/outbox 与模型实收；自有 timeout、成功响应 body 中断；真实 API PID 退出／重启、同 Runner/Attempt/DB/port 的原回执恢复；两失响应保持不确定且不完成、首次完整拒绝零重放、Plan outbox 故障整体回滚、Human Stop 后零第二业务 HTTP及原 E Stop_ACK/Lease 清理。Human 经既有 REST revokeDelegation 后原 E 被拒、零第二业务 HTTP，数据库撤权事实另存。

新增真实 Pi 边界分别证明：后台 refresh 已取得并使用新 E，原 toolCall 的第二业务请求仍用冻结旧 E；第二业务 HTTP 明确拒绝后数据库 external_effects_reconciled=false，Session 未完成，模型收到结构化错误；首 commit 后服务器原 E 到期，原 E 准入401，零第二业务请求；Human 只停当前 Turn，Attempt aborted／Turn stopped／Session executing，零第二业务请求。缩短 TTL／服务器到期／准入后缩减 definition 都是显式特权故障准备，未改变公开合同。模型可以处理错误后令回合 settled，不能强假定 Attempt failed 或宣称效果已对账；纠正此断言的首败也保留。本机 held expiry 与 shutdown signal 的全部竞争仍仅消费者单元，不冒真实子进程覆盖。

同 owner/Session 的两轮合法准确 E 竞争是 SDK 协议调用方与实际 Pi，按唯一 running Attempt 时序观察真实旧 revision 与新 intent 合并，保留 stable step ID；SDK 方不冒 OpenCode。两个实际 Pi Connection 的核心交接由 H2 接受后 B 新 Session 创建本人 Plan／Artifact并完成；旧 A 原 E 四个合法请求均得到 `DELEGATION_NOT_ACTIVE`，来源 Delegation completed 的事实保留。fake Git 补充链由两个实际 Pi producer/reviewer 执行 branch/commit/PR、精确 action/current head、显式缩减 reviewer repository scope、review_result/code_review/structured review、H2 精确 merge approval、Worker、required child 读取及父完成。SDK claim/ACK、初始 Plan/context、特权 membership/repository scope和 provider webhook 属准备／观测，单列在原件中。

个人 Lite、团队成品部署、企业实机、其他 OS、真实模型／Git provider 账号均未测。独有测试服务、两 Human／两 Team 夹具不等同成品画像认证。外部签名上传／下载两模型工具仍禁用，Pi 传输不能计外部覆盖。逐行实际支持／未测与原九类缺口见 [实际矩阵](product-matrix.md)。

## 检查与首败

精确命令、原生退出、runtime、stdout/stderr 指纹及新源码前后绑定见 [全部命令回执](product-checks.json) 与 [实跑数量摘要](product-check-summary.json)。全仓 lint／typecheck、route policy、两 Skill pin 检查、ci:test／ci:validate、conformance 生产构建和 ci:source build 均实际 exit0。全仓单元1854通过、2跳过（1856），32任务、缓存0；Runner 聚焦68通过。全仓 integration 在仓库 CI 测试频控环境下实际 exit0，runtime 1942.0459635 秒：DB81；API278通过／1跳过；conformance76通过（原61＋本批当时15）；Worker147通过／1跳过；recovery1通过，合计583通过／2跳过（585）。跳过分别为真实 MiniMax 与受 guard 限制的 retention upgrade；恢复检查实际运行，未按环境跳过。E2E 实际 exit0、70通过、0失败／跳过，3任务、缓存0，runtime 274.92225660000986 秒；这组旧 UI 回归不表示外部客户端联合验收通过。

最终 M5 套件扩至19条并以当前完整字节实际复跑：19通过、0失败／跳过，native exit0，runtime 176.29314409999643 秒，受测源码前后不变。新增边界首次7条中5通过／2失败，修正故障准备后的四项边界4通过／15未选择；之后 durable 未对账增强断言1通过／18未选择。过滤 skipped 是未选择用例，不是环境跳过，不能把这些运行数量相加成新的完整套件数量。新增夹具最后的 lint／typecheck 和生产构建均 exit0；完整 integration 之后的修改只增补测试／故障准备及文档，新增四项在上述本批完整运行验证，不借旧指纹冒新增用例已在根 integration 跑过。

保留规划首败和本轮所有首败：早期 typecheck、负例错误码／旧 A 状态码断言、含 shell 管道字符的过滤命令 native exit255、Document 列名假设、原 get_plan 名称修正及 membership 诊断。`joint-all-fourteen` 是十三通过一失败；不能以其中错误工具名的旧“通过”代修正后完整读取实证。最新用例与数量另依最终实际回执。

完整 integration 首轮在 API 阶段失败，未进入下游 conformance/Worker/recovery：密集 installation 准备触发默认频控；外层长期允许 loopback 主机又破坏私有主机拒例。修正仅使用仓库 CI 已有测试频控值，并将 loopback 授予缩到单受控模型夹具；不改生产 policy、不 flush 共享 Redis。首败保留；环境调整与下一次运行分列见 [测试环境回执](product-check-profile.json)。

membership 诊断实际证明：原 principal 降为 member、首 Document commit 后删除准确 membership，原 E status GET 与原 Document key 回执仍200，模型收到成功。当前普通 E `authorize.loadAgentFacts` 不查询 principal membership，runner status 本身只返回状态；这是本卡待合同复核的具体缺口，不以 SDK 准备、源码阅读或 revokeDelegation 另例宣称该负例已通过，也没有自行扩大权限修复。完整事实见 `pi-member-revoke-observation.json` 及两次失败运行回执。

## 保全、演示与剩余关口

原 Git blob 与 Windows 运行字节分别绑定；CRLF/LF 差异不是同一 SHA。每个检查 source manifest 保存前后 digest；早期无现场 manifest、未逐版保全的中间源码／被同名覆盖的 live 捕获明确记缺口，不伪补历史。完整 integration 的前后 digest 不同仅因20个既有 tracked 证据文件被套件更新，产品代码／配置未变；新运行字节已另存，原历史文件从精确 Git blob 恢复并逐项匹配当时 before runtime hash，见 [恢复回执](product-history-restoration.json)。不能把旧目录文件存在当新执行证明。最终 staged/commit 字节核验另存。原日志按脱敏公开字节进入 ZIP，逐 member SHA256 回读；必要原本机恢复文件不删除。入口见 [证据索引](product-evidence-index.json)。

演示：先读 [本卡缺口](product-gaps.md) 与环境/owner；`pnpm.cmd --filter @workmesh/conformance acceptance:joint` 使用明确 executable/evidence 根及本人隔离测试数据库，当前门禁预期非零，不会给四链发证。独立 Pi 补充套件使用 `pnpm.cmd --filter @workmesh/conformance exec vitest run --config vitest.integration.config.ts src/joint-clients.conformance.test.ts`；需要重新准备本人资源、受控模型与 fake Git，不能接共享/真实 provider。当客户端隔离门禁真实解决后，再完成 O/P 四链和九类缺失组合；不是修改配置便默认接入成功。

资源登记以 [owner](product-owner.json) 与 [实际收尾](product-cleanup.json) 为准，不以登记证明正在运行。本轮人工资源收尾只停止精确 ID／owner label 的本人闲置容器，容器、卷、网络、共享镜像、`.tmp/m5-runtime` 与当前恢复目录保留；收尾脚本无 recursive delete，未触碰 G1D0C3 拒目标、未清他人服务。既有 Runner／测试夹具按其既有生命周期清自己的 scratch，与本轮人工收尾分别记录。M5 保持未验收，交 Chief 阅读实际缺口及新证据后安排正式成果独审和后续关口。

三个本人容器停止命令均实际 exit0；[有界进程／端口读回](product-process-readback.json) 未见该 workspace 的测试 Runner/API/Playwright 残留，3100／3101 均无监听。最终 [暂存字节与检查关联核验](product-final-verification.json) 分列 Git blob、运行字节、原件完整回读、未变历史及静态 CI 分类；静态分类不冒最新 PR jobs 已运行。报告可在 change review 的 Markdown preview 阅读。
