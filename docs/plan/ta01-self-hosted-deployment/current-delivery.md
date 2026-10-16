# TA01 当前交付与诊断报告

## 当前结论与候选

基础交付尚未完成，PR228 保持 draft，未达到正式成果独审或合入条件。本轮开始时，本地和 PR head 均为 `5371f16e24db94415155228dfc8ac149523573a0`，tree 为 `a1a0c341b64186963c9e2eccb23b1171d0feafef`。本报告的后续提交与受测源码分开登记。以下运行及原件由执行者直接读取，不能冒称 Chief 已复核。

普通 [CI564／run38846561914](https://github.com/xurunxin/WorkMesh/actions/runs/38846561914) 绑定上述源码。双架构生产者已成功，原件核 Linux 上 55 项 Python 和 16 项安装单元检查通过。六脚本 SHA、manifest commit／tree 与 Git 一致。这补充此前“55 项仅本机”的时点，不代表 guest 或产品通过。

| 架构 | 候选 artifact | manifest SHA-256 |
| --- | --- | --- |
| AMD64 | 12024116322 | `7bf943924acc816828d14eff80b80d0995c13f2dd079550cf10a2168e038d536` |
| ARM64 | 12023303940 | `c3171763abafd0a93836a1a2902c9ca745b15da4b0f8478ac5e5c5d167f93d3a` |

<!-- ci564-state-start -->
2026-10-16 04:38 UTC，AMD64团队成功、企业失败，其他四个完整 guest 仍在运行，Required 尚未产生终态。没有重跑、取消或追加显式诊断。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116800972564，running | job116800972501，running |
| 团队 | job116800972528，success，1,783.10 s | job116800972574，running |
| 企业 | job116800972536，failure，2,821.11 s | job116800972535，running |

团队[原件索引](../../reviews/ta01-product/ci564-amd64-team-full-guest-pass.json)已核准确六脚本、同一生产者／manifest和11成员；重启恢复117.39 s，不同boot_id／kernel、QMP RESET／SHUTDOWN、QEMU退出0及四项后台证明齐全。只有本候选本组合通过，不关闭旧139。

企业[首败索引](../../reviews/ta01-product/ci564-amd64-enterprise-first-failure.json)绑定相同候选和六脚本，artifact12025775764原ZIP SHA为 `7584aee6044e5874411e92537521b99c7879c67c7047ac2a85794bb561943bda`。本次action17 rollback已完成，action18 commit的原initialize／id1在3,367 ms后ECONNRESET，无响应头或体。journal为healthy／validate-business-read failed，不能按旧CI562企业API139填原因。

本次MCP容器 `4757173fb5ff5202fe714023f8872faccad43f44e893324a00f8221167767c54` 的历史die139，事件timeNano为 `1792125358462709126`。较晚MCP重启1、无OOM、health=starting；API／Worker无重启且健康。代理第10次只到request-read、3 ms／OtherError，没有request-sent证明。未捕获core或应用调用者；不把OtherError猜成具体网络异常。

提前failure的hostElapsed为2,733.913519237 s，diagnosticsPending=true；最终failure为2,819.635980207 s。两者同一宿主单调钟，间隔85.72 s，已有业务首败在后置诊断前保全。最终结果仍failed。这是证据修正的真实局部验证，不能补为根因修复，也不证明ARM总期限前一定能保全。事件UTC早于journal本次读取约0.75 s，只保时序，不称该initialize触发崩溃。
<!-- ci564-state-end -->

`5371f16` 仅修正首败证据延迟：先发送已有安全摘要，再沿原预算收集诊断。pending failure 始终阻断验收。它没有修复 API139、MCP139 或 ARM 迟响应。本轮只增加离线分析、合成组件测量及报告，没有修改产品、安装器、CI、锁定运行时、保证或期限。

## 现有最早失败点

普通 CI562 和显式 CI563 均绑定 `9c8bbff749c1d2a52a3e6489dcec02d2d7c859af`。两轮及各自 Required 均已 failure，无取消。[终态索引](../../reviews/ta01-product/ci562-ci563-final-results.json)保实际作业及四份生产者原件。四生产者均核实际 52 项 Python 和 16 项安装单元成功；这些结果不能套给新候选。

| 运行／组合 | 最早有证据的失败 | 已知缺口 |
| --- | --- | --- |
| CI562 AMD64 企业 | 首次健康后 API die139；客户端 RemoteDisconnected，MCP 请求数 0 | 缺失败 REST 端点、业务调用者和 API core；不能认定与 MCP 同因 |
| CI563 AMD64 团队 | 回退后 commit 失败，MCP die139；只解析到公开 IC::UpdateState+128 和两个有界帧 | handler 比 journal 本次读取早约 7.23 s；不能称该 initialize 触发崩溃，缺坏指针来源和 JS 调用者 |
| CI562 ARM64 团队 | 串口 commit 明确 INSTALL_BUSINESS_VALIDATION_TIMEOUT，之后宿主总150分钟到期、receipts 为空 | 缺该普通请求的准确方法、代理完成投影；不能套显式运行的请求数值 |
| CI563 ARM64 团队 | 升级后 get_work_item／id2 在 30,394 ms socket 到期，上游稍后 49,798 ms 完成200 | 客户端仍失败；没有内部耗时分段，未观察到该窗口 core 或退出事件 |
| CI562 ARM64 个人／企业 | 两者总150分钟到期；最后只见 restore-empty 开始 | 没有恢复完成或具体恢复错误；不能认定恢复命令期限已到或数据损坏 |

CI562 AMD64 个人和团队分别完整通过，含准确候选、不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU 退出0及重启后四项后台证明。企业失败和 ARM 三失败独立保留。其余历史矩阵见[验收矩阵](acceptance-matrix.md)。[上一版完整报告](https://github.com/xurunxin/WorkMesh/blob/5371f16e24db94415155228dfc8ac149523573a0/docs/plan/ta01-self-hosted-deployment/current-delivery.md)固定保留全部旧原件链接与时序。

## 四项可证伪假设

以下均为待验证解释，不预写根因。API139、MCP139、ARM 原30秒业务超时和总150分钟耗尽分别判断。

| 假设 | 当前支持与排除边界 | 最小验证及否定条件 |
| --- | --- | --- |
| H1：产品每次 POST 构造 MCP、读取和解析完整资格响应，CPU／分配成本使 ARM 业务读取过慢 | 原生组件确有构造及资格处理成本；完整／缩小合成响应的对照支持成本存在。未测 ARM TCG，不能据此解释 30／49 s 或139。新企业首败为initialize，该请求不走资格读取；H1的资格成本不能解释该请求自身的失败，先前运行状态仍未知 | 同一准确候选中，只重复少量合成 initialize／get_work_item，并分别量构造、资格及工作项读取。若原大小资格耗时远小于业务总时延，须转向 API、传输或调度，不以裁减权限、缓存身份或删校验补成功 |
| H2：锁定 Node／V8、依赖原生代码或 TCG 交互导致139 | MCP 有公开 V8 帧；精确同一 Node 可执行文件的原生组件有限样本未复现。API 没有 core，不能合并归因。无显式捕获的普通运行也有139，排除“捕获器是所有139的必要条件” | 用同一组件及准确完整镜像，在既有原生／TCG环境各跑固定小样本；只比较已核身份的退出与安全公开位置。原生也复现可否定“只有TCG才发生”；均未复现只能记未复现。取得应用调用者前不指定某个 V8 缺陷或更换运行时 |
| H3：完整 TCG 的累计校验、镜像导入和健康成本耗尽总预算 | 旧 ARM 的这些阶段已有大量耗时；可以解释预算消耗的一部分，不能解释准确139或单次读取内部瓶颈。个人／企业恢复结果仍未知 | 对已有串口同一种钟求已记录阶段，不补缺失区间；在同候选组件原生／TCG对照中核CPU／wall。若慢耗主要在 Docker／IO，不能把 Node 解析优化当充分修复。原完整散列、资源和期限保持 |
| H4：诊断采集开销造成或掩盖首败 | 后置采集会占剩余预算、遮住最终回执。源码时序排除 GDB／后置 Docker 分类倒因解释已经发生的首个139或原30秒超时。捕获准备仍可能扰动后续调度，未排除 | 先读取 CI564 的提前 failure 与最终回执，在同一 guest／host钟内分别比较。普通运行不启用 watcher；若仍在原请求处失败，90秒 finish等待不能解释该普通首败。不得把不同钟相减为采集耗时 |

H1 与 H3 可同时成立，也可能都不足以解释 ARM 失败。H2 尚不能选择产品、依赖或虚拟机其中一种为根因。H4 对首败的因果边界已收窄；新企业AMD64已验证提前摘要送达及后置约85.72 s，ARM覆盖仍待原件。

## 已执行的小范围组件对照

[测量索引](../../reviews/ta01-product/resumption-mcp-component-probe.json)及[原件](../../reviews/ta01-product/resumption-mcp-component-probe.zip)保原五次运行、每次准确脚本、输入摘要、原 stdout／stderr、编译日志和资源账本。未保存原始 CPU profile、core 或私有内存。两个工具分别用于[组件测量](../../reviews/ta01-product/tools/mcp-component-probe.mjs)和[原件耗时分析](../../reviews/ta01-product/tools/analyze-failure-timeline.py)。

组件来自 `5371f16` 的 MCP、SDK、contracts 三包编译产物。三包源码自9c8未变，打包与 build 曾并行；build 完成后逐字核59个 workspace 输入相同。依赖来自现有 node_modules，准确版本逐包保存，95包、3,435个文件摘要；没有 install、钩子执行或全局工具安装。组件不是 CI 已安装候选镜像。

使用已有 `node:22.19.0-alpine3.21` 镜像，ID为 `sha256:6b2127043c2faa4f15cdcdeb65a39fc9afbecf5559301898b754bbff561a8aa9`。Node 可执行文件 SHA 与 CI563 的真实 MCP 崩溃目标逐字相同：`638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`。动态库、kernel、完整生产镜像和 TCG 环境没有匹配，不能宣称完整环境一致。

每个容器为 Linux AMD64、1 CPU／512 MiB、无 swap、只读 rootfs、无网络和宿主端口、非 root、cap-drop ALL、no-new-privileges。只同容器回环合成 API，没有 PG／Redis／S3 或真实凭据。每次12组 initialize／get_work_item，共24个 HTTP 请求，两种合成安装身份交替。实际 MCP HTTP、SDK 校验、资格投影和工具处理均运行，每次核身份与工作项返回；未知合成请求均为0。

| 对照 | 资格响应 | SDK资格调用 wall 中位数 | tools/call wall 中位数 | tools/call CPU 中位数 |
| --- | --- | --- | --- | --- |
| 同脚本完整 fixture | 314,011 bytes／287项发现操作 | 67.21 ms | 109.48 ms | 108.49 ms |
| 同脚本缩小 fixture | 4,255 bytes／1项发现操作 | 4.63 ms | 82.39 ms | 55.68 ms |

两组准确测量脚本 SHA 均为 `94e69236fef2ffa34174cbd3bf9275f54a1eceedace164867fe88872a7e36ea7`。缩小仅改变合成响应，保实际 SDK 校验和每次身份／工具 guard。它不是线上方案，不能据此删除发现字段、权限检查或引入跨请求身份缓存。

原完整fixture授予全部能力，不能当guest的实际资格响应。补测仅授予 `work:read`，仍保287项发现，响应309,710 bytes；资格wall中位71.25 ms、tools/call中位106.28 ms，CPU中位115.69 ms。见[补测索引](../../reviews/ta01-product/resumption-mcp-work-read-probe.json)及[原件](../../reviews/ta01-product/resumption-mcp-work-read-probe.zip)。权限集合更接近实际首败身份，但features、scope和数据仍为合成，实际guest响应大小未知。该补测脚本独立保SHA，未拿新源码倒填原五次结果。

无 profile 基线的12次 tools/call 中位数为99.87 ms，WorkMesh 构造中位数19.30 ms，SDK空服务构造0.72 ms。首次工具读取的资格 fixture 在56.23 ms完成，工作项 GET 到346.78 ms才收到。这个本地间隔支持资格返回后的处理成本，不能投射为 ARM 相同分段。另一次分段 profile 的资格中位64.76 ms、工作项2.42 ms，与上述成本方向相符。

Inspector 聚合出现 GC 和 Zod 解析样本。sample timeDelta 是 wall time，可能夹带 cgroup 调度／throttle；不能当精确 CPU 比例。process.cpuUsage 包含同进程的合成 API。12次顺序样本没有统计置信区间，RSS仅结束快照，不是峰值或泄漏证明。六次容器均退出0、无OOM且已定向移除，只能记有限样本未复现139。

复核可直接执行 `python docs/reviews/ta01-product/tools/analyze-failure-timeline.py`，它只读已入库原件并核 SHA。组件脚本的第一个参数须为隔离的已编译 MCP 闭包根目录；测量原件中的 preparation 脚本记录闭包打包和容器限制。不得把旧忽略目录当成现成可用发行包，也不应在真实身份或服务上运行合成 fixture。

## 旧 ARM 阶段账本与诊断时序

原件离线分析先核 ZIP、serial 和索引 SHA，再计算已有阶段。以下均为 CI562 的 Node 记录，不含 Docker 子进程 CPU；包含预期拒绝与多次完整复核，不能当单次正常安装成本。

| ARM画像 | verify-bundle 次数／wall合计 | import-images wall合计 | health／ledger wall合计 |
| --- | --- | --- | --- |
| 个人 | 21／1,450.30 s | 1,140.35 s | 890.98 s |
| 团队 | 17／1,277.03 s | 1,213.79 s | 991.80 s |
| 企业 | 18／1,302.87 s | 1,221.80 s | 832.43 s |

团队首个 caught 的 guest kernel uptime为8,715.354308 s，最后可读串口为8,720.849919 s，仅能确定串口继续约5.50 s。host total为另一种钟，不能用9,000.744670减该uptime断言诊断耗时。个人／企业最后记录分别为 restore-empty 开始，没有完成或错误结论。

当前实际准备路径返回 NativeCrashWatcher，不调用备用的主动附加调试器。watcher设置原 core pipe及归属，未主动发送 SIGSEGV；GDB在kernel触发handler并读到core后才运行。因此后置GDB不能解释此前首次139。finish 的最多90次1秒等待发生在原动作之后，可占显式诊断预算；普通运行不走它。原30秒业务超时先于后置采集，不能倒因为采集造成；准备阶段是否改变调度仍未排除。

## 下一项动作与门禁

先保全 CI564 其余各组终态和准确 result／serial／journal，不取消、重跑或追加整轮试验。优先判断原30秒失败是否再次出现，以及提前摘要能否在原总期限内保存首败；只收到 pending failure 也仍失败。

下一项因果测量是把当前固定小组件放到准确候选的原生及既有 TCG 环境，分别核构造、资格和工作项读取成本。当前本机没有同一完整 guest／候选环境；没有通过远程 shell 接入在途 CI。该对照尚未执行，不能用本机 AMD64 基础镜像结果补 ARM。对照须复用候选和锁定运行时、固定请求数／原业务期限，不能为它追加整轮六组合。若需要改变运行时、设备资源或验收保证，先提交具体证据与选项供裁定。

现阶段不改产品权限、合同或依赖来追逐未证实原因。H1 若在准确慢环境中成立，再针对重复构造／纯计算提出保持逐次身份和完整资格校验的修复；H2只有公开位置没有应用调用者，不能凭同地址选择上游补丁。API139尚无准确端点，不另把 argon2 或其他原生依赖预写为共同原因。

## 交付、检查与保护

基础实现包含版本化离线服务端包、PG／Redis／S3三画像、配置校验、安装升级journal、兼容程序回退及独立空目标完整恢复。实现存在不等于验收完成。安装和演示仍见[安装说明](../../integration/server-installation.md)，本轮没有新增使用方式、REST／MCP合同、事件、schema或迁移。

本轮实际编译三组件，并完成六次隔离 Linux 小测和原件离线核验；`node --check`、工具Python AST、38个归档成员SHA及 `git diff --check`通过。`pnpm ci:validate`通过24项原件检查，280 entries／61 members、errors=[]；`pnpm check:integration-docs`通过4技能文件／97链接／35 REST／11 MCP。未重跑本机五项根门禁，当前普通CI各作业另记，不能代guest。中文文档使用仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及适用 references，按规则手检。没有新增使用功能，API／MCP配置与请求示例按现行实现保持。

每台产品 guest 保原4 vCPU／4 GiB和150分钟，安装器业务读取30 s、首次 guest Client读取90 s、健康180 s、安装1,800 s和原oneshot期限不变。本轮组件的1 CPU／512 MiB只是独立测量条件，不是新的支持配置或最低配置。普通六组合、原九类适用合同、真实 Runner／连接器联合验收、五项根门禁、正式 P0/P1独审与最新 Required继续作为条件合入前置。

六个成功小测容器均按完整ID、owner、镜像和停止状态核定向移除，并只读确认不存在。首次bind create在30秒超时未取得ID，准确owner最终只读查询为0，不能补造历史从未创建。首次成功容器rm后因大小写错误匹配导致本机收尾断言失败；rm实际成功，随后仅只读复核，没有重试删除。单一20 MB组件闭包暂留供定向复用，原件ZIP不含闭包、Node二进制、完整符号索引或core。

旧树、旧远端、共享镜像／store、未知匿名卷、受拒目录和其他项目保持。没有 prune、reset、clean、权限扩大、新设备／runner注册、生产接入、对外发布或保证降低。Saved plan字段未同步的既定记录例外继续；Redis-free／filesystem继续待裁定，ADR0071／0072保持Proposed，Runner外置。PR227仅为恢复来源，交付走本会话分支。
