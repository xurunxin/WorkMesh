# 本次补交反馈与授权

## 完整补交反馈

已读你的confirm交付：只有doc:K7ASX6igBDq85SckGcuui计划链接且称本轮未修改文件。Chief独立git当前branch仍c768/main，docs/plan/agent-mcp-m0/不存在，不能用聊天摘要代完整计划独审。请在原todo仅补交现有完整savedplan正文至docs/plan/agent-mcp-m0/受控文件，附当前完整spec、精确main/source/平台docID及真实生成时序（版本无字段null，不循环创建计划预填ID）、操作决策清单、兼容策略、适用测试DoD映射；不产品实现。提交后停confirm供另一Agent平台独审。已明确12:00批次实施授权，无需重新问方向。用户刚要求待开始卡移除WebUI、聚焦后端基础设施；M0本身不设计UI，仍保留现行消费者相称兼容验证，不扩Human/C/E权限。具体发现协商字段/Runner401刷新边界/真实API MCP conformance方案需完整可复核。本次只把已有计划落盘，不无收益跑全产品tests。

## 实读问卡与答复

Q: 反馈要求本轮把现有 savedplan 落盘并提交，但本条消息末尾仍明确要求“Do not modify any files yet”。请确认本轮是否允许仅写入并提交 docs/plan/agent-mcp-m0/ 受控文档，随后停在 confirm，不改产品代码或运行全产品测试？

A: 允许仅文档落盘（推荐）

问卡ID为 `q-zCTE6mPE0AbODLww6cUer`。本轮依该授权仅交付受控文档，不创建新的平台计划版本。平台阶段由平台控制，本代理不伪造已进入confirm或已独审通过。

## 独审、平台修订与本轮同步指令（实际conversation）

[2026-10-09 04:59:04 UTC] (assistant/plan_review/codex/gpt-6.1-sol) (took 208s) 我会读取候选中的完整受控方案、合同草案和现行代码，重点核对资格模型、兼容行为与真实客户端验证是否可落实；本轮只读，不修改文件。
已确认候选 head 与注记一致。我正在逐项对照 HTTP/stdio 接线和操作清单，重点检查增强 DTO 能否区分安装凭据与 Session，以及共享 binding 是否覆盖实际调用的全部前置读取。
发现了几处需要在编码前定清的缺口：API 没有 MCP 的只读模式或实际注册表上下文；操作清单仍有通用占位决定，未明确部分已知角色限制；新增真实 conformance 只接入根集成脚本，也不会自动进入现行 Required CI。正在收束为具体修订项。
请在编码前解决以下问题。

1. > registered记录代码中兼容callback是否存在，discoverable记录此请求的tools/list或resource名单结果

   `compatibility.md` 把这些字段放进 API 的增强响应，但 API 不知道 MCP 的 `options.mode`、实际注册表或 stdio/HTTP 配置；同一 Session 在只读和读写 MCP 上的名单可以不同。请明确 API 输出与 adapter 投影的字段归属、输入和计算规则，并让 `getWorkMeshContext.allowedOperations` 使用同一次 adapter 投影。补同一身份连接两种 mode 的一致性测试。(blocking)

2. > credentialMode: 'agent_session' | 'coordination_connection' | 'installation_target'

   当前 `agent-capabilities` 要求精确 Session；`installation_target` 身份没有 `agentSessionId`，无法填充草案必填的 Session/Delegation 字段。另一个问题是：Coordination 客户端获取的是当前 C manifest，而带 `sessionId` 的执行工具通过 SDK 刷新目标 E 的 Token，不能拿 C 的角色和状态判定目标 E 的资格。请冻结两条路径：安装凭据在发现中如何表示、目标 E bridge 如何获得并绑定自己的资格；明确未给目标时的保守结果，保持现行鉴权边界。(blocking)

3. > 逐operation记录分类、C/E/H资格、注册与发现、具名SDK/Runner实现、条件、源码出处、测试和后续归属。

   当前 `operation-decisions.json` 多数资格仍是通用占位句，未形成可实施的逐项决定。例如 `getCurrentAgentConnectionIdentity` 的 E 行仍为 `requires_target_check`，但普通 E Bearer 已明确不满足其 Connection 认证；`publishAgentPlan` 未记录 `commands.ts:2824` 的 reviewer 拒绝。绑定也有冲突：`prepare_project_import` 仍挂在 `listProjects` 下，而兼容提案声明其为无 REST 的内部操作；`verify_connection` 未列入复合表，却实际读取 manifest、current identity 和 Teams。请补齐已知凭据、角色、状态和变体规则，区分当前 binding 与拟修正 binding；未核实项明确 blocked，并绑定具体源码及反例测试。全集相等不能替代这些决定。(blocking)

4. > 新真实套件从普通单元发现中排除，单独test:integration入口显式include该文件、passWithNoTests=false，并由根必需集成脚本执行

   现行 `.github/workflows/ci.yml` 不调用根 `pnpm test:integration`，而是分别调用 db/api/worker/recovery 脚本；agent-smoke 调用的仍是内存 conformance CLI。按当前方案接线，新真实套件可以完全未运行而 Required CI 通过。请明确将它接入哪个现有必需 job，补服务准备、执行、失败传播和证据上传步骤，以及防止入口漏接的检查。(blocking)
[2026-10-09 05:05:49 UTC] (assistant/plan_revision/codex/gpt-6.1-sol) (took 401s) 这四项需要修订计划。我会先核对资格查询、E Session bridge 和 Required CI 的实际接线，再明确 API 与 adapter 的字段分工，补齐操作决策及测试入口；本轮仍只修订方案文档，不进入产品实现。
源码确认了两处关键边界：增强 manifest 仍须由精确 Session 获取，SDK 的目标 Token 已按单次请求使用，不改写共享身份。CI 也确实分别运行集成脚本；计划将把真实 MCP 套件接入现有 `api-integration` job，并增加检查防止入口漏接。
计划已分开 API 资格与 MCP adapter 名单，并明确安装凭据不填充 Session DTO。目标 E 工具将在调用前读取并绑定该 E 自身的资格；未指定目标时仅披露条件入口，`allowedOperations` 不再把它计为当前 C 可执行操作。
已针对四项阻断意见修订平台计划，明确 API／adapter 字段归属、安装凭据与目标 E bridge 边界、逐操作决策要求及 Required CI 接线。本轮未修改文件或运行产品测试；编码前须同步受控文档，并完成独立复审与 Chief 确认。

[plan](doc:WS-FdgmfTwloZE8hNXvAb)
[2026-10-09 05:06:33 UTC] (user/plan_revision) 沿用户12:34已给的“允许仅文档落盘”和本批条件推进授权，继续同分支仅同步方案文件，不进入产品。05:05:49 UTC的修订平台plan已生成，但你明确未修改文件，所以当前00a5e34e受控21文件尚是上一已被阻断版本；不能拿平台摘要代仓库方案复审。请把当前注入的完整修订plan（doc:WS-FdgmfTwloZE8hNXvAb）原文同步至docs/plan/agent-mcp-m0/savedplan.md及implementation.md，并同步其他依赖文档、277逐操作/credential/role/state/variant决策（含代码绑定和反例测试）、来源及Git字节绑定。落实上一独审四项：API资格与adapter配置/readonly注册发现投影分工和Context.allowedOperations同次一致性；installation字段与C→目标E单次Token bridge各自资格、未提供目标条件广告不算可执行；getCurrentAgentConnectionIdentity/publishAgentPlan reviewer deny/prepare_project_import adapterinternal/verify_connection组成等准确当前与拟变体映射，待核项明确blocked；真实conformance接现有api-integration Required job的service准备/执行/失败传播/证据上传及防漏接检查。保留原计划及截断/版本null/首败历史，不编造版本、工具全文或产品运行证据。提交新准确head并停confirm交另一Agent定向复审；不再次edit_plan循环造doc，不confirm产品或merge文档完成整卡。规格既有‘先受控完整方案独审再产品’不变，原四项未闭前不实施。
