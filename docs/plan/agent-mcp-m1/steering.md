# 当前修订来源与边界

本轮仅同步受控方案文件并提交同会话分支，未确认产品。平台当前完整注入计划 doc:UlypOW9r_NCpezuKHk6KQ 原文保存在 savedplan.md/implementation.md；工具只读回前缀，不以工具截断代全文，不再次 edit_plan。当前完整 spec 来自 platform-observation-current.json 的 Spec 段，独审基线为历史候选 69f84207b6cc85a46609bdb781ecb377f4e0d743。

## 用户本轮原文

原问卡20:28已答‘结算等待，自动继续’，已同步到完整spec，沿同todo同分支仅方案文档修订。20:47doc:UlypOW9r_NCpezuKHk6KQ只平台计划未改文件，请把当前注入完整原文同步docs/plan/agent-mcp-m1/savedplan.md/implementation.md和受影响ProposedADR0080/security-contract/compatibility/SCHEMA迁移提案/operation-decisions/lifecycle/verification/current-spec/steering及来源字节；旧69/gPL原件与static首败保持历史。上轮两blocking必须具体落文件：原complete/stopAck来源实际提交E Token/Connection/原安装身份/actor的可唯一证明快照，在原事务写而不是query补写或任意历史token关联；双C提前refresh后C1提交/C2确认拒及双nativeinstall误归属拒，旧null/unprovenfailclosed，Pi内部completion无独receipt及settle事实明确不可假认。最小迁移具体列结构/约束/回填缺口/新旧读写兼容/滚动升级/事务与锁序/失败回滚，不能先假零迁移或扩大权限。等待路线按所选当前模型停止并公开等待回复settle、条件持久精确关联Approval或输入、后续唯一Turn经Worker合法claim/start/live权限/state校验；完整时序和状态转换、Lease与attempt结算/restart/debounce幂等、授权撤回/Stop/pause优先、条件反复触发/事务失败无重复Attempt/漏resume/挂Turn，真实Pi‘等→Human批准/输入→继续完成’正拒场景均映射。现行runPi poll非executingabort与RUNNER_ABORTED跳settle/assignmentadmission的实际修订及兼容具体化，不让模型等待跨2分钟长占同Attempt，也不自动解除pause。零副作用只读identity绕resolveCoordinationIdentity usage/createCsession、查询拒绝审计既有例外边界保，原普通terminalE禁写、旧SDK/MCP恢复与Human权限不回归。仅方案静态核验/source全文归档/Gitworkbytes/工具截断versionnull实证，无产品服务测试；重新真mainref区别历史base，不循环edit_plan。提交准确新head停confirm另一Agent定向两block独审，不只摘要审、不提前产品/文档merge完成整卡。

## 独审阻塞与用户选择

归属阻塞：refreshAgentToken 允许同 Agent/principal/Team 的另一 Connection 对相同执行 Session 签发 Token。commandContext 与现有幂等回执没有提交 Token/Connection，任意历史 Token 关联不足。反例 C2 提前 refresh，C1 complete，C2 不得确认 C1 原结果；同 Agent 双原生安装同理。旧来源不能唯一证明时失败关闭，取消零迁移假设。

等待阻塞：runPi 轮询非 executing 即 abort；executeTurn 对 RUNNER_ABORTED 跳过 settlement；assignment 只接收 queued/acknowledged/executing。进入 awaiting_approval/awaiting_input/blocked 会悬挂 Turn。用户选择“结算等待，自动继续”：公开结算原 Turn/Attempt、持久精确条件，满足后唯一后续 Turn 重新准入，不占旧 Attempt 跨模型时限、不自动解除 pause。该行为已写入当前 spec；字段与迁移仍是 Proposed，未冒称用户逐字段批准。

历史 gPL 原方案、工具截断、首败及原字节在 [历史索引](history/candidate-69-manifest.json)；不删除旧首败文件，不把历史检查用于本轮新合同。
