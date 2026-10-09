## 上下文与假设

M0统一“已注册、可发现、部署支持、具名适配、当前资格、目标授权”的含义。现有 `createAgentCapabilityManifest` 仅计算 feature 与能力交集；`createWorkMeshMcpServer`、`getWorkMeshContext` 和 `createWorkMeshTools` 各自维护工具选择，造成 Human-only 工具、E规划写操作和复合导入误广告。

复用现行领域门禁，不授予E协调角色。采用 `GET /api/v1/agent-capabilities?discovery=qualified` 显式请求增强披露；省略参数保持旧响应结构，旧字段保持原含义。增强披露只判断已知前提，目标范围、批准、Lease和revision仍由调用时裁决。

本批不实现Web UI、F/TA新域及后续批次的终态确认、Stop清理适配、子Session、精确action查询和rollup修复；这些缺口必须明确披露。

## 文件与实现变更

- **`docs/plan/agent-mcp-m0/`**：修订现有受控文件及 `compatibility.md`，绑定完整spec、平台计划引用和精确main/source；保留原归档及真实时序，不预填新docID。逐operation以结构化谓词记录凭据、C/E/H、Delegation role/scope、状态、能力、目标前提和具名实现，分列当前binding与拟修正binding；每项附具体源码行、反例测试及九类DoD映射。`getCurrentAgentConnectionIdentity` 对普通E Bearer固定 `blocked/CREDENTIAL_MODE_MISMATCH`；`publishAgentPlan` 对reviewer固定 `blocked/ROLE_REQUIRED`，依据 `apps/api/src/agent/commands.ts` 的 `publishPlan`，awaiting_approval另需现行批准。`prepare_project_import` 当前映射 `listProjects`，目标为无REST的内部binding；`verify_connection` 完整包含manifest、current identity和listTeams。其余角色/kind规则逐项核handler/domain，未核实项固定 `blocked/DOMAIN_DIFFERENCE_PENDING`，不得用通用资格句或集合相等代替决定。静态全集以实际OpenAPI双向核验；这些受控决定、合同提案和测试接线先独审，再进入产品。沿用Todos＋仓库双轨例外。
- **新增发现契约ADR**：在 `docs/adr/` 使用未占用编号，主题为工具发现与恢复契约，承接ADR0012、0042、0067。将协商字段、隐藏工具兼容、错误恢复及身份规则写为提案；上述文件先交同模型/high独审，blocking/high闭合并由Chief确认后进入产品实现。
- **`packages/contracts/src/agent-discovery.ts`（新增）**：建立operation规则、binding组成表与两个纯派生函数：API资格只接收精确Session的live身份、角色/scope、状态、能力和feature，返回逐operation/变体的已知资格与待核前提；adapter投影接收该资格、实际注册表、具名实现、`mode`、transport/coordination配置及目标Session资格。`registered`、`discoverable`、adapter部署支持和tool/resource名单只属于adapter输出，API不接收或猜测MCP配置。缺实现、只读写操作及已知拒绝均blocked；目标参数尚未知为 `requires_target_check`，不会转成eligible。纯installation_target使用adapter内部判别联合：Session、Delegation及manifest均为null，只披露既有安装交接内部用途，不调用Session manifest、不派生C Session。复合binding逐项检查全部前置读取和组成写入，保留逐项原因；provider按kind、Loop按实际admission前提判定。
- **`packages/contracts/src/route-policy.ts`**：将 `createComment/updateComment` 对齐既有Human-only handler。保留其他领域授权规则；补充复合与变体绑定，使导入包含Project、Milestone、WorkItem、relation及前置读取，provider工具按route与domain的联合要求披露，Loop按实际admission条件披露。
- **`packages/contracts/src/index.ts`**：保留旧manifest schema，新增增强响应schema及派生函数；复用 `createAgentCapabilityManifest` 的基础投影。统一角色、撤权、状态、revision、幂等冲突及游标错误的恢复说明，权限拒绝不建议自动刷新后重试。
- **`apps/api/src/client-profile.ts`**：在 `registerClientProfileRoutes` 校验qualified协商参数，仍要求精确Session，读取其kind、Delegation role/scope、实际认证方式及live能力交集；增强 `discovery` 仅返回身份与逐operation/变体资格，不返回MCP注册、mode或名单。Session认证方式仅为 `agent_session` 或 `coordination_connection`，不能把installation_target填入必填Session DTO；无Session的安装凭据继续拒绝。状态资格复用 `sessionActiveForOperation`；不放宽queued上下文读取或terminal manifest门禁。直接E使用自身manifest；Connection认证得到当前C manifest，不用其角色/状态推断其他E。
- **`apps/mcp/src/index.ts`**：以实际注册表、mode、transport/coordination配置和API资格构造adapter投影；`tools/list`、`resources/list`、`resourceTemplates/list` 与增强只读发现tool共用该派生结果，旧capabilities resource默认保留原manifest。借助SDK公开request handler分离list和兼容call，保留旧名/input schema；Human-only旧调用返回结构化 `FORBIDDEN`，只读部署缓存写调用也拒绝。带必填sessionId的E bridge工具在未指定目标时只能以 `requires_target_check` 的条件入口披露，且要求已配置installation bridge；不列作当前C的eligible操作。指定目标后先取该E自身资格，再用相同目标Token执行；失败保留原错误，不换身份。resource等价只读tool复用原SDK方法和URI，工具描述绑定输入、返回与分页合同。沿用 `tool/errorToolResult/currentRevision` 保全上游错误及trace。
- **`apps/mcp/src/http.ts`、`stdio.ts`**：统一发现准备及凭据模式检查。错误或混合凭据失败关闭，不回退到另一身份；每请求独立绑定Connection和exact Session，不共享执行Token。
- **`apps/mcp/src/coordination-product.ts`**：`getWorkMeshContext` 接收由MCP发现准备函数生成的同一次adapter投影，复用该次manifest，不自行重算全API名单；`allowedOperations` 只含当前身份下可发现且eligible的operation，条件bridge与blocked项另列原因、目标前提及后续归属。只读和读写连接各按自身mode计算，不共享缓存；不同请求重新读取live事实，列表不承诺后续调用授权。复用 `collectPages`、规范化及 `importKey`，保持导入hash恢复、逐命令部分提交和重放窗口，明确同内容再次导入的现有限制。
- **`packages/agent-sdk/src/index.ts`**：增加qualified请求/响应校验及精确目标发现helper，复用 `request` 现有 `refreshSessionId` 的安装凭据刷新路径；取得目标Token后，以单次调用作用域的client读取目标manifest并核sessionId与execution kind，资格检查和目标命令使用同一Token，不修改共享client的Session Token。没有目标、刷新失败、manifest拒绝或身份不匹配均停止该调用，不借当前C资格或缓存降级；并发两个目标各自隔离。复用 `stableIdempotencyKey`、请求重试和 `WorkMeshSdkError`：调用前持久化显式key，传输重试/重连沿用同key/body，新动作和改正文使用新身份；受保护请求的401、拒绝、Stop与冲突不触发刷新或重写。
- **`apps/agent-runner/src/workmesh-tools.ts`、`run-session.ts`**：`createWorkMeshTools` 取增强manifest，只呈现已实现且满足角色、状态和能力条件的工具，移除E无法通过 `teamAccess` 的规划写广告。保留 `operationKey` 和完成intent机制；`RunnerApiError` 保全message/details/correlationId，取消任意 `401` 自动刷新，只按已知凭据到期进行请求前刷新，拒绝后不重发。
- **合同与客户端文档**：更新 `OPENAPI.yaml`、`AGENT_PROTOCOL.md`、`docs/AGENT_COLLABORATION_CLIENT_PROFILE.md`、`docs/agent-integration.md`，公告协商、兼容及恢复行为；重新生成 `docs/route-policy-matrix.md`。无数据库迁移或新领域事件。
- **测试与运行入口**：扩展指定contracts、MCP、SDK、Runner测试及API权限集成测试；新增 `packages/conformance/src/mcp-coverage.conformance.test.ts`、同目录真实服务fixture与包级 `vitest.integration.config.ts`，显式include该文件、串行fork、`passWithNoTests=false`，从普通单元发现中排除。更新conformance `package.json`、锁文件及根 `package.json`，增加 `test:conformance:integration` 并串入根集成；fixture复用环境校验和测试DB reset，启动本机API、两种mode的MCP、fake模型及Pi Runner，等待ready后执行，finally保全日志并仅关闭己有进程，缺夹具/空套件直接失败。内存conformance保留为独立检查。
- **`.github/workflows/ci.yml`**：将真实套件接入现有必需 `api-integration` job，在原API集成之后显式运行 `pnpm test:conformance:integration`。沿用该job已准备的Postgres、Redis、RustFS/bucket、bootstrap及Runner测试凭据；串行重置专用测试DB，再由fixture启动监听服务并做ready检查。执行使用 `pipefail`，不设continue-on-error；完整退出码、测试报告、模型实收tools和脱敏服务日志落入 `ci-logs/mcp-coverage/`，由现有always上传步骤保存；失败进入Required CI聚合。
- **`scripts/ci-policy.mjs`、`ci-policy.test.mjs`、`validate-ci.mjs`**：让MCP、SDK、Runner、conformance变动必选 `api-integration`，保留原API/worker选择；增加逐包改动及失败/异常skip聚合测试。validator核根脚本链、显式套件include/非空要求、CI执行顺序、pipefail和always证据上传；删除CI入口或脱离根集成时必须失败，防止仅内存smoke绿色代替真实套件。

## 边界行为

发现后撤权或改变feature，API仍重新拒绝；不通过重新配对、刷新或换身份绕过。跨Team保持 `NOT_FOUND`，原因字段不包含隐藏资源存在性。

queued只提供现行握手、manifest和ACK前提；paused、stopping及terminal按真实门禁处理。manifest不可读取时保留原拒绝及最后有效发现说明，不新增终态Token读取权限。现有SDK Stop ACK入口保持可走，MCP/Runner尚缺的专用清理适配明确标为后续批次。

Human-only请求沿现有身份解析前拒绝；Coordination派生允许其既有Session事实，拒绝账本沿ADR0028。resource读取不增加receipt或业务outbox。错误包装和活动记录不得覆盖原命令错误。

## 验证与交付门禁

1. 使用仓库规定的Node/pnpm环境执行 `pnpm install --frozen-lockfile`；重核精确远端main及共享合同差异，只整合实际已落地主线。操作决策清单与解析后的OpenAPI全集双向集合一致，每个误广告项绑定服务端和适配证据。
2. 执行 `pnpm generate:route-policy`、`pnpm check:route-policy`、相关包定向测试、`node --test scripts/ci-policy.test.mjs` 和 `pnpm ci:validate`，再执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm test:conformance`。核根集成实际执行真实套件且测试数非零；在本任务隔离副本删除CI入口或破坏fixture，验证validator/集成命令非零退出。候选PR核 `api-integration` 已运行该命令、上传真实tools/错误证据且Required CI成功；内存conformance单列。文档修订阶段只核正文、来源、操作决定与接线映射，不跑全产品测试。
3. 真实集成沿预授权→安全兑换→initialize→tools/resources发现→verify/context/manifest→准确ID调用→故意越权→完整错误→继续允许读取。用同一Connection/Session分别连接只读和读写MCP，断言API资格相同、adapter名单按mode不同，context与同配置名单一致，缓存写调用在只读连接拒绝。普通E查询current identity拒绝；reviewer发布plan拒绝。纯安装凭据不得取得Session manifest；C bridge分别绑定两个E，核目标自己的角色/状态及Token隔离，覆盖缺目标、跨Team、目标暂停/撤权和manifest失败。SDK及Runner测试断言受保护401之后刷新/重发计数为零，请求前到期刷新仍经live授权。资源与仅tool客户端取得同前提；真实Pi Runner接本机假模型，记录模型实际收到的tools及拒绝后继续读取，不授权外部连接。
4. 将九类验收逐项绑定测试：正常发现；Human/E越权与撤权；状态/profile/凭据错配；丢响应、同key并发及异体冲突；旧revision；下游事务失败；初始化和resource重放；双客户端exact Session隔离；API/MCP重启、durable cursor和Stop。包含可读取正对照及数据库事实断言；新发现事务、新job明确不适用。
5. 记录受测head、Git blob与工作树换行映射、真实命令退出码、runtime、skip及首败。资源精确登记并在失败路径收尾，保全脱敏证据后仅清理确认归属且闲置的资源；已拒目标不重试或绕行。产品独审、最新候选PR RequiredCI及实际合入main证明齐备后验收，报告范围、文件、API变化、测试、演示步骤和剩余缺口。
