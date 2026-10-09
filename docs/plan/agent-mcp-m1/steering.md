# 当前修订来源与边界

本轮仅同步受控方案文件并提交同会话分支，未确认产品。当前完整注入计划 doc:3OqOjIiQK-CWC5I9F6_SC 原文保存在 savedplan.md/implementation.md；旧Ulyp计划与004554原件已在history保全；工具只读回前缀，不以工具截断代全文，不再次 edit_plan。当前完整 spec 来自 platform-observation-current.json 的 Spec 段，独审基线为历史候选 69f84207b6cc85a46609bdb781ecb377f4e0d743。

## 用户本轮原文

原问卡20:28已答‘结算等待，自动继续’，已同步到完整spec，沿同todo同分支仅方案文档修订。20:47doc:UlypOW9r_NCpezuKHk6KQ只平台计划未改文件，请把当前注入完整原文同步docs/plan/agent-mcp-m1/savedplan.md/implementation.md和受影响ProposedADR0080/security-contract/compatibility/SCHEMA迁移提案/operation-decisions/lifecycle/verification/current-spec/steering及来源字节；旧69/gPL原件与static首败保持历史。上轮两blocking必须具体落文件：原complete/stopAck来源实际提交E Token/Connection/原安装身份/actor的可唯一证明快照，在原事务写而不是query补写或任意历史token关联；双C提前refresh后C1提交/C2确认拒及双nativeinstall误归属拒，旧null/unprovenfailclosed，Pi内部completion无独receipt及settle事实明确不可假认。最小迁移具体列结构/约束/回填缺口/新旧读写兼容/滚动升级/事务与锁序/失败回滚，不能先假零迁移或扩大权限。等待路线按所选当前模型停止并公开等待回复settle、条件持久精确关联Approval或输入、后续唯一Turn经Worker合法claim/start/live权限/state校验；完整时序和状态转换、Lease与attempt结算/restart/debounce幂等、授权撤回/Stop/pause优先、条件反复触发/事务失败无重复Attempt/漏resume/挂Turn，真实Pi‘等→Human批准/输入→继续完成’正拒场景均映射。现行runPi poll非executingabort与RUNNER_ABORTED跳settle/assignmentadmission的实际修订及兼容具体化，不让模型等待跨2分钟长占同Attempt，也不自动解除pause。零副作用只读identity绕resolveCoordinationIdentity usage/createCsession、查询拒绝审计既有例外边界保，原普通terminalE禁写、旧SDK/MCP恢复与Human权限不回归。仅方案静态核验/source全文归档/Gitworkbytes/工具截断versionnull实证，无产品服务测试；重新真mainref区别历史base，不循环edit_plan。提交准确新head停confirm另一Agent定向两block独审，不只摘要审、不提前产品/文档merge完成整卡。

## 独审阻塞与用户选择

归属阻塞：refreshAgentToken 允许同 Agent/principal/Team 的另一 Connection 对相同执行 Session 签发 Token。commandContext 与现有幂等回执没有提交 Token/Connection，任意历史 Token 关联不足。反例 C2 提前 refresh，C1 complete，C2 不得确认 C1 原结果；同 Agent 双原生安装同理。旧来源不能唯一证明时失败关闭，取消零迁移假设。

等待阻塞：runPi 轮询非 executing 即 abort；executeTurn 对 RUNNER_ABORTED 跳过 settlement；assignment 只接收 queued/acknowledged/executing。进入 awaiting_approval/awaiting_input/blocked 会悬挂 Turn。用户选择“结算等待，自动继续”：公开结算原 Turn/Attempt、持久精确条件，满足后唯一后续 Turn 重新准入，不占旧 Attempt 跨模型时限、不自动解除 pause。该行为已写入当前 spec；字段与迁移仍是 Proposed，未冒称用户逐字段批准。

历史 gPL 原方案、工具截断、首败及原字节在 [历史索引](history/candidate-69-manifest.json)；不删除旧首败文件，不把历史检查用于本轮新合同。

## 本轮最新裁定与同步授权

继续同todo同分支仅方案文档修订，当前完整spec用户自动续Turn/终态精确只读路线不变。最新doc:3OqOjIiQK-CWC5I9F6_SC已自动修但你明确未改文件，仓库004554仍旧冲突；请将本轮注入完整plan原样同步savedplan.md/implementation.md及affected ProposedADR/DDL/schema-proposal.sql/迁移合同/等待合同/DTOZodWorker比较提案/operation映射/verification/current-specsource绑定。定向落实本轮两blocking：批准hash沿requestApproval/现Zod/批准消费真实‘sha256:<64hex>’全字符串，不能裸hex或strip前缀，waiting DTO-DDL-Worker一致；真实批准正向测试计划使用requestApproval实际返回hash而非手拼fixture。prompt复合FK改精确(agent_session_id,trigger_prompt_id)→agent_session_prompts(session_id,id)，新迁移先建匹配唯一约束，不能用不存在workspace_id；workspace授权仍在锁内另核，clean与升级旧数据库、正确Sessionprompt、其他Session拒绝及重复/旧数据/回滚兼容场景写完整。重新核真实当前mainDDL/code锚点，静态检查必须对源schema/hash引用语义有具体正拒反例，不只是计划字符串自证，保两失败意见及原004554/69等Git工作字节历史和首静态失败。上一原动作归属方案层面已闭、等待自动路径已明确，不无变化重开或再edit_plan造版本，不把未跑产品数据库迁移/真实tests假过。仍仅受控文档与适用静态核验，无产品SQL执行/服务测试。提交准确新head/文件入口停confirm交另一Agent仅两合同项定向复审，闭合后Chief按委托confirm实现；不只平台摘要审/不文档merge完成本卡。

当前平台注入完整plan为doc:3OqOjIiQK-CWC5I9F6_SC；四处已保存平台替换与本轮完整正文逐字对应，savedplan/implementation保持一致，未再次edit_plan。当前Spec工具全文未包含这轮独审修正，effective spec按该工具全文加本节最新steering与已保存平台plan绑定，不伪称todo Spec已经改写。

原动作归属方案层面已闭、等待恢复路径已明确；本轮仅针对hash/prompt FK两合同项提交定向复审，不将静态检查或旧首败冒新产品通过。
