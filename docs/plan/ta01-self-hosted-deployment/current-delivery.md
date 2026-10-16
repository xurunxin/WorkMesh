# TA01 当前交付与诊断报告

## 当前结论与源码

基础交付尚未完成，PR228 保持 draft，不能合入。本报告承接上一轮被平台截断的回复。下列状态来自执行者本轮直接读取 GitHub 与原件；Chief 提供的 ARM 企业 ZIP 摘要已独立复核。历史批准、规格、源码和资源证据继续保存在[接续记录](resumption.md)，本报告不替代历史原件。

本轮开始时，PR228 与本地 head 均为 `405f880439c288b681a02e5f4fb35948513e3dc3`，tree 为 `9d25f8cb902b06e391c6c1a89d9a7be945e85c14`。这是上一轮平台 checkpoint，包含新增有界帧链工具。七份 ZIP 的实际 Git blob 与索引 SHA 相同，最新归档六脚本与该提交逐字相同，证明附在[本轮材料](../../reviews/ta01-product/resumption-first-profile-staging-checks.zip)。

本轮在此基线上修正首画像暂存。修正源码逐文件 SHA 及六脚本原件见[索引](../../reviews/ta01-product/resumption-first-profile-staging-checks.json)。本报告不预填自身提交 SHA；提交后的准确 head 与新运行在 PR228 短正文登记。旧 `f53f20b` 的成功不冒 `405f880` 或本轮新候选通过。

## 基础实现与本轮变更

已实现版本化服务端包、源码／镜像／依赖摘要及离线闭包，限定 PostgreSQL／Redis／S3 三画像，Runner 外置。安装器执行配置预检、暂存、维护排空、完整备份、迁移账本、健康与业务读取后登记，保留 install-upgrade journal。

程序回退须核候选、依赖及真实账本兼容；不兼容时恢复到独立空数据库和 bucket，保原卷。健康失败先核归属并停止准确程序容器，不能证明停止则拒绝恢复旧程序。候选每次复核全部字节，构建镜像 ID、归档摘要与目标实际 ID 分列。具体流程及演示命令见[安装说明](../../integration/server-installation.md)。上述实现存在不代表全部组合验收完成。

本轮只改 guest 验收助手、对应显式诊断 CI／入口校验、回归、文档及原件索引。没有 schema、迁移、REST／MCP 合同或事件变化；没有更换 Node、QEMU、CPU、运行权限或生产配置。

## CI558 各架构画像终态

普通 CI558／run38801221509 受测 `f53f20b85e680a4219ae9f22a58ff37de58c37d8`，tree 为 `6868b31ac93f90d6bfb9e5149f2f01421426a2f8`。双架构生产者成功，各构建一次；六组均实际通过准确工件交接。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116655073333 success，2,081.81 s | job116655073308 cancelled，缺 result |
| 团队 | job116655073226 success，2,571.94 s | job116655073593 cancelled，缺 result |
| 企业 | job116655073277 success，1,860.15 s | job116655073569 failure，4,920.35 s |

三份 AMD64 各自完成安装、业务操作、升级、兼容回退、完整备份、空目标恢复和整机重启。两次 boot_id／kernel、QMP RESET／SHUTDOWN 与重启后四项后台证明齐全，原件见[矩阵](acceptance-matrix.md#ci558-当前基础矩阵)。这些是同程序候选对，不能冒历史不同发行程序升级已验证。

CI558 总运行 cancelled，Required job116693532882 failure。ARM 个人及团队各保 10 个原始成员，均缺 result.json；[个人索引](../../reviews/ta01-product/ci558-arm64-personal-cancelled.json)与[团队索引](../../reviews/ta01-product/ci558-arm64-team-cancelled.json)保准确 ZIP 摘要，不补造产品失败、完整通过或 guest 收尾。Chief 的“Required 仍 running”是较早快照，保留来源时间差。

## ARM 企业首败与定向修正

artifact12009297853 的原 ZIP SHA 为 `f9f9acb81ca0653d5892feab824a2ce5f68455f6b24c6961cc8d173f65efc0d3`，与 Chief 提供值一致。11 个成员、六脚本、生产者及 manifest 均核准确 `f53f20b`。见[首败索引](../../reviews/ta01-product/ci558-arm64-enterprise-first-failure.json)及[原件](../../reviews/ta01-product/ci558-arm64-enterprise-first-failure.zip)。

宿主 installed product assertion failed 只汇总失败。guest 原错误是 `TimeoutExpired`，command=sh、timeoutSeconds=1800。首次部署 action6 历时 1,800,370 ms；之前 action5 是并发锁拒绝用例，已完成。action6 没有 stage 前序，MCP 代理请求数为 0。

| action6 实际阶段 | 原记录耗时 |
| --- | --- |
| 校验包 | 43,003 ms |
| 导入镜像 | 1,034,983 ms |
| 启动数据服务 | 123,262 ms |
| 初始化锁定 bucket | 26,088 ms |
| 迁移账本 | 198,915 ms |
| 健康与账本 | 301,860 ms |

失败诊断时 journal 为 healthy，上述五个效果均 completed；没有 current 登记或业务通过证明。较晚容器健康、无 OOM 不证明安装在期限内完成。PG 聚合 100／3／on 包含采集自身，不说明历史耗尽；阶段耗时包含实际命令执行，也不证明单次健康等待期限变化。

源码确认，拆成单画像 guest 后仍以全局画像下标 `index == 0` 选择暂存，仅个人执行。独立企业／团队从冷镜像开始，导入与部署占同一次安装期限。本次改为首个请求画像 `profile == profiles[0]`，按其实际 project 检查没有部署容器、current 或运营密钥。端口仍用原画像下标，默认三画像路径仍只暂存一次。

stage／install 各保原 1,800 s，各自先预检。install 仍复核全部候选字节和实际镜像 ID；没有缓存捷径、重试或延长期限。修正恢复助手与文档的既定顺序，尚未证明 ARM 企业完整通过，也不解释 MCP 139。

## MCP 139 与显式 CI559

显式 CI559／run38801222595 同样受测 `f53f20b`。AMD64 job116656730219 failure，guest 3,179.09 s、diagnostic-only。个人三个窗口、团队首次成功，第五个团队升级原动作失败。准确 MCP 容器自然 die139；initialize 的原 30 s 读取超时，无响应头或体。见[索引](../../reviews/ta01-product/ci559-amd64-native-observation.json)。

coreCaptured=true、captured=false：111,050,752 字节 core 只在匿名内存处理，未落盘或上传；GDB 达原 60 s 期限，无可用栈。目标公开 Node SHA 完全匹配后，定位到 V8 `IC::UpdateState+128`、公开 ELF `0x136b1a0` 的 `mov rax,[rax-1]`。未输出私有寄存器、原始地址或内存。公开位置不能解释失效原因，上游 OpenSSL 报告也未证明同因。见[匹配索引](../../reviews/ta01-product/resumption-ci559-public-location.json)。

ARM64 job116656730405 现已 failure，未取消，guest 达原总期限 9,001.51 s，status=diagnostic-only、errorType=TimeoutError。个人首次／升级／回退三个 commit 原动作成功，均 preparedBeforeBusiness=true、coreObserved=false；三份 captureId 不同。串口最后为 action22 个人 rollback started，没有团队、企业、完整个人或重启证明。不能将总期限写为 MCP 单次读取超时或自然崩溃。见[索引](../../reviews/ta01-product/ci559-arm64-native-observation.json)／[原件](../../reviews/ta01-product/ci559-arm64-native-observation.zip)，11 成员、六脚本核准确 f53；原 ZIP SHA 为 `19875373c952c02ed5e7c2824357bddb41a265f1facff4acbb54f3d35e6caae8`。CI559 与 Required job116718937471 均终态 failure。

`405f880` 新增公开帧链最多 12 帧／1 MiB，未知、JIT、缺页或重叠即停。处理器 UTC 不是原信号时刻，调试器阶段不是命令成功。旧真实 guest 跑 40 项版本；405 的 46 项、本轮 47 项与后续 52 项本机检查不冒新路径自然捕获通过。

## CI560 与本轮验证

普通 CI560／run38813822284 绑定 `405f880`，仍含暂存遗漏。本轮定位首败后对其请求普通取消，未 force，保取消前快照及终态。运行已 cancelled，Required job116697182100 failure。双架构生产者各 46 项 Python、16 项安装单元通过，但取消前没有 manifest、候选或真实 guest，不能记修正已通过。见[取消索引](../../reviews/ta01-product/ci560-cancelled-source.json)／[原件](../../reviews/ta01-product/ci560-cancelled-source.zip)。CI559 ARM64 保持运行，不重跑健康旧检查。

本机最终 47 项 Python 检查、六文件 AST 通过。新增回归执行实际 main 的暂存分支，覆盖三个单画像、默认三画像只暂存一次，以及已有 current、密钥或部署容器拒绝。新增用例首轮因错误 AST 语句数筛选出现 StopIteration，修正后通过；未另存失败整源码及原日志，不补造其 SHA。[本轮原件](../../reviews/ta01-product/resumption-first-profile-staging-checks.zip)保最终准确源码与日志。

本轮不把旧五门禁、绿色 CI 或合成检查作为新候选通过。新候选须完成真实交接、六组 guest 及原断言；普通 Required 的失败、取消、跳过或缺项均不能合入。

本轮 `pnpm check:integration-docs` 通过：4 个技能文件、96 个本地链接、35 个 REST 端点、11 个 MCP 工具，语法通过。`pnpm ci:validate` 通过，含真实入口／策略检查、24 项既有原件检查；`git diff --check` 通过。这些不替代五项根门禁或六组真实支持验收，新提交仍须正常 CI。

## 缺口、演示与保护边界

`461c753c9ddca19e83a97fc31f4381427603a9ac`／tree `af26442a7b06030642fa917c84dd57f5e55bf6f3` 的普通 CI561／run38815572580 双架构生产者均成功，各 47 项 Python 与 16 项安装单元通过。六脚本、manifest 源码与准确 Git 实核。AMD64 候选 artifact12011220645、manifest SHA 为 `bba4ade2c0a25641aa2d3380a05e97446122789c45f21e526c8f0060149f040d`；ARM64 为 artifact12010009592／`5961d87b90bb30161d0c99661064b51ff5d93360b34549efd428aebc51f7b94d`。未重新下载大型候选。

CI561 团队 AMD64 job116703256409／artifact12012302165 已失败，guest 1,277.68 s。11 个成员及六脚本核准确 `461c753`。暂存与首次安装完成，journal healthy；首次身份读取出现 RemoteDisconnected，代理唯一请求停在 request-sent，5 ms 后记录上游断开。准确 MCP 容器 `c3146fa4097cd1dea5f4feb920de1380196b4ca4bd7259518c73be0c0661bf09` 自然 die139，较晚快照重启 1、无 OOM。尚未首次 commit，不能以旧 commit-only 捕获覆盖，也不能把旧 CI559 的 V8 位置套给本次未捕获故障。其余五组继续运行，先保终态，不取消健康组。

该首败的[索引](../../reviews/ta01-product/ci561-amd64-team-first-failure.json)与[原件](../../reviews/ta01-product/ci561-amd64-team-first-failure.zip)保留独立摘要；真实 guest 是 47 项版本，不冒后续 52 项已在 guest 执行。

企业 AMD64 job116703256439／artifact12014020629 随后失败，guest 2,705.89 s，同样核准确 461c753 的 11 成员、六脚本与生产者。action17 rollback 完成，action18 commit 失败；initialize 在 2,135 ms 连接重置，请求写完，无头／体。准确容器 `077d2fc332c39d45e51cd2d79fa85399ff7dba7fb034932f278aca097f324f88` 历史 die139。代理共 10 次、只保最近 8 次，最后 request-read／OtherError；不能据此推已经发送上游，或把团队首次断开和本次回退阶段归为同根因。见[企业索引](../../reviews/ta01-product/ci561-amd64-enterprise-first-failure.json)／[原件](../../reviews/ta01-product/ci561-amd64-enterprise-first-failure.zip)。当前其余四组继续运行，较早“五组”是团队首败时的快照。

个人 AMD64 job116703256288／artifact12013864413 随后完整通过，4,101.91 s，重启恢复 247.26 s。六脚本、manifest 及同一生产者与准确 461c753 相符；两个不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU 退出 0 和重启后四项后台证明齐全，21 项前序检查完成。见[个人索引](../../reviews/ta01-product/ci561-amd64-personal-full-guest-pass.json)／[原件](../../reviews/ta01-product/ci561-amd64-personal-full-guest-pass.zip)。三组 ARM64 仍执行；个人成功不代团队／企业或新 52 项诊断通过。

个人 ARM64 job116703256367／artifact12016758210 随后失败，guest 7,876.92 s，11 成员、六脚本与准确 461c753 及 ARM 生产者相符。action18 recover-old 是预期拒绝夹具，随后 action19 为升级后的 commit；不是已执行兼容 rollback。tools/call／id2 在 30,382 ms socket 超时，请求写完，无响应头／体；代理第9次请求稍后在 34,133 ms 记 upstream-complete、200，但客户端发送未完成，不能据此记原业务成功。代理只保最近8次、truncated=true。较晚 PG 聚合 20／4／off，包含采集自身，历史退出事件为空不能证明全程无退出或排除过去争用。见[索引](../../reviews/ta01-product/ci561-arm64-personal-first-failure.json)／[原件](../../reviews/ta01-product/ci561-arm64-personal-first-failure.zip)。本轮早期 commentary 曾将动作口述为回退后提交，源码与原件复核后已更正；没有改原30秒期限、代理转发或补成功。团队／企业 ARM64 继续运行。

团队 ARM64 job116703256260／artifact12016837950 随后失败，guest 7,960.36 s，11 成员与六脚本实核准确 461c753。action17 rollback 完成，action18 commit 的 tools/call／id2 在 30,459 ms 到期，无响应头／体。代理第11次在 33,158 ms 记 upstream-complete／200、客户端发送失败；其最近8次记录明确 truncated。较晚 PG 为 100／3／on，退出事件为空。见[团队索引](../../reviews/ta01-product/ci561-arm64-team-first-failure.json)／[原件](../../reviews/ta01-product/ci561-arm64-team-first-failure.zip)。两份 ARM 数据仅证明客户端先到期、上游随后完成，不能证明死锁、数据库耗尽或与 AMD139 同根因；原请求、代理及期限均未修改。仅企业 ARM64 仍执行。

企业 ARM64 job116703256610／artifact12017325834 最后失败，guest 8,201.29 s，同样实核 11 成员、六脚本及准确生产者。action15 recover-old 为预期拒绝夹具，action16 为升级后的 commit；tools/call／id2 在 30,508 ms 到期，无头／体。代理第9次随后在 34,681 ms 记完整上游 200，客户端发送失败，不能补成功。较晚 PG 为100／3／on、退出事件为空，不推同根因。见[企业索引](../../reviews/ta01-product/ci561-arm64-enterprise-first-failure.json)／[原件](../../reviews/ta01-product/ci561-arm64-enterprise-first-failure.zip)。

CI561 及 Required job116749221401 已终态 failure，六组全部结束、无取消，其余14个作业 success。上文“继续运行”保采集时刻。本轮等待所有真实终态及原件后才推送下一候选，没有取消仍具验证价值的组合。[终态索引](../../reviews/ta01-product/ci561-final-results.json)／[原件](../../reviews/ta01-product/ci561-final-results.zip)汇总实际作业、双生产者和六画像，分别核准确源码、工件及摘要。

六组均实际完成 stage 和首次健康。AMD64 个人／团队／企业的 stage 分别 315,815／278,506／308,513 ms；ARM64 分别 1,054,771／1,024,382／1,182,175 ms，各小于原 1,800 s。这个结果只证明首次请求画像暂存修正已在六组合落实、消除旧企业首次安装混用预算的首败；后续业务、恢复和重启仍只有个人 AMD64 完整通过，不登记全矩阵支持。

下一显式诊断因此收窄为双架构团队画像，先准备捕获器，再执行原三次身份读取。准备受拒不发送，原读取失败不重试，core 回执停止整轮；三次团队 commit 观察及原边界仍保留。普通六组合与全部断言保持，未提高任何期限。新增五个回归与原用例共 52 项通过，真实 CI 校验入口通过；这只是诊断助手修正，不是产品根因修复，新窗口尚未实测。

52 项本机检查、真实 CI 校验入口、六文件 AST、准确九份源码及 CI561 生产者源码绑定见[新索引](../../reviews/ta01-product/resumption-team-identity-checks.json)／[材料](../../reviews/ta01-product/resumption-team-identity-checks.zip)。实际环境为 Windows、Python 3.11.15、Node 22.19.0、pnpm 9.15.4，文档与空白检查通过。此前 47 项与 405 的 46 项原件保留，不改写为新测试或新源已实测。

首画像暂存修正已绑定 461c753 的新工件和六组真实 guest，整个矩阵尚未通过。MCP 139 根因、ARM64 完整矩阵及读取超时、历史不同发行程序升级仍未闭合。CI559／561 全部终态及首败已取得；接下来提交收窄诊断并按新候选有界公开证据定向修复，不猜原因或改原期限。外置 Runner／连接器的最终联合验收仍承接原 #20 责任，不以服务端局部结果代替。正式成果独审尚未做；全部原真实验收、P0/P1 独审、最新 Required 成功后才可条件合入。

演示仍按[安装说明](../../integration/server-installation.md)执行 check、stage、install，再通过正常 API 配对后 commit。当前仅验收用途，六组合尚未登记支持。Redis-free、filesystem、保证变更、物理设备最低配置、企业生产内网及对外发布均未交付。ADR0071／0072 保持 Proposed。Saved plan 未同步的记录例外及全部既定批准继续，无新范围裁定。

中文文档按固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及适用 references 手检，无全局工具安装。新示例没有秘密，业务请求例子及合同保持。

本轮只下载小型原件，未下载四百 MB 候选副本，复用既有公开 Node、索引和任务内解码器。未启动 WSL，未在宿主运行 guest main，未新增本地容器或卷。单份分析副本仍在用，不冒已收尾。

旧树、旧远端、唯一旧候选、共享缓存／镜像、未知匿名卷、受拒目录和其他项目保持。没有 prune、reset、clean、ACL 变更或绕过拒绝。取消 guest 缺 result 时不补造远端资源收尾；账本及来源见[接续记录](resumption.md)。
