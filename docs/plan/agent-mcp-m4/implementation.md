# M4 实施顺序与文件落点

本文件是平台简明计划的执行展开，与 [平台计划全文](savedplan.md) 同范围；本轮只交规划，以下实现及测试均尚未执行。

## 合同与实施关口

先将本目录、完整来源、[安全合同](safety-contract.md)、[消费者合同](compatibility.md) 及 [ADR 提案](../../adr/0086-optional-agent-domain-read-projections.md) 提交本会话分支，回 confirm，由 Chief 按已批准委托交另一 Agent 正式独审。逐项核四投影不扩大角色、Session、Team/project/work-item 范围及 Runner 不增加隐藏能力；blocking/high 闭合并确认后才实现。ADR 现在为 Proposed，不冒 Accepted。规划首败、未测及缺口保留。

实施开工重新只读读取真正 `refs/heads/main` 的准确 SHA，核 M0 及所用 M1–M3 恢复工具、M5 已合增量与本轮来源的差异；对新增主线合同先更新差异记录和受影响设计，再过独审关口。历史 #53、M0 和 M5 报告不倒写。交付只走本会话分支及本卡 review/merge，不另建任务或真实 WorkMesh 远端记录。

## 后端安全合同先行

| 实际拟改文件 | 确定实现与复用 |
| --- | --- |
| `docs/adr/0086-optional-agent-domain-read-projections.md` | 正式合同审查后记录接受结论；四项最小读取修复，不新增管理授权或公开路径。 |
| `OPENAPI.yaml`、`packages/contracts/src/optional-domain-contracts.ts`、`packages/contracts/src/index.ts` | 合同先行：具名 DTO 覆盖矩阵所选响应、usage 查询、Loop 调用、A2A 页及分页。沿旧字段、路径、JSON 错误，十进制字符串及 currency/unknown；导出 schema/type。已有输入复用，不另造同义命令。 |
| `apps/api/src/operations/read-projections.ts` | 新建应用层投影函数 `readInitiativeRollup`、`readAutomationRun`、`readUsageSummary`、`readA2ATaskEventPage`。同一 SQL 快照返回权限标记及正文；复用 `liveSessionReadPredicate`、`principalTeamAuthorityPredicate`、`rollupInitiative`、`mapStreamEvent`，精确限制 current Session。A2A 最终受控派生写另见安全合同。 |
| `apps/api/src/operations/routes.ts` | 四路径调用上述函数并解析共享合同；移走现有 Human membership 偏差查询。其余既有域命令不扩写，不把策略堆在路由。保留 Human 查询结果语义及现行特定错误。 |
| `apps/api/integration/stage4-operations.integration.test.ts` | 先编制四投影真实 PG/HTTP 正反例与 Human 回归、同语句授权竞争和 A2A 去重/回滚测试；通过后才能解除发现阻断。复用该套件真实登录、兑换 Session、Team grant、项目及事务故障夹具。 |

不改 `liveSessionReadPredicate` 全局语义；新投影补当前 principal Team 资格，用既有谓词，而不是给 Agent membership。不改 `packages/db/src/stage4.ts` 的 Loop Session 归属，不新增数据库结构、迁移或事件。后端验证先于适配；发现文档须一直报告四投影当前未修。

## 消费者与发现同步

| 实际拟改文件 | 确定实现与复用 |
| --- | --- |
| `docs/plan/agent-mcp-m4/product-discovery-decisions.json`、`scripts/generate-agent-discovery.py` | M4增量沿M3 rules/bindings/registeredBindingIds，按operation/binding键在M0–M3后合成，registry纳入M4；旧输入、bindings/映射/身份变体保留。未知操作、缺注册、重复冲突、activation证据不齐必须拒生成。当前JSON仅Proposed，实际registry空；首轮生成前需正式复审、后端合同及真实注册捕获，生成后再跑发现/零差异回归，避免循环前置。 |
| `packages/contracts/src/route-policy.ts`、`agent-discovery.ts`、生成的 `agent-discovery-rules.ts` 及原生成工件 | 后端通过后移除四项queryDifferences阻断，并由M4增量替换四项Human查询旧谓词；完整新规则和目标facts见discovery-contract。复用deriveOperationEligibility/projectAdapterDiscovery，未知目标requires_target_check。discovery生成器先行、route-policy生成器只扩OpenAPI/策略表，禁止手改派生规则。 |
| `packages/agent-sdk/src/index.ts` | 增加矩阵具名方法与共享响应校验，复用 `pagedPath`、`request`、`validateResponse`。已有 health/completion 方法保持参数与泛型兼容，新增具名返回默认类型；保留原 `RequestOptions`。调用者 key、同一 body 及准确 Session 凭据不被改写。 |
| `apps/mcp/src/index.ts` | 通过既有 `tool` 注册矩阵所选读取和三项新增适配写；读写模式才注册写。旧工具仍沿现行身份/资格投影；旧 Human 工具存在不等于 Agent 可调用。A2A 新工具仅调用现有有限 GET。 |
| `apps/agent-runner/src/workmesh-tools.ts` | 复用 `createWorkMeshTools`、`add`、`makeTool`、`operationKey`；矩阵所选操作使用准确 executing E 的 qualified manifest。`recordUsage` 两个 Activity flag 均 false，不偷加 `work:write`；命令自身 usage/event/outbox仍照旧。可续页完整输出，A2A/单资源在既有 12,000,000 字符边界内完整返回，超界明确拒绝，不给已消费摘要。 |
| `apps/agent-runner/skills/workmesh-workbench/SKILL.md`、`apps/agent-runner/src/workbench-skill-manifest.ts` | 内嵌说明注明 feature、owner/pin、target E、currency/unknown、独立 A2A checkpoint、有界与恢复边界；用 `generate:runner-skill` 更新 manifest。没有公共签名 Skill 发行。 |
| `packages/contracts/src/agent-discovery.test.ts`、对应SDK/MCP/Runner既有测试文件 | 增加四读完整新谓词及新增操作feature关闭、queued/stopping/terminal、缺能力、合法target待核、mode/精确E/C回归；核旧138 bindings/137 mappings及所有identityVariants、ACK/heartbeat/Stop恢复保留。注册证据必须真实，不用数量冒全面支持。 |

health/completion 已有 MCP/Runner 工具沿现行批准、revision 和工作流语义；本批只补具名合同与六域联用回归，不新增 Human 决定、发布或工作流完成能力。

本轮同步 [发现合同](discovery-contract.md) 与 [逐项审查回应](review-response.md)，未修改产品生成器或派生结果；High(blocking)仍由Chief交正式复审，不因文档修订自封闭。

## 端到端与验收关口

| 实际拟改文件 | 确定实现与复用 |
| --- | --- |
| `packages/conformance/src/optional-domains.conformance.test.ts`、`optional-domains.fixture.ts` | 新套件复用createMcpCoverageFixture/createPlanningCollaborationFixture/既有两客户端驱动；真实registerTool/registerResource公共原调用spy捕获installDiscovery注册，在构建结束finally恢复，不读私有字段。真REST/SDK/MCP、C/E、Pi/nativeOpenCode模型实收与PG事实；六域全开/逐域关闭及合法target待核回归，不真实外发。 |
| `packages/conformance/vitest.integration.config.ts`、`tsconfig.build.json`、根 `vitest.config.ts` | 新套件列入真实 integration include、unit exclude；跨包 fixture 仅从生产 build 排除，typecheck/lint/集成仍消费，保留 `passWithNoTests: false` 及串行测试库边界。 |
| `scripts/ci-policy.mjs`、`scripts/ci-policy.test.mjs` | 将新套件纳入 `validateMcpConformanceEntrypoints` 的必含入口和逐套件删除负例；沿已有 Required CI 作业、失败传播及 always 日志上传，不弱化门禁。 |
| `docs/plan/agent-mcp-m4/` | 实现期间追加 actual 源码清单、前后指纹、操作报告、九类适用理由、原始运行回执、资源账本、独审/CI/actualmain 证明；规划预测与 actual 分栏，首次失败不覆盖。 |

全部本机必需 checks、独立成果审查 blocking/high 闭合、最新 PR Required CI、PR merged 与 actual Done/main 证据齐后，才将本批产品验收记为完成。当前恢复目录继续保留；只清已授权、保全且无引用的本卡闲置资源。

UI 重设计、F/TA 新域、发行/真实外发/连接凭据不属于此卡；发现需改变 Loop 项目归属、跨 Session 观察或新增权限时另列具体卡，不以本提案自行扩权。
