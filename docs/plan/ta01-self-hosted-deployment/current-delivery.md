# TA01 当前交付与诊断报告

## 当前结论与源码

基础交付尚未完成，PR228 保持 draft，未进入正式成果独审或合入。本轮起始及 CI566 受测 head 为 `541f6ba64841915801a1ccb123f9adb7f61ebe17`，tree 为 `9d330d4aca890e4d1147315923e6c3f5f61b68f2`，parent 为 `ac0a4d21deba15a23c8c7b40f671b59c41f30f37`。执行者 2026-10-16 18:21（UTC+8）另核真实 refs/heads/main 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`，不是缓存引用。本轮后续文档提交与这个受测源码分开，不把旧运行套给新 head；交付提交以 PR 实际 head 为准。

本轮核 CI566 原运行、准确原件及源码，并补有界健康读取／initialize 对照及三次同源 manifest 纯函数成本测量。没有修改产品代码、原guest诊断字段、CI、锁定运行时或原验收资源／期限，没有手动整轮、cancel 或 rerun。先等有证据价值的原运行终态，再提交，避免平台推送触发并发取消。以下新结果仅来源执行者，不冒称 Chief 已独立复核。

## CI566 的准确结果

普通 [CI566／run38871063733](https://github.com/xurunxin/WorkMesh/actions/runs/38871063733) 绑定上述 541。终态、各 job 和双生产者见[完整索引](../../reviews/ta01-product/ci566-final-results.json)及[原件材料](../../reviews/ta01-product/ci566-final-results.zip)。

整体 **failure**，Required job116933988732 **failure**；14 个其他作业 success。六 guest 均自然终态，无取消；未调用 cancel／rerun，也未手动追加整轮。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116878340364，success，4,274.10 s；完整重启通过（[原件](../../reviews/ta01-product/ci566-amd64-personal-full-guest-pass.json)） | job116878340374，failure，7,889.16 s；get_work_item 30 秒失败（[原件](../../reviews/ta01-product/ci566-arm64-personal-first-failure.json)） |
| 团队 | job116878340605，failure，2,830.52 s；initialize／139 首败（[原件](../../reviews/ta01-product/ci566-amd64-team-first-failure.json)） | job116878340578，failure，9,001.25 s；总期限、upgrade 未完成（[原件](../../reviews/ta01-product/ci566-arm64-team-first-failure.json)） |
| 企业 | job116878340581，success，4,016.89 s；完整重启通过（[原件](../../reviews/ta01-product/ci566-amd64-enterprise-full-guest-pass.json)） | job116878340358，failure，9,001.06 s；总期限、upgrade 未完成（[原件](../../reviews/ta01-product/ci566-arm64-enterprise-first-failure.json)） |

个人／企业 AMD 分别核 11 成员、22 输入与六脚本、两次不同 boot_id／kernel、QMP RESET／SHUTDOWN、QEMU0 及重启后 API／MCP／原工件／新 outbox 四证明。重启恢复分别 266.09／252.64 s，只证明 541 这两个准确组合，不关闭原生故障或外推其他画像。

双生产者真实通过 Linux 60 项 Python 和 16 项安装单元，22 个发行输入、六 Python 脚本、manifest commit／tree 与 Git 字节一致。AMD 候选为 12033760634，manifest SHA 为 `1e8cb5c8e3eacc3e1de2be0f4bffbbf17e02beffa0b72cd0abe260f4c246c8c5`；ARM 候选为 12032934001，manifest SHA 为 `391bd59c041d4a7d87a15573d2f03ff07edfddcf6b1233b6f092b75639fd29b4`。各架构三画像复用同一生产者，不把本机 60 项检查当作 guest 通过。

### 团队 AMD64：回退后的 initialize 首败

[团队原件索引](../../reviews/ta01-product/ci566-amd64-team-first-failure.json)及[原件](../../reviews/ta01-product/ci566-amd64-team-first-failure.zip)绑定 job116878340605、artifact12036196564。原 ZIP 为 2,376,641 bytes，SHA-256 为 `6c7a12bd5a74a0373eeadc41716e410f67d186614a00e5e1df3a4dbc8e63b787`。11 个成员、前后源码、22 个发行输入、六脚本及准确 manifest 均已核验。

action17 rollback 达到原预期，耗时 270,914 ms。首个未达预期的动作是 action18 commit，耗时 97,343 ms；journal 为 healthy，最后动作 validate-business-read failed。其原 initialize／id1 在 2,766 ms 后 ECONNRESET，请求写入完成，无响应头或体。不是 30 秒读取期限耗尽，也没有进入该次 get_work_item。

准确 MCP 容器 `adb00ab6e8f777b805c3516a498568b75bc407034c8e9a56bd517200d93e9df4` 有 die／139 事件，timeNano 为 `1792141146936165836`；较晚重启 1、无 OOM、health=starting。API／Worker 较晚健康、重启 0。代理第 10 次只有 request-read、1 ms、OtherError，没有 request-sent 证明；不能从分类补成具体网络错误或上游已收到。

journal 意图开始 UTC 为 `2026-10-16T08:59:02.578Z`。它在落盘和发请求之前，不是服务端收包时刻。退出事件与意图有先后，不证明 initialize 触发故障；本组没有 core、准确 Node 子进程调用者或应用栈。容器主 PID 的 stat 也不能当 Node 进程 CPU。

另有更早的空闲、首任务和三份并发采样，已记录相同 MCP 容器重启 1 次。该次历史重启的原因未知；后来采集的事件窗口只从当前 journal 开始，不能当完整生命周期，也不能据计数相同推只有一次故障。

首份 pending failure 的宿主 elapsed 为 2,742.504538005 s，最终回执为 2,830.036837396 s，同一宿主单调钟间隔 87.53 s。guest 总耗时 2,830.52 s；pending 始终阻断通过。较晚 PG 快照为 3／100，包含诊断自身，不能倒推历史连接耗尽；采集时内存／load 也不是失败瞬间证据。

### 新 API 耗时投影的实际覆盖

本次团队 AMD 的 serial 没有 `ta01-api-read-timings`，最终 diagnostics 也没有 apiReadTimings 或 apiReadTimingsUnavailable。准确受测 guest.py 只在最后失败的 method=tools/call 时选择这条分支；本组是 initialize，属于未选择采集，不能写成已覆盖或采集失败。

原件只保 API 日志的 13,203 bytes 及 SHA `8fdf17ecd78bbdcd8aee7b592a092cab8e36e728e793117bc5806481c89ee0bb`，没有原日志正文。因此无法回算 API 资格／工作项耗时，也无法提供 API／MCP 的实际差额。initialize 自身不读资格；不能用资格响应成本解释本次尚未走该路径的重置，也不能把未选择投影等同 API 耗时为零。

### 个人 ARM64：真实工具窗口中的 API 耗时

[个人 ARM 原件](../../reviews/ta01-product/ci566-arm64-personal-first-failure.json)绑定 job116878340374、artifact12039324604，原 ZIP SHA 为 `54d2cb7d64fc715046c006a3f397ae7d03492badb18705fa39a7b83692af64f7`。22 个发行输入、架构／画像、固定镜像／QEMU／4CPU／4GiB 及六脚本均已核。基线生产者为 12032934001／manifest391bd59；journal 的 `70cd214a827cb7d303db143f5e3a6e5750172fa0d3f7b0dfab6a98751e32e7aa` 是 guest 内生成的同程序升级夹具，不是另一历史发行程序。

action18 recover-old 完成，165,245 ms；首个未达预期的 action19 commit 在 254,031 ms 后失败。journal 为 healthy／validate-business-read failed，开始 UTC 为 `2026-10-16T10:19:40.065Z`。原 get_work_item／id2 在 30,609 ms 无头／体超时；代理第 9 次后来 upstream-complete／200 为 37,996 ms，下游失败。真实客户端仍失败，未登记成功。

本组首份 pending 没有 API 投影，后置 serial 有一份 `ta01-api-read-timings`，最终回执逐字相同。其 sourceSha256 与已归属 API 容器原有那一次日志 stdout 哈希相同；原日志为 13,688 bytes。窗口从上述 journal UTC 至 `1792146055.455507`，共 75.39 s。固定路由有 2 对、不同 requestId SHA，unpaired=0、ambiguous=0、truncated=false，tailMayOmitRequests 仍为 true。

| 本窗口固定路由 | API responseTime | 结果 |
| --- | --- | --- |
| qualified-capabilities | 21,622.81 ms | completed／200 |
| work-item-read | 10,019.08 ms | completed／200 |

这次实证真实 API 侧存在显著耗时，不能继续把迟响应全归为 MCP 内部。两记录求和 31,641.89 ms 只是窗口内服务端记录求和；没有原始起止、统一跨进程关联或内部阶段追踪，不能当端到端串行分解，也不能用代理时间减它来声称“MCP CPU 耗时”。源码表明资格读取完成后才进入工作项读取，但本投影仍只提供窗口和路由配对。API200 不代客户端成功。

两接口共用实时 Coordination 身份解析、授权和 PG 路径，资格接口另构造及校验 manifest；旧合成 API 在计时前已生成响应，未覆盖这段服务端生成或实际事务成本。源码中的 Agent 凭据走 SHA-256 tokenHash，不把 Human 密码 Argon2 路径猜作本次开销。现有资料尚不能区分 SQL／锁、manifest 计算、序列化和调度，尚无准确产品修复。

较晚 API／MCP／Worker 均 healthy、重启 0、无 OOM；有界事件窗口为空，不合并成 AMD139。PG 快照为 4／20，track_activities=false，包含采集自身，不倒推历史等待。pending 至 final 为 7,642.033861110→7,888.190104561 s，间隔 246.16 s；总 guest7,889.16 s，在 150 分钟之前因业务读取失败结束。


### 团队与企业 ARM64：总期限与缺失回执

团队 job116878340578／artifact12040529179，原 ZIP SHA 为 `fd88cf100c5e5cb4add9089ee47a4427ad95b7f7285e7885c3cc40f5b32230fe`；企业 job116878340358／artifact12041052864，原 ZIP SHA 为 `0b50fd62e7f0ef4c5fcaa116f95b1a2fb1ebfa3b471cd5ae96fa2ee2e051eed2`。两组 11 成员、541／22 输入／六脚本、准确 ARM 生产者和固定 guest 条件已核。

两组 result 均 failed／TimeoutError，达到原 9,000 s 总期限，含收尾 total 分别 9,001.25／9,001.06 s，未放宽上限。最后记录都是 action22 upgrade started，未见该动作的阶段计时、完成或失败标签；不能从 wrapper 补具体安装阶段或业务根因。

此前 action20 restore-empty、action21 recover-old 均 finished，团队分别 465,320／307,523 ms，企业 432,807／310,317 ms。finished 仅表示达到当次脚本预期，包含可能的预期拒绝，不能替代最终完整恢复／原卷保留／重启证明。

这两组 receipts=[]，也没有 API 投影或最终 journal／事件快照。result 原件存在，与 CI564 取消时缺 result 不同。不能套个人 ARM 的 30 秒读取失败、API21.62／10.02 s 或 AMD139，也不能补诊断耗时、正常业务结果或 guest 资源收尾。原预算失败门禁保持。


## 少量可证伪假设与下一动作

| 解释 | 当前证据与缺口 | 最小验证及判定边界 |
| --- | --- | --- |
| H1：资格响应处理拖慢本次失败读取 | 团队 AMD 首败是 initialize，原 SDK／MCP 路径及此前小测均证明该方法不读资格；这一解释不能解释该次请求自身 | 个人 ARM 已实测 API 资格 21.62 s、工作项 10.02 s。同源纯函数三次已量测 5.29／1.89／1.13 s，但未测真实内部阶段。下一项固定测量共同身份／授权事务与 PG／调度成本，保持实时资格；0 对、缺件或 API200 不补客户端成功 |
| H2：产品构造路径、依赖运行时或 TCG 交互导致 139 | 本组实际只有归属容器退出 139，无 core／应用调用者。源码 apps、packages、infra/docker 和 lock 从 9c8 到 541 无差异，但不证明两次构建的二进制相同。已完成小测有限未复现，仍不排除 | 保本组与旧 API139、旧有界 MCP 原生帧分别绑定；先核同轮其他原件是否有独立故障证据，不凭相同退出码合并。有界健康读取对照另见下文，只得到局部负样本。没有准确故障路径前不换 Node／QEMU 或修改产品 |
| H3：原请求或整机期限造成此次失败 | AMD initialize 仅 2.77 s／总 guest47.18 min，个人 ARM 在 131.49 min 因 RPC30.609 s 失败；另外两 ARM 确实达到 150 min 且 upgrade 缺回执。三类失败分别保留，完整服务竞争、调度和更早重启原因仍未知 | 只用同一种钟分析已有阶段；两 ARM 多次完整包核验约 80～90 s 且包含大量当前进程 system CPU，但尚无独立 I/O／调度归因。保持完整读／散列及原上限，不按最后 started 猜阶段故障，也不拿 PID1、晚快照或混合时钟补结论 |
| H4：新增后置日志投影制造首败 | 本组没有进入新分支，pending 已先报，最终采集晚 87.53 s。后置投影无法解释已发生的这次重置；普通模式也没有启用原生捕获 | 保留同组先后和缺件；不为这项已经可判定的解释再加字段、试跑或放宽期限。已有 core 捕获对旧故障时序的影响仍另列 |

下一动作是依据本轮工具读取的真实覆盖决定更小的验证。若原件仍缺应用调用者或 API 时间分界，明确保留未知；不以单组通过或另一轮通过替代根因。确需改变锁定运行时、设备／资源授权、验收范围或保证时，先给有依据的具体选项。本轮没有这种变更，也没有足够证据实施准确产品修复。

## 本轮有界对照：健康读取与 initialize

源码显示，MCP 的真实 `/readyz` 会对上游发起带 1 s 期限的 fetch。此前只读微测没有这个健康请求，冷启动微测也没有 MCP POST。因此补一个具体条件：先观察合成 API 收到健康读取，再发送与安装器相同形状的 initialize；健康夹具交替立即返回或延迟 2 s，原 MCP 上游期限仍为 1 s。每 10 s 至多发起一次健康读取，每环境各 12 次正常、12 次延迟，不强制 GC、不改 JIT，不加入实际业务服务。

[配对索引](../../reviews/ta01-product/resumption-mcp-readiness-initialize-comparison.json)及[材料](../../reviews/ta01-product/resumption-mcp-readiness-initialize-comparison.zip)保 30 成员。测量脚本 SHA 为 `1691bead14148f18ea1de658c4182792974e2cac050d2e8c481be982309dcc8e`。只复用 CI563 精确角色 rootfs，Node22.19.0 SHA 为 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`。产品源码从 9c8 到 541 相同，runtimeFingerprint 也相同；它只散列 Git 输入，不能证明新候选动态库或二进制相同。

先核精确 QEMU `8.2.2+ds-0ubuntu1.18` 可得，再仅在独有 Ubuntu 容器安装；版本与 CI566 原件一致。该本机 QEMU SHA 为 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854`，不冒 CI 二进制也已逐字核。guest 沿原固定镜像 `6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2`、kernel6.8.0-142、4 vCPU／4 GiB。原生侧是 Docker Linuxkit 7.0.14 的 chroot，内核不同；两侧使用同一 rootfs、非 root 身份和脚本，均跳过生产 entrypoint，未复刻整套 Compose 容器配置。

| 环境／健康条件 | initialize 成功数 | initialize wall 中位／最大 | 健康结果 |
| --- | --- | --- | --- |
| 原生／正常 | 12 | 21.43／69.03 ms | 12 次 200 |
| 原生／合成延迟 | 12 | 20.64／37.52 ms | 12 次 503 |
| TCG／正常 | 12 | 407.51／2,321.17 ms | 12 次 200 |
| TCG／合成延迟 | 12 | 315.10／643.56 ms | 12 次 503 |

每环境 24 次健康读取、24 次 initialize；未知、资格和工作项读取均 0，Node 均 0，QEMU0。原生控制命令 241.02 s，TCG Node253.03 s、VM451.11 s；这是本轮新增的有限测量开销，不称合计开销不变；供应及输入复制耗时未单独量测。仍为 Node600 s／VM1200 s，未延长原产品或 CI 期限。

这个对照只覆盖健康请求待完成时发起 initialize；没有测到 Abort 回调具体执行点，不能宣称它恰好落在构造函数内。固定次序交替也未消除热身／顺序效应，不据两组中位数推成本因果。小测调用侧用 30 s 取回响应，没有运行原 curl 2 s 健康客户端；表内 200 不是该健康脚本通过证明。合成 503 不能冒真实 CI 在崩溃前发生过同类健康超时。有限未 139 只说明本批条件未复现，不能排除更长负载、真实 API／PG／Redis／S3、TLS／代理或调度差异，也不外推 ARM。

辅助账本先因旧工具默认编码失败，包装脚本又因生成语法错误失败；两次均在 Node／guest 启动前。原字节、错误和修正依据已保，转码核 JSON 语义、补全语法检查后，才开始两环境各一次实际测量，没有重试失败业务请求。全部 Node／QEMU 结束并核无活动进程后，按完整 ID 及 owner 停止并移除唯一容器；PID1 最后 137、无 OOM，与本次 Node／QEMU 均 0 及旧 139 分开。

## ARM 同源 manifest 纯函数成本

依据个人 ARM 的真实 API 资格 21.62 s，再量测 API 调用的同源公共函数子集：[索引](../../reviews/ta01-product/resumption-api-manifest-arm-cost.json)及[原件](../../reviews/ta01-product/resumption-api-manifest-arm-cost.zip)保 22 成员。测量只生成 manifest、计算资格并 JSON.stringify，共 3 次，不运行 HTTP、鉴权或 SQL。它不是实际 API 镜像、进程、请求或支持验收。

复用 CI565 的准确 ARM MCP 角色 rootfs、Node22.19.0／`da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7`，相关算法源码从 ac0 到 541 无差异。固定 QEMU8.2.2+ds-0ubuntu1.18、guest／EFI／ROM 及 4CPU／4GiB，宿主仍 x86_64，没有原生 ARM 对照。实际脚本 SHA 为 `7026d7d6fff0d71e781037901dd1642342e790e4b92828c2b926644b614fb0d4`。

输入按受测源码构造：work:read、mcp、executing／coordination／coordinator／team；13 个 feature 默认 false，仅显式开启 Coordination 和 Gitea。静态预检发现角色闭包没有 config 包，在 Node／guest 启动前按配置源码确认等价 feature 值，未安装缺失依赖。UUID 与 revision1 是代用值，不称实收身份快照或真实资格响应。

| 次数 | manifest 生成 | 资格计算／校验 | JSON.stringify | 三部分 wall 求和 |
| --- | --- | --- | --- | --- |
| 1 | 879.84 ms | 4,196.04 ms | 213.35 ms | 5,289.23 ms |
| 2 | 151.86 ms | 1,548.91 ms | 185.64 ms | 1,886.41 ms |
| 3 | 165.29 ms | 890.02 ms | 79.24 ms | 1,134.56 ms |

三份合成响应均 308,929 bytes／287 项操作、同一 SHA；这不是原真实 guest 响应大小，后者仍未知。模块导入 6,844.75 ms 另列，不能加进每请求成本；CPU 只属当前测量 Node 进程，不含 PG／Docker，不作 CPU 比例。未覆盖 Fastify 钩子、真实鉴权、SQL、调度和多服务竞争。

Node 及 QEMU 均 0，Node27.95 s、VM974.30 s，在原 600／1,200 s 小测期限内。只得到本机旧角色／代用输入的冷暖基线，不能从真实 21.62 s 扣掉它来声称 SQL 或锁耗时，也不能排除真实 API 纯计算在另一负载下更慢。没有改产品、缓存实时资格或以预热冒根因修复。下一项应固定测量真实身份／授权事务与 PG／调度成本，先收敛内部阶段，再选准确产品修复。

## 历史证据与微测的适用边界

[541 提交中的上一版完整报告](https://github.com/xurunxin/WorkMesh/blob/541f6ba64841915801a1ccb123f9adb7f61ebe17/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留全部历史说明。CI562／563 的 9c8、CI564 的 5371、CI565 的 ac0 和当前 CI566 的 541 分开；[接续记录](resumption.md)保授权及旧树来源，PR227 只作恢复来源。

| 历史运行 | 已保实际结论 | 固定原件 |
| --- | --- | --- |
| CI562／563 | 普通 AMD 个人／团队完整通过，企业 API139；ARM 恢复缺件或工具超时。显式 AMD 有界 MCP 原生帧，ARM 超时，Required 均失败 | [双运行终态](../../reviews/ta01-product/ci562-ci563-final-results.json) |
| CI564／5371 | AMD 团队完整通过、企业 MCP139；个人 AMD 及三 ARM 取消且缺 result。整体 cancelled、Required failure | [终态与取消来源](../../reviews/ta01-product/ci564-final-results.json) |
| CI565／ac0 | 三 AMD 完整重启通过，三 ARM get_work_item 无头／体超时，Required116861412474 failure，六组无取消 | [终态与双生产者](../../reviews/ta01-product/ci565-final-results.json) |

CI565 企业 ARM 首次正常 commit 为 30,382 ms；个人／团队同程序升级夹具为 30,392／30,602 ms。较晚代理 200 分别不能补成功。pending 到最终间隔分别为 370.84／304.31／252.17 s。此前成功组均按准确六脚本、manifest 和生产者绑定，并核不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU0 及重启后 API／MCP／原工件／新 outbox 四证明；不外推 ARM 或历史不同发行程序升级。

CI564 的取消发生于平台 ac0 checkpoint 推送后，相同 PR 并发组使用 cancel-in-progress；规则与时序支持这一推断。GitHub 没有独立取消发起者字段，执行者未调用 cancel／rerun，不能冒称各组自然终态。旧 API139 无 core、CI563 MCP 的 IC::UpdateState+128 及两个有界公开帧不证明坏指针来源；GDB 到 before-binary 后达原 60 秒，不能冒成功取栈或关闭根因。

| 已完成局部小测 | 准确证据 | 适用边界 |
| --- | --- | --- |
| 六次原生组件探索 | [完整组件](../../reviews/ta01-product/resumption-mcp-component-probe.json)、[work:read](../../reviews/ta01-product/resumption-mcp-work-read-probe.json) | Node SHA 匹配旧目标。完整／缩小资格中位 67.21／4.63 ms，work:read 为 309,710 bytes／71.25 ms；features／scope 仍合成，实际 guest 响应大小未知。profile wall 不作 CPU 比例 |
| 固定 AMD 原生／TCG 及冷启动 | [两环境配对](../../reviews/ta01-product/resumption-mcp-native-tcg-comparison.json) | QEMU 精确 8.2.2+ds-0ubuntu1.18、固定 guest／Node、4CPU／4GiB；各 12 组，initialize 零资格，工具最大 1.92 s。各 12 次冷启动仅健康读取、零 POST／资格，均 0；未覆盖长期负载 |
| CI563 准确 MCP 角色 | [准确角色配对](../../reviews/ta01-product/resumption-mcp-exact-role-comparison.json) | 同一角色原生与 TCG rootfs 各 12 组，initialize 零资格、工具最大 2.53 s；跳过 entrypoint、合成 API。config／归档／实际 ID 分开，不把源码相同当新候选二进制相同 |
| CI565 准确 ARM 角色 | [ARM 补测](../../reviews/ta01-product/resumption-mcp-arm-path-probe.json) | 固定 Node／guest／QEMU／EFI，首次缺 ROM 在 0.79 s、零请求退出；按 CI 准确包补齐后一次补测。12 组工具最大 4.09 s，Node／QEMU0，VM1,028.61 s；宿主 x86_64、无原生 ARM 对照 |

所有有限未 139／未超时样本仍只是局部负样本，没有真实 API／PG／Redis／S3、代理和完整竞争负载，不能折算为支持矩阵或根因排除。源码快照和实际使用 SHA 均在各索引，后续工具版本不倒填。

## 核验、资源与交付边界

本轮[核验索引](../../reviews/ta01-product/resumption-ci566-delivery-checks.json)及[日志／源码快照](../../reviews/ta01-product/resumption-ci566-delivery-checks.zip)保实际结果：9对新原件的155成员SHA／大小一致，两份实际测量mjs字节与输入SHA一致且Node语法通过，8份在用Python助手AST通过。首次坏包装语法原件单列，不混作通过。新增文件Git过滤前后字节一致；本机 `pnpm ci:validate` 为24项通过、registry280 entries／61 members／errors=[]，`pnpm check:integration-docs` 为4技能文件／98链接／35 REST／11 MCP通过，`git diff --check` 通过。可选autocorrect未找到，按固定技能手检；原组合shell末尾因该可选查询退出1，两个pnpm实际退出均0，不冒测试全绿。

CI566 Source gates实际checkout为 `56dc7a3972ffc8c1ac8bf65d08ec7216152749d8`，parents为c3dd／541，GitHub临时合并快照的tree实核等于受测541；这不是PR实际合入。原checkout公开两行、完整日志SHA及tree／parents已保，lint按现有CI共用typecheck。双生产者／六guest按各自准确源码另核，不把工作流head当所有job实际checkout。本机未重跑五项根门禁；这些局部检查不代失败的Required、原真实验收或正式产品审。


本轮没有 schema、迁移、REST／MCP 合同、事件、安装行为或配置示例变化。同步[安装说明](../../integration/server-installation.md)及[验收矩阵](acceptance-matrix.md)的验收状态；原接入命令继续使用。中文文档按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及适用 references 手检，没有全局安装。

本轮创建并收尾两个独有控制容器和两次小测 VM，没有新宿主安装、设备、权限、常驻服务、宿主挂载或公开端口。原 Node／guest 输入复用，只在独有消费者中暂存，随其收尾；未下载新的几百 MB 候选或保第二份 rootfs。另只下载必要 raw 原件，选取有依据的 11 成员、生产者及门禁日志。之前微测的准确容器／新诊断标签收尾在各原件中；PID1 最后 137 与 Node139 分开。单一公开 guest／组件输入、旧树、旧唯一候选、共享镜像／store、未知匿名卷和受拒目录保持，无 prune、reset、clean 或绕过拒绝，不宣称物理净释放。

产品仍保 PG／Redis／S3、外置 Runner、纯后端和原恢复保证。每 guest 4 vCPU／4 GiB／150 min，支持 job 210 min；业务 30 s、首次 Client90 s、健康 180 s、安装 1,800 s 和原 oneshot 不变。每架构三独立 guest 的合计计算开销增加已有披露，不冒物理最低配置。Redis-free／filesystem 仍待裁定，ADR0071／0072 仍 Proposed，Saved plan 未同步的 23:41 记录例外继续。

完整 guest 升级／回退仍为同程序两候选夹具。两个历史已发行程序对、裸 Compose 迁入、Runner／连接器最终联合验收及全部原 DoD 没有新增完成依据。没有生产内网、权限扩展、发布、ready、合入或 Done。原真实验收、实际五门禁、仅 P0/P1 正式产品独审及最新 Required 齐备后才可条件合入。
