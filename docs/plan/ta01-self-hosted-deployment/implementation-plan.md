## 当前授权与执行关口

用户 2026-10-20 10:34 已批准新会话接续。当前分支为 `tds/conv-01a1572a-7aeb-7b6d-b7e8-83e89c2b723d`；已保全旧树并快进接入 PR228 实际 `1a2e562f`。本次唯一 API QEMU 已自然终态：2540.87 秒、外层无 OOM，一次目标尝试断连，准确 API139 和有限 core 元数据已归档，致因仍未知。准确来源、未闭项及收尾见[恢复记录](recovery-2026-10-20.md)。本次许可已消耗，不重复启动或继续 MCP，旧分支保留作恢复来源。

用户 2026-10-19 22:26 已在 `q-6dUwccoh0de_5smR0B7K2` 选择“重取 API，外层6 GiB（推荐）”，执行[本次明确资源例外](current-spec-amd64.md#单次-api-重取资源例外)。先核没有同次已启动／完成的 6 GiB VM，再执行唯一一台；不是继续等待同一批准。原 4 GiB OOM 及 40 成员归档保持。专用外层仅内存上限改为 6 GiB，guest／原候选／原前缀／90秒首次身份和30秒产品读取及9000秒总窗保持。容量不足或输入不可得即停，不变全局配置、其他项目或权限，不续 MCP／矩阵。准备和实际 QEMU 启动分别留证，不以确认消息或 runner0 冒完成。

本次用户已回答原问题 `q-E6FuFFokBxxs6UpR6K9vC`：“先取API窗口（推荐）”。按[已入库最小方案](amd64-crash-investigation-plan.md)只执行 A：CI562／9c8bbff 企业原前缀及一次首次 auth/install，一台固定 amd64 guest，总窗最多 9000 秒，首败或目标完成即停，无重试、下一窗口或新矩阵。固定原 Node／QEMU／guest、4 CPU／4 GiB、设备、产品 30 秒及正式期限；原首次身份 Client90 与安装器业务30按源码分列。原拒绝／等批历史及 ARM 延期保留，Saved plan 例外继续。P1-1 已由正式复审确认闭合，P1-2 等此次证据判断，仍不可合入。

**2026-10-19 当前执行范围：**用户于03:41批准恢复本卡，收敛到既有 Linux amd64。以[当前完整规格](current-spec-amd64.md)为准。ARM 服务端候选及矩阵延期，不再执行未批企业 ARM 取证；10月17日保持关口的历史选择及所有旧失败保留。后文双架构计划是历史，不继续作为本轮前置。

本次变更仅服务端 producer／guest 矩阵为一个 amd64 候选、三个独立画像 guest。策略校验须拒绝缺画像、跳过、吞失败、错误工件／摘要和非本轮架构；Required仍要求实际选中的全部检查成功。连接器两个架构及平台门禁保持原样。新服务端构建／安装入口明确拒绝 ARM、Windows及32位平台，历史ARM清单仍可解析留证。

固定Node22.19.0、原QEMU／guest／4CPU／4GiB、原请求30秒和所有正式期限保持。先核范围及负例，再以新源码候选跑实际amd64三画像，目的为验证新的分发入口和CI交接，不用旧绿补最终结果。API／MCP139仍须沿原件独立定位，普通三组合偶然通过不能关闭；不因此反复推新候选求绿。原五门禁、九类适用合同、正式P0/P1产品独审及最终head最新Required仍是合入前置。

下段是1de9bf3资料交付时的历史关口，已由上述新裁定恢复；不是当前待批企业ARM实验。

最新反馈要求基于现有原件收敛修复；现有证据尚不足以安全选择产品补丁，当前停在[定向修复关口](repair-decision-gate.md)。单次1800秒组件例外已消耗，禁止自动追加任何 VM 组件小测。新企业 ARM 原组合取证方案尚待裁定，不等于已批准或已执行；本轮仅核源码和原件，没有修改产品、CI或原验收期限，没有启动新运行。旧139、企业读取失败及个人／团队缺件分别保持未闭，完整验收和正式P0/P1产品审／最新Required仍为合入前置。

本次按用户 2026-10-14 12:27 批准的新会话方式接续。PR227 为恢复来源，本次交付和条件合入走当前会话分支；旧树保全、真实主线及双架构首败见 [接续记录](resumption.md)。产品验收尚未完成。

用户已批准保留 PostgreSQL、Redis、S3 的基础产品交付及现有 Linux amd64／arm64 CI、干净完整虚拟机验收。当前路线、设备环境和条件合入许可见 spec.md；Redis-free、filesystem、保证变更、生产接入与仓库外发布不实施。

原规划计划 doc:X7D1XMP5_XpGdpyYKCVNZ 和四份已审文档完整保存在 history/。本文件是基础产品执行计划。用户先选择平台同步，随后明确批准本阶段记录例外并继续。平台 Saved plan 字段仍未同步；本阶段以仓库计划、完整规格和对话批准记录执行，字段同步不再是产品修改前置。不能把旧平台计划或聊天 <plan> 正文冒充已更新的字段。

## 基础产品文件增量

- scripts/server-distribution/build.mjs、manifest.mjs：从已提交干净源码按架构构建 API／worker／MCP／Lite 和安装工具镜像，保留现有依赖镜像，记录源码 tree、镜像 ID／摘要、工具版本及准确迁移账本。候选采用离线 Docker 归档和摘要清单；大归档分块并按内容复用，不提交 guest 磁盘、源码安装副本或明文秘密。源身份来自受审渠道，随包 hash 不代发布者身份。
- scripts/server-distribution/install.mjs、install.sh 与 infra/docker/server-installer.Dockerfile：交付包含 Node、Docker CLI／Compose 的可信安装工具镜像及 sh 启动入口，目标不需要源码、workspace、宿主 Node／pnpm／Python。启动入口先核用户取得的可信 manifest 摘要，再验证和装载工具镜像；不自行安装 Docker 或修改宿主权限。安装目录在宿主和工具镜像使用同一准确绝对路径，避免 Compose bind mount 指向其他目录。
- packages/config/src/deployment-profile.ts 与对应测试：固定 personal／team／enterprise 三画像，只有 Redis／S3 组合；拒绝未知画像、不支持后端、副本或角色、缺 CA／代理约束及不安全路径。沿 loadConfig、loadFeatureConfig、loadRealtimeRedisHintConfig、loadRetentionConfig 和 runtime-secrets 校验；可信工具镜像经摘要认证后先载入；配置预检先于其他应用镜像导入及业务服务启动，错误不包含秘密。
- docker-compose.lite.yml、docker-compose.production.yml、配置 JSON 示例及 runtime-guard：安装工具对既有 Compose 生成受控 JSON，接入显式画像、只读 CA、回环发布和准确 feature／MCP 模式，保持正常服务非 root 与硬化。初始化镜像的临时 /data 使用显式独有挂载，不新增无归属匿名卷。Runner 外置；Lite 的 MCP 使用独立镜像。
- 安装器使用独占锁、原子写入和写前 journal。阶段固定 verified、staged、backed_up、migrated、healthy、committed，绑定原 project、配置摘要、候选身份和账本；同版本异内容拒绝，损坏或不确定 journal 拒绝继续。排空 API／worker／MCP 后用旧工具完整备份，沿 applyMigrations 逐项 SQL／账本同事务迁移，再验证候选；首次用户沿现有 API 初始化账号及配对，commit 使用受保护凭据执行实际 MCP 读取后才切 current；不将整批升级说成单事务。
- packages/recovery 的现有 createRecoveryBundle／restoreRecoveryBundle 由安装工具调用，保持加密、密钥分离、全部 S3 版本／Object Lock／legal hold、空目标和认证 journal。迁移前失败保旧，迁移后仅在真实账本、运行输入指纹和依赖镜像均符合旧候选兼容条件时允许程序回退；不兼容时保留原卷，恢复到独立空目标，数据损失与切换另取具体授权。基础范围不新增领域 schema／API／event。
- docs/integration/README.md、reference.md、getting-started.md、installation.md、troubleshooting.md 及部署／恢复文档：同次维护服务端包、三画像、离线闭包、CA 和失败恢复的可运行示例，使用仓库固定 zh-tech-writing；支持声明仅覆盖实际通过组合。

## 验收与 CI

用户于 2026-10-16 21:48 对 Chief 具体方案回答“单次延长诊断窗（推荐）”。本次仅批准一次 ARM 组件 VM 总窗从 1,200 秒增加至最多 1,800 秒，增加 600 秒；前三次 1,200 秒 incomplete 原件与未知请求数保持，不倒填。固定 guest／Node／QEMU、4 vCPU／4 GiB和设备配置保持，预展开已核公开角色输入，经真实配对身份只取一对原 GET，按统一关联记录连接／事务／SQL／授权／响应并即时保存阶段。Node 600 秒、产品请求 30 秒及正式安装／整体验收全部原期限不变；不缓存资格或替换授权。到期保已有安全回执并停止，不追加第五轮。该单次诊断例外不扩产品范围，不替代完整矩阵、正式 P0/P1 产品审或最新 Required；不取消或重跑 CI567。Saved plan 记录例外继续，不增平台同步前置。实际命令、输入、阶段、首败和资源账本见[当前报告](current-delivery.md)。

当前接续以[完整报告](current-delivery.md)及其准确原件为准，以下逐轮记录保留历史时态。CI561 的 `461c753` 在团队首次 MCP 身份读取、尚未 commit 时自然退出 139，旧 commit-only 捕获会漏该窗口。后续仅将显式诊断收窄到双架构团队画像，在原三次身份读取前准备完成；受拒不发请求，失败不重试。团队三次 commit 观察继续。普通六组合、Required 严格结果、全部请求／健康／安装／guest／捕获期限不变。

新诊断窗口与同步准备的回归冻结在既有 `native_diagnostic_test.py`，包括普通三请求原参数、其他画像无新观察、准备受拒零请求、读取失败不重试且一次恢复、core 回执停止。CI 入口及 `ci-policy.test.mjs` 同步核显式团队和普通六组合，删除 profile、替换画像或逃离手动分支拒绝。9c8的52项已在 CI562／563 四生产者实测，显式首次身份窗口两架构成功，AMD后来仍捕获139、ARM升级后仍业务读取超时；不关闭根因或进入正式成果审。

CI562 普通团队 ARM64 的串口已报 commit 读取超时，但最终摘要等重型 Docker 诊断结束才上报，宿主先到150分钟，result.receipts为空。本轮在首个 Docker 探测前上报同一安全摘要，标 diagnosticsPending=true；允许原诊断在原总期限内继续，只有最终failure立即结束。只有pending失败也必须拒绝普通／诊断验收，不延时、不重试或增加私有数据。新增已创建回归冻结为 `GuestFailureProgress.test_pending_snapshot_precedes_docker_and_survives_aborted_collection`、`test_pending_failure_blocks_actual_host_completion_in_both_modes` 和 `test_only_literal_pending_true_defers_final_failure`。55项仅本机通过，新路径待新候选真实验证；原52项guest证据另保。

创建 server-distribution 的安装、manifest、journal 测试及 apps/api/integration/deployment-profiles.integration.test.ts。沿 acceptance-matrix.md 冻结的名字覆盖安装、重复／并发、拒绝和 journal 中断、迁移失败、兼容程序回退、不兼容空目标恢复、原卷保留、限流 store 失败关闭、丢 hint／worker 重启、工件上传下载和完整备份恢复。所有断言使用真实接受状态与外部效果证据，不用 fake 结果代真实原子性和存储锁。

新增必需双架构 server-install CI 入口，并同步 ci-policy、结果汇总和入口删除负例。复用现有固定 Ubuntu 完整 TCG guest／QMP 生命周期代码；先准备 Docker 及工具，再对无源码候选关闭外部默认路由、禁止自动 pull，实际证明离线启动闭包。三画像分别建立独有环境，API／MCP／Worker／outbox／限流／工件／完整恢复均在实际安装的候选中验证；隔离 CA、身份与 fake provider 不冒企业生产实网。

明确原 guest image／firmware、实际 kernel、boot_id、CPU／RAM／磁盘和候选／源码／脚本摘要；保留首败、采样、重启与收尾回执。固定资源采样不宣称物理最低配置，不上传含秘密的 guest 磁盘。 首轮2 vCPU／4 GiB的完整TCG记录保留；ARM64首次安装未通过，数据服务也有连续健康探针超时。下一候选验收环境改为固定4 vCPU／4 GiB作容量对照，现有健康、安装、请求和guest总期限及全部业务／故障／重启断言保持；CI547已执行该对照、两架构仍达到总期限，不能认定CPU为根因或宣称物理最低配置。后续保同一固定条件与全部断言，优化完整校验的有界读取缓冲并补固定操作耗时；不缓存跳过字节／SHA／OCI核验，实际性能与完整组合仍待新候选。执行 lint、typecheck、test、integration、conformance 五项及真实示例／恢复 opt-in，核新支持组合和当前 HEAD Required CI；不复用 docs CI 或控制面基线。

## 交付与收尾

CI548 两架构仍达到原 150 分钟总期限：AMD64 个人及团队闭环完成、企业仅到健康阶段；ARM64 个人业务提交后，升级链 commit 失败，完整失败回执没有送达，具体原因未知。后续保同一完整 guest、三画像、重启断言和原期限，抽出同源版本／功能登记入口，减少配置校验加载无关合同；生产包显式保新入口。另补固定阶段耗时／Node CPU 和分类前即时快照，用新候选确认效果，不冒根因修复或支持通过。

CI549 双架构及 Required 终态失败。AMD64 团队回退后 commit 的真实 MCP initialize 返回 ECONNRESET，重启计数不代历史退出码；ARM64 个人升级后 commit 的 tools/call 触发原 30 s socket 超时，当时程序健康、重启数 0，不能认定同因。阶段耗时和即时失败快照已有原件。后续保普通模式全部前序、三画像和期限，失败时补准确本安装容器的有界历史退出事件、只含布尔值和数字的 HTTP 响应进度；显式诊断改为团队回退后 commit，并行准备后事后核原业务边界，迟到拒绝、不重试请求或受拒设置。原生捕获仍不构成产品验收，不由未捕获推断已解决。

全部产品、候选索引和有界证据交付本会话分支，复用共享工具／store／镜像内容。只定向收尾身份已证且无活动引用的本人资源，历史匿名卷、两处 policy-blocked 目录及其他受拒目标保持，删除首败停止该目标。

本会话分支的 PR 随最终基础范围更新标题正文，并保留 PR227 恢复来源。实际产品验收及最新必需检查成功后回 review，完成正式 P0/P1 成果独审；问题闭合、PR ready、无新范围分歧时按已获条件授权合入。正式独审前不合并、标 Done、外发或声明产品完成。
## CI550／551 后续执行增量

两轮双架构服务端和 Required CI 均失败；CI550 普通 AMD64 耗尽150分钟总预算，ARM64 个人升级提交读取超时。CI551 AMD64 原生退出139但 GDB超时，ARM64未到团队目标。首败原件保留，不盲重跑旧候选或归为相同根因。

后续候选完整散列最多两个工作线程，单可用 CPU 顺序执行；校验全部字节、路径、大小和成功退出后才继续。原生捕获保存安全公开 Node 相对位置和超时部分栈，保60／90秒及512 MiB无swap边界。ARM64 显式诊断观察个人升级后的原 commit，普通模式不变。失败快照一次只读采集已核归属 PG 的连接上限、包含自身的连接数和活动跟踪开关；不改池配置、不重试业务。26项 Python、16项安装单元及隔离 PG 采集通过，完整新候选及性能未验，正式成果独审未做。后续仍须原五门禁、最新普通 Required CI、全部双架构／画像／恢复／重启实测，通过后才进入正式独审和条件合入。见 [接续记录](resumption.md)。
CI552普通AMD64已在企业回退提交实际退出139；CI553旧单窗口两架构均成功但未捕获，不能关闭原生故障。后续显式诊断覆盖三画像首次／升级／回退的九个正常提交，每个原动作和恢复各一次、未知窗口提前拒绝，准备／恢复受拒或原失败即停止，不在其他窗口重试同一拒绝。逐窗口回执仅诊断、不替代完整支持或重启；普通路径原参数、次数、断言和全部期限保持。30项本机检查通过，新候选仍须真实完整guest及最新普通Required，正式独审未做；普通ARM64待终态。见 [接续记录](resumption.md)。
CI552普通ARM64已终态失败：个人升级提交tools/call原30秒超时，失败快照PG20／3／off、程序健康且未重启，不能推根因。CI552／553及Required均失败。下一候选增加只观察原POST /mcp的代理阶段，每代理最多128次／保最近8条，固定字段、没有正文或凭据，不新请求或重试，不改原30秒客户端／90秒上游及全部期限。33项本机工具检查通过，真实HTTP回环中的TLS为stub，新完整guest待验；见 [接续记录](resumption.md)。
扩大观察的CI555因源码核查确认首次正常commit前已有失败读取、旧助手边界将误拒而主动普通取消，未force；无result.json不补造产品或收尾结论，普通CI554仍继续。新助手保旧journal事实，仅认本次追加的唯一读取，并核ID／旧前缀不变；34项本机回归通过，待普通旧snapshot终态后才推新候选。公开Node索引仅准备、目标SHA未匹配，不作故障归因。完整新guest、根因修复与正式独审仍未完成，见 [接续记录](resumption.md)。
## 六组合独立验收执行增量

为取得原要求每个支持组合的完整证据，普通CI改为六个独立TCG guest，沿现有amd64／arm64 hosted runner类型，每VM仍4 vCPU／4 GiB、150分钟及原请求／健康／安装／服务oneshot、故障、恢复、完整重启断言。每架构从一台串三画像改为三台独立VM，合计预算增加，不隐称原架构总时限或性能未变；不新增设备／runner注册、付费服务或权限。

server-build按架构只产一次候选，按架构独名传不可变工件ID及manifest SHA，消费端先核交接、摘要再执行；旧attempt原件不覆盖。Required增加生产者并要求六组全部成功，矩阵缺项、错误交接、条件跳过或吞失败拒绝。验收助手--profile只选一配置，默认仍三画像；前后范围、原身份和四项后台重启证据齐全，单份结果不代全矩阵。显式诊断仍非零、保默认三画像观察而不作普通验收；每窗口独有标记和回执，core处理回执出现即停整轮，不覆盖或重用旧数据，捕获预算保持。

40项Python及22项CI门禁检查通过，新六组合与真实工件交接尚未运行。CI554 AMD64已在团队回退提交退出139，普通ARM64仍执行；保原件后才推新候选，不取消在途普通验收。当前无根因修复或正式独审结论，不能合入；准确源、首败和未测见 [接续记录](resumption.md)。
