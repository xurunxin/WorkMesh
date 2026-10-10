# M3 产品交付报告

状态：本机必需检查全部通过，停 review 供另一 Agent 正式成果独审。本报告为主力整体汇总，内部只读子任务结论不代正式成果独审。尚无本候选最新 PR Required CI、合入或 Done。

## 交付与安全合同

实施依据为已独审候选 `499ccc1419ba2fbd15171f6ff7c0adc78647c2cc`。本次修复开工候选 `c8e2632d36e15b43d3cb1ec2ef468680dad31e01`；平台重新 fetch main 后准确 FETCH_HEAD 为 `ef4cb5e1458d911d98433c443dba46e6c224caa0`。历史主力开工候选 `e73e814dd631a3c5db47afc1ff4d89e5cfaf3941` 保留在原报告 ZIP，不冒本轮源。最终受测源码与提交绑定见 [源字节清单](product-source-manifest.json) 及提交后核验，报告自身不循环嵌入其未来 commit SHA。

交付回执的产品源码候选 `25a528c56e51df1025849b0eb29589f66502bddf`，文件数量以 [提交后源码核验](product-source-verification.json) 为准；163 个 ZIP 的原 bytes 核验见 [交付核验](product-delivery-receipt.json)。上轮回执只证明上轮受测源，本轮三 blocking 修复、实际新结果与来源边界见 [成果独审修复报告](review-fixes-report.md)，不能把旧源码核验冒当前代码已测。

- 新 REST `GET /api/v1/provider-actions/{id}` / `getProviderAction`：六 kind 的严格白名单只读投影，精确 requester/Session/principal/Team/resource/feature与当前context读授权。payload、文件内容、provider raw错误、worker身份和秘密不返回；隐藏目标统一 NOT_FOUND，查询不领取、续租、外发或追加业务事实。Human原principal合法终态诊断与E普通终态拒绝分别验证。
- reviewer `repositoryIds` 由用户明确选择：三方 `repo:read` 交集与父仓库范围、共享 WorkItem/Project context；省略保 M2 三项。`mutate.beforeReserve` 完整父子锁计划与 `authorizeReplay` 共用校验，撤权/收窄后旧key也拒绝。本人 Room review_result、本人当前head code_review Artifact及structured review在有效E下交付；父等required child completed再确认。
- Worker每次写HTTP前同一 `prepareMutation` 完整authority/资源/准确PR/check/approval/action事务，最后DB `clock_timestamp()`核原claim和批准；最新合法context重验已锁PR的head_branch/base_branch。许可先提交仅当前在途不可召回，后续写重新授权；Stop/撤权/pin先提交零新写。HTTP期间不持DB事务。
- 五类写旧领取无合法checkpoint保守dead/OUTCOME_UNKNOWN，零重发、人工对账；合法checkpoint按kind绑定仅本地finish。context纯读有界重试。DB现有attempt约束0..8使用单调饱和，claimed_at在领取时取DB时钟毫秒精度，以 worker/attempt/claimed_at/status完整CAS身份防同worker到顶ABA；60秒租期仍按DB时钟。是源码发现的零迁移兼容，不是用户新增裁定。
- REST/Zod/SDK/MCP/derived manifest/Runner按同一操作对齐；补仓库/交付、上传状态/列表/取消/下载、completion suggestion及health允许子集。取消保持无If-Match，health发布仍需准确Human批准。Runner只访问配置的store origin，准确required headers，无WorkMesh Bearer、重定向或模型自选URL；Pi全局model dispatcher与对象存储使用独立native HTTP，签名资料不进入模型。

零数据库迁移、零新事件种类；沿原action、artifact links、approval事实及既有dead-letter事件。freeze的M0/M1/M2报告与#53不冒新通过。

## 验证入口与实际结果

| 命令 | 回执 | exit | 数量／skip／cache原统计 |
| --- | --- | --- | --- |
| pnpm.cmd check:route-policy | [m3-7b3caaeedcaf](product-evidence/m3-7b3caaeedcaf.json) | 0 |  |
| pnpm.cmd check:workmesh-skill | [m3-d16f3e84338b](product-evidence/m3-d16f3e84338b.json) | 0 |  |
| pnpm.cmd check:runner-skill | [m3-508b16483c2d](product-evidence/m3-508b16483c2d.json) | 0 |  |
| pnpm.cmd ci:test | [m3-a1f2b9618ff1](product-evidence/m3-a1f2b9618ff1.json) | 0 | # tests 16; # pass 16; # fail 0; # skipped 0 |
| pnpm.cmd ci:validate | [m3-e6a6f820f239](product-evidence/m3-e6a6f820f239.json) | 0 | # tests 15; # pass 15; # fail 0; # skipped 0 |
| pnpm.cmd lint | [m3-bb73020cf8d1](product-evidence/m3-bb73020cf8d1.json) | 0 | Tasks:    18 successful, 18 total; Cached:    17 cached, 18 total |
| pnpm.cmd typecheck | [m3-7823ad875289](product-evidence/m3-7823ad875289.json) | 0 | Tasks:    18 successful, 18 total; Cached:    15 cached, 18 total |
| pnpm.cmd test | [m3-95ef5b7584b8](product-evidence/m3-95ef5b7584b8.json) | 0 | @workmesh/api:test:  Test Files  34 passed (34); @workmesh/api:test:       Tests  180 passed (180); @workmesh/conformance:test:  Test Files  1 passed (1); @workmesh/conformance:test:       Tests  1 passed (1); @workmesh/contracts:test:  Test Files  29 passed (29); @workmesh/contracts:test:       Tests  213 passed (213); Tasks:    32 successful, 32 total; Cached:    30 cached, 32 total |
| pnpm.cmd test:integration | [m3-8c0f15d203fd](product-evidence/m3-8c0f15d203fd.json) | 0 | Test Files  27 passed (27); Tests  278 passed ／ 1 skipped (279); Test Files  4 passed (4); Tests  61 passed (61); Test Files  8 passed ／ 1 skipped (9); Tests  147 passed ／ 1 skipped (148); Test Files  1 skipped (1); Tests  1 skipped (1) |
| pnpm.cmd test:e2e | [m3-0bcb6acb9f6f](product-evidence/m3-0bcb6acb9f6f.json) | 0 | @workmesh/web:test:e2e:   70 passed (5.4m); Tasks:    3 successful, 3 total; Cached:    0 cached, 3 total |


| 最终受影响套件 | 回执 | exit | 实际统计 |
| --- | --- | --- | --- |
| API交付 | [m3-8c0f15d203fd](product-evidence/m3-8c0f15d203fd.json) | 0 | Test Files  17 passed (17); Tests  81 passed (81); Test Files  27 passed (27); Tests  278 passed ／ 1 skipped (279); Test Files  4 passed (4); Tests  61 passed (61); Test Files  8 passed ／ 1 skipped (9); Tests  147 passed ／ 1 skipped (148); Test Files  1 skipped (1); Tests  1 skipped (1) |
| M3三客户端 | [m3-8c0f15d203fd](product-evidence/m3-8c0f15d203fd.json) | 0 | Test Files  17 passed (17); Tests  81 passed (81); Test Files  27 passed (27); Tests  278 passed ／ 1 skipped (279); Test Files  4 passed (4); Tests  61 passed (61); Test Files  8 passed ／ 1 skipped (9); Tests  147 passed ／ 1 skipped (148); Test Files  1 skipped (1); Tests  1 skipped (1) |
| Worker发送恢复 | [m3-8c0f15d203fd](product-evidence/m3-8c0f15d203fd.json) | 0 | Test Files  17 passed (17); Tests  81 passed (81); Test Files  27 passed (27); Tests  278 passed ／ 1 skipped (279); Test Files  4 passed (4); Tests  61 passed (61); Test Files  8 passed ／ 1 skipped (9); Tests  147 passed ／ 1 skipped (148); Test Files  1 skipped (1); Tests  1 skipped (1) |


本轮数量／skip／cache 使用表中对应最新原输出，修复增量与精确统计见成果独审修复报告；不沿用旧候选数量。M0/M1/M2 三套真实 conformance 与 M3 同组合运行。运行环境固定 Windows / Node 22.19.0 / pnpm 9.15.4；每次 runtime.execPath、准确 elapsed 与起止源码 SHA 在原回执中保存，早期缺少PID/时间字段不伪补。

命令实际argv、exit、runtime、elapsed、stdout/stderr原字节ZIP及before/after指纹见 [完整检查索引](product-check-index.json)；Turbo缓存统计单列，缓存日志不冒本轮重新执行。历史M3 7例与Worker22例保持各自旧受测字节；新增源变化只由本轮受影响结果证明。

integration 的实际 skip 有三项：API 的 live MiniMax 用例须 `RUN_WORKBENCH_LIVE` 与账号秘密，未获本轮真实账号授权；Worker 的 retention upgrade 用例须 `RUN_RETENTION_UPGRADE_INTEGRATION`，本批零迁移且该升级路径未变；recovery 的一项备份恢复套件须 `RUN_RECOVERY_INTEGRATION`、独立source/target数据库与工具容器，未配置、未测。来源分别为 `apps/api/integration/workbench-runner.integration.test.ts`、`apps/worker/integration/retention-upgrade-barrier.integration.test.ts`、`packages/recovery/integration/recovery.integration.test.ts`。exit 0 不把这些 skip 称通过，不缩它们原发布验收门禁。定向测试的过滤 skip 与上述环境 skip 分开看原日志。

全仓单元测试另有两个 Linux 专用实机用例在 Windows skip：`retention-soak-lock.test.ts` 与 `retention-soak-formal-launch.test.ts` 的 `process.platform === "linux"` 条件；其余对应单元断言已运行。E2E 70 例通过、无 skip。最末完整统计以检查索引对应原输出为准。

逐项入口：[四十操作](product-operation-matrix.md)、[原九类](product-acceptance-matrix.md)、[十八恢复行](product-recovery-matrix.md)、[首败](product-first-failures.md)、[资源保全与清理](product-resources.json)。原规划的完整中文spec/M3全文/原测试与DoD保留，独立平台doc全文缺口仍见 sources.md；没有用摘要或截断前缀伪补。

三链由真实API、MCP与本机TLS假模型运行Pi，实际模型实收及持久Turn/工具事实保全到各run ZIP。Human连接/pin/批准及原Session ACK/Plan/complete生命周期使用受控SDK/REST夹具；表中明确实际工具调用与公共准备的区别，不以19工具数量冒全部功能。RustFS实际PUT、验证Worker、下载checksum/字节均比对；签名URL/headers不入Pi模型。

本机GitHub/Gitea HTTP夹具测试每写窗口正/拒例，包含GitHub tree/commit/ref及Gitea单文件create/update。Worker日志保存pg_locks/pg_blocking_pids/clock_timestamp及claimed_at代次、真实默认租期，不拿delay代锁观察。真实provider账号与外发仍未授权、未测；Gitea多文件commit/CI retry明确不支持。context的各provider标签Worker恢复使用注入Fake reader，实际adapter纯GET另单列；不冒真实账号整链。

实际锁与代次原值见 [锁观察](product-lock-observations.json)，服务脱敏原bytes见 [保全索引](product-service-logs-index.json)。最终定向 API/M3/Worker 回执补足长命令期间源码变更的来源边界，逐命令对最终bytes的匹配见 [运行来源绑定](product-test-source-bindings.json)；旧首败和18:54内部阅读未提交字节没有逐文件原件的缺口保留。证据归档、矩阵和完整源静态核验见 [实测静态回执](product-static-verification.json)，不代产品运行。

## 文件与演示

主要文件变化（完整差异以Git为准）：

- `AGENT_PROTOCOL.md`
- `OPENAPI.yaml`
- `apps/agent-runner/skills/workmesh-workbench/SKILL.md`
- `apps/agent-runner/src/delivery-transfer.test.ts`
- `apps/agent-runner/src/delivery-transfer.ts`
- `apps/agent-runner/src/permission-matrix.test.ts`
- `apps/agent-runner/src/run-session.ts`
- `apps/agent-runner/src/workbench-skill-manifest.ts`
- `apps/agent-runner/src/workmesh-tools.test.ts`
- `apps/agent-runner/src/workmesh-tools.ts`
- `apps/api/integration/stage3-delivery.integration.test.ts`
- `apps/api/src/agent/guard.ts`
- `apps/api/src/authz/authorize.ts`
- `apps/api/src/collaboration/routes.ts`
- `apps/api/src/delivery/provider-action-query.ts`
- `apps/api/src/delivery/repository-access.ts`
- `apps/api/src/delivery/routes.ts`
- `apps/api/src/live-read-authorization.test.ts`
- `apps/api/src/server.ts`
- `apps/mcp/src/discovery.ts`
- `apps/mcp/src/index.ts`
- `apps/worker/integration/stage3-provider.integration.test.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/provider-actions.ts`
- `packages/agent-sdk/src/index.ts`
- `packages/conformance/package.json`
- `packages/conformance/src/delivery-recovery.conformance.test.ts`
- `packages/conformance/src/delivery-recovery.fixture.ts`
- `packages/conformance/src/mcp-coverage.fixture.ts`
- `packages/conformance/src/planning-collaboration.fixture.ts`
- `packages/conformance/vitest.integration.config.ts`
- `packages/contracts/src/agent-discovery-rules.ts`
- `packages/contracts/src/agent-discovery.test.ts`
- `packages/contracts/src/child-session-contracts.test.ts`
- `packages/contracts/src/child-session-contracts.ts`
- `packages/contracts/src/delivery-contracts.test.ts`
- `packages/contracts/src/delivery-contracts.ts`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/pagination-contract.test.ts`
- `packages/contracts/src/route-policy-bindings.ts`
- `packages/contracts/src/route-policy.test.ts`
- `packages/contracts/src/route-policy.ts`
- `packages/contracts/src/stage3-contracts.test.ts`
- `packages/db/src/agent-lock-order-manifest.ts`
- `packages/db/src/index.ts`
- `packages/db/src/principal-team-authority.ts`
- `packages/domain/src/delivery-scope.ts`
- `packages/domain/src/index.ts`
- `packages/git-provider/src/index.test.ts`
- `packages/git-provider/src/index.ts`
- `packages/git-provider/src/mutation-http.test.ts`
- `scripts/ci-policy.mjs`
- `scripts/ci-policy.test.mjs`
- `scripts/generate-agent-discovery.py`

在 change review 对本报告点预览，再打开三份逐行矩阵与原日志索引。复现实证：以 `product-integration.py all` 创建独有PostgreSQL/Redis/RustFS，固定Node22.19/pnpm9.15.4，运行必需integration及E2E；`product-checks.py`分别执行表中命令。服务凭据仅在测试进程环境，报告不含秘密。

## 适用限制与收尾

当前仅Todos＋仓库记录，不伪造WorkMesh远端Project/Issue；#9的新UI候选未消费，不借旧UI tests；#5三OS分发不在本场景，原门禁未减；不扩UI/F-TA、Team权限、凭据连接或真实发布。merge不deploy、不自动Issue done。

额外组合的真实覆盖边界见九类JSON：100个仓库只做DTO正例、不冒100仓库部署；有限预算100/60/40由M3显式repo与M2兼容分别验证，M3预算满旧key重放及普通child完成后重放不重admission；未把未运行的全部笛卡尔组合改称通过。纯GET幂等写账本/If-Match/写事务故障不适用；Human保留操作不对Agent跑写正例。

owner容器、实际nativeExit、服务日志及清理label核验逐项保全；共享镜像/store/node_modules及当前恢复目录保留，G1D0C3拒目标不操作。原早期每个短时进程没有独立PID登记的缺口如实保留，结束时当前进程观察另列。正式另一Agent成果独审、最新PR Required CI与实际Done/main均未完成，不能称验收或合入。

最后一次 [进程/容器观察](product-process-observation.json) 记录实际检查进程和 owner 容器；44 轮 owner 的 132 个容器各有 label/ID 核验和 nativeExit 清理回执，不删共享镜像、卷、网络或 Windows 目录。定向复验首次命令未能启动 recorder 的原输出缺口另见 [启动失败边界](product-startup-gap.md)，不纳入通过数量。
