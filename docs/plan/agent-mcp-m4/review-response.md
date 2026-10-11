# discovery High(blocking)逐项答复

原审候选 `4e144f35759525a8a377acc73ba2f2dbfe02ab67`、基线 `c2b3d363c037157df13beb82799d99d07a9b7db8` 均保留可达。原审全文见 [原审](input/discovery-review/reviewer-feedback.md)，本轮指令见 [用户反馈](input/discovery-review/user-feedback.md)，不可变历史索引见 [history](history/index.json)。原审来源是用户直接注入的正式审查文本，不伪装本轮调用review API得到的回执。

本轮同步平台已修订的完整计划及仓库合同，不再修改平台计划。下列改动都是规划；High(blocking)状态为**已提交修订答复，待Chief安排正式复审**，不自行关闭。

| 原审问题 | 本轮真实修订与来源 | 未来产品执行与验收 |
| --- | --- | --- |
| generator只合M0–M3、registry仅M2/M3 | 完整读取 `scripts/generate-agent-discovery.py`，保全四批输入及基线；新增 [受控M4增量](product-discovery-decisions.json) 和 [生成合同](discovery-contract.md)，在实施步骤明确新增M4合成及注册集合来源 | 产品实施修改该生成器，在M0–M3后合M4 rules/bindings/registeredBindingIds；校验未知操作、缺真实注册、同批冲突和activation未完成时拒生成，禁止部分写。旧输入不改 |
| route-policy生成不更新discovery | 完整读取 `scripts/generate-route-policy-artifacts.mts` 和 Runner Skill生成器；计划区分三个生成责任及顺序 | 先 discovery，再 `pnpm generate:route-policy`，再 `pnpm generate:runner-skill`；不能以route-policy成功代discovery生成 |
| 四读仍有Human查询谓词 | 操作决策保留 `sourceRule` 现状，在 `planned.discovery.rule` 和M4 rules单列新资格；ADR0086、安全合同和消费者兼容同步引用 | 同时移除四项queryDifferences阻断及替换四项 `humanAuthorityMatches/legacyMembershipQueryVisible`；新谓词不放宽REST实时授权，详细表见下文 |
| 新bindings必须真实注册并保旧映射 | 基线逐条保存138 bindings、137 policy mappings及139历史registry输入；增量列16拟新增、3既有health/completion原样复制；实际 `registeredBindingIds=[]`、activation均false | 实际 `installDiscovery` 注册链由真实MCP夹具捕获，记录两种mode；缺注册不激活增量。新绑定current_session E/C、targetParameter=null、无installation bridge；旧bindings/mappings/identityVariants完整保留 |
| 必須验证重新生成零差异 | [九类与命令](verification.md) 列生成、暂存预期产物、再次生成、完整字节指纹和五文件 `git diff --exit-code` | 对全部旧输入hash及旧bindings/mappings/identityVariants比对；真实产品两轮生成必须零差异。当前未执行产品生成，文档辅助生成检查不能替代 |
| feature关闭、非法状态、合法target待核 | [九类](verification.md) 增加四规则精确pendingChecks及真实MCP回归，实施步骤纳入 `agent-discovery.test.ts` | 关闭feature/非法state/缺能力blocked；共同门禁合法而目标未知为requires_target_check；真实目标REST正反例证明最终准入。原ACK/heartbeat/Stop、C/E模式回归 |

## 四项替换规则与不扩大授权的依据

共同门禁逐字段复制现行 `listInitiatives` 的credentialMode/sessionKind/role/state/liveAuthority/capabilitiesAllPresent/featureEnabled；能力固定work:read、write=false、保原feature。Human合法REST读保持原分支，Agent不会获得Human membership。完整源规则与拟规则分开保存，不能改写旧现状称新投影已落地。

| 操作 | 新目标fact（allowed=true） | 现行授权依据与拒绝边界 |
| --- | --- | --- |
| getInitiativeRollup | initiativeLinkedProjectScope | 同listInitiatives live Session/Delegation/Team grant和project/item-linked scope，精确授权项目集合；非空正例且他scope排除；撤权拒而不是用非空聚合掩盖；保Human/200/COSTS/currency/unknown |
| getAutomationRun | routeResolvedScope、automationRunSessionMatches | 沿listAutomationRuns准确run.session_id=current Session；origin拿到targetId不授target读权；nullTeam不豁免 |
| getUsageSummary | usageSessionMatches、usageAgentMatches、usageProjectMatches、usageFiltersMatchCurrentSession | 沿recordUsage三方work:read及本人Session/Agent/真实绑定项目；显式filters不能变成跨Session/跨project查询；projectless拒显式project，合法空保unknown |
| streamA2ATaskEvents | a2aBindingActive、a2aTaskSessionMatches | 现行active binding/task准确Session、pin/protocol；最终batch实时授权核验与既有delivery唯一约束；有界扫描、空映射推进独立cursor |

未知目标只进入target-check，不提前授权；最终应用投影核精确凭据与principal，同SQL快照核返回事实。Runner保持executing E和原Activity/重放限制，A2A派生写不伪装零DB写。项目无归属Loop E不借Loop.project_id、delegation清单或admission推项目读取。无需新增产品范围卡。

## 当前证据与仍未执行项

[新增来源清单](input/discovery-review/source-manifest.json) 完整读取14个Git blob及运行字节映射；[读取回执](input/discovery-review/source-capture-receipt.json) 验原候选36交付文件blob一致并读取两自引用账本。原177来源清单和原审不覆盖改写。文档结构、来源、链接、增量数据和仅规划范围的实际结果见 [规划检查报告](planning-report.md)。

产品生成器、derived产物、后端、SDK/MCP/Runner均未修改；未部署、未运行产品生成/产品测试/Required CI。`registeredBindingIds`为空、registrationEvidence未运行、activation/postGenerationAcceptance均false是真实缺口。正式复审须消费本次新候选完整Git文件，不能拿原审或旧head检查验新组合；blocking仅由正式复审关闭。
