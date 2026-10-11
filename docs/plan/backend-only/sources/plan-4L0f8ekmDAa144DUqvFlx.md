## 背景

WorkMesh 改为长期纯后端服务，对外提供 API/MCP。当前 WebUI 还承担 Lite 代理入口、签名 Skill 下载和部分后端验收；退役时同步迁移这些职责，消除发布、恢复和 Required CI 对 Web 的依赖。

## 实施约定

保留 worker、PostgreSQL、Redis、对象存储、外部 Runner、连接器和 SDK。Human 管理继续使用现有 REST、Cookie 和 CSRF；Agent 权限、功能开关默认值及业务数据保持原合同。本次不新增数据库迁移。

沿用当前卡片明确的 Todos＋仓库记录方式。先单独提交并经平台推送方案、来源和测试影响文档，交接准确文件路径、分支和提交 SHA；产品编码、退役删除及 CI 实现须等待方案独审及实施确认。两项原问题已裁定：保留 Web Push 服务端合同，新通知改为鉴权 API 链接，不再重复询问。交付顺序为 #61 → #62 → #7 → #20。完整接入文档初版由 #62 承担；B3 编码、新功能、文档站和外部发布不在本卡范围内。

## 文件改动

- **`docs/plan/backend-only.md`、`docs/plan/backend-only/sources/plan-eeEM_cmzdO-i7EqTiz7XF.md`、`sources/spec.md`、`sources/user-decisions.md`、`source-manifest.json`、`test-impact.md`**（后四项位于 `docs/plan/backend-only/`）：前置文档提交保存可审完整方案、原平台方案逐字全文、本轮最新完整规格及两项准确问答。原方案从本轮平台注入的 Saved plan 完整副本保全；`todos` 的截断返回及 `conversation` 的仅链接返回单独记为读取缺口，不当全文。来源清单记录 doc／todo／问题卡 ID、实际读取方式、平台确实返回的字段、UTF-8 正文和提交 blob 的 SHA-256；不猜版本字段，不改写原件，不用摘要代全文。测试影响表逐套件列原路径和断言、已有后端覆盖、迁移目标、纯 UI 退役项及待执行验收，尚未执行不写通过。中文说明按固定写作规范来源手检，原件逐字保留。后续实施阶段新增 **`docs/adr/*-backend-only-service.md`**、逐卡去向、验证和资源清理记录。开工独立读取远端 `refs/heads/main`，绑定准确 SHA，与本会话分支比较；不将共享 `FETCH_HEAD` 当作主线，不删除共享锁。

- **`apps/web/`、`packages/ui/`、`playwright*.ts`及专用 WebUI 验证脚本**：移除可运行页面、组件包、浏览器配置和测试入口。删除前逐项登记；签名 Skill 先迁移，截图、基线、首败和独审原件保留为历史证据，建立原路径、Git blob 和哈希索引。后端读取这些路径的合同测试同步改指现行资产或明确历史来源。

- **`package.json`、`pnpm-lock.yaml`、`turbo.json`、`vitest.config.ts`**：移除 `test:e2e`、Playwright 和仅供已退役 workspace 使用的依赖、Next 输出及缓存输入。按剩余依赖闭包更新锁文件，不升级无关依赖。后端集成验收继续由 `test:integration` 执行。

- **`apps/api/assets/skills/`、`apps/api/src/skill-download.ts`、`apps/api/src/server.ts`、`apps/api/src/agent-connections.ts`**：将签名 Markdown 原件迁入 API，新增固定路径下载处理器，禁止任意文件访问。复用 `buildApp` 和 `resolveAgentConnectionEndpointUrls`：发现与 Skill 使用 API origin，MCP 使用配置的 MCP origin；`connect_url` 保留 fragment 配对码和原字段，改为兑换接口定位符，供客户端提取，不再指向页面。原件字节、哈希、签名及兑换安全检查保持不变。

- **`OPENAPI.yaml`、`AGENT_PROTOCOL.md`、`packages/contracts/src/route-policy*.ts`及生成产物**：先声明 Skill 下载合同，再通过现有 route-policy 生成器更新注册清单。同步配对定位符和纯后端入口说明，不增加凭据字段或授权。**`scripts/generate-workmesh-skill-artifact.mjs`、`.gitattributes`**同步迁移资产路径，并校验提交 blob 的 LF 字节和签名。

- **`packages/db/src/channel-notifications.ts`、`apps/worker/src/automation.ts`、`apps/worker/src/wecom-notifications.ts`及对应测试**：复用 `prepareChannelSend`、`settleChannelSend` 和现有投递状态机。Human attention 来源改用 `/api/v1/human-attention/{id}`，其余通知指向 `/api/v1/notifications`；链接不携带凭据，查询实时鉴权。旧 `request_hash` 按原格式重建并严格校验，保留旧哈希；只有原状态机确认可发送的记录才渲染新链接，`sending`／`uncertain` 不自动重发。

- **`docker-compose*.yml`、`.env.example`、`.env.lite.example`**：删除 Web 服务和 Web 镜像、端口、Next 配置要求。Lite 直接暴露 API，MCP 沿用独立镜像和现有 profile。`WEB_ORIGIN` 保留为兼容配置名，改指外部 API origin，继续约束 Human 请求及通知地址；同步反向代理路由、发现地址和配置示例。

- **`infra/docker/`中后端 Dockerfile、`lite.Dockerfile`、`packages/config/src/service-command.ts`、`runtime-secrets.mjs`及对应测试**：删除 Web manifest 的安装前复制和 Web 运行角色。Lite 只打包 API、worker、migrate；保证生产及 Lite API 镜像包含 Skill 原件。保留非 root、只读文件系统、秘密预检、健康检查和退出约束。同步 `infra/lite/verify-image-roles.sh`。

- **`.github/workflows/ci.yml`、发布候选及晋级 workflow、`scripts/ci-policy.mjs`、`ci-policy.test.mjs`、`ci-test-inputs.mjs`、`validate-ci.mjs`**：删除浏览器 job、分片、下载和 Next 缓存；更新 `checkIds`、`classifyChanges`、`evaluateResults` 和 Required CI 汇总。将迁入的后端断言纳入 API 必需检查，补齐 fake-agent 等直接测试消费者的触发关系。保留锁定 YAML 自举，以及缺历史全检、缺结果拒绝、失败传播和证据上传保护。

- **镜像、发布和恢复验证文件**：同步 `scripts/validate-development-images.py`、`validate-production-images.mjs`、`validate-lite-compose.mjs`、`validate-release-workflows.mjs`、`create-release-manifest.mts`及相关合同测试。生产发布清单只要求 API、worker、MCP；恢复 CI 和 `packages/recovery/scripts/post-restore-smoke.ts`删除 Web 检查，继续验证恢复后的 API、worker、Agent 工作流，并增加 MCP 接口验证。保持扫描、来源证明、摘要固定和恢复门禁。

- **`apps/api/integration/backend-retirement.integration.test.ts`（新增）及现有连接器集成夹具**：逐条核对原浏览器套件，将未被现有后端测试覆盖的领域、鉴权、隔离、撤销、审批、幂等、恢复及真实 worker→fake Agent 断言迁入新套件。连接器纵向测试改从真实 API 下载 Skill，取消夹具代替产品提供静态文件的做法；纯页面、布局和视觉断言登记为退役。

- **`README.md`、`AGENTS.md`、`CONTEXT.md`、`docs/CI.md`、`docs/production-deployment.md`、`docs/agent-integration.md`、`deploy/lite/README.md`及现行发布、操作说明**：同步启动、安装、管理、部署和检查命令。新增当前路线图索引，关联平台最新 #4、#20、#23–29、#32–51 全文和逐卡去向；补充 #7 等待本卡合入及 #62 初版交付的顺序。历史规格保持原件，截断来源记录缺口。中文改动按指定 [SKILL.md](https://github.com/leter/zh-tech-writing/blob/ffda9353768dece8aabd26ccb3a4978025e9437c/skills/zh-tech-writing/SKILL.md)及两份参考执行，记录来源提交和文件哈希；`autocorrect` 缺失时手检。

## 验证与合入

前置文档提交：逐字比对平台完整保存副本、完整规格和原问题答复；用 PowerShell `Get-FileHash -Algorithm SHA256` 校验文件，用 `git cat-file blob HEAD:<路径>` 读取实际提交字节复核清单。执行 `git diff --check` 并按固定技能及两份参考手检新写中文；审查差异只包含上述方案／来源／测试影响文件。记录真实返回字段及截断缺口，确认每条必要断言有去向。文档单独提交并经平台推送本会话分支，给出可读路径和准确 head；推送未成功不得声称独审材料已交付。方案独审及实施确认前，不执行以下产品实施与验收步骤。

1. 复用共享 pnpm store，登记本任务独立可写依赖及测试资源。执行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm ci:test`、`pnpm ci:validate`、`pnpm check:route-policy`和 `pnpm check:workmesh-skill`。验证后端变更实际选择所需 job，并用删除必需步骤、缺结果和失败结果的负例证明门禁有效。

2. 使用专用测试数据库和现有环境预检，执行 `pnpm test:integration`、`pnpm test:conformance`及 `pnpm smoke:agents:ci`。断言去向表必须逐条对应真实用例与结果；取消的 UI 检查不标为通过。

3. 执行 `python scripts/validate-development-images.py`，实际无缓存构建 API、worker、MCP 开发镜像。逐个构建对应生产镜像及 Lite 镜像，执行 `pnpm validate:production-images --env-file=<私有环境文件>`、`pnpm validate:lite:self-test`和 `sh infra/lite/verify-image-roles.sh <Lite镜像>`。分别启动生产 API 和 Lite API 角色，从发现返回的 Skill URL 经真实 HTTP 下载；逐字节比较原签名资产、迁移后的 Git blob、镜像内文件和响应体，验证规范 LF、相同 SHA-256 及现有公钥的 Ed25519 签名。用 `pnpm check:workmesh-skill` 校验生成源与 manifest，验证未声明路径及路径穿越拒绝；连接器须消费真实 API 下载结果，夹具静态文件不能代验。保留源码绑定、原日志和定向清理回执。

4. 在本任务隔离 Compose 环境实际完成安装／登录、Cookie＋CSRF 管理请求、发现、Skill 字节与签名验证、连接器兑换及 MCP `initialize → verify_connection → get_workmesh_context`。验证 Stop／撤权后拒绝，通知 API 链接无凭据且返回 JSON，本人可读，匿名、他人及已失权者拒绝。用真实 PostgreSQL 和 fake 通知适配器分别覆盖新投递、保留旧 `request_hash` 的合法待发送／显式重试，以及旧内容被篡改：按旧序列化合同重建全部字段，合法记录改用新链接但数据库旧哈希不变，不匹配返回 `IDEMPOTENCY_KEY_REUSED` 且零外发。对 `sending`、`uncertain`、发送后 Worker 重启和并发旧 claim/fence 验证零自动重发；仅显式 `reconcileChannelSend` 按既有权限、revision 和状态机允许 retry，撤权先提交则零外发。保留 Web Push config、订阅注册／撤销及 worker 投递的后端正反例，不真实外发。执行恢复矩阵及恢复后的接口 smoke。

5. 提交代码、中文说明、实际命令与结果、首败及清理回执，经平台推送本会话分支。仅清理已登记、无活动引用的本人资源。独立审查关闭 blocking/high，最终 head 的最新适用 Required CI 成功后，按既有“优先合并”授权合入；核验 PR 和主线实际落地后才标记完成。
