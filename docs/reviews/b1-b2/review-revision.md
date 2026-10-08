# B1/B2 独审修订记录

本轮修复三项 implementation blocking，保留原已审规划、原检查及来源绑定。三系统 CI、成果复审及 actual main 尚未闭合；本记录不放行合入、不把整项置完成，也不代替 #20 无源码安装验收。

## 逐项实现证据

1. `apps/connector/src/platform-security.ts` 原祖先循环已替换为 `withPreparedDirectory`：包含根的 `chain` 逐级执行 `verifyAncestor(part)`，缺失目录逐层保护创建，移除默认权限的 recursive mkdir。`verifyAncestor` 调用 `trustedPosixDirectory(info.uid, info.mode, process.getuid!())`／`trustedWindowsDescriptor(descriptor.subarray(0, needed[0]), await userSid())`。POSIX owner 仅当前 uid/root，非 sticky 祖先不能对其他用户可写；macOS 检查扩展 ACL。Windows owner/替换权限保守核验，并以 `nativeOpen!(part, 0x20000 | 0x80, 1, null, 3, 0x02000000 | 0x00200000, null)` 固定整条祖先路径到操作结束，阻止写入重解析点与删除/重命名。`path-policy.test.ts` 覆盖 owner、六种危险授权、NULL DACL、inherit-only 和 sticky 边界；平台测试真实证明安全祖先/连接器不可重命名，故意放开的不安全祖先可以重命名及同名替换，但连接器拒绝进入。Windows 第二用户测试与正对照仍须真实执行，不用 Linux 结果替代。
2. `apps/connector/src/cli.ts` 中固定扣留 64 字符的函数已移除，重导出 `client-process.ts` 的脱敏器。新逻辑为 `const suffix = prefix.exec(pending)?.[0] ?? ''`，接着 `write(pending.slice(0, pending.length - suffix.length))`，只保留可能组成未完成凭据的后缀。安全提示立即显示。每种凭据形态的全部 46 个切分位置、真实管道子进程提示后才输入再退出均有断言。
3. `cli.ts` 的无条件管道启动已替换为 `return launchClient(command, args, token)`。`client-process.ts` 在 `if (process.stdin.isTTY && process.stdout.isTTY)` 内使用 `pty.spawn`；stdin/stdout/stderr 为真实 TTY，传入初始尺寸、监听 resize、转发原始输入/Ctrl-C，终端合并输出依然脱敏。输入或输出重定向时才使用分别脱敏的管道。新增固定依赖 `node-pty@1.1.0`；Windows 使用包内 ConPTY DLL。CLI 完成后恢复原始模式、移除监听、排空输出并退出自身进程，释放仍有引用的 ConPTY 输入句柄，避免再次 kill 已退出 PID。独立终端驱动实际验证 91×31 → 103×37、提示后应答、Ctrl-C 到达、退出码和跨块秘密脱敏；系统平台 CLI 还校验真实系统存储注入的令牌摘要。
4. 三系统 `Connector native storage` 和 `Required CI` 仍是 blocking。本机没有 macOS，Windows 第二用户环境未提供；缺夹具是失败而不是 skip/通过。没有该修订提交对应的成功 CI 时不能放行。

## main 整合与检查绑定

本轮首次平台 fetch main 为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`。Chief 19:10 指出 A1 已 actual main；随后平台再次 fetch 实读 `96e724858e692d262107c34db50b40c3ae7c122c`。先让当时运行的健康长命令结束，再正常合并到本会话分支，没有新建分支、没有重做规划。AGENT_PROTOCOL/OPENAPI 自动合并无冲突，A1 server、contracts、路由生成和 Schema/DB 与该 main 相同，保留 Installation Token 在身份解析前拒绝 Human-only 的安全修订。

`current-source.json`／`verify-current-source.mjs` 保留上一轮历史语义；当前修订另用 `revision-source.json` 与 `verify-revision-source.mjs`。每项新检查记录运行时工作树 SHA-256，Git blob 另记；source-before/after 不同的旧基点运行不冒称最终组合已测。仅产品/测试源码变化与 main 影响触发适用复验，证据文档更新不重跑整套。

原 `implementation-report.md` 的运行编号及 OS 缺口保留历史，不用修改旧报告数字冒充新结果。当前源码清单由 `verify-revision-source.mjs --capture` 生成，逐运行列出精确差异；其中 `finalSource` 只说明相关源一致，不把失败的平台检查冒作通过。

## 实际检查及补查范围

所有运行使用独有临时 Node 22.19.0（与仓库 `.node-version` 一致），不升级机器 Node/daemon；运行脚本只改变子进程环境，退出时删除自己的运行副本。下表原日志的逻辑路径由 `evidence/raw-evidence-index.json` 精确解析至 `raw-evidence.zip`，归档前后逐字节核对。

| 运行 | 实际结果 | 源码及范围说明 |
| --- | --- | --- |
| `revision-static-01` | 根 lint/typecheck/test、构建、CI policy、route、Skill pin 均 exit 0；单元 1699 通过、2 既有 skip | 历史基点 1078bbc；期间有连接器源码变动，随后 main 整合，不能声称此轮覆盖最终组合 |
| `revision-unit-09` | 连接器类型检查成功、41 单元通过 | 最终连接器源，但 contracts 仍旧 main；最终 Linux 平台运行再次验证 41 项 |
| `revision-main-impact-01` | connector/contracts/API 类型检查、184 contracts 单元、route、CI policy 成功 | 已整合 main96e7248；之后只改 API 集成夹具临时根；该文件不在 contracts 单元执行范围，API 类型及集成另补查 |
| `revision-final-types-01` | connector build/typecheck、API typecheck 全部 exit 0 | 包括修正后的 API 集成夹具；源码前后稳定 |
| `revision-linux-03` | 6 平台项、41 单元全部通过 | 最终连接器及新 main；真实 Secret Service 跨进程/后端重启、nobody 读取与重命名拒绝、可读/可替换正对照、真实 CLI 与 PTY |
| `revision-windows-02` | 3 平台项通过、2 失败 | 最终源；实际 Credential Manager、ACL、完整协议及 CLI/PTY 通过；第二用户未提供，读取及重命名测试失败，不能记为 skip 或完成 |
| `revision-main-integration-02` | 完整 `pnpm test:integration` exit 0：329 通过、3 既有 skip | DB77、API174+1skip、worker78+1skip、recovery1skip；含原 stage5 重放30项、连接器6项、A1十四项。默认未启用的 recovery 不计通过 |
| `revision-main-e2e-01` | Web build exit 0、完整 `pnpm test:e2e` 67 通过 | 集成结束后顺序执行；源码前后稳定，健康长命令未中断 |

最后一次源码影响补查为 `revision-affected-final-01`：connector/contracts/API lint 全部 exit 0，API 单元174项通过，补齐 main server 增量及后续连接器/测试夹具变化的影响，不因证据文档变化重跑整套。具体退出码及数量见该运行的 `checks.json` 与归档日志。旧根检查加上述适用补查保留各自精确源绑定，仍待当前修订提交的正式 Required CI。

收尾归档共123条日志路径、89个内容成员、8378187字节，逐字节验证通过；归档后重建资源账本仍得到12个容器、22个运行临时路径、432个测试临时目录全部不存在，没有因删除已保全原日志而丢失资源事件。

首败全部保留：`revision-unit-01` 至 `06` 暴露 ConPTY 提示/输入 socket 退出问题，之后用包内 ConPTY DLL、独立终端驱动和 CLI 输出排空后退出修复；`revision-linux-01` 的后端重启后删除失败原件保留，后续 `02`/`03` 成功不覆盖首败；`revision-main-integration-01` 因 Windows TEMP 祖先不安全导致连接器6项失败，改为受保护 APPDATA 临时根后完整 `02` 重跑通过。Windows 两轮缺第二用户的失败也保留。

## 平台及合入门禁

本机为 Windows 普通权限运行环境，不创建其他业务用户，不假设能执行 CI 的第二用户夹具；本次已提交的 Windows CI 脚本创建独有用户并核对 SID，PUBLIC 目录可读正对照、读取/重命名负例和可替换正对照均不可跳过。macOS 实际 Keychain/权限/跨用户验证本轮未运行。Linux 容器实测不代替三系统 GitHub CI。当前分支查询未发现 workflow run；CI workflow 的分支 push 仅匹配 main，普通会话分支推送本身不保证触发。须经正常 PR 流程获得当前修订 head 的三系统平台 job 与 `Required CI` 成功，并完成成果独审及 Chief 确认后再合入；本轮不绕行自动合并，不以 A1 的 CI388 或历史 CI 代替。

零 Schema/迁移变更，服务端与 contracts 产品源相对 main96e7248 无差异；只调整连接器 API 集成测试夹具的临时目录来源。main 的配置就绪 query、`workKind=repository|non_repository`、生成路由和 Installation Token 的 Human-only 前置拒绝完整保留。演示仍为取得管理员清单/配对码后执行 `connect --expect`，再用 `run -- <client>` 启动；TTY 入口现在保留真实交互、尺寸和 Ctrl-C，重定向路径继续脱敏。无源码分发验收仍由 #20 负责。

## 本轮资源收尾

完整 ID、绝对临时路径、原登记事件和存在性复查见 `evidence/revision-cleanup.json`；单轮账本同时保存在各运行目录。Docker 仅对以下本轮专属对象执行 `docker rm -f -v <id>`，保存脱敏服务日志后删除自身匿名卷，再通过 `docker inspect <id>` 的 No such object 验证；没有 global prune，没有专用镜像或网络，没有删除持久业务卷。

| 资源 ID 前缀 | 名称 | 结果 |
| --- | --- | --- |
| `2943cdee30fb` | `b1b2-01a11ac2-linux-native-b45510d5` | 已删除并复查不存在 |
| `4554f37cee63` | `b1b2-01a11ac2-linux-native-5c1fef3f` | 已删除并复查不存在 |
| `8bc2a789aeaa` | `b1b2-01a11ac2-linux-native-6f940512` | 已删除并复查不存在 |
| `2b38b9cf480b` | `b1b2-01a11ac2-pg-7e28db2f` | 已删除并复查不存在 |
| `1d192f8a22e8` | `b1b2-01a11ac2-redis-7e28db2f` | 已删除并复查不存在 |
| `5384daa6033d` | `b1b2-01a11ac2-s3-7e28db2f` | 已删除并复查不存在 |
| `28067124fcf4` | `b1b2-01a11ac2-pg-e3ba6ad6` | 已删除并复查不存在 |
| `325a11bfb94f` | `b1b2-01a11ac2-redis-e3ba6ad6` | 已删除并复查不存在 |
| `3c4e2cc5df06` | `b1b2-01a11ac2-s3-e3ba6ad6` | 已删除并复查不存在 |
| `46c510ffe505` | `b1b2-01a11ac2-pg-bb9e4731` | 已删除并复查不存在 |
| `965c5e21ecab` | `b1b2-01a11ac2-redis-bb9e4731` | 已删除并复查不存在 |
| `7b59f06f9ee3` | `b1b2-01a11ac2-s3-bb9e4731` | 已删除并复查不存在 |

运行临时 Node、Linux 测试副本和成功 Playwright 运行目录均按绝对边界核验后删除；432 个记录到的测试临时目录已全部复查不存在。异常 worker 留下的空目录 `C:/Users/xurx/AppData/Roaming/workmesh-b1-b2-test-sOrnjO` 经归属/边界/空目录元数据保全后正式删除，见 `revision-failed-fixture-cleanup.json`。E2E 登记的37个进程用 PID 加 CreationDate 核验全部退出，见 `revision-main-e2e-01/processes-after.json`；不凭重用 PID 杀其他进程。系统秘密测试仅登记随机引用，finally 删除，不归档令牌。

保留当前工作区 `C:/Users/xurx/.tds/workspaces/01a11ac2-a0a9-7ef6-bd48-3bb37c21a301` 与旧工作区 `C:/Users/xurx/.tds/workspaces/01a1187a-f0f1-74d9-a5e7-0022c903a6e6`：尚未满足连接器 actual main、全部成果保全及无人运行的 worktree 清理条件。保留共享 postgres/redis/rustfs/node 基础镜像及必要证据。`apps/connector/dist` 上一轮删除被自动审批拒绝（返回 `blocked by policy`）；本轮构建更新后保留、不入 Git，不冒清理完成。
