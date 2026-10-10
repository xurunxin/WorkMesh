# M3 成果独审三项 blocking 修复

状态：本轮全部必需检查 exit 0 且最终源码起止绑定一致，停 review 供正式复审。不直接 PR CI、合入或 Done。主力交付入口为本报告与 [整体产品报告](product-report.md)。

开工 Git 候选 `c8e2632d36e15b43d3cb1ec2ef468680dad31e01`；本轮平台只读实际 main `ef4cb5e1458d911d98433c443dba46e6c224caa0`。最终源码共 1114 文件，Git blob 与 Windows 运行 bytes 分列见 [源清单](product-source-manifest.json)、[提交后核验](product-source-verification.json)。元数据提交不冒新的产品运行。上轮报告、矩阵、核验全文从精确 Git 保存在 [历史原件 ZIP 索引](review-fixes-history.json)；原旧源码 ZIP、unknown、首败和缺口保持。

## 三项修复及准确源码

1. `apps/worker/src/provider-actions.ts`：在既有完整 `prepareMutation` 锁事务内取 `r.default_branch AS repository_default_branch`，branch 的 `payload.name === facts.repository_default_branch`、commit 的 `payload.branch === facts.repository_default_branch`、openPR 的 `payload.headBranch === facts.repository_default_branch` 及 merge／CI 的 `pr.head_branch===facts.repository_default_branch` 均拒绝。每次 HTTP guard 重读；claim 的旧默认分支不再作仓库写发送决策，剩余引用仅为 fake 分支夹具的 seedRepository 引导，不作写许可判据。PG 实际观察五 kind 默认分支更新先提交，仓库写 HTTP 0；commit 第一条 tree 已许可并进入 HTTP 后，在真实下一 guard 锁等待中更新默认分支，写总数保持 1。原 head／checks／reviews／approval／context 门禁未减。
2. `packages/db/src/principal-team-authority.ts`：共享谓词 `authority_principal.kind='human' AND authority_principal.is_active`，并要求 `authority_principal.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships authority_membership ... authority_membership.team_id=${teamSql} ... authority_membership.actor_id=authority_principal.id)`。Worker、`apps/api/src/delivery/provider-action-query.ts`、review parent predicate 与 `assertReviewRepositoryScope` 共同消费；显式创建和 replay 已用同一校验器。准确 workspace／Team／principal，无 Human 角色扩张；省略 repositoryIds 的 M2 合同保持。真实 PG 成员删除先提交 HTTP 0，第一条许可后删除成员阻止第二条写；Native HTTP／MCP／Pi action 隐藏、review 创建／原 key 重放／子仓库读拒绝，恢复后原回执且不重复 child。API 另保 admin 无成员合法正对照。
3. `apps/worker/src/provider-actions.ts`：领取 CTE 由旧行生成 `(action.kind='resolve_repository_context' AND action.attempt_count>=8 AND action.result IS NULL) AS exhausted_context`；不再用旧 attempt 过滤永久丢弃过期动作。`if (checkpoint)` 本地 finish 优先；随后 `if (action.exhausted_context)` 通过完整锁及原 worker／attempt／DB 毫秒 claimed_at／status CAS，`await deadLetter(tx, action, 'PROVIDER_ACTION_RETRY_EXHAUSTED')`，零 provider 构造与调用。新 attempt7→8 是最后一次允许读，旧8→8 是耗尽重领。查询 `exhaustedContext` 派生 `human_reconcile / scheduled=false / nextQueryAt=null`，REST/Zod/OpenAPI 增加同一稳定 code。零迁移、零新字段／状态／event。

## 实际验证、首败及适用边界

| 命令 | 回执 | exit | 实际统计／cache／skip |
| --- | --- | --- | --- |
| check:route-policy | [m3-7b3caaeedcaf](product-evidence/m3-7b3caaeedcaf.json) | 0 |  |
| check:workmesh-skill | [m3-d16f3e84338b](product-evidence/m3-d16f3e84338b.json) | 0 |  |
| check:runner-skill | [m3-508b16483c2d](product-evidence/m3-508b16483c2d.json) | 0 |  |
| ci:test | [m3-a1f2b9618ff1](product-evidence/m3-a1f2b9618ff1.json) | 0 | # tests 16; # pass 16; # fail 0; # skipped 0 |
| ci:validate | [m3-e6a6f820f239](product-evidence/m3-e6a6f820f239.json) | 0 | # tests 15; # pass 15; # fail 0; # skipped 0 |
| lint | [m3-bb73020cf8d1](product-evidence/m3-bb73020cf8d1.json) | 0 | Tasks:    18 successful, 18 total; Cached:    17 cached, 18 total |
| typecheck | [m3-7823ad875289](product-evidence/m3-7823ad875289.json) | 0 | Tasks:    18 successful, 18 total; Cached:    15 cached, 18 total |
| test | [m3-95ef5b7584b8](product-evidence/m3-95ef5b7584b8.json) | 0 | @workmesh/observability:test:  Test Files  2 passed (2); @workmesh/observability:test:       Tests  16 passed (16); @workmesh/ui:test:  Test Files  4 passed (4); @workmesh/ui:test:       Tests  50 passed (50); @workmesh/git-provider:test:  Test Files  3 passed (3); @workmesh/git-provider:test:       Tests  17 passed (17); @workmesh/artifact-storage:test:  Test Files  2 passed (2); @workmesh/artifact-storage:test:       Tests  22 passed (22); @workmesh/agent-runner:test:  Test Files  14 passed (14); @workmesh/agent-runner:test:       Tests  76 passed (76); @workmesh/a2a-adapter:test:  Test Files  1 passed (1); @workmesh/a2a-adapter:test:       Tests  4 passed (4); @workmesh/agent-sdk:test:  Test Files  3 passed (3); @workmesh/agent-sdk:test:       Tests  53 passed (53); @workmesh/config:test:  Test Files  2 passed (2); @workmesh/config:test:       Tests  34 passed (34); @workmesh/domain:test:  Test Files  9 passed (9); @workmesh/domain:test:       Tests  65 passed (65); @workmesh/web:test:  Test Files  114 passed (114); @workmesh/web:test:       Tests  789 passed (789); @workmesh/db:test:  Test Files  8 passed (8); @workmesh/db:test:       Tests  28 passed (28); @workmesh/mcp:test:  Test Files  4 passed (4); @workmesh/mcp:test:       Tests  50 passed (50); @workmesh/fake-agent:test:  Test Files  1 passed (1); @workmesh/fake-agent:test:       Tests  4 passed (4); @workmesh/worker:test:  Test Files  24 passed (24); @workmesh/worker:test:       Tests  211 passed ／ 2 skipped (213); @workmesh/recovery:test:  Test Files  1 passed (1); @workmesh/recovery:test:       Tests  7 passed (7); @workmesh/api:test:  Test Files  34 passed (34); @workmesh/api:test:       Tests  180 passed (180); @workmesh/conformance:test:  Test Files  1 passed (1); @workmesh/conformance:test:       Tests  1 passed (1); @workmesh/contracts:test:  Test Files  29 passed (29); @workmesh/contracts:test:       Tests  213 passed (213); Tasks:    32 successful, 32 total; Cached:    30 cached, 32 total |
| test:integration | [m3-8c0f15d203fd](product-evidence/m3-8c0f15d203fd.json) | 0 | Test Files  17 passed (17); Tests  81 passed (81); Test Files  27 passed (27); Tests  278 passed ／ 1 skipped (279); Test Files  4 passed (4); Tests  61 passed (61); Test Files  8 passed ／ 1 skipped (9); Tests  147 passed ／ 1 skipped (148); Test Files  1 skipped (1); Tests  1 skipped (1) |
| test:e2e | [m3-0bcb6acb9f6f](product-evidence/m3-0bcb6acb9f6f.json) | 0 | @workmesh/web:test:e2e:   70 passed (5.4m); Tasks:    3 successful, 3 total; Cached:    0 cached, 3 total |

当前完整套件：API delivery 51，Worker provider 40，M3 conformance 20；单元 1820 passed／2 skipped。缓存与数量以各条原日志为准，不把 cache 回放称重新执行。M0／M1／M2 同组合回归，三 fake 完整链、实际 RustFS 上传下载、health 精确 Human 批准及本机 GitHub／Gitea HTTP adapter 都由当前完整 integration 原输出确认。

PG 锁观察 19 条（当前完整 integration），含 blocker／waiting PID、pg_locks、提交次序；context 第八次领取崩溃测试 1 条默认真实 60 秒跨期观察，旧 generation fail 不覆盖重领，终态只一条 dead-letter 事实，沿原事务写 outbox，provider 0。合法 context checkpoint 在上限仅本地完成且旧 unknown 不改写。新的耗尽跨默认租期主夹具使用 GitHub 标签、provider 不构造；未单独再跑 fake／Gitea 的同一耗尽组合，不冒三个真实账号。原十八行 checkpoint／纯读重试按标签各运行，来源及限制在 [十八恢复行](product-recovery-matrix.md)。

Pi 配置 LLM 入口要求 admin，测试在管理员准备后、Runner 准入前恢复原 principal member 身份；模型第一条请求已准入后撤销成员，工具真实 API 拒绝响应后恢复，使模型实际接收带 code／correlationId 的拒绝结果；不是模拟成功或放宽产品权限。准确旧回执 key 从持久记录取回，经 REST 验 replay，Pi 新创建与查询／子仓库读由模型实收；不把每次模型新调用冒原 key replay。三个拒绝 HTTP 状态、恢复正对照与 child 数量见各 run ZIP 的 `*-principal-membership.json`。

本轮首败保全（完整 stdout/stderr 在对应 ZIP）：

- [m3-c516dcc37a2b](product-evidence/m3-c516dcc37a2b.json)：exit 1；FAIL  integration/stage3-provider.integration.test.ts > Stage 3 provider webhook worker > M3当前默认分支或成员资格 open_pull_request 先提交，真实HTTP许可锁竞争零仓库写; FAIL  integration/stage3-provider.integration.test.ts > Stage 3 provider webhook worker > M3当前默认分支或成员资格 membership 先提交，真实HTTP许可锁竞争零仓库写; AssertionError: expected 'existing.find is not a function' to be 'PROVIDER_ACTION_AUTHORITY_REVOKED' // Object.is equality
- [m3-628ffc989358](product-evidence/m3-628ffc989358.json)：exit 1；FAIL  src/delivery-recovery.conformance.test.ts > M3 Native HTTP/MCP/Pi精确Git与review闭环 > pi principal Team成员撤销：action隐藏、review创建与重放及子仓库读拒绝，恢复正对照; Error: Human fixture POST /api/v1/workbench/llm-connections: 403 {"error":{"code":"FORBIDDEN","message":"Workspace administrator role required","correlationId":"4495ef13-9398-48f2-a464-7b6ff45d0e4b"}}
- [m3-82f1f9af9d27](product-evidence/m3-82f1f9af9d27.json)：exit 1；FAIL  src/delivery-recovery.conformance.test.ts > M3 Native HTTP/MCP/Pi精确Git与review闭环 > native principal Team成员撤销：action隐藏、review创建与重放及子仓库读拒绝，恢复正对照; FAIL  src/delivery-recovery.conformance.test.ts > M3 Native HTTP/MCP/Pi精确Git与review闭环 > mcp principal Team成员撤销：action隐藏、review创建与重放及子仓库读拒绝，恢复正对照; Error: {"error":{"code":"DELEGATION_NOT_ACTIVE","message":"Source Session installation authority is no longer active","correlationId":"5c7db39a-6fa8-436f-8130-81b9bfe06053","safeNextAction":"Inspect the correlation ID, resolve the reported cause, and retry only when the operation remains safe and idempotent."}}
- [m3-5a1ef9aba742](product-evidence/m3-5a1ef9aba742.json)：exit 1；FAIL  src/delivery-recovery.conformance.test.ts > M3 Native HTTP/MCP/Pi精确Git与review闭环 > pi principal Team成员撤销：action隐藏、review创建与重放及子仓库读拒绝，恢复正对照; AssertionError: expected [ { …(2) }, { …(2) } ] to have a length of 3 but got 2

首轮 Worker GitHub PR GET 列表夹具返回对象导致 `existing.find` 错误，修正为原 API 数组 `[]`；Pi 夹具先误改原 principal 角色导致配置 admin 门禁拒绝，再错误更换 principal 引发既有 installation／conversation 绑定拒绝，均保首败。恢复夹具保持同一个原 principal，在明确 DB 授权测试条件下切角色／membership；拒绝响应路径断言也保原首败，不减少断言。原 source before／after 区分执行中变化的早期回执，最新源以无变完整运行绑定为准。

现有 Windows 单元两个 Linux 实机 skip，以及 integration 的 live MiniMax／retention upgrade／recovery 三环境 skip 来源与不适用理由保存在 [整体报告](product-report.md)。定向 `-t` 过滤 skip 另计；全部必需 exit 0 不把 skip 称通过。没有真实 provider 账号、秘密或外发授权，不冒账号整链支持；Gitea 多文件 commit／CI retry 仍不支持。

## 整体交付与收尾

[四十操作](product-operation-matrix.md)、[原九类](product-acceptance-matrix.md)、[十八恢复行](product-recovery-matrix.md)、[准确命令／runtime／原输出](product-check-index.json)、[逐命令来源绑定](product-test-source-bindings.json)、[修复证据](review-fixes-evidence.json)、[资源逐 owner／path 保全清理](product-resources.json)、[最后进程观察](product-process-observation.json)。历史完整中文方案及冻结全文保持原件，不借旧检查代新组合。

独有临时 PostgreSQL／Redis／RustFS 的 label、ID、端口、准备和清理 nativeExit 逐项保存；所有健康检查轮询至退出后才收尾。共享镜像、store、node_modules、当前恢复目录及 G1D0C3 拒目标保留；不递归删除 Windows 目录。仅 Todos＋仓库记录，不伪真实 WorkMesh 远端状态。正式独立成果复审、最新 PR Required CI 和实际 Done/main 未完成；本轮停 review。
