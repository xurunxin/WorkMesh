# TA01 当前交付与审查修正报告

## 当前反馈关口：已批新 A 同钟首败取证

用户于 2026-10-20 13:03 在 `q-PiHASaTSNU-05WBsiC5me` 选择“新 A：同钟首败单台（推荐）”，仅放行 `02ae2085` 方案 A 的新增一台和有界同钟包装。该单台已真实结束：原 QEMU PID3099／startTicks66092994、全窗 2430.22 秒、QEMU0／QMP SHUTDOWN；一次身份请求 8261 ms 返回 HTTP200，9 条同钟记录齐全，未见首败、API 重启或外层 OOM。准确容器已定向收尾并核不存在。完整来源、同次中断接续、[95 成员原件](../../reviews/ta01-product/amd64-api139-clock-a.json)及剩余缺口见[新 A 执行记录](amd64-api139-clock-a.md)。

本次无故障样本不能补旧 139 的因果链。本次及旧许可均已消耗；B、MCP、矩阵、CI、成果审及合入未追加。现有证据仍不足以安全修改产品，P1-1 保持闭合，P1-2 的 API139／MCP139 分别未闭，PR229 继续 draft，当前停回裁定关口。

## 上轮反馈关口：只读分析与待裁定方案

用户确认 970565f9 及唯一 6 GiB 窗口终态后，本轮仅核已有材料并提交[下一步方案](amd64-api139-next-gate.md)。准确源码、容器不存在及限定路径核查表明：本次原 core 只存在于已关闭的匿名 memfd，没有可用离线 core 或 GDB 会话原文；保留的是安全元数据和公开二进制。未据公开帧选择产品修复。推荐另行裁定一次 A 的同钟／早期首败取证；B 在线 GDB 及其新增期限单列待批，均未实施。原许可已消耗，P1-1 保持闭合，P1-2 未闭，最终门禁及 PR draft 保持。本轮不运行 VM、MCP、矩阵、CI、成果审或合入。

## 2026-10-20 新会话接续

当前交付分支已改为 `tds/conv-01a1572a-7aeb-7b6d-b7e8-83e89c2b723d`。先核并保全旧树 `.tmp`、同次账本及原准备容器，再快进接入 PR228 实际 `1a2e562f`。恢复前 43 个安全原件及完整哈希清单见[保全索引](../../reviews/ta01-product/recovery-2026-10-20.json)，实际路径、授权及本次唯一 API 窗口见[恢复记录](recovery-2026-10-20.md)。

本次 6 GiB QEMU 已于 `2026-10-20T02:47:22.066748+00:00` 实际启动，2540.87 秒后自然终态，QMP SHUTDOWN／QEMU0，未达原期限。最终回执为一次首次身份尝试、31,296 ms 后 RemoteDisconnected；准确 API die139／重启一次，外层无 OOM。受限 core 元数据定位 IC::UpdateState+128，原 GDB 超时，不能据公开位置认定根因或请求触发关系。完整[64 成员结果索引](../../reviews/ta01-product/amd64-api-crash-window-a-6g-once.json)及恢复记录保留边界、命令、资源和收尾证明。

唯一容器已按完整 ID／owner 收尾并核不存在，未重试或继续 MCP 业务窗口。下文外层 4 GiB OOM、旧分支和曾经待批的文字均保留历史来源，不能覆盖最新批准或推成本次结果。P1-1 已复审闭合，P1-2 仍未闭，当前停回关口，不送审、合入或宣称完成。

## 当前状态与来源

受测 head 为 `c7cf68aaf279f771a2022d37d69b5651cdb66ace`，parent 为 `718c03408fe8b975917062bb1322eaf36c51c79c`。CI570／run39169353227 已自然终态，17 个 job 全部 success，Required117818842379 成功。三画像原件及新增撤回断言已核；P1-1 已由本会话收到的正式复审反馈确认闭合，未发现新增 P0／P1；P1-2 旧 API139／MCP139 仍未闭。PR228 保持 draft，不合入或发布。

CI570 的归档收尾已提交为 `ef372816e518e86530f11708739feaaa51ce5bff`，当时原取证问题尚未答复，也没有新诊断 VM。用户本次已对该原问题回答“先取API窗口（推荐）”，仅批准已入库方案 A 的一次窗口。准确执行结果在下节单列；没有重问、复制问题、改产品、重跑／取消 CI 或追加矩阵。CI 原件核验来源于执行者；P1-1 闭合另外来源于本会话正式复审反馈，不能把两者混作同一结论。

本轮支持范围仍为 Linux amd64 三画像，PG／Redis／S3、外置 Runner、原鉴权／资格／事件／通知／事务保证保持。ARM 服务端延期，连接器既有双架构不变。没有迁移、REST／MCP／事件合同变化，没有更换产品 Node／QEMU／guest、资源、设备或任何产品期限。

产品修正开工时本地与 PR 均为 718c034，main 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。本轮收尾重新读取本地与 PR，均为 c7cf68a，工作树起初干净。未操作共享缓存锁、旧树或其他远端。修正属于 c7cf68a，不倒填到 8ff1f8b 或 CI568。

## 本次 API 窗口：外层 OOM，取证不完整

本轮开工及 PR 资料 head 为 `ef372816e518e86530f11708739feaaa51ce5bff`。用户已批准原方案 A，准确批准正文及该提交下的方案 Git blob 已保存。唯一一次执行命令为 `python .tmp/ta01-resumption/api-crash-window-a/execute_once.py`；它调用专用容器内 `python3 /opt/api-window/run_window.py`。VM 总窗上限 9000 秒，外层命令 9030 秒仅作清理后备，不是 VM 或产品延长许可。没有第二次 VM、MCP 窗口或矩阵。

[完整安全索引](../../reviews/ta01-product/amd64-api-crash-window-a.json)及对应 ZIP 保存实际脚本、原件、阶段与收尾。诊断候选为 CI562 的 `9c8bbff749c1d2a52a3e6489dcec02d2d7c859af`，artifact12018130672、manifest `c34733df5e9d45ac6fddbc504a45540779e252071d55fe22eb9bfbee2744028b`。原 ZIP 摘要匹配，31 个文件／分块和 8 角色的 132 个 OCI blob 闭包已核；旧首败的 22 输入、原 commit 对象、六个助手脚本亦匹配 Git。复制到容器的三份新增诊断脚本匹配本轮冻结摘要；这些是取证包装，不是产品源码改动。

| 实际观察 | 结果及边界 |
| --- | --- |
| 固定输入 | QEMU 8.2.2+ds-0ubuntu1.18 及二进制 SHA、guest SHA、4 vCPU／4 GiB／40 GiB 设备保持；阶段确认内核 6.8.0-142-generic、GDB 15.1-1ubuntu1~24.04.1。旧原件的 Docker 29.1.3／Compose 2.40.3 包版本也匹配 |
| 最早安全阶段 | `driver-started` 在 VM 宿主计时 609.61 秒落盘；仅一条阶段回执，无原安装动作、目标请求或最终回执，不能假定阶段后的实际调用数 |
| 终态 | VM 678.69 秒，QEMU 退出 -9；外层 runner 退出 0只表示已写测量结果，不是诊断成功。未达 9000 秒截止，无正常 SHUTDOWN或完整最终回执 |
| 新首败证据 | 准确外层容器有 Docker oom 事件，停止前 Running=true／OOMKilled=true。没有内存峰值或 OOM 受害 PID原件，不外推具体被杀进程的完整机制 |
| 未测 | 实际目标请求数 unknown；API Node身份、运行时二进制摘要、注册覆盖、core 和公开帧均未取得。不能写成未复现 139或证明原调用通过 |
| 停止／收尾 | QEMU已结束后仅余控制 sleep 和收尾 shell；按完整 ID／owner核无宿主挂载／设备／端口，定向 stop、rm并核不存在。随后 PID1 的 die137属于收尾，不是 API139或新的业务结论 |

执行者错误沿用了组件测量的外层 `--memory 4g --memory-swap 4g` 上限，完整 guest 自身也配置 4 GiB。外层的 QEMU 及缓存开销没有合适余量；本次 OOM是测量封装失败的证据。guest 磁盘、应用数据库、密钥及原始服务日志没有导出。没有修改 Node／QEMU／应用、资源或期限后重试。

本次静态核验缩小了“错误候选／脚本／OCI 闭包”这一输入缺口，但目标尚未取得回执，产品实现、依赖运行时与 TCG 三个旧 139解释均未受到有效检验。外层 OOM／QEMU SIGKILL不等于旧 API／MCP SIGSEGV，不能合并根因，也不据此修改产品。

下一项可检验方案已写入[原取证计划的新关口](amd64-crash-investigation-plan.md#本次-a-的实际结果与新关口)：若另获批准，仅将专用外层容器上限从 4 GiB 改为 6 GiB，再取一台同样的 A；guest、产品、原期限和单次停止条件保持，容量不足不启动，不改全局配置或其他项目。该选项尚未批准或执行；本次单台许可已消耗，当前停回关口。P1-1 保持复审闭合，P1-2 继续阻断，不送审、不合入、不发布。

## P1：恢复后提交撤回候选

审查指出：`recover-old` 恢复 A 后仍保留 healthy／pending B；随后 commit 能从 A 读取业务，却把 B 登记到 current。实际安装器的旧源码对照已复现该控制流，不能把旧成功验收当作这个边界已覆盖。

`install.mjs` 现在在启动旧程序前执行：

```js
journal.withdrawnAt ??= new Date().toISOString()
delete journal.validation
await atomicJson(journalFile, journal)
await healthy(previous)
```

提交入口先执行：

```js
if (candidateWasWithdrawn(existing)) fail('INSTALL_CANDIDATE_WITHDRAWN')
```

`candidateWasWithdrawn` 同时识别新 `withdrawnAt` 和历史 `recovery.status=previous-restored`。healthy／pending 的快捷返回也要求候选未撤回。恢复中断仍拒绝提交和快捷重试；显式重新 upgrade 只有在原恢复完成后才建立新 journal，重新备份、迁移、健康和业务验证。原 pending 文件保留作证据，历史 actions 不删除，原 current／数据卷及兼容性检查保持。

[控制流原件](../../reviews/ta01-product/recovered-candidate-regression.json)及对应 ZIP 保留准确旧 Git 字节、修正脚本快照、命令、stdout／stderr 和逐成员摘要。使用真实状态文件，Docker／HTTPS／配置适配器为替身，不是真实部署：

| 对照 | 实际结果 |
| --- | --- |
| 718c034 的 install.mjs | `old-bug-reproduced`：替身运行 A，却登记 B |
| 本次修正 | 恢复前先落撤回状态、直接 commit 拒绝，零业务 HTTP |
| 全新 Node 进程读取原状态 | commit 拒绝，current 仍为 A，零业务 HTTP |
| 恢复在旧程序健康阶段中断 | commit／pending 快捷恢复拒绝 |
| 显式重新升级 | 新 journal，备份／迁移／健康完成后重新验证才能提交 |
| 历史 previous-restored journal | 无新 marker 也拒绝旧提交，允许显式新升级 |

测试使用 Node 的 VM 模块隔离替身，实验性开关仅用于测试子进程，不用于产品 Node。源码实际执行而非复制一套状态机；Windows 仅在替身适配器中模拟 Linux 私有文件 mode。首轮夹具缺 PUBLIC_MCP_ORIGIN 的前置失败已修正，未启动部署或 VM。

`guest.py` 在原兼容升级链加入：B 健康待验证 → recover-old → 两个独立 installer oneshot commit 均报 `INSTALL_CANDIDATE_WITHDRAWN` → 显式重新 upgrade 建立不同 journal 并完成原备份／迁移／健康，随后沿原业务验证。新三项断言为 `withdrawnCandidateCommitRejected`、`restartedInstallerRejectsWithdrawnCandidate`、`explicitReupgradeRevalidates`。CI570 三画像均已真实执行通过。这里的重启拒绝指全新安装器进程读取持久状态，完整系统重启的业务恢复另有证据。各 guest 原 4 vCPU／4 GiB／9000 秒及逐命令期限不变。

## P1：API139／MCP139 仍未闭

**第 2 项仍未修复。用户只批准 A 的一次 API 窗口；B 及追加实验未获批准。**

[最小取证方案](amd64-crash-investigation-plan.md)分别绑定：CI562／9c8bbff 企业 API 的序号 8 install 后首个业务初始化窗口，以及 CI566／541f6ba 团队回退后序号 18 commit／initialize 窗口。两者都发生于普通 amd64 验收；相关应用源码无变化，完整镜像身份不同。现有帧及阴性样本不能区分产品、运行依赖与 TCG。

方案建议一次只批准一个窗口，优先无 core 的 API：单台完整 guest 最多 9000 秒，仅原前缀至原目标动作，失败或完成即停，不重试、不自动继续另一窗口／恢复链／矩阵。原 Node、QEMU、guest、设备、4 CPU／4 GiB、业务 30 秒和正式逐动作期限保持。匿名 RAM core 上限 512 MiB、handler 90 秒、GDB 60 秒及原隐私过滤不变。准确工具或输入不可得即停，不安装宿主依赖或换版本。

方案列明各解释所需的直接证据和反驳条件。相似 V8 帧、单次 TCG 失败／原生阴性、完整镜像不同都不够闭合。不能定位就继续记未知，不自动追加对照。要证明最终环境不适用，须证实实际致因差异并验证旧失败／最终输入修复，不能改口排除既定完整 guest 验收。

## 检查与新候选

本机实际结果：安装单元 18 项通过（含上述真实文件控制流及新进程回归）；Python 60 项通过；guest AST、Node 语法检查通过；`pnpm ci:validate` 通过。接入文档检查和完整命令／字节摘要见[本次检查记录](../../reviews/ta01-product/recovered-candidate-checks.json)。这些不是新候选完整 guest 或五根检查的替代。

产品提交 c7cf68a 正常触发 CI570，本轮只取回其完成结果，没有 rerun。三画像均为普通完整验收，`nativeDiagnostic=false`；不把普通产品验收当作新增崩溃诊断的批准。[终态与来源索引](../../reviews/ta01-product/ci570-observed-status.json)保存 17 个 job 的准确 ID、时序、结果及下表原件绑定。

| amd64 画像 | job | 总耗时／重启（秒） | 原始 artifact ID | 新三项断言 |
| --- | --- | --- | --- | --- |
| [个人](../../reviews/ta01-product/ci570-amd64-personal-full-guest-pass.json) | 117801087468 | 4893.67／249.82 | 12154815070 | 全部通过 |
| [团队](../../reviews/ta01-product/ci570-amd64-team-full-guest-pass.json) | 117801087401 | 4479.22／266.67 | 12154590857 | 全部通过 |
| [企业](../../reviews/ta01-product/ci570-amd64-enterprise-full-guest-pass.json) | 117801087484 | 2891.40／162.34 | 12152749057 | 全部通过 |

三组候选 artifact 均为 `12152451241`，manifest SHA-256 均为 `360e2033a5eb72192c40b2a3a7ee6edec16a464fb58851fa2d8079eefccce98f`。源码 tree 为 `d4e4c1e40e16dc8e05285269716c62426bb41b32`。[生产者索引](../../reviews/ta01-product/ci570-amd64-producer.json)绑定原始 artifact12152047803、完整 manifest 及候选 ZIP 摘要；没有重复下载 427 MB 候选。

生产者及三组各核 23 个发行输入的 Git blob／SHA、原 commit 对象及前后干净源码标识；三组另核六个执行脚本。23 项包含新增回归夹具，不能沿用旧 22 项数量。归档脚本首次沿用旧数量断言而停止；核原件后修正为 23，仅重做离线归档，没有重跑业务。原始 ZIP 均匹配 GitHub digest；每组完整 11 个安全成员按原字节入精选 ZIP，逐成员摘要保存在索引中。

三组均核原固定 QEMU `8.2.2+ds-0ubuntu1.18`、guest SHA、4 vCPU／4 GiB、TCG、退出 0；两个 boot ID、kernel 和 QMP RESET／SHUTDOWN 完整。重启后认证 API、认证 MCP、工件字节及新 outbox 四项证明齐全。完整加密备份、兼容回退、不兼容账本拒绝、独立空目标恢复和原卷保留的原断言继续通过。新撤回断言核当前文件／卷／journal 不变，并要求显式新 upgrade 使用不同 journal、完整备份／迁移／健康和新业务验证。私有 journal、配置、数据库、密钥及磁盘不入库；安全 receipt 与准确 `guest.py` 是这些内部断言的证据，不能冒称已归档私有文件原件。

[Required 与源码门禁日志](../../reviews/ta01-product/ci570-required-source-gates.json)保存安全原字节。lint／typecheck／test 及适用集成、conformance 的完成依据为本次正常 CI 的成功 job；本轮没有在本机重跑五根检查。连接器 ARM 成功只属于其既有范围，不恢复 ARM 服务端交付。受控安装器的同源不同候选验证仍不等于已发行历史程序对或裸 Compose 迁入验收。

本轮 JSON／ZIP 资料按现有策略使用 `[skip ci]` 提交，避免无产品变化又触发全矩阵。受测 head 始终为 c7cf68a；后续资料 head 及准确 PR ref 在 PR 短正文单列，资料 head 没有自身成功 Required。CI570 成功本身不代表 P1-1 正式复审通过。随后已收到正式复审确认 P1-1 闭合；P1-2 仍未闭。

历史 CI568／run39160943688 仅绑定 `8ff1f8bf87b1593ff4833b1ab1358e71f8a23a8b`，17 job／三画像及 Required117791572117 成功；不覆盖新修正，也不关闭旧 139。准确完整对照、原件及资源账本见 [718c034 历史报告](https://github.com/xurunxin/WorkMesh/blob/718c03408fe8b975917062bb1322eaf36c51c79c/docs/plan/ta01-self-hosted-deployment/current-delivery.md)。原生／TCG 各 32 轮、595.16 秒的单次 amd64 样本和旧 ARM 全部记录保持，没有新 VM 或组件小测。

## 文档、资源与完成条件

同次更新安装接入说明的撤回语义、错误码和再次升级步骤；API／MCP 参数没有变化，OPENAPI／Schema 无需修改。按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 与 typography／manual-structure 手检，未安装全局工具。Saved plan 记录例外保持。

新回归只创建归属已证的测试私有目录，均在真实路径校验后收尾；健康单元复用原精确镜像 ID 及 tmpfs／--rm，无新部署。旧树、共享 store／数据／镜像、未知卷和受拒目标保持。测试替身与真实产品、普通 CI 与待批诊断、源码／镜像／guest 指纹分别记录。

两个 P1 都须有闭合依据，最终候选原真实验收、仅 P0／P1 正式成果复审、准确最终 head 最新 Required 齐全且 PR ready 后才可条件合入。本轮不宣称整卡完成，不对外发版、打标签或切生产。
