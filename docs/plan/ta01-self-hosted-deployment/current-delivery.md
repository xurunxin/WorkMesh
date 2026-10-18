# TA01 当前交付与审查修正报告

## 当前状态与来源

受测 head 为 `c7cf68aaf279f771a2022d37d69b5651cdb66ace`，parent 为 `718c03408fe8b975917062bb1322eaf36c51c79c`。CI570／run39169353227 已自然终态，17 个 job 全部 success，Required117818842379 成功。三画像原件及新增撤回断言已核；P1-1 正式复审尚未完成，P1-2 旧 API139／MCP139 仍未闭。PR228 保持 draft，不合入或发布。

本轮只归档已完成的验收并更新资料。问题 `q-E6FuFFokBxxs6UpR6K9vC` 尚未收到用户答复；本次收尾指令不是诊断授权。没有启动 API／MCP 诊断 VM、重问或复制该问题，也没有改产品、重跑成功 CI、取消 job 或新增矩阵。以下结果来源于执行者本轮 GitHub API 和原件核验，不是正式独审结论。

本轮支持范围仍为 Linux amd64 三画像，PG／Redis／S3、外置 Runner、原鉴权／资格／事件／通知／事务保证保持。ARM 服务端延期，连接器既有双架构不变。没有迁移、REST／MCP／事件合同变化，没有更换产品 Node／QEMU／guest、资源、设备或任何产品期限。

产品修正开工时本地与 PR 均为 718c034，main 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。本轮收尾重新读取本地与 PR，均为 c7cf68a，工作树起初干净。未操作共享缓存锁、旧树或其他远端。修正属于 c7cf68a，不倒填到 8ff1f8b 或 CI568。

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

**方案已形成，不代表第 2 项已修复。批准前不启动新的诊断 VM。**

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

本轮 JSON／ZIP 资料按现有策略使用 `[skip ci]` 提交，避免无产品变化又触发全矩阵。受测 head 始终为 c7cf68a；后续资料 head 及准确 PR ref 在 PR 短正文单列，资料 head 没有自身成功 Required。CI570 成功不代表 P1-1 正式复审通过，更不关闭 P1-2。

历史 CI568／run39160943688 仅绑定 `8ff1f8bf87b1593ff4833b1ab1358e71f8a23a8b`，17 job／三画像及 Required117791572117 成功；不覆盖新修正，也不关闭旧 139。准确完整对照、原件及资源账本见 [718c034 历史报告](https://github.com/xurunxin/WorkMesh/blob/718c03408fe8b975917062bb1322eaf36c51c79c/docs/plan/ta01-self-hosted-deployment/current-delivery.md)。原生／TCG 各 32 轮、595.16 秒的单次 amd64 样本和旧 ARM 全部记录保持，没有新 VM 或组件小测。

## 文档、资源与完成条件

同次更新安装接入说明的撤回语义、错误码和再次升级步骤；API／MCP 参数没有变化，OPENAPI／Schema 无需修改。按仓库固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 与 typography／manual-structure 手检，未安装全局工具。Saved plan 记录例外保持。

新回归只创建归属已证的测试私有目录，均在真实路径校验后收尾；健康单元复用原精确镜像 ID 及 tmpfs／--rm，无新部署。旧树、共享 store／数据／镜像、未知卷和受拒目标保持。测试替身与真实产品、普通 CI 与待批诊断、源码／镜像／guest 指纹分别记录。

两个 P1 都须有闭合依据，最终候选原真实验收、仅 P0／P1 正式成果复审、准确最终 head 最新 Required 齐全且 PR ready 后才可条件合入。本轮不宣称整卡完成，不对外发版、打标签或切生产。
