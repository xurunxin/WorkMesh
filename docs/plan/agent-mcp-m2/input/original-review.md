[2026-10-09 19:49:48 UTC] (assistant/plan_review/codex/gpt-6.1-sol) (took 92s) 我会只读核对规划包、冻结 M2 要求和现有实现，重点检查父子投影授权、reviewer 准入与预算，以及 Agent 工具权限。
已确认候选 head 为 `5356b0619bffe3130a377f68e38a2a89931962a1`，相对 main 的差异仅为 52 份规划工件。正在核对全额 reviewer reservation 与现有预算消耗的关系，以及完整调用链是否受现有权限限制。
发现一个明确的可行性缺口：方案要求通过现有 DTO 设置父／step 子任务上限，但当前合同和 Plan 写入代码没有这些字段。另在核对预算提案：全额 reviewer reservation 会让已有正额 child reservation 的有限预算父 Session 无法再创建 reviewer。
只读静态校验退出 0，核对了 877 个来源条目、91 个操作和 18 行原验收要求；工作树仍干净，未运行产品测试。审查将列出预算恢复方案、上限配置入口和创建响应字段保留这三个问题。
请在编码前解决以下问题。审查 head：`5356b0619bffe3130a377f68e38a2a89931962a1`。

1. > reviewer 按继承预算全额 reservation，余额不足返回明确拒绝；不自动释放既有 reservation。

   任一受限维度已有正额 reservation 时，`reserved + parentCap > parentCap`，因此普通 child 完成后仍必然无法创建 reviewer。ADR0082 所述“Human 修订父预算后再 review”也无法解决：现有 API 没有该入口，而且增大预算仍会被 reviewer 全额预留。删除这一恢复承诺，明确有限预算下 child→reviewer 链永久受阻的兼容性收缩，并提交明确裁定；不能仅用 `{}` 预算成功证明该链完整。(blocking)

2. > 父上限及 step 限额以现有 DTO字段控制。

   `planStepInputSchema` 没有 `maxChildSessions`，`publishPlan` 的 INSERT 也不写 `max_child_sessions`；父创建合同同样没有上限字段。当前两者使用数据库默认值 8，传入额外字段会被 Zod 丢弃。修正运行方案：明确哪些测试使用默认上限、哪些通过特权夹具构造；若要求客户端配置，须先冻结相应合同、持久化和 Runner 参数变更。(blocking)

3. > 统一两种创建的共享输入／typed 输出……保留……原消费者字段。

   操作矩阵却指定直接使用 `agentSessionResponseSchema`。该 schema 会丢弃现有创建响应中的 `parent_session_id`、`plan_step_version_id`、`required_for_parent`、`inherited_budget`、`max_child_sessions`，与字段保留及精确绑定读回承诺冲突。冻结包含这些字段的创建响应 schema，并加入 SDK／MCP 实收字段保留断言。(blocking)
