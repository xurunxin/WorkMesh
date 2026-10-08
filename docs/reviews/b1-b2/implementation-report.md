# B1/B2 产品实现与交付门禁

已按历史独审计划恢复并实现连接器；本文件是当前执行记录，历史规划材料保持原义。尚未满足全部 OS 验收、成果独审、最新 Required CI 和 actual main 门禁，整项未完成。

## 来源与整合

当前构建分支为 `tds/conv-01a11ac2-a0a9-7ef6-bd48-3bb37c21a301`。开工与收尾通过平台只读 git 工具 fetch main 后实读 `1078bbcd527550bfabee73093b7ffd0032d3fd24`；已包含 D1a。正常整合已审历史 `b80593e9918ac7ce05465fd0ac640c809753ac5a`，保留祖先与完整规划/来源/测试映射，没有新建分支或另建 todo。

原 workspace `C:/Users/xurx/.tds/workspaces/01a1187a-f0f1-74d9-a5e7-0022c903a6e6` 只读盘点，有 staged D1a 和未提交的连接器骨架、锁文件。六个骨架文件与旧锁文件原字节保全于 `recovery/prior-connector-source.zip`；盘点见 `recovery/inventory.json`。恢复骨架后扩展产品实现，不把仅远端计划推断成无本地成果，也不把 dirty 文件当远端已交付。D1a 以当前 main 为准，旧 dirty 工作区和日志未删、未 force 清理。

已审 savedplan 来源仍为 `doc:m7WeSHWZt1Bv3FZwYlnlv`，未提供的平台版本字段为 null。正文 UTF-8 SHA-256 为 `72e6fcb9d46a3f433291db4b1db3e351c243bc38202fdc884d463f5d50341230`；可审完整计划文件 SHA-256 为 `71a0e7845b205f60ecc29b91e66bea2f2086004c16212c03034a51fcbb5b6352`。本轮从历史 Git blob 精确核对并恢复 LF 字节，添加窄范围 eol 属性防止 Windows 展开改变字节；不重做规划或冒称旧 verify-plan 脚本的仅文档范围可验证当前产品。用户/Chief 同步的 16:38 独审、16:39 放行和 13:46 实施确认持续有效。

当前完整卡正文及精确来源另存 `current-spec.md` / `current-spec-source.json`，包括执行收尾清理要求；它们不替换历史 R1 源快照或原源 SHA。

## 实现范围

`apps/connector` 新包提供严格清单、敏感 pending、原生跨进程锁与实际权限验证、系统秘密存储、可信 Skill 原字节验证、MCP 完整握手、独占提交 journal 与补偿、隐藏/扫码输入和启动注入。全部网络与身份验证成功后才写秘密及正式配置，原配置/引用不覆盖。发现无后端时失败，Linux 显式禁用 keyutils 回退。

真实子进程验证两进程竞争和八阶段 SIGKILL。新增独立 API 集成文件保留原 Stage 5 文件原样，验证稳定重放、事务回滚、窗口/擦除和撤权/过期/overlap。原生平台测试补实际 CLI、秘密跨进程读取、权限和不同用户拒绝；CI 接入 Linux/Windows/macOS Required CI 矩阵，失败、取消或意外跳过不放行。

规范说明同步到 `AGENT_PROTOCOL.md`、`OPENAPI.yaml` 和 ADR 0079。零 Schema/迁移、零新端点/DTO/事件、不改服务端运行时或凭据生命周期。计划中的 API 用例拆到独立 `stage5-connector.integration.test.ts`，便于完整保留原重放断言。新增最低限度的 Web 定时器清理修复：全仓单元发现审批后刷新在组件卸载后触发，修复卸载取消并补对应断言，未调整超时或断言来掩盖失败。

## 实际检查

| 检查 | 实际结果与证据 |
| --- | --- |
| 连接器 build、全仓 lint/typecheck/test | 最终 `static-04` 全部退出 0；单元 1694 通过、2 个既有可选 skip，连接器 36、Web 779 |
| 原/新 Stage 5 定向集成 | `focused-05` 36 通过（原 30＋新 6）；当前组合还由完整集成验证 |
| 根 test:integration | `integration-02` 315 通过、3 个既有条件 skip，退出 0；应用实现相关源稳定。随后仅增强平台权限测试夹具，由平台/单元另行复验；`integration-01` 混合运行源作为历史保留 |
| 根 test:e2e | `e2e-01` 67 通过、退出 0；原始浏览器状态由 finally 删除，不纳入 Git |
| Linux 原生平台 | 最终 `linux-native-04` 5 平台＋36 单元通过；实测 Secret Service/daemon 重启、目录/文件拒绝与放开后可读正对照、CLI；容器/副本已删 |
| Windows 原生平台 | 最终 `windows-platform-04` 3 通过、1 失败；当前用户专用实际 ACL、Credential Manager 跨进程与 CLI 通过；第二用户未配置，跨用户测试失败，不算通过 |
| macOS 原生平台 | 本机不具备 macOS，未运行；Keychain/权限验收待 CI 实测 |
| CI 策略、路由、Skill pin | `policy-02` 成功；Required CI 聚合拒绝平台矩阵失败/取消/意外 skip，策略单元 13 通过；完整稳定源也由 `static-04` 检查 |
| 证据、来源、秘密边界、迁移与差异 | 看最终 `current-source.json`、源验证脚本、日志归档索引与资源清理账本；只记录实际执行结果 |

日志按执行时脱敏后原字节无损归档为 `evidence/raw-evidence.zip`，索引精确映射原路径/版本/字节类型；用 `node docs/reviews/b1-b2/archive-evidence.mjs` 验证。已保全的失败记录覆盖限流和 loopback 夹具、过期投影夹具、PowerShell 模块、定时器泄漏及缺跨用户夹具，不覆盖失败结果或把未测写为通过。第一轮 fixture features 缺字段、最初原生指针解码崩溃与早期 pnpm 入口失败仅保留了本轮对话/部分盘点及清理回执，没有完整原始检查 stdout 文件，明确记为原日志缺口，不伪造原件。

## 使用与开放门禁

演示步骤和无秘密清单见 `apps/connector/README.md` / `examples/expectation.json`。管理员给出预期清单与完整码后，单次 connect 完成全部验证；中断重跑用同身份；run 从系统秘密引用注入客户端。仓库 pnpm 命令不是版本化发布，B3 和无源码分发范围仍交后续任务。

本地验证不替代当前提交的成果独审、最新 Required CI 和实际 main 落地。Windows 跨用户及 macOS 缺口仍开放，未声称目标设备矩阵完成。可从 Todos 消息栏的 AI 审核入口复核完整已审计划、当前产品 diff、逐项映射和源绑定；Chief 确认后才按后置门禁放行。

清理是交付收尾的一部分。实际容器 ID、临时路径、系统秘密引用和服务地址均记录在各轮 `resources.json`、脱敏日志及最终 `cleanup.json`。不做 global prune，不删除其他任务资源或持久数据；当前构建及旧 dirty 工作区保留到 actual main、证据完整保全且无人运行后再正式清理。

## 最终源与清理回执

运行时源 ID 为 `808e85dcec1aaa3840951aa67bd84152d49b50b7125180b66b36bb39be4d3705`。`current-source.json` 的 86 个文件同时记录运行时工作树字节和实际 Git blob，检查按适用范围绑定该源；平台夹具增强不冒作 API/E2E 已执行的测试。原工作区用 `node docs/reviews/b1-b2/verify-current-source.mjs`；新检出因 LF/CRLF 展开差异可用 `--git-only` 验证实际 Git 字节，保留历史运行字节的原义，不重新声称已执行。

已登记 28 个本任务容器，逐 ID `docker inspect` 核验均不存在；四份 Linux 独立字节副本及 E2E 浏览器状态目录也已删。日志 ZIP 保全 67 个原路径、52 份唯一字节内容，共 4,270,139 原始字节，逐字节读回成功。6 个已记录 Windows 测试秘密引用经系统存储只读复查均不存在；登记前的引用/临时路径缺口明确保留说明，不补造 ID。

| 资源/路径 | 实际收尾结果 |
| --- | --- |
| 各次 `b1b2-01a11ac2-*` 容器 | [完整 28 个 ID 及删除核验](evidence/cleanup.json)；全部不存在，未操作其他任务容器 |
| `workmesh-b1-b2-node22-f257e2a2-8336-4980-b035-fc312b4dffbb` | 校验用 Node 22 与下载 tgz 在专用系统临时目录；所有检查结束后定向删除，未更改机器 Node 配置 |
| `workmesh-b1-b2-probe-3d5a81e0-dd6f-469c-8592-8250b9153522` | 原生失败非秘密探针目录，盘点为空后删除 |
| 本轮单元/平台/CLI 临时路径 | 414 条创建/清理/关闭事件留在账本；最后只读扫描 `workmesh-b1-b2-*` 无残留 |
| API `54148`、`127.0.0.1:3101` / Web `127.0.0.1:3100` | E2E 结束后无监听，状态目录不存在；没有猜 Web PID |
| 公共基础镜像 `postgres:16-alpine`、`redis:7-alpine`、`rustfs/rustfs:1.0.0`、`node:22.19.0-bookworm` | 完整镜像 ID 见账本，保留公共镜像；没有构建任务专用镜像，没有 global prune |
| 当前 workspace、`apps/connector/dist` 和旧 dirty workspace | 保留当前构建及未满足清理门禁的旧工作；删除 dist 动作被自动审批检查拒绝，仅返回 `blocked by policy`，未提供具体原因，未绕过限制 |

`evidence/node-runtime.json`、`probe-cleanup.json`、`secret-cleanup-verification.json`、`e2e-01/services-observed.json` 和 `cleanup.json` 记录实际路径、引用、时间及状态。执行夹具环境未写回机器配置；没有升级或操作 tds daemon。失败检查原件和当前产品均保留供成果独审，整项仍不标完成。
