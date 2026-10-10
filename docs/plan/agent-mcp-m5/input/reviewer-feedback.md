我会先核对候选提交中的完整规划、冻结来源和现有代码合同，重点检查真实客户端隔离、四条验收链及故障验证是否可执行。全程只读。
候选提交与给定 SHA 一致，差异集中在规划目录。我已读完四条主链和九类矩阵，接下来核对 Handoff、审查完成、Pi 幂等恢复及 MCP 签名材料的实际代码，确认这些步骤能按方案串起来。
已发现无 Git 链的一处时序冲突：现有 Handoff 接受事务会结束来源 Delegation，但方案随后仍要求来源 Agent 读子状态、更新 Plan 并申请批准。我也在核对双客户端 Plan 冲突用例和 Pi 失响应重试是否有实际代码支撑。
请先处理以下问题，再开始编码。

1. > B 发布本人结果／证据并完成；A 查询直接子状态，完成原 Plan；实际 requestApproval，公开等待

   `acceptHandoff` 会将 A 的来源 Delegation 置为 `completed`（`apps/api/src/collaboration/routes.ts:1723`），后续准确 E 授权要求 Delegation 仍为 active。因此 N5–N6 中 A 的读取、Plan 更新、批准请求及完成无法继续。请让交接后的剩余工作由 B 的新 Session 承接；父读子后父完成另用保留父授权的 child/review 场景验证，并明确旧 A 的拒绝结果。(blocking)

2. > O与P获同Plan／Document基revision并发写

   F5 尚未给出合法的共同 Plan 写入身份。当前 O/P 使用两个 Agent 的各自 E，而 `publishPlan` 要求调用者的 `agentSessionId` 精确匹配目标 Session；两个 Session 不能共同修改其中一个 Plan，先得到的是身份拒绝。请明确同一 Plan 的所有者、两消费者合法取得准确 E 的方式及 Runner fence 时序，再断言旧 revision 冲突。跨 Session 拒绝须单独归入越权用例。(blocking)

3. > Pi同toolCall HTTP retry使用原派生key，重启新Attempt读原facts不盲重发

   普通工具目前没有这条 HTTP 重试路径：`makeTool` 调用一次 `api.request`，失响应后直接抛错；`RunnerApi.request` 也只发送一次。自动原 key 重试仅存在于外层 settle。请明确 F4 如何由真实 Pi 普通工具发出第二次原 key/body 请求；若需最小 Runner 修复，将其纳入实施文件和验证步骤。代理代重发、协议对照重放或新的 toolCall 都不能作为这项通过证据。(blocking)
