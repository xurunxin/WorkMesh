# 逐操作现行合同与拟补消费者矩阵

全部 planned；当前没有本批产品运行通过。完整角色/状态/capability/feature/凭据谓词逐项原样保存在 [结构化矩阵](operation-decisions.json) 的 sourceRule，来自精确主线解析，不以通用 pending 代审计。

六域默认 feature 均关闭；独立部署全开是已选择的未来目标，当前容器没有被启用。普通 SavedView、Health/Completion 的 feature 为现行 null，不随六域假造新开关。

| operationId / 域 | 当前后端与权限边界 | 拟 SDK / MCP（Runner同名加workmesh_） | 允许正例 | 拒绝/兼容对照 |
| --- | --- | --- | --- | --- |
| `listCycles` / Planning | 当前Team/null集合；签名分页；既有领域合同，目标仍逐次核验 | `listCycles` / `list_cycles` | 当前Team current/upcoming/history分页 | 跨Team、撤grant、关闭Planning |
| `listInitiatives` / Planning | 准确Session或WorkItem项目关联；Team-only C不自动含项目；既有领域合同，目标仍逐次核验 | `listInitiatives` / `list_initiatives` | 两个关联Initiative分页且仅授权项目可见 | 跨项目、先list撤Delegation |
| `getInitiativeRollup` / Planning | 与list相同linked授权项目；200上限/COSTS；Human membership查询差异，发现明确阻断 | `getInitiativeRollup` / `get_initiative_rollup` | 非零completed/health/多币种准确排除另一scope | 撤grant后拒绝而非零；Human、201可见上限 |
| `listSavedViews` / SavedView | 内置＋准确owner/当前Team；非Advanced管理；既有领域合同，目标仍逐次核验 | `listSavedViews` / `list_saved_views` | 本人private保存过滤和内置页 | 另一个owner私有项、跨Team、撤权 |
| `createSavedView` / SavedView | owner固定current actor；原Team和work:write；既有领域合同，目标仍逐次核验 | `createSavedView` / `create_saved_view` | 同key/body只一个saved_view及event/outbox | 异体key冲突、他Team、owner注入不能生效 |
| `listAdvancedViews` / Planning | owner/workspace/currentTeam；列表不授管理；既有领域合同，目标仍逐次核验 | `listAdvancedViews` / `list_advanced_views` | 三种现行可见范围分页 | 他owner private、关闭Planning |
| `evaluateAdvancedView` / Planning | 额外resultScope及受支持layout/filter；cost需currency；既有领域合同，目标仍逐次核验 | `evaluateAdvancedView` / `get_advanced_view_results` | 准确workItem/project/Session结果和cursor | 越resultScope、非法filter、混币请求 |
| `listAutomationRules` / Automation | 当前Team/null规则读取；管理Human；既有领域合同，目标仍逐次核验 | `listAutomationRules` / `list_automation_rules` | 规则current version/condition/actions完整 | 跨Team、撤grant、Agent触发/改版拒绝 |
| `listAutomationRuns` / Automation | run.session_id==当前Session；rule/loop过滤；既有领域合同，目标仍逐次核验 | `listAutomationRuns` / `list_automation_runs` | 本人run分页/source/trace | 另Session、session_id=null、跨Team |
| `getAutomationRun` / Automation | 准确当前Session run/effects；nullTeam不豁免；Human membership查询差异，发现明确阻断 | `getAutomationRun` / `get_automation_run` | 本人真实Loop target E读run及ordered effects | origin E读target、别人nullTeam run、Stop |
| `listLoops` / AgentLoops | workspace/owner/currentTeam现行列表；recent_runs仅元数据；既有领域合同，目标仍逐次核验 | `listLoops` / `list_loops` | 可见Loop/pin/预算与最近运行 | private owner、跨Team、feature关闭 |
| `runLoopNow` / AgentLoops | automation:manage＋work:write；同Team/admission/no-overlap/预算；既有领域合同，目标仍逐次核验 | `runLoopNow` / `run_loop_now` | 合法origin admission后target另接单；同occurrence单事实 | 停用pin/Loop、竞争容量预算、跨Team/撤权 |
| `recordUsage` / Costs | 本人Session/Agent/准确项目或projectless；仅work:read；既有领域合同，目标仍逐次核验 | `recordUsage` / `record_usage` | 已知/unknown usage及独立币种；命令事实完整 | 冒他Session/Agent/项目、同key异body、extra Activity禁止 |
| `getUsageSummary` / Costs | 准确本人Session/Agent/项目；totals/buckets同快照；Human membership查询差异，发现明确阻断 | `getUsageSummary` / `get_usage_summary` | from-inclusive/to-exclusive和known/unknown；合法空 | 异Session显式过滤、撤权、零记录不能呈免费 |
| `listTemplates` / Template | 仅当前run执行pin的Template/version/body；既有领域合同，目标仍逐次核验 | `listTemplates` / `list_templates` | Loop target pinned body/hash/version分页 | 普通E无pin合法空、他owner/pin、停用Template |
| `streamA2ATaskEvents` / A2A | active绑定task到准确Session；最多扫描200；派生去重；Human membership查询差异，发现明确阻断 | `getA2ATaskEvents` / `get_a2a_task_events` | target E单页和无映射页推进checkpoint | 另task/session、越bigint、撤权between scan/insert |
| `getProjectHealthHistory` / Health | 已有准确project execution E；current grant；既有领域合同，目标仍逐次核验 | `getProjectHealthHistory` / `get_project_health_history` | 合法project E分页published/draft合同对照 | projectless Loop E、C模式、跨project |
| `createProjectHealthUpdate` / Health | 已有agent草拟；source=agent/If-Match；publish需批准；既有领域合同，目标仍逐次核验 | `createProjectHealthUpdate` / `create_project_health_update` | draft与Human精确approval后published | 旧revision、未批准publish、非精确project |
| `suggestWorkItemCompletion` / Completion | 已有准确project/workItem E提案；不transition；既有领域合同，目标仍逐次核验 | `suggestCompletion` / `suggest_work_item_completion` | 合法suggestion＋evidence，工作流保持 | 越workItem、Agent decide/publish管理拒绝 |

SDK/MCP覆盖sourceRule准许的真实C/E模式；四投影的C scope可能合法为空/隐藏，不给coordination Session挂虚构项目。Runner仅execution/executing E，health/completion沿原更窄credential/role合同。所有写工具只读模式不注册；所有读取每次target核验，pagination/binding不授读权。费用写关闭Activity包装，A2A读派生写不发领域event/outbox。

## 保留Human管理

以下按现行六域规则逐项列出，不因工具数量或enabled转成Agent授权；completion Human decision另沿原稳定域合同。

| operationId | feature | 判定 |
| --- | --- | --- |
| `createCycle` | `WORKMESH_BETA_PLANNING` | 保持Human管理，不新增Agent适配或授权 |
| `generateCycles` | `WORKMESH_BETA_PLANNING` | 保持Human管理，不新增Agent适配或授权 |
| `carryOverCycleWork` | `WORKMESH_BETA_PLANNING` | 保持Human管理，不新增Agent适配或授权 |
| `createInitiative` | `WORKMESH_BETA_PLANNING` | 保持Human管理，不新增Agent适配或授权 |
| `createAdvancedView` | `WORKMESH_BETA_PLANNING` | 保持Human管理，不新增Agent适配或授权 |
| `createAutomationRule` | `WORKMESH_EXPERIMENTAL_AUTOMATION` | 保持Human管理，不新增Agent适配或授权 |
| `createAutomationRuleVersion` | `WORKMESH_EXPERIMENTAL_AUTOMATION` | 保持Human管理，不新增Agent适配或授权 |
| `dryRunAutomationRule` | `WORKMESH_EXPERIMENTAL_AUTOMATION` | 保持Human管理，不新增Agent适配或授权 |
| `triggerAutomationRule` | `WORKMESH_EXPERIMENTAL_AUTOMATION` | 保持Human管理，不新增Agent适配或授权 |
| `setAutomationRuleState` | `WORKMESH_EXPERIMENTAL_AUTOMATION` | 保持Human管理，不新增Agent适配或授权 |
| `createLoop` | `WORKMESH_EXPERIMENTAL_AGENT_LOOPS` | 保持Human管理，不新增Agent适配或授权 |
| `setLoopState` | `WORKMESH_EXPERIMENTAL_AGENT_LOOPS` | 保持Human管理，不新增Agent适配或授权 |
| `setBudgetPolicy` | `WORKMESH_BETA_COSTS` | 保持Human管理，不新增Agent适配或授权 |
| `createTemplate` | `WORKMESH_BETA_TEMPLATES` | 保持Human管理，不新增Agent适配或授权 |
| `createTemplateVersion` | `WORKMESH_BETA_TEMPLATES` | 保持Human管理，不新增Agent适配或授权 |
| `setTemplateState` | `WORKMESH_BETA_TEMPLATES` | 保持Human管理，不新增Agent适配或授权 |
| `exportTemplates` | `WORKMESH_BETA_TEMPLATES` | 保持Human管理，不新增Agent适配或授权 |
| `importTemplatesAsDrafts` | `WORKMESH_BETA_TEMPLATES` | 保持Human管理，不新增Agent适配或授权 |
| `configureA2ABinding` | `WORKMESH_EXPERIMENTAL_A2A` | 保持Human管理，不新增Agent适配或授权 |
| `acceptA2ATask` | `WORKMESH_EXPERIMENTAL_A2A` | 保持Human管理，不新增Agent适配或授权 |

现行 `createAdvancedView` Human-only、`decideCompletionSuggestion` Human-only 均保留。首轮真实测试须对每个Human保留动作使用Human合法正例与准确Agent拒例；不以没有工具作为REST拒绝证据。外部通知发送不执行，只验证准入拒绝与fake adapter事实。

## 四读新资格与精确bindings

[受控discovery增量](product-discovery-decisions.json)列4项完整新rules、16项新增绑定及3项原样保留的health/completion绑定；[发现合同](discovery-contract.md)解释逐项谓词、未知目标与生成边界。当前sourceRule仍是主线旧事实，planned.discovery.rule才是待实施替换，不覆盖sourceRule。registeredBindingIds为空且registrationEvidence未运行，不是假实测清单；实际捕获前不得启用产品生成。
