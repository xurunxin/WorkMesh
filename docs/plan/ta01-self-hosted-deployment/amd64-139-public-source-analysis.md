# amd64 139：既有证据与上游源码收敛

## 本次批准与外发回执

用户在后续裁定卡选择“限定摘要上游询证（推荐）”，明确放行本文件在 `3a11c37bff907c52de44e1df04e63b95eed282e6` 中的 1051 字节正文。此批准仅覆盖一次 issue 提交及回读；没有批准新的运行、调试、CI、成果审、合入或额外披露。下文原拟议正文保留为批准来源，不倒填当时授权。

已使用现有账号向 `nodejs/node` 创建 [issue #66881](https://github.com/nodejs/node/issues/66881)。提交前本地没有同次发送账本，当前作者的同标题关键词查询无匹配。实际 POST 一次、回读一次，正文逐字一致，未编辑或追加评论。标题为“Node 22.19.0 在 IC::UpdateState+128 的重复 SIGSEGV 询证”。

| 回执项 | 实际结果 |
| --- | --- |
| 获批正文 | 1051 个 UTF-8 字节；SHA256 `cfb0fd8c0cd1ad4bda6ccfd8db52cd831f3ffe7403c38f45b11b465a765b339e`，与准确来源提交、POST 返回正文和回读正文相同 |
| 提交与回读预算 | 同一宿主 monotonic 连续消耗 5.0159999998 秒，小于 60 秒；没有重试或扩窗 |
| 时间来源 | 宿主起始 UTC `2026-10-20T15:50:41.638407+00:00`，完成 UTC `2026-10-20T15:50:46.665393+00:00`；GitHub 返回 created_at 为 `2026-10-20T15:51:06Z`。两处时钟原样保留，不相减来推网络耗时 |
| 回读状态 | open、comments0，只说明此次回读时无评论，不预判后续回复或上游确认 |
| 数据范围 | 仅标题和获批正文；无附件、本仓库链接、公开 ELF 本体、ZIP、core／内存、GDB 原文或秘密 |

[安全发送回执](../../reviews/ta01-product/upstream-node-inquiry.json)保存批准来源、正文、实际命令边界和输出摘要。同次账本为 `.tmp/ta01-public-analysis/upstream-once-ledger.json`；已标记发送完成，不能再次调用发送包装。

当前等待的是上游的具体不变量／修复前提，不是新的运行授权。按原方案，首个实质回复或 GitHub created_at 后 7 个自然日（`2026-10-27T15:51:06Z`）取早回关口。本轮没有建立后台轮询或定时任务。要求 core、复现负载、升级或其他新范围时另行裁定；无回复不证伪任何假设。P1-1 已闭、P1-2 未闭和最终 Required／正式 P0／P1／ready 门禁保持。

## 当前结论

现有材料确认 API 的公开故障位置重复，但不能给出安全产品补丁。MCP139 尚无可比的故障帧，不能并入 API 根因。本轮找到的相似上游案例也不满足直接套用条件。

本轮基线为 `2a03724f0cd6bad1094b80be02c13da50c29f942`。仅只读既有 Git 原件、公开 Node ELF 和官方资料，没有执行受测程序、原生负载、VM、GDB、CI、成果审或合入。A、B 及此前许可均已消耗；[B 终态与收尾](amd64-api139-online-b.md)保持。

限定摘要现已按后续明确批准发送，准确范围与回执见上节。现有证据结论保持，不默认重复 A／B，不调整 Node、QEMU、期限、资源或业务保证。

## 真正重复的事实与未知

下表位置均为公开 ELF 链接地址，不是进程地址。重读以下既有 ZIP 的实际 Git 字节，核 CRC 和索引成员摘要；没有复制或新建证据 ZIP。

| 样本与准确源码 | 可核故障或负样本 | 不能据此认定的事 |
| --- | --- | --- |
| [CI559 团队升级观察](../../reviews/ta01-product/ci559-amd64-native-observation.json)，`f53f20b85e680a4219ae9f22a58ff37de58c37d8` | 准确 Node SHA 匹配；signal 11／code −6；ELF `0x136b1a0`，即 `IC::UpdateState+128`；GDB 超时，无调用帧 | 没有上一层帧或 JS 调用点，不能从“升级”阶段名指定业务函数 |
| [CI563 团队回退观察](../../reviews/ta01-product/ci563-amd64-team-native-observation.json)，`9c8bbff749c1d2a52a3e6489dcec02d2d7c859af` | 同一 Node SHA、同一 PC 和信号；公开返回位置为 `Runtime_LoadIC_Miss+974`、`Builtins_CEntry_Return1_ArgvOnStack_NoBuiltinExit+53`，帧链止于 `frame-link-invalid` | 与下行的 Store 路径不同；同 PC 不证明同一对象、请求或损坏来源 |
| [恢复后的企业 API 样本](../../reviews/ta01-product/amd64-api-crash-window-a-6g-once.json)，同 `9c8bbff…` | 同一 Node SHA／PC／信号；返回位置为 `Runtime_StoreIC_Miss+264` 和同一 CEntry+53，止于 `caller-outside-public-node`；一次尝试在 31,296 ms 后断连，API die139／重启 | 原 core 和 GDB 原文已无可用留存；不同 UTC／monotonic 时钟、登记和断连不能补请求致因 |
| [CI566 团队 MCP](../../reviews/ta01-product/ci566-amd64-team-first-failure.json)，`541f6ba64841915801a1ccb123f9adb7f61ebe17` | commit 序号 18 的 `initialize`，2766 ms／ECONNRESET；MCP die139／重启，API 没有重启；未取得该 MCP 的准确故障 PC、栈或进程二进制 SHA | 只能说 MCP139 也发生过，不能说它重复落在 UpdateState。initialize 不读资格，API 资格成本不是其已证根因 |
| [新 A](amd64-api139-clock-a.md)／[B](amd64-api139-online-b.md)，同企业候选 | 各一次 HTTP200，分别 8261 ms／10248 ms，无可见首败。A 无在线调试；B 有附加／继续／detach 干预 | 有限负样本不排除间歇故障；A、B 耗时差不是受控因果比较，B 没有故障栈 |
| [旧外层 OOM](../../reviews/ta01-product/amd64-api-crash-window-a.json) | 外层 4 GiB 容纳完整 4 GiB guest，678.69 秒、QEMU−9、外层 OOM；目标数未知 | 与 guest Node139 分列，不能当成 139 阴性或同一根因 |

CI551、CI552、CI554 的既有 139 归档也已只读核摘要；它们没有本表三次 API 样本那样的准确 PC／二进制绑定，不计入“同位置重复”数量。CI563 和企业样本的两帧是有界帧指针投影，不冒完整调用栈；表中偏移沿用投影的 return-site−1 归属规则。

### 指纹与环境差异

| 材料 | 已核版本或摘要 | 边界 |
| --- | --- | --- |
| 三个已定位 API 样本的 Node | 124,181,928 字节；SHA256 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328` | 本轮只读旧树已登记的 `public-node-symbols/node`，不执行本机或缓存 Node |
| V8 | ELF 含 `12.4.254.21-node.29`；Node v22.19.0 的版本头和 `common.gypi` 一致 | 字符串和准确函数字节支持版本对应，不代完整编译配置、工具链或全部动态库同一 |
| 公开基础镜像及函数 | 原索引绑定 `sha256:6b2127043c2faa4f15cdcdeb65a39fc9afbecf5559301898b754bbff561a8aa9`；UpdateState253 字节 SHA256 `82157473e3416b355451ae177f1ddd577d62532d39eb3f14c72a4f7c733415e7` | 各画像、角色和 producer 的完整镜像不同；相同 Node 不代完整环境相同 |
| QEMU | CI 回执版本 `1:8.2.2+ds-0ubuntu1.18`；本地三个窗口二进制 SHA256 `8a35ccba41582fc6c38b9df85fc9e35fa1d42f414d2d7d8090ee9b2f5e7c0854` | CI 没有可比 QEMU 二进制 SHA，不能用本地摘要倒填 CI |
| 完整 guest | 原 4 vCPU／4 GiB、`-accel tcg`；本地 guest SHA256 `6a81c37564db9b1ee84e141922625e1d7c5b389b99bb3c572e0243607d5bb4d2`，kernel 6.8.0-142-generic；本地外层 6 GiB | CI559 团队 manifest `91abad…`、CI563 `62d765…`、企业 `c34733…`、CI566 `1e8cb5…`，候选不能互代 |
| [既有原生／TCG 组件对照](../../reviews/ta01-product/resumption-mcp-native-tcg-comparison.json) | 两环境各 12 次 initialize／tools-call，以及各 12 个零 POST 冷启动，均未 139；复用原 Node／基础 rootfs | 合成身份、API、数据和组件；未覆盖完整 MCP 镜像的 apk 升级、真实 PG／Redis／S3 及长期负载。宿主 kernel 与 guest 不同，不能证明完整候选在原生环境稳定 |

## 准确源码能说明什么

Node 官方 tag v22.19.0 本轮解析到 `f8fe6858549f75a4b4e9633abf39dd2038dbf496`，内置 V8 为 12.4.254.21、embedder 为`-node.29`。出处为[版本头](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/deps/v8/include/v8-version.h)和[构建配置](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/common.gypi)。本轮读取的 v22.x 提交为 `9b16463128ba6d281a5d456f0a9e132bc9bdbcbf`，其 `ic.cc` 与 v22.19.0 逐字相同；这只限该文件，不能推断其他修复不存在，也不是升级收益证明。

准确公开字节在 PC 前为 `mov rax,[rdx]`、tag 位测试，PC 是 `488b40ff`（`mov rax,[rax-1]`），后接 instance-type 读取和比较。结合 ABI 参数位置及[UpdateState 源码](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/deps/v8/src/ic/ic.cc#L271)，可把它静态对应到 `IsString(*name)` 的对象类型检查。该位置尚不能指定业务操作。此对应是无 DWARF 行号支持的静态推断。原 `lookup_start_object` 的 map 读取在函数前段，见[内联函数](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/deps/v8/src/ic/ic-inl.h#L17)。

`Runtime_LoadIC_Miss` 和 `Runtime_StoreIC_Miss` 都会调用 UpdateState。因此，Load／Store 两种公开返回路径落到同一个类型检查并不矛盾。现有安全材料没有当时的 `name` 值、handle 来源、私有调用者或最早损坏点；应用逻辑、native 依赖、V8 不变量、运行环境／TCG 仍不能唯一选定。不能以“加空值判断”、改资格缓存、删通知或升级运行时冒修复。

signalCode−6 也不能单独选定故障机制。准确 Node 源码在启用 WebAssembly trap handler 时，存在未处理信号后恢复默认处理并 `raise(signo)` 的路径，见[原版本 node.cc](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/src/node.cc#L444)。这是可能影响最终信号元数据的机制，不是本样本已经走过该路径的证明；也不能据此说业务使用了 WebAssembly。

## 官方案例与修复的适用条件

| 官方来源 | 可核内容 | 对本样本的结论与可证伪条件 |
| --- | --- | --- |
| [Node #54573](https://github.com/nodejs/node/issues/54573)、[修复 #55261](https://github.com/nodejs/node/pull/55261/files) | 22.7.0 的 Parcel 案例有 UpdateState／LoadIC_Miss 帧，伴随分配器堆损坏。修复改 `lib/v8.js` 的未对齐 TypedArray 反序列化复制，另有回归用例 | v22.19.0[源码](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/lib/v8.js#L378)已有修正。准确 ELF 也包含修正语句 `buffer_copy.set(new Uint8Array`，未找到旧 copy 调用文本。“此补丁尚未应用”不受材料支持；仍缺本样本走该反序列化分支的证据，不能套同因 |
| [Node #59740](https://github.com/nodejs/node/issues/59740) | 同为 22.19.0／Alpine，报告者的栈落在 OSSL_STORE_load、证书链验证，关联 OpenSSL3.0.17 | 本表 API PC 是 V8 类型读取，不是该 OpenSSL 栈。不能凭版本相同回退 Node 或关闭 TLS；其他时点的潜在损坏来源仍未知 |
| [22.19.0 发行记录](https://github.com/nodejs/node/blob/f8fe6858549f75a4b4e9633abf39dd2038dbf496/doc/changelogs/CHANGELOG_V22.md)、[38bafc59 修复原文](https://github.com/nodejs/node/commit/38bafc59e0406e7c920e6b45ae4d218639b84f65) | 该 V8 backport 是 SetWeak 的 clang 函数类型警告处理，改头文件和构建 embedder 编号 | 没有证据把它解释为 UpdateState 的运行时崩溃修复；不从“V8 backport”标题猜因果 |
| [QEMU #2220](https://gitlab.com/qemu-project/qemu/-/issues/2220) | x86 TCG、8.2.0／8.2.1，宿主 qemu-system-x86 自身 SIGSEGV 的报告 | 这里已定位的是 guest Node；相关窗口 QEMU0。两者故障进程不同，不能直接套同因；本轮未得到适用于本 guest 故障的修复 commit |
| [QEMU v8.2.2 译码源码](https://github.com/qemu/qemu/blob/11aa0b1ff115b86160c4d37e7c37e6a6b13b77ea/target/i386/tcg/translate.c#L3845)、[同版本 TCG 说明](https://github.com/qemu/qemu/blob/11aa0b1ff115b86160c4d37e7c37e6a6b13b77ea/docs/devel/tcg.rst) | `0x8b` 经通用内存加载路径；system emulation 通过软件 MMU 处理代码页保护／翻译失效 | 没有该次寄存器／内存输入或翻译块证据，单条 mov 不能证明 TCG 译错。user-mode ARM／binfmt 案例不能套全系统 x86 guest |
| [Ubuntu .18 发行记录](https://lists.ubuntu.com/archives/noble-changes/2026-July/057142.html)及[准确打包源码](https://archive.ubuntu.com/ubuntu/pool/main/q/qemu/qemu_8.2.2+ds-0ubuntu1.18.debian.tar.xz) | .18 列 module 加载及 ARM 修正。准确 debian.tar.xz 为 261,892 字节，SHA 与发行记录一致；130 个有效 patch 未命中`target/i386/tcg`、`accel/tcg`、`tcg/i386`路径文本 | 已核发行商补丁目录，不能把上游 8.2.2 当作完整发行商构建。未找到能绑定当前 PC 的补丁，不代表全部 TCG 机制、构建差异或间接影响已排除 |

本轮检索限上述官方 tag 源码、发行记录和相似 issue，不是所有 V8／QEMU 问题的穷尽证明。Launchpad 源包页面和 Ubuntu 独立 changelog 端点未成功返回正文；随后从 Ubuntu archive 取得准确打包源码，并对发行记录 SHA，不以失败页面猜补丁。部分 GitHub 网页加载不全时改核官方 raw／commit 原文，没有使用本机不同版本 Node 代测。

## 批准前的限定摘要方案与原正文

本节保留 `3a11c37bff90` 的方案与获批正文。需要补的是“哪个源码不变量或已知修复能解释准确类型读取，以及缺什么最小观测”。方案限定仅向 `nodejs/node` 提交一次问题，不同时开 V8／QEMU 问题，不代上游宣布根因；后续批准与实际发送已在首节单列。

**可供批准的完整外发正文如下，合计不超过 4 KiB，不带附件或本仓库链接：**

> 在隔离 Linux amd64 全系统 TCG 环境中，Node 22.19.0 的公开 ELF（124181928 字节，SHA256：638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328）有重复 SIGSEGV 安全位置记录。V8 版本字符串为 12.4.254.21-node.29。
>
> 公开 PC 为 IC::UpdateState+128／ELF 0x136b1a0，字节 488b40ff。静态对应 IsString(*name)；有界公开返回位置分别为 Runtime_LoadIC_Miss+974 或 Runtime_StoreIC_Miss+264，下一层为 Builtins_CEntry_Return1_ArgvOnStack_NoBuiltinExit+53。没有完整栈、私有操作数或可分享 core，不能认定同一根因。QEMU 版本为 Ubuntu 1:8.2.2+ds-0ubuntu1.18，guest 为 4 vCPU／4 GiB、kernel 6.8.0-142-generic。
>
> #55261 对应的修正语句已存在于该公开 ELF；#59740 的 OpenSSL 栈与此位置不同。有限无故障样本不能排除间歇故障。请问该源码路径是否有可指向的已知不变量违例／修复 commit，以及不涉及私有值的最小判别观测？目前没有可分享的最小复现，未据此升级运行时或改代码。

正文中的故障位置及次数是从已批准安全元数据推导的事实，**不能冒称全部都是公共源码自身提供的信息**。许可需明确覆盖这份正文的外发。公开 ELF 本体、完整反汇编、ZIP、原件、core／内存、GDB 原文、进程地址、业务请求、身份／秘密、内部 PID／owner／路径均不发送。

| 项目 | 拟议边界与判据 |
| --- | --- |
| 前置材料 | 上述已核摘要、准确 tag／函数字节和两种返回位置；使用已有获授权账号，权限不足即停，不注册账号或索取新凭据 |
| 操作／资源 | 仅一次 issue 提交与一次回读，正文≤4 KiB，无附件；提交／回读合计≤60 秒，无自动重发。0 台 VM、0 次产品／原生负载／GDB、0 个 CI；不调整任何产品资源或期限 |
| 可证伪假设 | 若候选修复已在准确 tag／ELF 中，或必要前提与已有事实相反，排除该具体候选。若上游指出缺失修复且必要前提可由现有材料证明，再提交最小修复及旧／新验证方案；此时仍不自动改产品或运行 |
| 不确定结果 | 仅建议升级、给出相似帧、要求复现／core，或没有实质回复，都不补因果、不关 P1。没有回复不证伪任何运行时假设 |
| 停止 | 提交状态不确定先只读核是否已存在，不能再发一条；发送或回读失败即保存准确状态并停。首个实质回复或 7 个自然日取早回关口；不创建后台任务／定时器等待，不自动追问或转发其他项目。要求秘密、core、新负载、权限或运行环境变化即另行裁定 |

另一选择是保持当前关口，不外发、不新增执行。当前不推荐直接排新 VM：API 的同钟／附加已各获得无故障样本；MCP 缺自己的 PC，无法据 API 帧设计同因补丁；也没有能选定 Node 升级、jitless、TCG 线程／CPU 变化的必要前提。若上游后续提出可核判别条件，再围绕该条件提交单独、明确的运行方案。

## 来源核验与门禁

本轮只新增本结论，并在既有下一步计划建立入口。没有产品源码、迁移、API／MCP／事件、安装配置或示例行为变化，接入手册无需改写为新增能力。P1-1 保持正式闭合；P1-2 的 API139／MCP139 分别未闭。PR229 继续 draft，最终准确 head 最新适用 Required、三画像真实验收、正式 P0／P1 复审和 ready 门禁保持。

公开源码下载仅存任务独有 `.tmp/ta01-public-analysis/`，未安装工具或执行下载内容。关键原字节 SHA256 如下；原件继续引用既有归档，不重复提交公开大文件。

| 文件及来源版本 | SHA256 |
| --- | --- |
| Node v22.19.0 `deps/v8/src/ic/ic.cc`，147,623 字节；上述 v22.x 提交同字节 | `9a256700d996fc09dc0c8e3eded58c501965f66780b05fea20ad1b59315c5b80` |
| 同版本 `deps/v8/src/ic/ic-inl.h`，1474 字节 | `15b69c1026a6dc66df71819a09741f0698dbf30f63b8a483fc56c528aa59e725` |
| 同版本 `src/node.cc`，56,888 字节 | `48957a7576f4deac88c98cb778c474fe142d0e8497efeef86bd03a067ed8ca81` |
| QEMU v8.2.2 `target/i386/tcg/translate.c`，231,762 字节 | `10b174db6de1d1a946a81b172ebaa58ba7af0ea18bed847e2780b3f4f1aaa835` |
| Ubuntu .18 `debian.tar.xz` | `7f1993808bbe15fee04c13aeb8ab5bc4f011b0b3b3a15d511c19d8956b34dc48` |
| 包内 `debian/patches/series` | `9be47e471413a83f024badcd172b4f90fae094ab10fd05b34a3b93967e97dc2d` |

按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c`、typography 和 manual-structure 手检，不装全局工具。既有归档读取采用 `git show HEAD:docs/reviews/ta01-product/<name>.zip`，按索引核原成员字节；公开 ELF 只用 Python 读取字节和符号索引，未加载执行。最初一次以系统默认 GBK 读取 UTF-8 索引失败，随后从原字节按 JSON 解析，没有把失败内容当分析结果。

`node scripts/check-integration-docs.mjs` 退出 0，结果为 skillFiles4／localLinks104／restEndpoints35／mcpTools11／humanSyntax passed。新增结论内 9 个本地链接均存在，外发正文为 1051 个 UTF-8 字节，低于拟议上限；`git diff --check` 退出 0。宿主 Node 仅用于该静态文档脚本；没有运行五根、产品验收或 CI，不把这些静态结果计作其通过。
