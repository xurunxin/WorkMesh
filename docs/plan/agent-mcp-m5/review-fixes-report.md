# M5 正式成果审查后的实施接续

M5 尚未验收，四条 O/P 联合主链仍未完成。本报告接续 `aa324caa769b472209c35288ee59d837144bb737` 的正式审查；原 [产品报告](product-report.md)、首败、规划和原件保留其历史含义。当前进入实施的分支 checkpoint 为 `8da61700380b8bc69c2af7ae0ad80ee7bab79253`，不是最终受测候选或未来 main。最新正式 `_oY` 复审、PR Required CI、actual Done/main 尚未具备。

## 实时资格修复与实际证据

普通 E 使用已有 `principalTeamAuthorityPredicate`：活跃 Human，且为 workspace admin 或拥有准确 workspace/Team membership；不允许失权主体读取旧回执。无新增角色、公开参数、事件或迁移。

- `apps/api/src/authz/authorize.ts:loadAgentFacts` 在普通 E 的事实查询中加入 `principalTeamAuthorityPredicate('d.principal_human_actor_id', 's.workspace_id', 's.team_id')`。
- `apps/api/src/agent/guard.ts:assertAgentPrincipalInTx` 对原 principal actor 与准确 membership 取 `FOR SHARE`，随后重新消费实时资格；保留原 ranked Agent 锁计划，不额外锁 Team。
- `apps/api/src/commands.ts:mutate` 与 `apps/api/src/agent/commands.ts:agentMutate` 在有效原回执返回前及新 handler 前执行 `await assertAgentPrincipalInTx(...)`。回执的 operation/hash/expiry 校验仍先执行，不能因 handler 被跳过漏掉撤权。
- `apps/api/src/workbench-runner.ts` 的 status GET 用相同 predicate，保持纯读；Stop、终态 settle 的专门恢复规则不改为普通 E 写入口。

`packages/conformance/src/joint-clients.conformance.test.ts` 新用例明确断言 `status: 403`、`code: 'SESSION_SCOPE_DENIED'` 及 correlationId，不能把 500 当授权拒绝。真实 Pi 首 Document commit 后失响应，删除原 principal 的准确 membership，原 E 的 Document GET/status/同 key 回执/新 key 写入全部拒绝；恢复原成员后原正文和回执返回，Document/event/outbox 各一次，Attempt 的 `external_effects_reconciled=false` 保留。模型错误实收、显式测试侧对账、代理观测与 Runner 实际业务请求分列，代理不替 Runner 发送第二请求。

独立实跑包括 inactive principal、管理员降级、活跃 admin 无 membership 合法，以及 `pg_blocking_pids` 观察到 membership 删除等待授权事务提交。Document GET/status 在撤权前与恢复后返回相同事实，读取没有增加领域 event/outbox。

新完整补充套件 `review-joint-regression` 实际 native exit0，23/23 通过，0 跳过，runtime 223.2792435 秒。其全仓 source digest 变化来自并发 OpenCode driver 修订；受测 API、Pi fixture、测试源码前后逐文件稳定，不能把整个 digest 宣称未变。过滤运行 `review-membership-real-member-exact` 是 1 通过、20 未选择，不能与完整 23 项相加。

## 客户端门禁与未完成项

当前安装的 OpenCode 原生 CLI 支持 `serve --stdio` 和 `run --server`。本轮仅使用私有 config/data/state、本人 loopback 服务及受控模型，临时服务认证留进程环境，不向模型或仓库暴露。私有发现源、父子 PID/readiness/EOF/退出、原 HTTP/TLS 到达、模型收到 MCP 结果必须分别取得实际证据；已有安装、正确目录或只读模拟 MCP 不证明真实 WorkMesh 身份接入。

四主链 O-N/P-N/O-G/P-G、真实 O/P 两轮同 Session 冲突、共享 Document 竞争、批准等待及 MCP/Worker/Runner 重启仍待实跑。外部两个签名传输工具保持禁止，双 Pi/SDK 补充结果不能代替 OpenCode。未测画像与原发行门禁保留。

## 检查、来源和资源

真实命令、native exit、runtime、数量、skip 与源码前后绑定见 [命令回执](product-checks.json)。旧全仓检查仅适用于其原受测字节，不证明新增鉴权修复。中断后已不存在且未有完整退出回执的检查见 [unknown 记录](review-fixes-interruption.json)，不计通过；回执脚本现在即时写私有原输出，结束后才生成脱敏公开副本。

本人容器恢复的精确 ID/owner/start 结果见 [资源恢复](review-fixes-resources.json)。当前登记不证明运行或收尾；最终健康检查实际退出、进程与端口读回及停止结果另落回执。当前恢复目录、共享镜像/网络/卷、G1D0C3 与他人目录保持保护。所有后续检查和四主链仍按未来未完成项，不提前写通过。
