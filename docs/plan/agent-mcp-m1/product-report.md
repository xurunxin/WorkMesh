# M1 主执行 Agent 产品成果候选

最新修复针对 `420aa…` 复审尚余的真实失权 queued Turn 阻塞，代码、真实 HTTP/Pi、九类差分与本轮证据见 [失权排队续接修复报告](product-queued-author-repair-report.md)。前轮 [修复报告](product-review-repair-report.md) 保留历史：原前两项已由另一 Agent 确认闭合，第三项的直接消息夹具没有覆盖真实 `/turns`。下列主体保留原候选结果与限制，不能替代本轮新受测组合；仍停平台成果复审，未合入。

本卡已按已审方案实现执行、Lease、Stop 恢复和精确原动作只读确认，并完成本机适用检查及真实 HTTP/MCP/Pi 验证。本报告是主执行 Agent 对整卡的汇总，不以内部子任务结束或 checkpoint 代替交付。当前停在**平台另一 Agent 完整成果独审**；最新 PR Required CI、实际 main 合入和 todo Done 尚未完成，不能据本报告称整卡已验收。

产品源码候选已提交并推送：`1f3ac69a51a15d1b7edaa242963673d3edf8e1ae`。后续只增加提交后 78 源码/93 归档的 Git 字节绑定及本段说明；最终证据提交 head 在主执行回复中给出，不循环将文件自身未来 SHA 写回。产品执行源码保持该候选，回执不宣称成果独审或最新 Required CI 通过。

方案依据为 `938f67f88c4f6889cbd49a3fd9b81fbd62aa60f6`，其全文、217 来源和历史首败保持原义。本轮重新通过平台只读 Git `ls-remote origin refs/heads/main` 实读仍为 `e49eda142d61bdd248ddc42ec16f5563abd4bbc6`，不是 FETCH_HEAD 或构建分支。受测输入包含运行当时 HEAD 的 Git blob 和实际工作树字节；本报告不把旧 HEAD 的结果冒为最终所有字节都已运行。候选提交绑定见 [candidate-binding](product-evidence/candidate-binding.json)，源码双字节见 [product-source-index](product-evidence/product-source-index.json)。

## 实现及合同

| 范围 | 具体实现与边界 |
| --- | --- |
| 原动作来源 | `agent/execution-origin.ts` 由 trusted `actor.credentialHash` 定位真正提交的 E Token，在 direct complete / stopAck 原事务保存 Token、安装、Connection 来源与原账本 actor；与 state/event/outbox/response 一起提交。native 创建和 Connection 镜像分别标记不可改投来源。任意历史 Token 不证明动作归属；旧 null、未知或歧义不补写。Pi 内层 `finishSessionInTransaction` 没有独立 complete receipt，不假确认。 |
| 最小只读确认 | 新 `GET /api/v1/agent-sessions/{id}/execution-result` / `getAgentSessionExecutionResult`，严格 `action=complete\|stop_ack`、原 `operationKey`。返回当前准确 Session state/revision、原动作确认状态及原 revision/result/event 引用、对应 Stop cleanupSummary/residualRisks；缺失/过期/无可用结果明确 unavailable，不表示可以再次执行。普通 E 拒绝，C/安装走受限无写身份识别，Human 原合法读取保留。 |
| live 归属 | `agent/execution-result.ts` 在单次 REPEATABLE READ READ ONLY 重验 principal、Agent、Connection/credential、Team grant、目标 Delegation 和精确资源 scope；Connection 另核 coordinator Delegation、源 Connection，native 核原安装 ID。同 Connection 合法轮换可读，另一 Connection/安装拒绝。不调用 `resolveCoordinationIdentity`，不写 usage/C Session/Token/receipt/Activity/event/outbox；原 authorization_denials 独立审计例外保留。 |
| 具名适配 | 共享 Zod、REST/policy/feature、SDK、MCP、derived manifest 与 Runner 覆盖 Session、context、Plan/版本、Approval、Lease heartbeat/renew/release、Recovery 与专用 stopAck/确认。Lease version、Session revision、Plan stable step ID 不混用；读取不要求写幂等 key。所有 43 条当前合同、消费者和测试边界在 [逐操作映射](product-operation-matrix.md)。 |
| 等待结算 | `sessionWait` 与 `sessionCompletion` 互斥；精确批准 ID/hash 或持久输入边界。Runner 停模型/普通工具/steering，确认 idle 与在途影响，再释放本人 Lease，以独立受控 signal settle 公开等待 reply、工具账本、Turn/Attempt、Session/wait。等待不是 `RUNNER_ABORTED` 跳过结算，不让同 Attempt 长占两分钟以外；未知在途不登记可自动续接 wait。 |
| 唯一自动续接 | `workbench-execution-waits.ts` 与 Worker 锁后 fresh 校验来源、授权、Human/模型、批准或准确输入；同事务 consume wait，合法转 executing，再建唯一后续 Turn 或复用准确 queued Human Turn。续接有原 Turn/Attempt 与真实触发 lineage，service system message 不伪造 Human 发言。旧消费者缺 `executionWaits` 默认 false，不领取续接；claim/start/credential 再核 admission 与 fence。 |
| Stop/撤权优先 | 已提交 Stop/终态或目标 Delegation 撤回后，Worker 在 authority→资源→Conversation→Turn→Attempt→Approval→wait 锁内将 pending wait 投影为 canceled/resolved，分别记录 `session_closed` / `authority_revoked`；保留原公开 reply 和 settled Turn，不生成后续 Turn/Attempt、不重复结算/event/outbox。其他 live 权限校验失败同样不能续接；pause 不被输入/批准自动解除，只有 Human resume 后重验。 |
| Stop finally | 运行中 Stop 先闭门，abort 并等待模型 idle，清理本人 scratch，以独立有界 signal、原准确 E 和稳定 key/body 提交专用 stopAck；绕普通 makeTool 的 Activity/已 abort signal，不拿 ordinary release 代 Stop。丢响应先精确只读确认，未知结果不盲换 key 重做。idle 不可证、清理失败或强杀保留残留/恢复信息，不复活模型。 |

变更文件组为 `OPENAPI.yaml`、`AGENT_PROTOCOL.md`、contracts/policy/生成器、API commands/授权/确认/workbench、SDK/MCP、Runner 生命周期/工具/指南及 skill pin、DB schema/迁移/等待 helper、Worker lifecycle、conformance 和对应单元/集成/CI 套件门禁。精确路径和字节由源码索引列出；没有 Web UI 产品改动、F/TA 新域、Human 角色替换、普通终态重放例外或真实外发/发布。

## 迁移、兼容与运行方式

唯一新增数据库增量为 `packages/db/migrations/v1/0017_execution_origin_and_waits.sql`，`SCHEMA.sql` 引用该增量，Drizzle/schema 和 migration manifest 同步。已应用 baseline、旧迁移与 upgrade bundles 未修改。

安装来源和 receipt 来源列可空，旧数据不推测回填；来源完整组合、安装来源不可改投、过期 key 来源 reset trigger 有真实 PostgreSQL 正拒验证。新 producer 原事务保存来源；滚动旧 producer 在新 schema 重占旧 key 时即使不认识新列，也不能遗留旧证明。旧 schema 夹具维持 schema-aware 旧写形状；回执查询缺证明失败关闭。

等待表有 source Turn/Attempt、Session pending 和 continuation 唯一约束、pending 索引与关系 FK。`approval_action_payload_hash` 的 DTO/Zod、DDL、Worker/实际批准消费均保留原 `^sha256:[a-f0-9]{64}$` 全字符串。先新增 prompts `UNIQUE(session_id,id)`，再建 `(agent_session_id,trigger_prompt_id) → agent_session_prompts(session_id,id)` RESTRICT 外键；workspace 不引用不存在列，仍以 Session 复合关系和锁内授权核验。clean DB、直接前一增量升级、旧来源 null、重复迁移和故障整增量回滚实际运行入口见下表。

部署顺序为先按现有 migration runner 应用增量，再部署同合同的 API/Worker/SDK/MCP/Runner。`WORKMESH_EXECUTION_WAITS_ENABLED=true` 在 API 和 Worker 显式启用自动等待协议；未配置默认关闭，旧 request 字段默认缺省兼容；Runner 的 `executionWaits` 资格须服务端验证并持久到 Attempt。Lease 不授权，所有执行重新准入。

HTTP MCP 每请求重建客户端，C 在停止后不能假设持有旧 E，也不能 refresh terminal E 来 stopAck；该 M0 限制保留并披露。持原准确 E 的受控生命周期可专用 ACK，原来源 live C/安装可确认失响应。确认不改变共享 SDK Token、不进行换身份 401/403 自动重发；Human pause/resume/stop/retry/force release 与批准决定保留。

## 实际检查及失败闭合

所有测试子进程使用独有 `node_modules/.m1-runtime/node.exe` 的实际 Node `v22.19.0`、pnpm `9.15.4`；不改全机 Node。每轮初始 running 回执、完整脱敏输出、实际退出/runtime、输入 ZIP 和前后 fingerprint 在 [check-index](product-evidence/check-index.md) / [JSON](product-evidence/check-index.json)。数量取完整日志，各 workspace 的缓存结果明确保留，不用模型工具数代替覆盖率。

| 检查/根脚本 | 实际结果 | 回执与解释 |
| --- | --- | --- |
| `pnpm lint` | exit 0；18 tasks；124.738 秒 | `lint-complete`；后续 API 测试变化由 `changed-api-tests-lint` exit 0、17.809 秒补齐；conformance 最终变化由 `conformance-tests-lint` exit 0、13.140 秒补齐。Worker 后补测试已在根 lint 的输入中。 |
| `pnpm typecheck` | exit 0；18 tasks；69.625 秒 | `types-final`；后续 API/conformance 分别 `changed-api-tests-types` exit 0、17.736 秒 / `conformance-test-types` exit 0、14.177 秒。Worker 后补测试由相同 `tsc --noEmit` 的根 lint 验证；运行期间变化明确列索引，不冒单次全字节冻结。 |
| `pnpm test` | exit 0；32 tasks 成功、27 cached；42.084 秒 | `unit-reservation-fixed`：Runner 13 文件 67 pass、API 180 pass、Worker 211 pass/2 skip、SDK 52 pass、MCP 50 pass、contracts 207 pass；其余 workspace 精确小计见原日志。后续变化仅集成测试，不属于该单元 include。 |
| `pnpm test:integration`：DB 阶段 | 17 文件、81 pass、0 skip | `integration-stable` 原根运行中的完整 DB 阶段，包括真实 clean/升级/回滚；生产 DB 字节未变，保留充分绑定结果。 |
| 同一根运行：API 阶段 | 27 文件、257 pass、1 skip | `integration-stable`，包含 Stop/撤权公开等待、唯一恢复、rolling key、原来源和 Plan/Lease/Approval/complete/stopAck 两类事务故障。单独 `atomicity-capability-fixed` exit 0、10 pass、8.573 秒也保留。 |
| `pnpm test:conformance:integration` | exit 0；2 文件、22 pass、0 skip；187.215 秒 | `conformance-revoke-fixed` 完整 M0+M1 真实 HTTP/MCP/Pi；最终源码输入与运行前后完全一致。 |
| `pnpm test:integration:worker` | exit 0；8 文件通过/1 skipped；119 pass/1 skip；40.648 秒 | `worker-complete`，native/Connection × Stop/撤权、双 Worker、重启、原 settled 公开投影与零新 Turn/Attempt/event；最终源码完全一致。 |
| `pnpm test:integration:recovery`，真实环境启用 | exit 0；1 pass、0 skip；8.013 秒 | `recovery-real` 配置独有 source/target DB、桶和 Postgres 工具，真实 backup→中断空目标恢复→resume→全状态校验。此前 `recovery-complete` 0 run/1 skip 保留，不能冒作此通过。 |
| `pnpm test:e2e` | exit 0；70 pass；407.249 秒 | `e2e-complete`；保全 UI 原验收。运行期间只变生成锁清单的行位置；API/Worker/Runner 产品执行字节未变，不重复无意义 UI 跑测。 |
| `pnpm build` | exit 0；18 tasks 成功、0 cached；96.713 秒 | `build-clean-source`；修正发行构建 fixture 边界并清理第一次失败产生的 source spill 后，以最终干净源码完整构建。先前 `build-fixture-fixed` 18 成功/14 cached、86.199 秒也保留，不能冒首次构建通过。 |
| `pnpm smoke:agents:ci` | exit 0；3.458 秒 | `agent-smoke-complete`，真实 MCP read-only server 构造及 Fake Agent 签名交付/去重；不是将 smoke 当完整 MCP 端到端覆盖。 |
| `pnpm check:route-policy` / `pnpm check:runner-skill` | 均 exit 0；2.798 / 1.152 秒 | `route-policy-final` / `runner-skill-final`，按现有生成检查；skill 的实际 pin 见回执。 |
| `pnpm ci:validate` | exit 0；2.547 秒 | `ci-validate-final`：工作流/发布/lite 配置检查，15 raw archive TAP pass，以及既有 280 entries / 61 members 的历史原件校验。 |
| `pnpm ci:test` | exit 0；16 TAP pass、0 skip；1.148 秒 | `ci-test-second`；CI policy/必含 M0+M1 及真实删除单套件负例代码之后未变。其它产品源码变化不等于此 policy 单元重跑依据。 |

`integration-stable` 原根命令**退出 1**，不改写：DB/API 通过后，conformance 撤 Delegation 的用例误期望 `DELEGATION_NOT_ACTIVE`。现有 Human revoke 同事务撤 E Token，真实最先拒绝码是 `UNAUTHENTICATED`。修正为精确错误码并新增 DB `bool_and(revoked_at IS NOT NULL)` 正确事实断言，随后完整 conformance 通过；Worker/Recovery 当时尚未到达，已经以仓库实际根分项脚本补齐。依用户“无变化充分绑定通过不重跑”的指示，没有再从头重复 DB/API。根退出 1 是可追溯的历史失败，不声称另有一次根命令退出 0；五个实际根分项均已覆盖，最终不存在未闭合本机测试失败。

原失败完整回执保留：`api-m1-third`、`conformance-first/second`、`unit-first`、错误 Worker 根脚本、Worker 缺 Team 夹具、序列 bigint DTO、DDL probe 同时撞多唯一约束、最新迁移期望未更新、schema 检测新增 query 的严格 fake/order 断言、Plan 回滚正对照缺 `plan:write` 夹具。修复沿实际源码/现有协议，未松断言、改超时、加 M1 skip 或伪称 baseline 失败。根当前修正后结果见上表；API/Worker/Runner 的局部先前通过均有独立输入和局限，不替代整卡汇总。

额外 Required source-gate 构建首败 `build-complete` exit 2：新增 `execution-recovery.fixture.ts` 拉入 API/MCP 源码，违反 conformance 发行构建 rootDir。只在 `tsconfig.build.json` 仿既有 M0 fixture 增加该文件的 exclude，测试 include/typecheck 及断言不变，不删真实套件、不冒 baseline 归因。该构建生成的 114 个 API/MCP source JS/声明文件按“原输入不存在、untracked、相邻 TypeScript、实际构建写入区间、绝对 workspace/link/活动进程”逐项核验，保存 `build-spill-originals.zip` 并独立读回 SHA 后由原生 PowerShell `Remove-Item -LiteralPath` 清本人文件；没有递归/Force/属性或权限改动。两次收尾预检失败（输入归档时间被误算入运行区间、当前 PowerShell 缺 Get-FileHash）均在任何删除前退出，完整日志保留；按记录器真实 spawn 时序和独立 .NET SHA 核验修正，`build-spill-removal-verified` exit 0，114/114 保全后清理，随后干净全仓 build 再通过。不是绕过自动审批拒绝或重删已拒目标。

真正的原有 skip：API 商业 MINIMAX live 凭据/开关未配置一项；Worker retention-upgrade-barrier 需独立 `RUN_RETENTION_UPGRADE_INTEGRATION` 环境一项；Worker 单元两项 Linux FD/flock 专用用例（`retention-soak-formal-launch` 的 prelocked FD 经 Node/tsx loader，`retention-soak-lock` 的 wrapper prelock/exec 拒绝集合）在 Windows 原 runIf 跳过。M1 新场景没有新增 skip；这些 skip 不计已验收，未擅自调用商业模型或扩展三 OS/发布范围。

## 客户端事实、九类 DoD 与审查复现

[九类 DoD/兼容闭合矩阵](product-closure-matrix.md) 逐项给出真实断言和不适用理由，[43 操作映射](product-operation-matrix.json) 保存当前 REST、components、policy、角色/状态/capability/scope/feature、SDK/MCP/Runner 参数输出与证据种类。映射生成器以当前 OpenAPI、执行加载的 policy、实际 SDK/MCP/discovery/Runner 符号检查 43 unique bindings；这是静态一致性，不能冒逐操作所有权限组合均经过产品运行。

确定性 Pi 使用真实 Runner/Pi 子进程、HTTPS 假模型和真实 HTTP/MCP/PG，模型实收工具及持久 Turn/Attempt/Plan/Lease/tool invocation/清理事实可查。不是商业模型实测。最终 conformance 服务归属与生成时间见 registry；`*-client-evidence.zip` 中保存以下可读 JSON：

最终通过客户端原件在 [m1-a609b9b0f88c-client-evidence.zip](product-evidence/m1-a609b9b0f88c-client-evidence.zip)，对应 [独有服务登记](product-evidence/m1-a609b9b0f88c-resources.json)，其它轮同名事实保持各自历史结果，不混合称最终通过。

1. `origin-double-connection-complete/stop_ack`：C2 先 refresh 同 Session，C1 提交且丢响应，原 E 重放被终态拒；原来源 live C 确认，另一 C 拒；查询前后无新增执行事实。同 Agent 同 Team 双 Connection 由明确 privileged fixture 构造，未放宽公开配对 unique 规则。
2. `origin-double-native`：同 Agent 两原生安装，原提交安装确认，另一安装拒绝；原 Token 删除后快照仍可读，旧 null/unproven、scope/principal/grant/安装撤销拒绝。
3. 三类 `pi-wait-*`：公开等待结算、无旧活跃 Attempt/Lease、Human 准确批准或输入、唯一续 Turn/Attempt、新 Lease 后完成。approval 正向贯穿真实 `requestApproval` 原返回 hash；input 实际等待 121 秒并重启 monitor，超过原两分钟 Turn 时限仍不跑模型。
4. Pi pause/Stop 与撤 Delegation：输入到达不越过 pause，Stop/撤权先提交后 wait canceled，原 reply/Turn settled 不变，零续 Turn/Attempt；双 Worker/新实例扫描仍无事实增量。E Token 撤销事实及 REST/MCP 精确拒绝均断言。
5. `pi-stop-finally`：模型运行中 Stop，模型 idle 后 finally 清 scratch，专用 ACK 保存 cleanupSummary/residualRisks，停止后零普通调用与零新执行。准确 scratch created/removed 路径与不存在断言保全。

复现使用仓库现有脚本与本批记录器：`python -X utf8 scripts/m1-run-services.py <新的回执名> pnpm test:conformance:integration` 创建独有标签服务，登记准备/ready，运行完整 M0+M1，finally 保全日志/客户端原件后只清本轮 ID。DB/API/Worker 使用相应根分项；真实 Recovery 用 `recovery-real-*` 回执名使记录器启用独有 source/target 契约；普通 lint/typecheck/test/CI 检查由 `m1-run-check.py` 记录实际 Node 输入。生产操作应使用用户已有合法 Human/Agent 凭据，不把 test installer/privileged seed 搬入生产。

## 原件、资源与剩余门禁

完整日志可读副本去尾随空白符合原 `git diff --check`；先保存无损 raw ZIP，分别有工作树原字节和当时 Git blob，不修改 whitespace 属性或原 CI 门禁。[raw-log-index](product-evidence/raw-log-index.json)、各内容寻址 `raw-logs-*.zip` 的内部 index 保存历史原件；[源码 ZIP](product-evidence/final-product-source.zip) / source index 保存双字节，Git LF 与 Windows CRLF 分列，不能用工作树 hash 冒 Git hash。运行输入 ZIP 另含原 `inputs.json`，每次 actual postFingerprints/前后变化保留；新增报告/证据脚本是测试后文档处理，不冒已作为产品执行字节跑过。

输入归档保存运行当时相对 actual main 的源码差异；后来新加入的差异和 post 缺失/运行中删除也单列，不能从旧 HEAD 猜运行字节。最终 conformance 后只改发行 build 的 fixture exclude，对 test config/include/typecheck 无影响，已由干净 build 验证；不因此重跑无变化真实客户端。最终实际暂存 Git 对象全 main 范围 `diff --check` exit 0 和冻结方案原件未变见 [静态回执](product-evidence/final-static-check.json)。先前临时关闭 autocrlf 的错误工作树诊断产生截断输出且 Git 独立退出未知，原缺口见 `whitespace-diagnostic-first.json`，不以后接 Python 的组合 exit 0 冒原 Git 通过。

旧中断运行 exitCode 为 null，保持未知，原 running 回执不补码；`integration-final-inputs.zip`、`lint-final-inputs.zip`、`wait-ddl-first-inputs.zip` 是中断留下未闭合 ZIP，原字节保留并标缺口，不能称完整源绑定。原 Node ignored Runner 日志已保存 `runner-legacy-logs.zip`；没有原退出或精确组合的旧日志仅作历史诊断。资源审计首次碰到未闭合 ZIP 的静态首败也保留，后续明确标不完整而非伪“校验通过”。M0 旧 ZIP 两声明容器缺原件等缺口继续作为历史。

[资源审计](product-evidence/resource-audit.md) / JSON 列 75 个登记容器的准确 ID、准备/ready、原 finally 或中断逐命令收尾、日志/客户端 ZIP 和最终状态；最终只读观察没有本卡 owned 容器或登记的同工作树活跃测试进程。服务均先保全再清，镜像共享、无新持久卷或网络，全局 prune/store/他人服务未动。中断首败现场、状态采集错误和未知退出保留；不存在不代替历史批准或清理命令原回执。当前工作树/恢复目录和专用 Node 运行时保留供独审，已拒 G1D0C3/共享目标未动。

已覆盖代表性实际重启、锁等待、事务故障、客户端失响应、跨来源与撤权；未执行每个物理断电/强杀点、每个凭据过期/清理错误的真实客户端笛卡尔积，Runner 单元故障不能冒这些端到端都通过。Recovery 夹具自身 finally 清随机 bundle 目录，但未单独保存每个 Windows 临时目录链接/活动引用预检回执，该历史证据缺口不补造。真实外发/发布、三 OS 分发与 UI 重设计不属于本卡。

交付后停成果 review：另一 Agent 完整独审并闭合 blocking/high，最新 PR Required CI 和 actual done/main 证据齐全后才验收。本文档或候选 branch 合入前的通过检查不替代这些门禁；没有伪造 WorkMesh 远端 Project/WorkItem/Activity 记录。
