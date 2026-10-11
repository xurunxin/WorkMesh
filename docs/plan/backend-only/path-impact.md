# 实施路径与服务影响

## 保留的服务和消费者

API 使用 Fastify 的 `buildApp`。worker 继续处理 BullMQ、outbox、lease 和通知。
MCP 是独立服务；PostgreSQL、Redis、对象存储和外部 Runner 继续支撑后端。
`packages/domain`、`packages/db`、`packages/contracts` 和业务数据继续保留。
SDK、连接器及 CLI 是 API／MCP 消费者，不按 WebUI 删除。

Human 的安装、登录、管理、审批和设置已有 REST 入口。
保留 Cookie、CSRF、实时鉴权、原 feature gate 和默认值，不新增登录页面或授权。
配对入口、签名 Skill 和通知链接是当前 Web 依赖，须迁移后再移除运行路径。

## 拟改动与依赖

下表是产品实施范围，本轮没有改动这些文件。
完整原方案中的文件组保持原文；这里列出已核查的具体入口。

| 文件或路径 | 当前依赖 | 实施动作 |
|---|---|---|
| `apps/web/`、`packages/ui/` | Next.js、React、页面、Service Worker 和 `@workmesh/ui` | 移除可运行客户端及仅供 UI 的包；保留浏览器基线和历史证据原件 |
| `playwright.config.ts`、`apps/web/playwright.*.config.ts`、WebUI 专用脚本 | 启动 API／Web、预览服务、浏览器与报告 | 后端断言迁移后移除浏览器运行入口，保留历史报告 |
| `package.json`、`pnpm-lock.yaml`、`turbo.json`、`vitest.config.ts` | 根 `test:e2e`、Playwright、Next 缓存与 workspace 闭包 | 更新剩余依赖闭包，不升级无关依赖，不移除后端检查 |
| `apps/web/public/skills/workmesh-1.1.0.md` | 当前签名下载资产只由 Web 提供 | 原字节迁入 `apps/api/assets/skills/`，禁止重新签名 |
| `apps/api/src/skill-download.ts`（待创建）、`server.ts`、`agent-connections.ts` | `resolveAgentConnectionEndpointUrls` 的 Web 下载与 connect 页面 URL | 在 `buildApp` 注册固定下载合同；发现与下载使用 API origin；配对 fragment 保留 |
| `OPENAPI.yaml`、`AGENT_PROTOCOL.md`、`packages/contracts/src/route-policy*.ts` | 新路由须进入 `installRoutePolicyInventory` 的精确注册清单 | 合同先行，再由 `generate-route-policy-artifacts.mts` 生成；不扩权 |
| `scripts/generate-workmesh-skill-artifact.mjs`、`.gitattributes` | 旧资产路径、规范 LF 和签名校验 | 更新路径并核实际提交 blob，签名与摘要保持 |
| `packages/db/src/channel-notifications.ts` | 原 URL 参与 `ChannelContent` 的 request hash | 全字段兼容旧摘要；旧哈希保持；sending／uncertain 继续禁止自动重发 |
| `apps/worker/src/automation.ts`、`wecom-notifications.ts` | Web Push 与企业微信旧页面深链接 | 使用鉴权 REST 链接；URL 无凭据，保留发送准入与结算 |
| `docker-compose*.yml`、`.env.example`、`.env.lite.example` | Web 镜像、端口和 Next 代理；`WEB_ORIGIN` 约束 Human 请求 | 直接暴露 API；保留配置名兼容，并更新 origin、发现和反向代理示例 |
| `infra/docker/` 的 API／worker／MCP 开发与生产 Dockerfile、`lite.Dockerfile` | 安装前复制 Web manifest；Lite 包含 Web runtime | 移除 Web 构建要求；验证 API 资产打包、完整安装钩子、非 root 和只读限制 |
| `packages/config/src/service-command.ts`、`runtime-secrets.mjs`、`infra/lite/verify-image-roles.sh` | Lite 的 web role 和 Next 启动预检 | Lite 只保留 api／worker／migrate；保留秘密、健康和退出约束 |
| `.github/workflows/ci.yml`、发布候选／晋级 workflow | 浏览器分片、Next 缓存、四镜像发布与 Web 恢复探测 | 删除 Web 路径，后端检查与扫描、证明、摘要固定继续执行 |
| `scripts/ci-policy.mjs`、`ci-policy.test.mjs`、`ci-test-inputs.mjs`、`validate-ci.mjs` | `checkIds`、闭包分类、Required CI 和 YAML 自举 | 更新消费者关系和必需结果集合；缺结果和失败仍拒绝 |
| `scripts/validate-development-images.py`、`validate-production-images.mjs`、`validate-lite-compose.mjs`、`validate-release-workflows.mjs`、`create-release-manifest.mts` | 验证器显式要求 Web 镜像或 Web 角色 | 更新为后端组合，实际执行镜像验证，保留来源证明与安全负例 |
| `packages/recovery/scripts/post-restore-smoke.ts` | 恢复后探测 Web 页面 | 保留 API／worker／Agent，增加真实 MCP 检查 |
| `apps/api/integration/stage5-connector.integration.test.ts` | gateway 夹具代供 Web 静态 Skill | 改为消费真实 API 下载处理器 |
| `apps/api/integration/backend-retirement.integration.test.ts`（待创建） | 浏览器仍承担部分纵向后端合同 | 按测试影响表迁移缺失领域和安全断言，接入 API 必需检查 |
| `README.md`、`AGENTS.md`、`CONTEXT.md`、`docs/CI.md`、`docs/production-deployment.md`、`docs/agent-integration.md`、`deploy/lite/README.md`及现行操作说明 | 启动、构建、部署与验收仍有 WebUI 要求 | 同步纯后端入口和准确命令；完整接入初版由 #62 接续 |

## 历史与真实分歧

`apps/web/e2e/baselines/`、`docs/reviews/` 和旧规格继续保存原始证据。
取消视觉检查不等于旧失败已通过。路径移动须保留原路径、源 Git blob 与字节哈希。
不重建已移除的 `WORKMESH_PRD.md`。

本方案不新增数据库迁移，不删除业务数据或共享 store。
若后续源码核查发现某项 API／MCP 能力会失去等价入口，列出准确能力和影响，提交真实分歧裁定。
两项通知选择已明确，不再作为开放问题。
