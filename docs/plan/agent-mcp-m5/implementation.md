# 完整实施设计

## 上下文与假设

M5 消费 M0／M1／M2／M3 已落主线合同，以同一候选后端跑外部实际 OpenCode 和内置 Pi。两种进程分别运行无 Git 核心链及 fake Git 交付链；不是在四条旧协议夹具上追加客户端标签。

本轮仅规划。OpenCode 与本机依赖的可得版本、官方来源读取时间保存在环境元数据，正文不人为标方案版本。后续固定使用已盘点的原生 OpenCode 二进制；不安装、登录或连接真实模型／Git 账号。缺环境时提交具体原问题卡，不能偷偷换客户端、把协议夹具顶替实机或给未测画像打勾。

## 实施顺序与拟变更文件

先完成受控包与方案独审，Chief confirm 后才执行下表。表内是后续授权实施清单，本轮未创建这些产品文件。

| 文件 | 确定变更与复用机制 |
| --- | --- |
| `packages/conformance/src/joint-clients.fixture.ts` | 复用 `createMcpCoverageFixture` 的 `buildApp`、`WorkMeshClient` 与 dedicated-test-DB guard；复用 `createPlanningCollaborationFixture` 的签名 webhook、`runnerProxy`、受控 TLS 模型；复用 `createDeliveryRecoveryFixture` 的 `FakeGitProvider`／provider Worker／upload Worker。增加两 Human 独立 cookie 句柄、两 Team、两 Agent、准确实际 clientType，原准备阶段与实际调用分别记录。M0 helper 当前固定 codex 的 pairing 不可冒 OpenCode：本文件经真实 connection REST 创建／redeem，记录实际 client metadata，不全局重命名旧夹具 |
| `packages/conformance/src/joint-clients.model.ts` | 独有 loopback TLS 模型支持两个真实客户端所需 streaming tool-call 协议，以每个模型 session 独立状态驱动整链。用响应中的实际资源 ID／revision 生成下一调用；捕获实际请求中的 tools、调用参数、返回结果与公开消息，不记录隐藏思维字段；工具缺失／错误被吞／结果未送回模型立即失败 |
| `packages/conformance/src/joint-clients.service.ts` | 测试专用 API／MCP／Worker 子进程入口，实际调用 buildApp／createWorkMeshMcpHttpServer／createProviderActionWorker，供受控退出重启；独立 fake provider fixture 保持远端effect状态及计数，不随Worker内存消失。各子进程使用同一专用DB、既定port和owner ledger，失败前后PID和持久事实记录 |
| `packages/conformance/src/joint-clients.drivers.ts` | OpenCode driver 用 `execFile` 和准确已安装 executable 启动 `run --standalone --format json --model m5-local/controlled`；不传秘密到 argv。Pi driver 复用 `apps/agent-runner/src/run-session.ts --once` 真实进程及 persisted Turn／Attempt。保留 SDK／MCP reference driver 为独立协议对照；报告明确实际 executable／PID／OS／client metadata 和每条领域事实 |
| `packages/conformance/src/joint-clients.reporter.ts` | 输出分层 JSON／JUnit／中文 transcript：实际 OpenCode、实际 Pi、协议对照、Human 准备、特权故障夹具分列。持久 Session／Turn／Plan／Artifact／review／approval／action／event／outbox ID 关联；缺 binary 是环境缺口／失败，不能伪 passed；未运行／未测／不支持／环境 skip 各自表达 |
| `packages/conformance/src/joint-clients.conformance.test.ts` | 使用本包真实 integration 入口运行无 Git／fake Git 两种链的 SDK 协议对照、实际 Pi 及全部确定性故障断言；现有基础 `runClientConformance` 不作整批完成指标。实际外部 OpenCode 另由下述已安装客户端入口执行，避免 Required CI 无该设备时把厂商画像伪造为通过 |
| `packages/conformance/src/joint-clients.acceptance.ts`、`packages/conformance/package.json` | 增加 `acceptance:joint` 脚本 `tsx src/joint-clients.acceptance.ts`，读取 `M5_CLIENT_EXECUTABLE`、`M5_EVIDENCE_ROOT`，强制实际 OpenCode 与 Pi 主链及外部故障子场景；缺关键条件 exit 非零、原问题卡，不跳过。不添加厂商安装器或 runtime 依赖 |
| `packages/conformance/vitest.integration.config.ts`、`vitest.config.ts`、`packages/conformance/tsconfig.build.json` | 新 integration 套件显式 include、根单元显式 exclude；新跨包 fixture、drivers、model、service、reporter、acceptance 只从生产 build 排除，lint／typecheck 保持包含。保持非空、串行与现有四批套件 |
| `scripts/ci-policy.mjs`、`scripts/ci-policy.test.mjs` | 必含新真实 integration 套件、root 排除和 build 边界；逐套件删除负例针对每条单独项，不以整串 replace 假删除。沿现有 API integration job、`pipefail` 与 always evidence upload，不新增仅靠报告冒实机的 CI job |
| `docs/agent-runner.md`、`docs/agent-integration.md`、本目录产品报告／运行证据 | 增补选定两客户端的演示、Human 前提、身份边界和实际支持矩阵；报告四条主链及故障证据，保留原限制。公共 Skill 原字节、Runner 内嵌 pin、无源码发行分别沿原门禁 |

不新增业务、权限、迁移或 API／事件。真实产品缺陷只在本批既有合同内修复，新增投影／权限分叉先 ADR 与独审；修复涉及的 REST／Zod／SDK／policy／MCP／manifest／Runner／conformance 必须同步，不事先列未经发现的产品改动。

## 客户端与后端运行合同

外部进程位于本任务独有空 runtime 目录，配置与数据根分离于用户配置。仅继承运行必需 PATH、系统／临时目录和测试输入；不继承本机账号 API keys、`TODOS_MCP_API_KEY` 或既有 `WORKMESH_INSTALLATION_TOKEN`。新测试 Connection 凭据通过子进程环境变量引用，配置文件只存占位符。新 Human cookie、CSRF、DB／master／bootstrap／Runner service secret 只在准备驱动进程，不进入外部客户端与 Pi 模型。

按已归档官方 schema 使用 `mcp.servers`、`oauth:false`、`codemode:false`、经典握手。C endpoint 使用 `X-WorkMesh-Installation-Token`；E endpoint 使用仅限该 MCP listener 的随机 access Bearer，后端 E Token 留在 server。两 endpoint 的 token 不混用。按 chain 建新的 standalone OpenCode session；C 接单后由本机准备驱动经原安装身份取得准确 E 并建静态 E listener，显式记录该传输准备，不假称模型自行得到 Token。原 E 贯穿 Stop/finally，不能 Stop 后 refresh。

采用子进程私有 XDG config／data／state 与 APPDATA／LOCALAPPDATA 目录，禁止改用户 HOME／USERPROFILE。正式运行前核该二进制实际消费的路径与有效配置；官方页面只说明标准路径，不证明这些环境隔离入口已被消费。验证仅有本任务配置、MCP、模型、无用户服务复用，无下载／自更新／账号恢复及真实出网；本机拒绝代理只允许 loopback，列出实际请求目的地。无法证明隔离时在原卡形成具体能力问题并停外部子流程，不修改用户配置或新增外部授权。

权限规则先拒默认工具，再按场景允许准确 WorkMesh MCP tool；禁 shell／subagent／webfetch／websearch／skill、任意文件操作、共享与插件执行，不传 `--auto`。受控模型只请求 whitelist 内工具。`request_artifact_upload`／`download_verified_artifact` 原 MCP 返回短期签名资料，外部模型链不调用这两个入口；外部交付用既有 `publish_delivery_artifact` 的 test_report／code_review 完整证据链。该传输兼容限制在矩阵注明，不能称外部模型上传已验收。Pi 保留 `delivery-transfer.ts` 安全上传下载实测，资料不进模型；SDK／MCP 受控传输对照单列。

两 Human 的实际账号、角色、Team membership、责任人和 principal 在每个用例前登记。H1 完成管理员准备后回到 Team1 合法成员，H2 为 Team1 maintainer、Team2 授权 Human；A／B 两测试 Connection principal 固定 H1，H2 接受 Handoff 沿当前 `acceptHandoff` 继承原 principal，不改为 H2 伪匹配。撤销 H1 membership 的用例在 Runner 准入后进行，真实拒绝响应返回后才恢复相同 membership，以便模型实际收到错误；不换 principal／installation。

## 验证和收尾

具体四链步骤见 [journeys](journeys.md)，九类及失败判据见 [acceptance](acceptance-matrix.md)。`acceptance:joint` 是本机必需外部进程验收，Required CI 的确定性 integration 与之互补；CI 通过不代替外部实际进程结果，外部主链结果也不代替 Required CI。

每条命令保存实际 argv／exit／runtime、源码与 runtime bytes 前后指纹、stdout／stderr 脱敏原件、真实工具序列和 DB／provider 状态；失败和 skip 不计 passed。先资源 ledger 后启动，失败仍保全，健康进程等退出才清本人闲置资源，旧证据、共享 store、当前恢复目录和拒绝目标保留。
