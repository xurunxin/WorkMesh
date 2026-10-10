# 三项阻断的处置提案与复审入口

状态：本轮实际同步规划，等待_oY复核；B1/B2/B3均未正式闭合，产品修复及联合验收未运行。edit_plan接受、规划静态exit0和生产者自述不关闭blocking。

原审核全文见[input/reviewer-feedback.md](input/reviewer-feedback.md)，明确落盘反馈见[input/sync-feedback.md](input/sync-feedback.md)。原候选全部47个规划Git对象及修改前实读worktree在[基线索引](review-base-manifest.json)和[input/candidate-before-review.zip](input/candidate-before-review.zip)，旧首败及旧回执保持原含义。原main源码完整归档及双字节索引继续消费，当前重新fetch事实见[input/sync-main-observation.json](input/sync-main-observation.json)。

| finding | 当前真实源码与问题 | 选定处置及身份时序 | 未来实证／当前结果 |
| --- | --- | --- | --- |
| B1 blocking | collaboration/routes.ts的acceptHandoff在事务内把source Delegation completed；agent/guard.ts要求active，原N5–N6再用A不可执行 | N4–N6全部剩余工作转B的新Session，授权brief/context→B本人新Plan→批准/等待→B证据/完成；旧A事实不覆盖、不复活。另建未Handoff的active父/requiredchild链及原Git requiredreview | 两个方向实际客户端运行，B终态、A sourceDel与实际state、旧A四原E拒例分别记录；R拒例不冒来源Pi模型实收。child前父拒、child后父active完成。未运行、待复核 |
| B2 blocking | agent/commands.ts:publishPlan→guard.ts:loadAgentSessionForMutation/revalidateLockedAgentSessionForMutation要求actor.agentSessionId精确等于target；跨Session先身份拒绝 | 独立owner B/S，O静态MCP从B原installation取得S准确E，Pi从同installation正常refresh S准确E；Pi真实claim/credential/start唯一Attempt running后两模型读同revision/Plan，O先/P先屏障两轮。失败方新intent明确合并。service/fence只由Pi控制入口持有，不交O或模型 | 同owner/Session/installation凭据指纹（不同E字节可合法）、start/durableAttempt/commit时序、实际冲突code/currentRevision、两model实收、Plan stableID/版本/合并。跨Session归F2，旧fence另测控制拒绝。未运行、待复核 |
| B3 blocking | RunnerApi.request单fetch、makeTool单api.request；原replayableSettle是另一专属恢复，单元两次execute不算真实自动重发 | 新最小Runner提案及ADR，三个operation内部白名单、精确transport cause/自有timeout、同key/body/E/headers/If-Match、单execute内最多一重放、统一截止/signal。准入原E/原Attempt/lifecycle；拒绝不refresh，不重入Activity，二失败首cause保unreconciled | 三个单toolCall普通写首commit失响应后Runner第二原HTTP；业务effect一、公开Activity分账。API真实重启仍同Runner/Attempt预算，O另测MCP重启；两次丢失、二次拒绝、Stop/revoke/cancel、newintent、GET/明确HTTP/provider不重发。未实现/未运行、待复核 |

逐步路径见[journeys](journeys.md)，九类及适用理由见[acceptance](acceptance-matrix.md)，准确所有者和重试边界见[security](security-contract.md)，拟变更文件见[implementation](implementation.md)，ADR拟正文见[提案](adr-proposal.md)，checks见[verification](verification.md)。所有未来支持结果仍未测。

本轮只执行规划来源/全文/矩阵/链接/UTF-8/空白/CI分类/暂存与commit byte核验；实际原stdout/stderr/nativeexit/runtime在review-checks相关回执。新增文件及数量按实际统计，不能把原候选47、原43check或旧CI419借作新组合通过。原候选完整byte归档不代表取得独立平台doc原件，后者缺口见sources。

交付新head后停confirm；_oY正式复核三项并消除blocking/high、Chief confirm齐全前，禁止改Runner产品、运行联合验收、安装/登录/外部授权或公共发行。
