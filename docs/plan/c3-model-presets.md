## 上下文

提供带出处的模型配置目录，减少 base URL 手工输入错误。复用 `WorkbenchLlmSettings` 的连接创建、修订和模型登记流程，以及服务端 `normalizeLlmBaseUrl`、鉴权、幂等和 revision 校验。选择预置只填可编辑草稿；保存不调用模型服务。

开工前复读当前任务、最新 `main`、前置任务验收及 `docs/reviews/r1/test-coverage.json`，固定实际输入提交。本批使用已批准的 Todos＋仓库记录方式，交付仍须独立复核和 Chief 确认。

## 假设与边界

- 首批包含 MiniMax、DashScope、智谱、Moonshot·Kimi、DeepSeek、火山、SiliconFlow、百度千帆及 OpenAI；每家收录一条官方标准文本 API 配置，模型标识取实施时官方入门示例，并与官方模型列表交叉复核。
- 确认方式表示资料核对方式。本次读取官方资料的条目标记为机器确认；保留人工确认枚举。模型开通、地区与账号条件写入说明。
- 真实探测、付费服务调用、新协议、预置 CRUD、数据库表和迁移均不在范围内。

## 文件变更

- `packages/contracts/src/model-presets.ts`：新增严格 Zod 契约。目录包含必填 `version`、`entries` 和默认空的 `disabledIds`；条目包含稳定 `id`、`provider`、`region`、`apiType`、`baseUrl`、`modelId`、`sourceUrl`、`checkedAt`、`confirmationMethod` 与说明。复用 `llmApiTypeSchema`，拒绝缺失出处、非法日期、重复 ID、未知字段和带凭据的 URL。
- `packages/contracts/src/index.ts`：导出契约，登记默认关闭的 `WORKMESH_BETA_MODEL_PRESETS`，补齐功能路由映射与公开读取清单。
- `OPENAPI.yaml`：声明公开只读 `GET /api/v1/workbench/model-presets`、目录响应和现有 `FEATURE_DISABLED` 错误，不声明写入操作。
- `packages/contracts/src/route-policy.ts`、`packages/contracts/src/route-policy-bindings.ts`、`docs/route-policy-matrix.md`：按现有路由策略模式登记 `listModelPresets`，同步生成字段及矩阵；对应路由契约测试更新数量并验证公开、只读和功能开关策略。
- `apps/api/src/data/model-presets.json`：保存首批目录及每条官方出处。只采用可直接编辑使用的完整 URL 和模型标识，不把模板变量或虚构接入点当有效配置；不包含凭据、兼容性状态或模型能力断言。
- `apps/api/src/model-presets.ts`：实现启动时加载和只读路由。优先级固定为：功能关闭时不读取部署文件；启用且指定 `WORKMESH_MODEL_PRESETS_FILE` 时整体替换内置目录；随后应用该目录的 `disabledIds`。文件缺失或校验失败阻止启动，不回退或合并。加载后深度冻结，请求只返回已加载数据；文件变更需重启生效。
- `apps/api/src/server.ts`：在 `buildApp` 中加载并注册目录，加入公开路径，复用现有功能开关错误处理。连接保存继续调用原有 `normalizeLlmBaseUrl`，部署目录不能绕过私有主机授权与 allowlist。
- `packages/config/src/index.ts`：增加本地文件路径配置，拒绝远程 URL；功能开关继续使用 `loadFeatureConfig`。
- `.env.example`、`.env.lite.example` 和现有三份 `docker-compose*.yml`：沿用环境配置模式传入功能开关和目录路径；部署文档给出只读文件挂载配置。
- `apps/web/app/lib/model-presets.ts`：实现响应校验和纯草稿填充函数，复用 `publicRequest`；不提交保存、不持久化选择、不修改目录对象。
- `apps/web/app/settings/workbench-llm-settings.tsx`：在新增连接表单加入预置选择器，展示目录版本、地区、模型、出处、核对日期及确认方式。选择后填连接和待登记模型草稿，保留手工编辑；连接创建成功后将模型草稿绑定新连接，模型仍须显式登记。切换连接清空未登记模型草稿，刷新目录不覆盖用户编辑。凭据、作用域和能力上限由用户填写；目录关闭、为空或加载失败时仍可手工配置。
- `apps/web/app/lib/i18n.tsx`：补齐双语文案，明确“预置不验证凭据”“保存不验证可达性或兼容性”。
- `CONTEXT.md`、`docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md`、`docs/production-deployment.md`、`docs/VERSION_POLICY.md`：记录 Preset 定义、确定的加载规则、公开目录的数据边界、出处维护和功能开关。百炼固定域名与业务空间域名的关系按[官方说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)记录。
- `docs/plan/c3-model-presets.md`、`docs/reviews/c3/`：实施时保存与平台一致的计划、任务引用、官方复核清单、输入提交、测试映射、实际结果和审核证据；历史 R1 快照保持历史含义。

## 验证

开工前完成测试映射，所有新增断言先标为未运行：

- `apps/web/app/lib/model-presets.test.ts`：建立原验收四项及 `R1-17-1`、`R1-17-8`，覆盖版本与出处必填、完整替换、禁用优先、多次读取不修改数据、草稿填充不自动保存；零出站验收关联下面的真实 API 集成用例。
- `apps/api/src/model-presets.test.ts`：用例“禁用优先且不读取指定文件”“完整替换不残留内置条目”“坏文件拒绝启动”“并发读取不改变冻结目录”。同时检查内置 JSON 随 TypeScript 构建进入部署产物。
- `apps/web/app/settings/workbench-llm-settings.test.tsx`：用例“选择预置只填草稿并显示出处”“手工编辑不被刷新覆盖”“模型草稿绑定新连接且显式登记”“目录失败仍可手工保存”。
- `apps/api/integration/workbench-llm-connections.integration.test.ts`：新增“预置配置创建修订及重放零模型服务出站”和“修改预置 URL 仍受安全策略约束”。对 `fetch`、HTTP、HTTPS 出站入口设置失败陷阱并统计零调用，实际执行连接 POST/PATCH，保留真实数据库及原有加密、授权、幂等和 revision 断言。
- `apps/web/e2e/workbench-llm-settings.spec.ts`：走“读取预置→选择→手工修改→显式保存连接→显式登记模型→刷新”的完整链路，断言选择阶段没有写请求且凭据不回显。`playwright.config.ts` 启用测试目录开关；功能注册表夹具按现有模式同步新增键。

执行定向 Vitest 与 Playwright 检查，再运行 `pnpm generate:route-policy`、`pnpm check:route-policy`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 和适用 CI。集成使用独立测试数据库与完整服务夹具，结束后再运行 E2E；记录实际执行数量、失败和跳过项。

构建 API，并在生产部署产物中验证内置目录可读；用只读挂载文件验证整体替换、逐项禁用及重启生效。逐家复核官方资料，不调用模型推理或鉴权 API。全部适用检查通过、证据落盘且独立复核完成后，交 Chief 确认。