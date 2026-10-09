# M0产品候选与实际验收证据

## 实现范围

复用已审冻结规则实现277个现有operation、97个现有binding与10个等价只读tool的资格和发现投影，数量仅为静态全集核验。API通过qualified参数协商精确Session资格；旧响应、旧tool/input schema和resource URI保留。API不猜MCP运行配置。adapter按实际注册、readonly/coordination/bridge部署配置独立投影，Context.allowedOperations来自同一次投影。Human-only兼容调用提前拒绝，领域授权未放宽。

当前C verify/claim与返回的新E、直接E自身读取、C精确目标E单请求Token变体分别绑定。目标actor/session/kind和两层manifest actorId必须一致；不写共享client身份。provider kind/reviewer联合能力、九项planning写team scope和具体owner/recipient/holder前提由已审规则披露。SDK原stale refresh→ACK保持，受保护401/403不刷新或重发。Runner只呈现已实现且资格相符的工具，错误保留details/correlationId；稳定key、完成intent与领域事务沿原合同。

无数据库迁移、新领域事件或WebUI改动。ADR0079仍Proposed；后续M1–M5缺入口保留未适配归属，本批不实现它们。

## 文件与服务

- contracts发现规则、纯资格/投影函数、DTO、manifest/errorReactions及route-policy；API client-profile精确身份响应；MCP发现接线、只读tool和HTTP/stdio模式；SDK局部目标client；Runner工具与错误恢复。
- OpenAPI、协议和客户端指南公告协商与兼容。冻结savedplan/implementation和历史档案保持，实施内问题及原审查另存，不改旧证据含义。
- 真实conformance fixture、独立非空串行入口与根集成接线；现有api-integration Required job显式执行，失败传播及always证据上传；CI policy/validator含删除入口等语义反例。
- 本机检查使用Node22.19.0/pnpm9.15.4。检查器把Git源blob和实际工作树输入分别ZIP保全，运行秘密仅在子进程环境。独有Postgres/Redis/RustFS容器使用tmpfs、随机凭据及独有bucket；归属验证后只stop/rm本轮ID，不清共享镜像/网络。

本机假模型使用公开测试TLS密钥和本轮loopback监听；CA只注入Runner子进程，没有关闭TLS验证。Agent仅用既有管理员预授权的Connection/E Token，Human cookie只用于安装与管理员夹具，不注入Agent。管理员提高测试Agent并发容量以安排多个Session，不增加领域角色/能力。

## 九类DoD映射

| 类别 | 产品验证及事实 |
| --- | --- |
| 正常 | 真实HTTP MCP initialize/tools/resources、C两mode名单、Context同次投影、E资源与等价tool；Pi模型实收名单和实际调用/Turn/Document/活动事实。参数返回引用沿原OpenAPI，静态数不代功能。 |
| 越权/撤权 | 缓存readonly写/Human-only拒绝、E自身与异Session、Connection撤权零Project；SDK错actor/401/403零刷新；API完整权限套件覆盖Document/Inbox/Lease、跨Team/Delegation与live授权。 |
| 非法状态 | queued仅握手、paused/stopping/terminal普通发现拒绝；stale后原ACK恢复；credential/profile failclosed及feature/能力与role/scope交集。 |
| 幂等 | MCP同key并发/重新连接同一Document；异body冲突，SDK丢响应后同key重放一条事实；原稳定key与新逻辑动作区分。 |
| 旧revision | Document错误If-Match原结构REVISION_CONFLICT/currentRevision，内容hash不变；不盲改后报告成功。 |
| 事务失败 | 专用DB触发器注入下游Document失败，原INTERNAL_ERROR/trace保留，Document/event/outbox回滚；新发现命令事务不适用。 |
| 重放 | resource重读零event/outbox；initialize/重连不复制领域事实；SDK完整错误保全。本批无新job，后续job去重沿后批。 |
| 并发 | 两C MCP客户端桥接两个E且Token不串；同key并发一条事实；服务器live撤权/锁竞争由API集成检验。 |
| 重启/恢复/Stop | 真API/MCP重启重新发现、durable cursor继续；Stop普通写拒绝，已有E SDK专用Stop ACK走现行revision。C安装凭据停止后刷新仍拒绝，不新增M1清理bridge或外部机器恢复承诺。 |

详细测试名与真实退出/runtime见product-evidence回执，允许正例和拒绝反例均保留；skip不计通过，产品检查结论只使用后面的实际结果表。

## 演示与交付门禁

在专用test数据库及完整服务环境执行pnpm test:conformance:integration，fixture会配对、initialize、核两种mode、准确ID读写与拒绝、Pi模型tools/实际调用和durable facts，退出前关闭己有监听。必需根集成实际包含该套件；CI由原api-integration job执行同命令，根脚本、job接线/pipefail/上传缺失会被validator拒绝。

本地结果由实际回执填写，不代最新PR RequiredCI；未有平台独立成果审、最新候选CI及实际main证明前不宣告整卡完成、不merge。原合同审查只是一项实施过程检查。


## 实际检查结果

| 命令 | 结果 | 退出码/实际秒数 | 回执 |
| --- | --- | --- | --- |
| `pnpm lint` | 18包通过 | 0 / 55.881 | [final-lint](product-evidence/final-lint.json) |
| `pnpm typecheck` | 18包通过 | 0 / 55.849 | [final-typecheck](product-evidence/final-typecheck.json) |
| `pnpm test` | 1753通过、2可选skip | 0 / 161.636 | [product-unit-tests-2](product-evidence/product-unit-tests-2.json) |
| `pnpm --filter @workmesh/agent-runner test` | 最终Runner51通过，包含新增Pi结构化错误反例 | 0 / 9.802 | [runner-final-tests](product-evidence/runner-final-tests.json) |
| `pnpm test:integration` | DB80/API234/真实MCP9/Worker113，共436通过、3可选skip | 0 / 300.134 | [product-integration](product-evidence/product-integration.json) |
| `pnpm test:conformance:integration` | 最终9通过；真实Pi错误后继续读、三次调用/settled Turn/Document事实 | 0 / 19.760 | [real-conformance-error-recovery-2](product-evidence/real-conformance-error-recovery-2.json) |
| `pnpm test:e2e` | 70通过 | 0 / 281.325 | [product-e2e](product-evidence/product-e2e.json) |
| `pnpm build` | 18包通过 | 0 / 106.944 | [product-build](product-evidence/product-build.json) |
| `pnpm test:conformance` | 6/6内存fixture通过，单列 | 0 / 1.955 | [product-memory-conformance](product-evidence/product-memory-conformance.json) |
| `node --test scripts/ci-policy.test.mjs` | 14通过，包含真实job/root入口语义反例 | 0 / 0.309 | [ci-policy-product-3](product-evidence/ci-policy-product-3.json) |
| `pnpm ci:validate` | CI/release/lite及15项原件核验通过 | 0 / 2.781 | [final-ci-validation](product-evidence/final-ci-validation.json) |
| `pnpm check:route-policy` | 生成物一致 | 0 / 2.806 | [final-route-check](product-evidence/final-route-check.json) |
| `pnpm check:workmesh-skill` | 签名/内容一致 | 0 / 0.735 | [final-workmesh-skill](product-evidence/final-workmesh-skill.json) |
| `pnpm check:runner-skill` | 生成物一致 | 0 / 0.860 | [final-runner-skill](product-evidence/final-runner-skill.json) |

根单元后仅Runner工具错误边界及对应测试、真实conformance夹具增加了错误继续读验证；最终Runner和真实套件分别重新验证。生成器只去除TS文件结尾多余空行，规则谓词没有变化；最终build/lint/typecheck/check:route-policy输入均包含当前源码。未重复不变的全API/Worker检查冒新运行。

两个单元skip为retention-soak-lock/formal-launch的环境用例；三个集成skip为旧workbench-runner可选场景、retention升级barrier及完整recovery。M0真实Pi链已单独必跑，不以旧Runner skip计作Pi通过；完整恢复/外部机器恢复仍未验收。

冻结安装实际退出0。客户端实读为MCP SDK1.29.0、Pi0.87.1、Playwright1.61.1，精确包文件hash见[运行条件](product-evidence/client-runtime-versions.json)。服务run索引合计10轮30个己有容器全部按ID/标签stop/rm，3100/3101监听观察为空；[资源回执](product-evidence/resource-final-observation.json)及各轮resources.json包含准备、ready、cleanup时序。当前工作区、便携Node与测试输出保留；共享服务/镜像/网络及既拒目标未动。

原运行输出的无损ZIP及可读副本映射见[原字节索引](product-evidence/raw-output-index.json)，受测输入ZIP均逐member实核。首次中断的contracts-typecheck ZIP不完整，仅保留首败，未计产品输入或通过。所有运行回执锚定启动时源码HEAD f0fcf961672541c234a7d1ce6194ea1d2b4f01ea加实际工作树ZIP；不能把HEAD单独冒运行源码。最终暂存blob、工作树及最新静态受测字节见product-source-manifest.json。

平台读取的[现行完整执行spec](spec-execution.md)与[工具观察](product-evidence/platform-spec-observation.txt)分列保存；工具saved plan末段截断，未冒全文读回，平台Q全文仍以冻结savedplan/implementation为准。
