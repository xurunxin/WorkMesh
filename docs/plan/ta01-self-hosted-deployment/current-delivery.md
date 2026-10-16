# TA01 当前交付与诊断报告

## 当前结论与来源

基础交付尚未完成，PR228 保持 draft，未达到正式成果独审或合入条件。本轮开始时，本地及 PR head 均为 `9c8bbff749c1d2a52a3e6489dcec02d2d7c859af`，tree 为 `c07235f615836fae402d670ac932f6a9d484f347`。以下结论来自执行者直接读取 GitHub 及原始工件；Chief 的较早快照单独保留，不能代新终态。

普通 [CI562／run38831525243](https://github.com/xurunxin/WorkMesh/actions/runs/38831525243) 和显式 [CI563／run38831565958](https://github.com/xurunxin/WorkMesh/actions/runs/38831565958) 均受测这个 head，现已全部终态 failure，两轮均无取消。本轮修正验收助手的首败证据延迟上报，保全原件并核公开符号；没有产品根因修复、手动追加运行或重跑。[终态索引](../../reviews/ta01-product/ci562-ci563-final-results.json)和[材料](../../reviews/ta01-product/ci562-ci563-final-results.zip)保两轮实际作业、四生产者及公开帧匹配依据。

历史批准与保护边界见[接续记录](resumption.md)。[上一版完整报告](https://github.com/xurunxin/WorkMesh/blob/9c8bbff749c1d2a52a3e6489dcec02d2d7c859af/docs/plan/ta01-self-hosted-deployment/current-delivery.md)固定保留此前交付与诊断，不重复叙述全部过程。本次报告自身提交不预填 SHA；受测源码、报告提交和后续 CI 须分别登记。

## 当前候选与真实矩阵

两个运行各有独立双架构生产者，均实际成功。四份小型生产者原件确认 Linux 上 52 项 Python 检查、16 项安装器单元通过；六脚本逐文件 SHA 与准确 Git 相符，manifest 的 commit／tree 相符。这补充了 Chief 当时“52 项仅本机”的较早快照，仍不等于真实画像通过。未重复下载大型候选。

| 运行／架构 | 准确候选 artifact | manifest SHA-256 |
| --- | --- | --- |
| CI562 AMD64 | 12018130672 | `c34733df5e9d45ac6fddbc504a45540779e252071d55fe22eb9bfbee2744028b` |
| CI562 ARM64 | 12017881012 | `69b6ef13b56864de128cc969da18e3558da91af56a9d4acc69705a3481669ae4` |
| CI563 AMD64 | 12018111191 | `62d76558ce5495cbe20b6315608b6717e00770c02d9759480d534b8446113a42` |
| CI563 ARM64 | 12018310750 | `53f3789f77d1200d86f161dd76260eaabdcdd8eed6404f695ab597039c120aeb` |

CI562 每架构三画像复用该架构同一准确候选。CI563 仅双架构团队画像，用于自然故障观察，不作为完整支持验收。

| CI562 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116754248256，success，4,068.43 s | job116754248226，failure，总150分钟，9,000.68 s |
| 团队 | job116754248608，success，2,485.96 s | job116754248155，failure，总150分钟，9,000.74 s |
| 企业 | job116754248268，failure，1,082.60 s | job116754248157，failure，总150分钟，9,001.15 s |

CI562 Required job116795930709 failure，其余14个作业 success。六组实际结束后才提交下一修正，没有取消有证据价值的组。

AMD64 团队 [索引](../../reviews/ta01-product/ci562-amd64-team-full-guest-pass.json)与[原件](../../reviews/ta01-product/ci562-amd64-team-full-guest-pass.zip)含 11 成员，六脚本、manifest 和生产者均核准确源码。20 项前序检查完成；两次不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU 退出 0 和重启后四项后台证明齐全。重启恢复 156.36 s，仅本候选本组合通过，不抵消旧自然 139。升级仍为同程序两候选夹具，不冒两个历史已发行程序的升级验证。

个人 AMD64 随后完整通过，[索引](../../reviews/ta01-product/ci562-amd64-personal-full-guest-pass.json)和[原件](../../reviews/ta01-product/ci562-amd64-personal-full-guest-pass.zip)同样核准确六脚本及候选。21 项前序检查、两次 boot_id／kernel、QMP RESET／SHUTDOWN、QEMU 退出0及重启后四项证明齐全，重启恢复249.05 s。不能据此宣称整个矩阵通过或两处139已修复。

## 普通 ARM64 总期限与团队首败

三份 ARM64 原件均11成员、准确六脚本、同一生产者及manifest，result.errorType=TimeoutError、receipts=[]，不是缺 result。三者都未交付完整重启或通过回执；不得用显式诊断的业务失败填回普通运行。

| 画像／artifact | 原 ZIP SHA-256 | 串口最后已知动作 |
| --- | --- | --- |
| 个人／12023575178 | `b3fdfccbd76c77ba0eacfd7341e073af6bdf7012cd5f0f4d6028d954f0adf65d` | action22 rollback完成，action23 restore-empty开始 |
| 团队／12022978043 | `05292a1b7eb31b94f55435f521fb6b6afb988bcfb3f19da0c4d8e093282cacb1` | action17 rollback完成，action18 commit失败，之后仍在故障采集 |
| 企业／12023375802 | `4e1464a1b1d6b4afbedfe078797900578e8fc21673be666968225cc49892ec61` | action19 rollback完成，action20 restore-empty开始 |

个人[索引](../../reviews/ta01-product/ci562-arm64-personal-first-failure.json)、团队[索引](../../reviews/ta01-product/ci562-arm64-team-first-failure.json)及企业[索引](../../reviews/ta01-product/ci562-arm64-enterprise-first-failure.json)各绑定独立 ZIP。个人／企业没有恢复完成或具体恢复错误回执，不能认定恢复命令本身超时、失败或数据损坏。

团队串口明确记录 INSTALL_BUSINESS_VALIDATION_TIMEOUT、journal healthy／validate-business-read failed，随后 owned-states 全部程序无重启、无OOM且健康。该原件缺具体HTTP读取进度、代理完整响应或退出事件投影，不能套显式 ARM64 的30,394／49,798 ms数值。源码显示安全 journal／installer 摘要已构造，却要等后续 Docker、事件、数据库和逐容器日志分类完成才 report；宿主先到总期限，因此 result没有保存这些已有细节。

本轮只修这个证据丢失路径：在首个 Docker 探测前，上报已有安全摘要，沿用 phase=failure 并标 diagnosticsPending=true。宿主保存它，允许原诊断在原总期限内继续；只有最终 failure 立即结束运行。进程结束时，即使只收到 pending failure，也必须拒绝普通和诊断验收；原150分钟仍可先到期。网络发送失败只标不可用，继续原故障采集，不重试。没有读取新私有字段、扩展日志范围或改产品断言。

新增三个回归执行实际 catch 路径并模拟后续采集中断；验证摘要先保全、后续修改不改已接收快照，以及真实宿主完成分支在两种模式都拒绝 pending failure。布尔标记仅接受字面 true 作为“诊断尚在采集”，其他值不推迟既有失败退出。共55项本机检查通过；新路径尚未在真实 guest 执行，不能冒9c8的52项原件已覆盖本次修正。

## 企业 AMD64 首败

artifact12018119685 的原 ZIP SHA 为 `f73947564d7e580383392cd905848ea4831c0461048cc47d9bf698ed3990aec1`，与 Chief 提供值一致。[索引](../../reviews/ta01-product/ci562-amd64-enterprise-first-failure.json)和[原件](../../reviews/ta01-product/ci562-amd64-enterprise-first-failure.zip)保 11 成员、准确六脚本及生产者，未从 wrapper 猜原因。

stage 完成于 230,211 ms，首次 install 完成并达到 health-ready；journal 为 healthy，五个效果均 completed。随后 guest 报 RemoteDisconnected，API 容器 `f679d90f52562ee65a6e088c3d5ccd7317ff020086ef7b18914cbfb5c00fdd7b` 历史 die139，事件 timeNano 为 `1792113399333850785`。较晚快照 API 重启 1、无 OOM、health=starting。MCP 代理请求数为 0，MCP 容器无重启。

当前原件没有失败 REST 请求的准确端点、请求进度或 API core。已完成检查只到离线、错误组合拒绝、project 锁拒绝和候选暂存，尚无首任务完成。故障发生在 MCP 请求前，但不能确定是哪次 API 请求触发、API 故障位置或与 MCP 同根因。较晚 PG 为 100／2／on，包含采集自身，不能证明历史连接耗尽。

## 显式 AMD64 团队捕获

CI563 AMD64 job116754162739 已 failure，guest 3,111.97 s、status=diagnostic-only。artifact12019851989 原 ZIP SHA 为 `a8e4481330b3f4a325260eaa4f7857e581cbb948b62118e32790d3b3b3263240`。见[索引](../../reviews/ta01-product/ci563-amd64-team-native-observation.json)及[原件](../../reviews/ta01-product/ci563-amd64-team-native-observation.zip)。后续 ARM64 结果单列如下，不以 AMD64 代它。

首次三次身份读取、首次 commit 和升级 commit 的原动作成功，捕获器均已在业务前准备，coreObserved=false。三个完成回执的 captureId 不同。第四个回退后 commit 原动作失败，原 initialize／id1 在 31,953 ms socket 到期，无响应头或体；代理第10次请求已发送，9 ms 后记录上游 RemoteDisconnected。准确 MCP 容器 `d55d3c38427d8922d914f243eb9200a567002cca5b7e1a015b0c3b90aa63c776` 历史 die139。

第四窗口 captureId 为 `ecd9fc1349cc48e6baef04cf8ac2ee33`，注册 Node PID34240／容器 init PID34187。coreCaptured=true、coreObserved=true、captured=false：110,559,232 字节 core 只在匿名 RAM 解析，SHA 为 `25e7e8156ce7479011a6cdc6fc02624f9b10d020e1cdef40e832e34c74fe35a8`；没有原始 core 落盘或上传。GDB 达原 60 s 期限，只到 before-binary 阶段，无可用完整栈。阶段标记不证明 file 命令成功。

目标 Node SHA 为 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`。与既有公开二进制和索引逐字匹配后，公开 ELF 位置解析如下：

| 位置 | 公开函数范围匹配 |
| --- | --- |
| 故障 `0x136b1a0` | `v8::internal::IC::UpdateState+128`，指令 `mov rax,[rax-1]` |
| 帧1 lookup 20427054 | `v8::internal::Runtime_LoadIC_Miss+974` |
| 帧2 lookup 30266485 | `Builtins_CEntry_Return1_ArgvOnStack_NoBuiltinExit+53` |

两个返回地址来自既定有界帧指针解析，frame-link-invalid 后停止，未扩大到栈扫描或私有内存。它们不是完整栈或应用 JS 调用者。准确 Node 版本的 [IC 源码](https://github.com/nodejs/node/blob/v22.19.0/deps/v8/src/ic/ic.cc#L271)能说明该函数更新属性读取的缓存状态，不能单凭位置证明坏指针来源。旧 Node／OpenSSL 报告没有成为本次根因证据。

handlerStartedUtcEpoch=`1792115310.7350152`，journal 本次追加业务读取开始为 `1792115317.963`，前者早约 7.23 s。处理器开始并非原信号时刻，journal 边界并非上游收包。这个时序不能支持“该 initialize 触发崩溃”，也不证明此前某个健康请求触发。原动作失败、较晚 die 事件和 core 观察分别保留。

## 显式 ARM64 团队首败

CI563 ARM64 job116754162659 随后 failure，guest 8,873.74 s，未达到总150分钟，不是总预算超时。artifact12023390367 原 ZIP SHA 为 `f167d11e6f988c3825a6810dea80da203286e8f527cb1c3fb4dabff4ddb2cde7`。11 成员、六脚本及该运行 ARM64 候选均核准确9c8源码。见[索引](../../reviews/ta01-product/ci563-arm64-team-native-observation.json)和[原件](../../reviews/ta01-product/ci563-arm64-team-native-observation.zip)。整轮及 Required job116795308066 均 failure。

首次三次身份读取、首次 commit 原动作成功，两个窗口的捕获准备完成、coreObserved=false、captureId 独立。第三窗口 team-upgrade-commit 原动作失败；action13 upgrade 完成，action14／15 recover-old 为预期拒绝夹具，action16 commit 失败于314,735 ms，未到回退后的 commit。不能把 recover-old 夹具当成真实兼容程序回退。

原 `get_work_item`／id2 在30,394 ms socket 到期，请求写完，无响应头或体。代理共9次、只保最近8次，truncated=true；最后第9次稍后在49,798 ms 完整上游200，客户端发送失败。较晚 PG 为100／3／on，包含采集自身；退出事件为空，该窗口 coreObserved=false。这些不排除更早问题，也不能证明上游返回体的领域断言通过或服务内部耗时原因。

本轮没有改 socket、代理、重试或处理器预算。安装器 commit 的业务读取保原30 s；首次身份读取仍走原 guest Client 的90 s socket。实核 Client 整类源码自 f53 至9c8逐字相同，不能把首次身份成功误作30秒安装读取通过。该失败与 AMD64 的真实139、旧 CI559 ARM64 的总150分钟到期分别登记，不因外层同为RuntimeError合并根因。

## 历史结果与未闭缺口

| 精确受测源码／运行 | 真实结果及边界 |
| --- | --- |
| f53f20b／普通 CI558，run38801221509 | AMD64 三画像完整通过；ARM64 企业首次 install 到原1,800 s，个人／团队取消且缺 result；Required failure。首画像遗漏暂存已在后续461修正，未将取消写通过 |
| f53f20b／显式 CI559，run38801222595 | AMD64 团队升级捕获自然139，公开位置同为 IC::UpdateState+128，无可用 GDB 栈；ARM64 个人三 commit 成功无core后达总150分钟；两作业及 Required failure |
| 405f880／普通 CI560，run38813822284 | 确认仍含暂存遗漏后普通取消，双生产者46项通过但缺候选／guest；Required failure |
| 461c753／普通 CI561，run38815572580 | 六组 stage／首次健康完成；仅个人AMD64完整通过。团队／企业AMD64分别首次身份读取及回退后commit139。ARM64个人／企业升级、团队回退后tools/call均30秒到期；上游稍后200不补成功。六终态无取消，整轮及Required failure |

旧原件入口见[验收矩阵](acceptance-matrix.md#ci561-修正候选矩阵)与 [CI561 终态](../../reviews/ta01-product/ci561-final-results.json)。各轮 40／46／47／52 项检查按实际源码区分；既有成功、组件恢复和本机检查均不能代新候选的六组合验收。

安装器 `install.mjs` 的 commit 固定先 initialize／id1，再调用 `get_work_item`／id2；首次身份窗口则是 initialize、verify_connection 和 get_workmesh_context。两类请求不能只按 id2 混同。现有 HTTP 服务为每次 POST 新建客户端、MCP 服务和 transport；仅凭这个源码事实，尚不能确定34秒花在构造、资格读取、业务读取还是响应传递，未据此共享身份或改鉴权。

API139 没有 core 或准确请求定位；MCP139 仍缺坏指针成因和应用调用者；ARM64 迟响应仍缺服务内部耗时证据，普通个人／企业空目标恢复未完成。三者不能按退出码、相近位置或上游晚200合并根因。当前两轮终态及原件已取齐，下一候选先核故障摘要提前保全的真实效果，再据准确请求和公开位置收敛产品修正。没有预设 Node／QEMU 更新、JIT 开关、全局 MCP 身份缓存或期限变更。

## 交付范围、检查与保护

已有实现为版本化服务端包、版本／源码／镜像／依赖摘要、离线闭包和 PostgreSQL／Redis／S3 三画像。安装执行预检、暂存、维护排空、完整备份、逐项迁移账本、健康及业务读取后登记 journal。程序回退严格核候选／依赖／账本兼容；不兼容则恢复到独立空目标并保原卷。实现存在不代表完整验收完成。

本轮仅改 guest.py、run.py、三个故障采集回归和对应记录，无 schema、迁移、REST／MCP 合同、事件或安装行为变化。安装与演示步骤见[安装说明](../../integration/server-installation.md)。中文文档沿用固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 与适用 references；缺 autocorrect 按原规则手检，未安装全局工具。

本机55项 Python 检查通过，耗时2.330 s，六脚本 AST 通过。`pnpm ci:validate` 通过真实入口／策略及24项原件检查，归档校验280 entries／61 members、errors=[]；`pnpm check:integration-docs` 通过4技能文件／96链接／35 REST／11 MCP及语法，`git diff --check` 通过。环境为 Windows、Python3.11.15、Node22.19.0、pnpm9.15.4。准确六脚本与日志见[新索引](../../reviews/ta01-product/resumption-pending-failure-checks.json)和[材料](../../reviews/ta01-product/resumption-pending-failure-checks.zip)。未在本机重跑五项根门禁；CI562绿色的14个其他作业、旧组件验收及上述本机检查都不代新候选完整验收或最新Required。

每台 guest 保原4 vCPU／4 GiB、150分钟，以及安装器业务读取30 s、健康180 s、安装1,800 s和原 oneshot 期限。普通六组合、全部原断言、真实 Runner／连接器联合验收、P0/P1 正式成果独审和最新 Required 成功仍是条件合入前置。本轮没有正式成果独审、ready、合入或 Done 结论。

Saved plan 字段未同步的既定记录例外继续。Redis-free、filesystem、保证变更、物理设备最低配置、企业生产内网接入及对外发布均未交付；ADR0071／0072 保持 Proposed，Runner 外置。

资源只增加小型原件与索引，复用既有公开 Node／符号索引，不下载大型候选副本、不启动 WSL 或宿主 guest main、不创建容器或卷。旧树、旧远端、共享缓存／镜像、未知匿名卷、受拒目录和其他项目保持。没有 prune、reset、clean、权限修改或绕过拒绝，不补造远端 guest 收尾。
