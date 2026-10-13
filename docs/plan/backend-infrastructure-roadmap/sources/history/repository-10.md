# B-ship 无源码安装验收设计

本次按[产品规格](product/current-spec.md)与[产品计划](product/implementation-plan.md)执行完整产品验收。用户已采用现有 hosted 双架构＋TCG。历史 KVM 条款与研究阶段说明保留来源，已被本次环境裁定覆盖；研究不能代替发行安装 DoD。

## 输入、执行者与结果规则

输入为[当前规格](spec.md)、[实施方案](implementation-plan.md)、`docs/reviews/r1/test-coverage.json` 中 `seqNum=20` 的全部内容，以及当前协议、OpenAPI、Schema 和已接受 ADR。后续实际执行者在派发时由 Chief 落实；这里不冒称其他 Agent 已任命或已审查。

首批 Linux amd64、arm64 都必须运行。Windows/macOS 保留现有 native storage 和 CLI 平台回归；它们本批没有发行安装验收承诺。新结果必须区分未运行、不适用、被 CI 正确分类跳过和实际通过；任何必需验收不得静默 skip。

保存准确源码 head/tree、产物版本/hash、CLI `--version`、目标 OS/kernel/架构、glibc/libstdc++、RAM、磁盘、D-Bus 与 Secret Service 身份。分别绑定 CI 的 `head_sha`、实际 checkout SHA、parents/tree 和 VM 运行原件；复用 `scripts/capture-connector-source.mjs` 的前后源码绑定原则，不能仅以 PR head 代替各 runner 的实际检出。

## 原验收与 DoD 全量去向

原文位于 [R1 测试映射](../../reviews/r1/test-coverage.json)。原 DoD UTF-8 SHA-256 为 `e47bb41e1f33ce1b172c48b81f526ddaf34a7362a55db8b388b620c3edbfd957`；当前规格仍完整保留。本表逐项承接，原有未勾选状态保持。

| 原项 | 原要求 | 后续证明 | 本轮状态 |
| --- | --- | --- | --- |
| `todo-20-T1` | 带版本分发产物在不含仓库源码的目标 Lite 环境中可安装和启动。 | 双架构 guest 无源码/Node/pnpm，离线安装、不同 cwd 启动及 `--version`；R1-20-1 | 两架构完整通过快照见产品记录 |
| `todo-20-T2` | 用安装后的命令完成连接器既定黄金路径，完整校验一步不减。 | 下节真实 API/MCP＋签名 Skill＋OS store；R1-20-1 | 两架构完整通过快照见产品记录 |
| `todo-20-T3` | 既有错误/恢复机制与秘密边界在安装场景中成立；文档可直接指导恢复。 | R1-20-2/3/4/6/8/9、B3 错误消费及随文恢复步骤 | 双架构安装、恢复与秘密原件已保存；正式独审待 |
| `todo-20-T4` | 版本、设备环境、安装命令与实际结果均有仓库内证据；未完成对外发布时明确区分已验证产物与已发布版本。 | 准确清单、命令、目标条件、原日志和收尾；未发布标识 | 双架构通过工件及原件已保存；未对外发布 |
| `todo-20-T5` | 所有适用仓库必需检查与已裁定验收通过，blocking/high 已解决。 | 最新 Required CI、新安装验收、正式独审和 Chief 确认 | 最新 Required CI 与正式成果独审仍待；只处理 P0/P1 |

依赖仍为 G1、P1、R1、合并后的 B1/B2、B3；本卡吸收 B4。`stale revision` 和 `webhook/job replay` 不适用的解释不能取消连接器已有恢复、服务端权限和重放断言。

## 九类适用性

安装专项已创建，入口为 `apps/connector/test/install.integration.test.ts`，使用独立 `vitest.install.config.ts`，设置非空测试、串行执行并显式开启本任务夹具。控制端可以使用源码测试工具，目标 guest 只能接收发行物、无秘密清单和已构建的测试客户端。不能在 guest 用 `tsx src/cli.ts` 替代已安装命令。

| R1 标识与类别 | 适用性与必需断言 | 既有机制与后续责任 |
| --- | --- | --- |
| R1-20-1 happy path | 两架构干净目标离线安装、启动、完整连接；错误架构/摘要/缺 native/helper/缺动态库失败；不同 cwd 正例 | `cli.main`、`connect`、`verifyPairing`、`validateBootstrap`、`SystemSecretStore`；新增安装用例 |
| R1-20-2 unauthorized actor | Team、principal、Agent、Connection、能力、profile、Skill 和指纹不匹配均拒绝；跨用户秘密读取/替换拒绝；打包不放宽权限 | `platform-security`、`path-policy`、协议严格合同；Linux 安装用例＋现有三系统 native 测试保 Windows ACL |
| R1-20-3 invalid state transition | 已消费码换新 key、窗口外、撤销、过期、旧 overlap 拒绝；旧配置保留，错误给准确安全下一步 | `getPending`、`validateCurrent`、`formatConnectionError`；真实服务端夹具 |
| R1-20-4 duplicate idempotency key | 丢响应后原 pending 使用相同 key/body/origin/user-agent；同 key 异体/上下文冲突，不发行第二凭据 | `pending.ts`、真实 API encrypted replay；捕获摘要和相等布尔值，不记录 body/令牌 |
| R1-20-5 stale revision | 不适用：发行版本不是领域 revision，本批不新增 If-Match 接口 | 管理员撤销/旋转夹具仍走现有 If-Match，不删既有 stale 测试 |
| R1-20-6 transaction failure | 归档/暂存/验证/切换失败保留旧命令；秘密写入/读回/补偿失败或 config 替换失败按原提交点恢复 | 安装助手＋`commitConnection`/`recoverCommit`；安装真实故障、既有提交 checkpoint 测试均保留 |
| R1-20-7 webhook/job replay | 不适用：安装包不新增 job/webhook | 已有后端 outbox/job 测试继续由根 integration/worker 检查运行 |
| R1-20-8 concurrent request | 两个已安装 connect 进程共享一个 pending 身份与一次提交；双安装、升级×connect、版本切换不改未决身份 | 安装 OS 锁＋`withDirectoryLock`；实际子进程并发与屏障，不用顺序重跑代并发 |
| R1-20-9 server restart/outbox recovery | guest 完整重启和真实 API/MCP 重启后窗口内恢复，窗口外人工重新配对；Secret Service 重启持久性；日志无秘密 | 原生 VM、`recoverCommit`、服务端 restart 夹具；分别记录设备/服务/进程重启 |

`connect.test.ts`、`client-process.test.ts`、`path-policy.test.ts`、`integration/native-storage.test.ts` 和 `integration/cli.test.ts` 的既有断言保持。真实后端流程复用 `apps/api/integration/stage5-connector.integration.test.ts` 的 `buildApp`、`createWorkMeshMcpHttpServer`、授权信封、网关丢响应和重启方式；目标端使用真实 `SystemSecretStore`，不能用该文件的 `MemoryStore` 冒 OS 后端通过。

## 干净目标与黄金路径

1. 两架构分别使用现有 `ubuntu-24.04`、`ubuntu-24.04-arm` 原生构建机和独有 TCG guest，显式 `-accel tcg`，不要求 KVM 或注册新 runner。构建机完成受控 node-pty 编译、准确 headers/toolchain 与归档 ELF 摘要。guest 无源码、workspace 或宿主 HOME 挂载；实查 node/pnpm/tsx/node-gyp 不可用，连接器安装运行不依赖 Python。
2. 目标预备同一测试用户的 D-Bus 和可解锁 Secret Service，使用独有 XDG 数据/运行/配置目录。真实密钥环解锁输入只通过 stdin，密码不入命令、环境文件或日志。检查实际路径/owner/mode/祖先，不改变用户共享 keyring 或 ACL。
3. 只转移受审归档、manifest、SHA256SUMS、安装脚本、同架构安装助手及其闭包、无秘密 expectation 和已构建的测试客户端。先阻断安装阶段出站访问，执行实施方案安装样例；安装不得尝试网络或调用包管理器。固定安装目录并运行 `--version`。
4. 控制端用独有 test 数据库启动真实 API、MCP 与必要 worker；安装协调模式开关与鉴权头按现行合同设置。用管理员 Cookie/CSRF、fresh Idempotency-Key 创建 Connection，按返回事实形成预期清单，经本地管理员确认；不从 discovery 自行批准身份。
5. 测试配对码通过内存保持的 stdin 或真实隐藏 TTY 输入。安装后的 `connect --expect <file>` 执行 discovery、redeem 指纹校验、兑换响应的 `skill.download_url` 原始字节下载、UTF-8/LF/SHA-256/Ed25519 校验，再按 `initialize → verify_connection → get_workmesh_context` 比较完整当前身份。deployment/MCP/Skill origin、能力集合、Coordination Session 和 `active` 指纹都要精确匹配。
6. 检查完整验证前无正式配置或系统令牌。成功后正式配置仅含秘密引用，pending 清理；系统后端跨进程读回只比较摘要/相等布尔值。不得把配对码、Token 或完整兑换响应写成证据。
7. 使用已安装 `run -- <test-client>` 验证子进程实际收到安装 Token，并执行真实 MCP 验证；只返回安全结果。在两个架构的 SEA 进程中实际建立 PTY，证明归档的 `build/Release/pty.node` 被加载；核加载路径位于准确安装版本目录，移除受控副本 `pty.node` 的负例必须失败。PTY 和管道两种模式分别验证终端属性、交互提示、尺寸、SIGINT/SIGTERM、退出码、跨 chunk/ANSI 输出和 stderr 重定向，原始字节与显示规范化结果都无凭据。`--version` 或普通宿主 Node 的 require 正例不能替代 SEA 加载验收。
8. 执行拒绝、故障与竞争矩阵。丢响应测试保留同一个真实请求身份；在私有测试服务或文件操作上注入故障，不向发行物暴露跳过鉴权/更换公钥/测试内存 store 的产品开关。提交 checkpoint 内部精确故障继续由既有单元测试证明，安装用例补真实进程终止及文件/后端故障。
9. 使用持久 guest 磁盘重启整个虚拟机，之后重新建立同用户 D-Bus、解锁原私有 keyring；证明 pending/journal 与原秘密持久性、窗口内恢复及窗口外拒绝。时序绑定服务端真实截止时间，不靠延长领域窗口或仅重启容器。
10. 安装第二个受审候选版本，核原子升级、失败回退和已有 pending 的协议 user-agent 不变。卸载只清理账本程序对象并保留配置/秘密；管理员 DELETE Connection 后实证拒绝。最后按登记身份清理本任务 guest、服务、卷、目录和秘密引用并证明不存在，保留原始首败。

黄金路径在隔离测试网允许访问准确 API/MCP origin，目标安装阶段的离线断言与连接阶段联网许可分开记录。模型提供方、真实用户客户端账号及仓库外消息发送不参与本批安装验收。已有客户端配置形状照 `clientSnippet` 验证，不能把扫码输入测试冒称真实硬件扫码验收。

## 错误、恢复与秘密专项

| 触发 | 必需结果 |
| --- | --- |
| 清单/公钥/Skill/能力/身份被篡改，重定向或未批准 origin | 所在验证步骤失败，安装令牌不进入普通文件或客户端配置，不静默采用旧凭据 |
| Linux store 未启动、锁定、读回不同或补偿删除失败 | 显示既有安全错误；无文件/内存/keyutils 降级；journal 保留并阻止新提交 |
| 损坏或异清单 pending，同码新 key，重放到期 | 原身份不能自动重建；按已核安全下一步停止或请管理员签发新码 |
| 429、503、slug/type/policy mismatch、未知错误形状 | 保留 `next_action`/`human_action`、安全 supported clients/correlationId、Retry-After；不自动重试、不打印恶意服务自由文本 |
| 配置替换前后强制终止、秘密后端重启 | 依据真实提交点保护旧配置/旧秘密，保留或补偿新增秘密，系统后端恢复后可继续 |
| tar 穿越、重复成员、链接、device/FIFO、helper 被替换、同版本异内容 | 暂存前或提交前明确拒绝，目标目录外无写入，旧入口仍可运行 |
| 存储不足、两个安装器竞争、卸载时仍有本版本进程 | 失败或串行收敛；不留半份正式版本，不删运行中依赖 |

## B4 文档验收

后续文档必须通过 `docs/integration/README.md` 链接安装页，说明系统条件、版本清单、离线安装、管理员预期清单、客户端环境引用、完整校验、错误恢复、升级回退和卸载保留语义。未外发标为“本地已验证产物，尚未对外发布”，没有产物时标为“待实现”；不写虚构下载 URL。

逐项核 `docs/agent-integration.md`、`AGENT_PROTOCOL.md`、`AGENTS.md` 与 connector README 的当前命令。共享 `main` 保留 `connect --expect <file>`、`run -- <command> [args]` 和 `abandon-pending`。SEA 发行入口已新增 `--version`；产品 `connect` 不新增假 dry-run，安装脚本提供 `--dry-run` 只读校验并断言零写入。不能因文档提到参数就宣称代码已有支持。

当前协议仍是 Installation Token 用 `X-WorkMesh-Installation-Token`，普通执行用 Session Bearer。配对码不得成为 MCP header；示例不出现真实凭据、shell 历史中的完整配对码或普通 `.env` Token。

## 必需检查与 CI

本轮包含产品代码与验收工作流；按真实变更运行完整适用必需检查及双架构安装验收，文档检查不能代替安装成功。

当前已添加下列入口；完整产品验收结果另列，不因命令存在填通过。

```sh
pnpm check:integration-docs
pnpm ci:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:conformance
pnpm --filter @workmesh/connector build
pnpm --filter @workmesh/connector test
pnpm --filter @workmesh/connector test:platform
pnpm --filter @workmesh/connector build:release -- --output <owned-output>
pnpm --filter @workmesh/connector test:install
node scripts/verify-connector-install.mjs --artifacts <owned-output>
pnpm verify:integration-examples
```

根 integration 使用独有 test 数据库、Redis 和对象存储，保持 opt-in recovery 的显式实际执行要求，不能将被跳过用例写为通过。适用 conformance 保留真实 REST/SDK/MCP/Pi；不恢复浏览器检查。B4 随文示例按行为改动真实运行，静态链接检查不代替鉴权、响应与恢复。

### 历史 KVM CI 条款（保留来源，已由 TCG 裁定覆盖）

新增 `connector-install` job 的 matrix 固定两项：amd64 的 `runs-on` 为 `ubuntu-24.04`，ARM64 的 `runs-on` 为 `[self-hosted, linux, ARM64, workmesh-connector-kvm]`。每项在本架构 Linux 构建机准备 GCC/G++、Make、Python 3、锁定 node-gyp 和已核 Node headers，原生编译 node-pty，打入 `build/Release/pty.node` 与上游 loader 后运行隔离 KVM guest 安装。目标安装/运行不执行生命周期脚本、node-gyp 或补件下载；本轮不修改 workflow 或执行编译。

ARM64 runner 须由 Chief 落实专用裸机、管理员完成受控注册和 KVM/guest 重启就绪证明，产品实施前核实际在线 labels、runner 身份与隔离条件；未取得资源不能将该 leg 排除。`changes` 输出、`checkIds`、`required-ci.needs`、分类依赖闭包、结果汇总和 `validate-ci` 同次维护；产物/installer/native/服务端 fixture 变化必须选择安装验收。policy 单测覆盖丢 job、取消、失败、意外 skipped 与矩阵缺任一架构的拒绝。保持已有 `connector-platform` 三系统 job，不用它替代安装验收。

每个 leg 上传按 run ID、run attempt 和架构命名的原始回执，包含 PR head、实际 checkout SHA/parents/tree、runner 身份/架构、KVM 启动与 guest 重启证明、headers/工具链、编译日志、归档/native 摘要及 SEA PTY 加载结果。Required CI 除核 matrix job 成功，还须读取同一 run/attempt 的 amd64、arm64 两份回执，逐项匹配源码与受测产物；缺件、错架构、错来源、native 未加载或只有一个 leg 均拒绝。排队/资源不可用不算成功，不补造通过回执。

每个 matrix leg 保存原生源码前后绑定、manifest、安装命令、原日志、设备原件和收尾，`always()` 上传，不设置 `continue-on-error`。job 无 KVM、无 Secret Service、无 guest 或没有用例就是失败。两个 leg 全部成功后，Required CI 才可汇总；实际源码绑定、独审、Chief 确认与发布授权继续分别记录。

## 本阶段交付判定

### 当前 TCG 产品验收入口

已用 `ubuntu-24.04`、`ubuntu-24.04-arm` 两个原生构建 leg，各自启动 `-accel tcg` 完整 guest；job 总预算为 90 分钟，结果按实际产品组合记录。按[研究报告](../../reviews/b-ship/tcg/report.md)已测的 OS reboot、同用户 D-Bus/Secret Service、原加密 API 重放方法设计安装验收，新增实际安装 SEA、`SystemSecretStore`、pending/journal、完整协议与全部错误/恢复断言，不能用研究 `secret-tool` 或私有 API 夹具替代这些组合。

Required CI 仍须绑定同一 run/attempt 的两架构产物及实际 checkout/tree、输入/镜像/固件摘要、native/SEA 加载、两次 boot_id/kernel 和期间 QMP RESET。TCG job 没有 KVM 不构成失败条件；缺完整 guest reboot、真实秘密或全部必要回执仍拒绝。用户已采用 TCG 并放行实施，这些增量已接入 connector-install 与 Required CI 汇总。三系统回归保留，历史 KVM 条款不作为当前产品执行步骤。

### 历史研究与文档准备判定

以下两段保留历史阶段判定，不作为当前产品交付结果。

下面“五个文档路径齐备”是历史文档准备阶段的判定。本次研究另外交付完整当前规格、研究计划、可复现探测脚本、脱敏运行原件和结论；逐项报告完整 guest、实际 reboot、秘密持久性、时间容量及真实 API 重放。仍不填写产品 DoD 已通过，不把历史 KVM 资源取得作为本次实验授权，也不预先放行 TCG 产品路线。

本阶段满足的是五个文档路径齐备、规格与 saved plan 原文完整、矩阵确认准确、方案可审查、适用文档/CI 检查通过及证据提交。上述产品 DoD 全部保持未验收。正式独审由任务 review 的独立审查承担，本人一致性检查不冒称独审；外部发布、新凭据和真实外发仍未获授权。
