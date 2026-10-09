[2026-10-09 07:12:33 UTC] (assistant/implement/codex/gpt-6.1-sol) (took 802s) 我会按已独审的方案进入实现，先核对当前分支、真实 main 增量和受控合同，再补共享资格模型、MCP/Runner 发现投影及真实客户端验证。
真实 main 仍是已核准的 A2 合入点，已整合到本分支且没有冲突。资格合同将继续分成两层：API 只披露精确 Session 的已知资格，MCP 再按自身模式和注册表生成名单；直接 E 自身读取与 C→目标 E 桥接分别处理。
共享发现规则已从独审清单生成，保留了逐操作的角色、状态、能力和目标前提。首轮类型检查发现清单中的凭据字段同时使用字符串和数组；我正在将其规范化为统一类型，并接入 strict DTO 校验。
独立合同审查暂不通过。只读检查发现以下 M0 阻断项：

1. **High：操作变体未进入 adapter 判定。** `scripts/generate-agent-discovery.py:21` 未保存 `proposed.variant`；`packages/contracts/src/agent-discovery.ts:136` 恒查 `variant === null`。因此 `open_pull_request` 缺 `repo:open_pr` 时仍条件披露；reviewer complete/fail 缺 `artifact:write` 同样未被基础行阻断。SDK `index.ts:618` 也仅为 provider action 选择变体，没有选择 reviewer 变体。

2. **High：已知 delegation scope 拒绝丢失。** 生成器 `:12` 只复制 predicates，没有纳入 `qualifications.scope.typeRequired`。九项 Project/WorkItem/Milestone/relation 写规则已审要求 `team` scope，但已知非 team scope 无法被早判阻断。`agent-discovery.ts:71` 虽准备 scope 事实，规则没有使用它。

3. **High：旧 stale ACK SDK 入口回归。** SDK `index.ts:616` 强制 C 目标调用先取 qualified manifest。现行 refresh 允许 stale（`apps/api/src/agent/commands.ts:2588`），ACK 允许 stale（`authz/authorize.ts:381`），但 manifest 拒绝 stale（`:388`），于是原可执行的 SDK stale ACK 在发现阶段退出。受控合同明确保留旧 SDK/REST 恢复入口；不广告恢复不能替代兼容行为。

4. **High：多身份变体被压成首个匹配。** `agent-discovery.ts:125` 只按 credentialMode 取首项；get/post work room 的 C `target_execution` 排在 `current_session_without_target` 前面。缺 bridge 的 C 即使省略可选 sessionId、沿当前身份调用，也在 `:128` 被整体隐藏。须分别投影变体，保留当前身份路径。

另外，`deploymentSupported` 在 `:118` 永远等于 registered，缺 coordination/bridge 时仍返回 true；SDK `index.ts:304` 尚未检查两个 manifest actorId 的一致性及目标 actor 绑定。这两处也需修正后复核。

已确认：API 未混入 adapter 注册/mode 信息；旧默认响应仍走原 manifest；安装 null 联合未伪造 Session；目标 Token 使用局部 client；受保护 401/403 的现有请求循环不会 refresh 或重发。本次未修改文件，未宣称运行验收通过。
