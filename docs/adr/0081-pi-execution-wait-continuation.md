# Pi 等待公开结算与自动续 Turn

## Status

Proposed。用户已裁定“结算等待，自动继续”；本 ADR 的wire/数据/锁序仍待另一 Agent 独审，不表示产品确认或验收。

## Context

当前runPi在非executing状态abort，executeTurn遇RUNNER_ABORTED跳settle；assignment只接queued/acknowledged/executing。直接加等待态工具会悬挂Turn。等待批准或输入可能超过单模型Turn时限，不能长占旧Attempt或擅自resume/pause。

## Decision

模型等待工具只形成waitIntent，关闭新工具/context/steering与模型，等idle和已知在途清理、释放自己Lease后，使用独立有界signal和稳定外层settle key/body。同事务公开等待回复、工具账本、Turn/Attempt结算、Session合法等待态、准确批准ID/hash或输入边界与pending wait、原响应和既有event/outbox。必须externalEffectsReconciled=true，不确定在途不登记自动恢复。

采用独立WAIT_REQUESTED结果，不能当RUNNER_ABORTED跳结算；executeTurn返回waiting，main仅monitor。没有运行旧Attempt/续Lease/长模型调用。默认executionWaits=false；opt-in在claim时持久存Attempt，旧Runner不能领取自动续Turn或被复用的续接HumanTurn。

Worker定期reconcileWorkbenchWaits，复用authority→资源→Conversation/Turn/Attempt锁，最后锁wait。重验精确原来源、principal、Connection/安装、双Delegation、grant/scope、负责Human、模型权限；批准需准确approved/hash/未过期未消费，input/blocked需边界后准确Session prompt或同Conversation合法Human消息。paused不消费，只有Human合法resume后重验；Stop/撤权/拒批/过期不继续。

满足时一个事务唯一消费wait、合法转executing或核已由Humanprompt/resume合法转换，复用最早queuedHumanTurn；否则唯一新continuationTurn及service作者system消息，显式原请求与真实触发引用，不伪造Human新发言。Worker不生成Attempt。Runner随后list→claim→credential→start，每步live/state/来源/触发/fence重验再取新Lease。所有pending wait相关Turn未消费前闭门，防prompt自动executing/旧Runner绕过。

等待批准的hash沿现行requestApproval返回的sha256:<64位小写hex>完整字符串，DTO/Zod、DDL CHECK、Worker和实际消费同格式/精确比较，不去前缀。

完整wire/schema/字段限长及消息context见 [等待合同](../plan/agent-mcp-m1/wait-contract.md)，时序与Stop/finally/失败残留见 [生命周期](../plan/agent-mcp-m1/lifecycle.md)。原Human控制、实际动作批准与旧settle回执语义保持。

## Alternatives

长占旧Attempt等待与默认手动followup/retry均不采用；用户已选择公开结算后自动续接。

## Consequences

公开等待回复和续Turn为持久事实；数据库唯一约束/条件更新处理双Worker、重复tick、重启，不靠内存debounce。每次实际模型Turn保持原预算。离线stale、撤权、强杀或未知在途不能承诺自动恢复，保留原Human恢复与残留记录。

## Migration

新增workbench_execution_waits及Attempt opt-in列，与来源增量同一新迁移。源Turn/Attempt唯一、每Session一个pending、续Turn唯一，资源复合FK及组合CHECK；不推测旧等待条件。prompt表无workspace_id，新迁移先建UNIQUE(session_id,id)，wait按(agent_session_id,trigger_prompt_id)引用agent_session_prompts(session_id,id) ON DELETE RESTRICT，锁内另外核workspace授权；旧prompt不回填或改写。旧服务混合窗口不开启新等待生产，所有API/Worker升级后统一开启内部配置。具体 [迁移合同](../plan/agent-mcp-m1/migration-contract.md)。

## Spec changes

settle新增互斥sessionWait，assignment/list/claim默认关闭opt-in，credential新增受校验continuation引用；现有prompt事件补准确promptId，复用已有事件类型。真实Pi批准/input/blocked等待→Human触发→续Turn完成，以及pause/Stop/撤权、事务/并发/重启负例必验；本轮产品测试未运行。
