## 背景

WorkMesh 改为长期纯后端服务，对外提供 API/MCP。当前 WebUI 还承担 Lite 代理入口、签名 Skill 下载和部分后端验收；退役时同步迁移这些职责，消除发布、恢复和 Required CI 对 Web 的依赖。

## 实施约定

保留 worker、PostgreSQL、Redis、对象存储、外部 Runner、连接器和 SDK。Human 管理继续使用现有 REST、Cookie 和 CSRF；Agent 权限、功能开关默认值及业务数据保持原合同。本次不新增数据库迁移。

沿用当前卡片明确的 Todos＋仓库记录方式。完整接入文档初版由 #62 承担；B3 编码、新功能、文档站和外部发布不在本卡范围内。

## 文件改动

- **`docs/adr/*-backend-only-service.md`、`docs/plan/backend-only.md`、`docs/plan/backend-only/`**：先提交中文退役决策、路径影响清单和浏览器断言去向表。新增逐卡去向、验证和资源清理记录。开工独立读取远端 `refs/heads/main`，绑定准确 SHA，与本会话分支比较；不将共享 `FETCH_HEAD` 当作主线，不删除共享锁。

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

1. 复用共享 pnpm store，登记本任务独立可写依赖及测试资源。执行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm ci:test`、`pnpm ci:validate`、`pnpm check:route-policy`和 `pnpm check:workmesh-skill`。验证后端变更实际选择所需 job，并用删除必需步骤、缺结果和失败结果的负例证明门禁有效。

2. 使用专用测试数据库和现有环境预检，执行 `pnpm test:integration`、`pnpm test:conformance`及 `pnpm smoke:agents:ci`。断言去向表必须逐条对应真实用例与结果；取消的 UI 检查不标为通过。

3. 执行 `python scripts/validate-development-images.py`，实际无缓存构建 API、worker、MCP 开发镜像。逐个构建对应生产镜像及 Lite 镜像，执行 `pnpm validate:production-images --env-file=<私有环境文件>`、`pnpm validate:lite:self-test`和 `sh infra/lite/verify-image-roles.sh <Lite镜像>`，保留源码绑定、原日志和定向清理回执。

4. 在本任务隔离 Compose 环境实际完成安装／登录、Cookie＋CSRF 管理请求、发现、Skill 字节与签名验证、连接器兑换及 MCP `initialize → verify_connection → get_workmesh_context`。验证 Stop／撤权后拒绝，通知链接对本人可读、他人不可读；通过 fake 通知适配器覆盖旧哈希、失权和不确定投递，不真实外发。执行恢复矩阵及恢复后的接口 smoke。

5. 提交代码、中文说明、实际命令与结果、首败及清理回执，经平台推送本会话分支。仅清理已登记、无活动引用的本人资源。独立审查关闭 blocking/high，最终 head 的最新适用 Required CI 成功后，按既有“优先合并”授权合入；核验 PR 和主线实际落地后才标记完成。
