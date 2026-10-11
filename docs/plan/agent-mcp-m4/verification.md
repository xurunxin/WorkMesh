# 六域九类验收与证据合同

全部是未来必跑方案，当前没有任何产品测试执行或通过。[冻结 M4](input/frozen-m4.md) 原九类/DoD逐字保留；此处展开精确操作、实际消费者和不适用理由。19项所选操作的角色/状态/feature谓词与允许/拒绝对照见 [操作矩阵](operation-matrix.md)，不得以总API/工具数证明全面可用。

## 后端先验与九类场景

四投影须先用真实 PG/REST 验证：有效E与合法非空Initiative只聚合授权项目且非零；他scope项目隐藏；Human原读；先list再分别撤Delegation/Team grant/principal/credential，精确HTTP拒绝；同SQL快照两种撤权顺序barrier；run本人及nullTeam跨Session拒；usage同快照、显式异scope拒/合法空不免费；A2A本人task/200扫描/空映射页推进/deriveddelivery单事实/最终gate撤权/故障整批回滚。后端拒例未过，四操作继续发现blocked。

| 冻结类别 | 六域与实际有限写验收步骤 | 不适用与判定边界 |
| --- | --- | --- |
| 正常 | Planning cycles/Initiatives/view/results分页，rollup nonzero及多币种known+unknown；普通saved view owner创建读取。Automation规则/run/effect/source；Loop合法origin admission，target真实接单E读本人run、Template pin完整body、usage。另合法project/item E读health并提completion；A2A有限页、空映射页推进，模型与REST/DB逐值匹配 | C只在其sourceRule准许的查询模式；C/projectless Loop E不假挂项目；Human准备、特权DB夹具、协议/模型实收分开 |
| 越权/撤权 | 每selected operation准确权限正例与另一Team/project/Session/private owner负例；关闭各feature真实错误。rollup先list撤权明确拒；run origin不能读target；usage另agent/session/project拒；A2A准确task与finalgate撤权零新delivery。AgentHuman管理拒绝且Human合法正例 | 不能因缺工具推REST安全；manifest资格不能推领域目标权限；Human cookie不流入Agent |
| 非法状态 | 停用Loop/Template、错误pin/协议、no-overlap、budget/capacity；Stop/terminal普通读写拒；Health缺/错approval不能publish、completion仅suggestion | 纯GET无领域状态transition，验证被停/撤资格拒及合法有效对照，不伪写transition；不新增规则/Loop管理 |
| 幂等 | saved view/run/usage/health/completion相同key+body单事实、异体409，业务occurrence/dedupe重复不多effect/event/outbox；A2A相同cursor重读单deriveddelivery且同payload | 纯GET无Idempotency-Key义务；A2A由既有binding+event唯一约束去重，不能加GET receipt替代 |
| 旧revision | Health真实合法同E旧If-Match冲突后明确新intent；Human规则改版保持旧领域消费者回归。DTO/SDK/MCP/Runner一致传revision | cycles/list/rollup/run/usage/A2A GET无If-Match；runLoopNow/recordUsage/saved view非revisioned依原幂等/领域校验，不新增revision |
| 事务失败 | 对run admission/usage/saved view/health/completion现行transaction注入失败，state/receipt/event/outbox一起回滚；Worker effect checkpoint事务故障；A2A最终batch失败无partialderiveddelivery | 普通GET无写command事务，断言零state/event/outbox/receipt不称写回滚；A2A derivedwrite特殊适用 |
| 重放 | scheduled/已有webhook/job/outbox重复消息只一effect、fence/checkpoint有效；同occurrence已完成不重演；A2A重复页/并发仅原delivery。SDK/MCPcaller key保原payload | 无新TA calendar/webhook规则、不把TA14或真实外发写已通过；M4不扩Runner自动transportReplay白名单 |
| 并发 | 两合法请求竞争Loop no-overlap、预算预留和capacity；H pause Loop/rule与E请求按原锁序两种顺序；真实PG barriers证明rollup/run/usage撤权snapshot、A2Afinalgate竞态；分页过程中撤权下一页拒 | 纯读没有OCC写冲突；不把顺序撤权当同时请求；不加读锁改变全域语义 |
| 重启/恢复/Stop | 真实owned API/MCP/Worker进程EOF/退出并重启，持久run/result及A2Acheckpoint恢复；LoopStop后零普通effect、原EStop_ACK/Lease清理；未知provider仅对账；客户端cachedinventory仍能恢复 | app fixture重建不是原生PID重启；没有M4新增shell/机器资源，不套用其清理测试；外部unknown不盲发 |

每条子场景保存caseId、operation/actor/feature/credential mode、准确权限facts、输入/响应、SQL/领域事实、允许正对照、拒绝结果及适用理由。env skip写具体条件和影响，不能以skip/pass-with-no-tests做必需正例。readonly GET、A2A派生写、Human管理回归分别记账。

## discovery专属回归

以下同属九类中的正常、越权/撤权、非法状态及重启/恢复，不另造已通过场景。逐规则以真实合法E/C提供共同门禁，目标未知时断言 `requires_target_check` 和准确pendingChecks：rollup为initiativeLinkedProjectScope；run为routeResolvedScope/automationRunSessionMatches；usage为usageSessionMatches/usageAgentMatches/usageProjectMatches/usageFiltersMatchCurrentSession；A2A为a2aBindingActive/a2aTaskSessionMatches。均不得再含旧humanAuthorityMatches/legacyMembershipQueryVisible；REST允许非空与拒例另核，pending不等于已授权。

四条规则逐项覆盖feature=false、queued/stopping/终态、缺work:read的blocked反例及合法目标待核正例。真实MCP同样测feature/state/target-pending；注册capture与filtered tools/list分开，read-only不见有限写、read-write同操作E/C current_session，原health/completion变体及ACK/heartbeat/Stop不回退。对baseline138旧bindings/137映射逐字段保留，不仅比数量。生成器未知operation、缺M4真实注册、冲突及activation未达成拒例必须失败且无部分写；这些是未来测试，当前未运行。

## 真实客户端固定链

在 [独立部署准备](environment-and-resources.md) 登记并准备空test DB及fake服务后，对 SDK、HTTP MCP C/E、真实Pi executing E、native OpenCode分别运行：规则/Loops发现与分页 → 合法origin runLoopNow回执 → target通过原接单/兑换E读取run/effects/pin/result → 本人准确Usage及summary → 另project/item E项目进展/rollup/health/completion → A2A本人task有界恢复。source/session变更分成真实新credential，不把同origin贯穿target虚报一条闭环。

两真实模型驱动实收整页/大Template正文、currency/unknown、结构化拒绝code/correlationId和后续合法读取；原HTTP Buffer字节UTF-8完整、工具输入/输出及DB事实逐值断言。协议driver/read registration smoke不足以证明真实客户端。OpenCode按M5来源现行私有hydration/stdin/readiness/EOF退出方法复用；本机版本需本轮实现实际核验，M5旧运行不代本批。

## 未来准确命令与 CI 接线

以下均未执行。Windows使用实际 `pnpm.cmd`。先在仅本卡空test DB运行环境保护、migrate/seed；不把仓库默认compose直接指向旧服务。

```powershell
node scripts/require-integration-env.mjs
pnpm.cmd db:migrate
pnpm.cmd db:seed
pnpm.cmd --filter @workmesh/api exec vitest run --config ../../vitest.integration.config.ts integration/stage4-operations.integration.test.ts
pnpm.cmd --filter @workmesh/conformance exec vitest run --config vitest.integration.config.ts src/optional-domains.conformance.test.ts
python -B scripts/generate-agent-discovery.py
pnpm.cmd generate:route-policy
pnpm.cmd generate:runner-skill
git add -- packages/contracts/src/agent-discovery-rules.ts packages/contracts/src/route-policy.ts OPENAPI.yaml docs/route-policy-matrix.md apps/agent-runner/src/workbench-skill-manifest.ts
python -B scripts/generate-agent-discovery.py
pnpm.cmd generate:route-policy
pnpm.cmd generate:runner-skill
git diff --exit-code -- packages/contracts/src/agent-discovery-rules.ts packages/contracts/src/route-policy.ts OPENAPI.yaml docs/route-policy-matrix.md apps/agent-runner/src/workbench-skill-manifest.ts
pnpm.cmd --filter @workmesh/contracts exec vitest run src/agent-discovery.test.ts
pnpm.cmd check:route-policy
pnpm.cmd check:runner-skill
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd test:e2e
pnpm.cmd --filter @workmesh/conformance build
pnpm.cmd ci:source build
pnpm.cmd ci:source lint
pnpm.cmd ci:source typecheck
pnpm.cmd ci:source test
pnpm.cmd ci:test
pnpm.cmd ci:validate
pnpm.cmd smoke:agents
```

生成前须完成正式复审、后端正反测试及真实工具注册capture，填M4 activationGate及实际registeredBindingIds；不以尚未生成的新发现回归作为第一次生成前提形成循环。第一次生成后才运行发现回归并登记postGenerationAcceptance。两轮生成前后分别保存五个文件完整长度/SHA256，暂存后零diff仅证明幂等；同时核M0–M3输入hash未变、旧bindings/mappings/identityVariants全保留。`ci:source`现行脚本要求build/lint/typecheck/test参数，以上按实际script展开，不调用无参数失败命令冒通过。本轮没有执行此命令块。

原test:integration从DB/API/conformance/Worker/recovery串行reset，本卡专库且无并行suite占用。原命令失败必须保stdout/stderr/exit，定位首败后保准确修复消费源码，只续证据明确分段，不把续跑exit0改原exit1；完整新root重跑如实际发生另留回执。source-gates/测试实际cache数量照实记录；直接conformance生产build保证新cross-package fixture的rootDir/exclude不被缓存掩盖。

现行 `.github/workflows/ci.yml` 的 `Run real MCP and Pi conformance` 作业沿真实integration入口执行；新增suite必须同时出现在conformanceinclude、rootunitexclude、ci-policy必含清单，fixture只排生产build。`scripts/ci-policy.test.mjs` 对每个suite删除做负例，CIbootstrap yaml用原独立lock/npmci规则，不因根依赖缺失移除parser门禁。日志沿pipefail/失败传播和always上传，Required CI不缩减。

本轮规划目录包含JSON/Python，现行 `classifyChanges` 会判full，不能自称prose-only或修改属性降门禁。规划文档检查与未来PR Required CI分栏；本卡产品验收仅在最新真实候选所有必需CI成功、独立成果审查关闭blocking/high、PRmerged和actualDone/main齐备后登记。

## 原件与结论格式

记录准确command/workingdir/redactedenv/start/end/runtime/exit、suite与test数/pass/fail/skip/cache、首败、prepared/restarted/cleanup资源ID；前后每个实际消费源码长度/hash、Git blob、工作树换行、staged/提交bytes映射分列。Git对象相同不证明中间运行bytes；缺旧原件如实记缺，不伪造hash/历史结果。仅复用已核Git/ZIP/member源，不复制整份M5构建输出。

逐operation结论只写实际支持、拒绝保留、未测、禁用或不适用；报告限定Windows/loopback/fakeprovider，其他OS/发行/真实provider不继承通过。#9/#16UI保全与#5三OS发行原门禁不减，不强加为所有M卡前置，除非这次实际选择其场景并消费新已验收源。本卡不伪真实WorkMesh远端事实。
