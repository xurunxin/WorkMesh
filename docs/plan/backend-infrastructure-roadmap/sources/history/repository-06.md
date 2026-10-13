# 后端化测试影响与验收

## 审查依据

本表记录源码审计和实施后的验收要求。本轮没有运行产品测试，所有迁移和产品验收均待执行。
既有测试文件存在，只证明有检查入口；不能据此宣称新组合已经通过。
源码绑定、用例声明和断言行号见 [test-inventory.json](test-inventory.json)。

根 `playwright.config.ts` 启动真实 API 和 Web，并以独立测试数据库运行。
`apps/web/playwright.mocked.config.ts` 使用预览服务；`page.route` 的响应只证明页面消费方式。
非 `mocked/` 文件也有模拟响应，因此分类按文件内容，不按目录名称推断后端覆盖。

## 断言迁移规则

每个原用例和断言位置都有源码索引。下表逐套件指定后端责任和去向。
布局、键盘、主题、页面状态和截图断言退役，历史证据保留。
领域状态、鉴权、隔离、撤销、审批、revision、幂等和恢复断言保留。
浏览器模拟过的安全行为必须在真实后端重新证明，不能把模拟成功当成后端验收。

优先复用现有 API 集成文件。缺少的纵向覆盖迁入待创建的
`apps/api/integration/backend-retirement.integration.test.ts`，下表简称“退役集成套件”。
实施者删除浏览器入口前，须把下表每项保留行为绑定到准确后端用例和实际结果。
索引中的断言起始行可回查完整 Git blob；多行断言和循环实例仍须通读原函数。

<!-- SUITE_TABLE_START -->
| 原测试或脚本（短路径位于 apps/web/e2e/） | 原行为与夹具 | 现有后端源码覆盖入口 | 去向（待实施） |
|---|---|---|---|
| `actionable-collaboration-queues.spec.ts` | 页面投影夹具；H／C／E 分离、脱敏、队列计数与权限 | `collaboration-queue-counts.integration.test.ts`、`human-attention.integration.test.ts`、`stage2-collaboration.integration.test.ts` | 保留队列与隔离合同；响应式和页面 URL 退役 |
| `agent-governed-controls.spec.ts` | page.route 模拟响应；Stop、Plan revision、retry 新 Session、If-Match 与精确输入 | `stage1.integration.test.ts`、`autonomous-control-plane.integration.test.ts`、`execution-waits.integration.test.ts` | 模拟安全语义用真实后端补缺；草稿、焦点和导航退役 |
| `agent-run-timeline.spec.ts` | 页面投影夹具；因果组、不可变 Plan、证据来源与分页 | `stage2-collaboration.integration.test.ts`、`stage3-delivery.integration.test.ts` | 投影合同核后端，DOM 数量、键盘和 URL 状态退役 |
| `approval-real-agent.spec.ts` | 真实 PG／API／worker→fake Agent；审批产生、worker 投递、Agent 接收、审批后结果与证据 | `stage1.integration.test.ts`、`stage2-collaboration.integration.test.ts` | 完整纵向用例迁入退役集成套件，复用 FakeAgent、createFakeAgentServer 和 createAgentWebhookWorker |
| `attention-center.spec.ts` | page.route 模拟响应；当前 scope、精确审批、逐项权限与 stale recovery 拒绝 | `human-attention.integration.test.ts`、`stage2-collaboration.integration.test.ts` | 迁移必要后端负例；批量表单状态不增加新后端批量能力 |
| `collaboration-hub.spec.ts` | 页面布局；attention 数据读取由后端承担 | `human-attention.integration.test.ts` | 桌面／手机可读性退役 |
| `command-center.spec.ts` | 页面搜索与键盘；已存在的查询和资源隔离 | `stage0.integration.test.ts`、`route-policy-authorization.integration.test.ts` | 搜索阈值和焦点退役，不新增搜索 API |
| `connection-diagnostics.spec.ts` | 页面／发现夹具；过期、rotation、撤销、scope、秘密脱敏 | `stage5-agent-connections.integration.test.ts`、`stage5-connector.integration.test.ts` | 复用真实凭据拒绝；页面状态和浏览器本地状态退役 |
| `documents.spec.ts` | 真实 API 与页面；不可变版本、冲突、导出、恢复、归档和来源归属 | `documents.integration.test.ts` | 复用领域覆盖，编辑器呈现退役 |
| `features-disabled.spec.ts` | 页面 feature gate；禁用功能不得入准入路径 | `stage4-operations.integration.test.ts`、`route-policy-authorization.integration.test.ts` | 保持真实 FEATURE_DISABLED；导航和请求次数退役 |
| `frontend-unification.spec.ts` | 页面布局／语言；既有 Project、Issue、Agent 资源读取 | `stage0.integration.test.ts`、`stage1.integration.test.ts` | 等高卡片、局部跳转和本地化退役 |
| `guidance.spec.ts` | 真实 API 与页面；版本化 Guidance、scope、Session pin 与审计 | `guidance.integration.test.ts` | 保持不可变版本；页面操作退役 |
| `human-control-plane-acceptance.test.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `human-reflow.spec.ts` | 预览服务／响应式；无新增后端合同 | 无后端迁移项 | 所有 reflow 断言退役，原截图保留 |
| `mcp-onboarding.spec.ts` | 模拟发现和 MCP 响应；发现失败安全、client 合同、MCP 不泄露配对 fragment | `stage5-agent-connections.integration.test.ts`、`stage5-connector.integration.test.ts` | 迁移发现、Skill、兑换及非法 client 的真实验证；复制按钮和几何退役 |
| `mocked/accessibility-keyboard.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/agents-interactions.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/agents-responsive.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/approval-human-agent-journey.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/command-center-routes.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/connect-clients.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/d0-visual-baseline.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/final-tour-server-contract.test.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/final-visual-tour.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/large-list-pagination.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/loading-states.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/operations-settings.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/operations-ux.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/overlay-contract.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/page-hotkeys.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/settings-workflow-colors.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `mocked/toast-outcomes.mocked.spec.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `notification-channels.spec.ts` | 真实 API 与页面；目标 owner、秘密脱敏、禁用持久化、撤销及无探测 | `notification-channels.integration.test.ts`、`wecom-notifications.integration.test.ts` | 复用 owner／隔离／撤销负例；浏览器秘密存储检查退役 |
| `pagination.spec.ts` | 页面分页与夹具；opaque cursor、过滤 scope、去重与第二页可达 | `stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 保留服务端 cursor 绑定；页面晚响应和 Registry 交互退役 |
| `playwright-config-contract.test.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `playwright-run-directory.test.ts` | 预览服务／浏览器工具合同；mock 数据与请求输入不构成服务端通过证据 | `route-policy-authorization.integration.test.ts`、`stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件 |
| `project-editor.spec.ts` | 真实 API 与页面；Project 创建和 revisioned 更新、Markdown 数据持久化 | `stage0.integration.test.ts`、`stage1.integration.test.ts` | 核对数据往返和 stale revision；页面 URL 恢复退役 |
| `recovery-center.spec.ts` | page.route 模拟响应；恢复投影、最新 revision、保留证据及受控 retry | `workbench-recovery.integration.test.ts`、`stage5-agent-connections.integration.test.ts`、`execution-result.integration.test.ts` | 缺失后端恢复负例迁入退役集成套件，页面几何与 URL 退役 |
| `rich-content.spec.ts` | 编辑器与布局；Markdown 存取和附件鉴权 | `documents.integration.test.ts`、`stage3-delivery.integration.test.ts` | Markdown／附件 REST 保留，HTML 惰性显示和键盘呈现退役 |
| `stage0.spec.ts` | 真实 API／PG／SSE；安装登录、CSRF、幂等、revision、团队删除后拒写、SSE 接续 | `stage0.integration.test.ts`、`bootstrap-install.integration.test.ts` | 跨 API 重启及 SSE 断线接续迁入退役集成套件 |
| `stage1.spec.ts` | 真实 API 与页面；原子委派启动、失败重试新 Session、非管理员权限 | `stage1.integration.test.ts`、`route-policy-authorization.integration.test.ts` | 核对原子启动与非管理员负例，补缺到退役集成套件 |
| `stage2.spec.ts` | 模拟页面与真实 API 混合；协作可见性、lease force release、Inbox、决策与审计 | `stage2-collaboration.integration.test.ts` | 真实事务／scope／force release 保留；卡片与布局退役 |
| `stage4.spec.ts` | 真实 API 与页面；规则操作、运行事实、模板、usage 与 feature gate | `stage4-operations.integration.test.ts` | 领域控制保留，页面呈现退役 |
| `theme-unification.spec.ts` | 主题样式；无新增后端合同 | 无后端迁移项 | 主题、CSS slot 与本地存储断言退役 |
| `wecom-backend-compatibility.spec.ts` | 真实 PG／REST；本地 Markdown 函数；本人可读、另一 Human 404、读取不新增决策事实、转发后实时鉴权 | `human-attention.integration.test.ts`、`wecom-notifications.integration.test.ts` | 改为 REST 链接并验证复合 ID、匿名和撤权；登录页面丢定位作为历史限制保留 |
| `work-item-detail.spec.ts` | 页面与请求输入检查；If-Match、幂等键、精确 mutation 输入 | `stage0.integration.test.ts`、`stage1.integration.test.ts` | 保留后端输入与 stale revision；Sheet、焦点和草稿退役 |
| `work-surfaces.spec.ts` | 页面与 mutation 夹具；稳定 revisioned mutation、Saved View 数据合同 | `stage0.integration.test.ts`、`stage4-operations.integration.test.ts` | 保留 mutation／View REST；布局、拖动、语言和客户端重试呈现退役 |
| `workbench-accessibility.spec.ts` | 页面结构／键盘；API 返回 scope 由后端套件承担 | `workbench-conversations.integration.test.ts` | 无障碍和几何断言退役，不冒后端已验收 |
| `workbench-conversation.spec.ts` | 真实 API 与页面；对话读取权限与服务配置入口 | `workbench-conversations.integration.test.ts`、`configuration-readiness.integration.test.ts` | 保持对话和设置 REST；桌面／手机入口退役 |
| `workbench-llm-settings.spec.ts` | 真实 API 与页面；预置可编辑后显式保存、模型连接注册撤销、凭据脱敏 | `workbench-llm-connections.integration.test.ts`、`configuration-readiness.integration.test.ts` | 保留管理 REST 与秘密负例；表单退役 |
| `scripts/verify-a2-backend-lite-api.mjs` | 真实部署 API／PG／worker；固定 HTTPS Git 提供方；安装认证、Cookie／CSRF、provider connection 与 context 动作幂等、精确 action/context 关联及 guidance 原件 | `bootstrap-install.integration.test.ts`、`stage3-delivery.integration.test.ts`、`stage3-provider.integration.test.ts` | 保留并改为 Node 原生 HTTP 直连 API；移除 Web workspace 的 Playwright、install 页面和 workbench 浏览器断言 |
| `scripts/verify-a2-backend-lite.mjs` | 准确 Git archive 构建；独立无源码 Compose 安装；固定 HTTPS 提供方；api／worker／migrate 入口、save/load 镜像身份、无源码与无 bind mount、安装状态、部署 worker、TLS CA、归属日志及定向收尾 | 由原部署脚本承担 | 保留部署验证入口；移除 web role、Next compiled proxy 和页面结论；启动后直接验证 API 并调用保留的内层脚本 |
<!-- SUITE_TABLE_END -->

## 目录外 Lite 脚本

两份脚本属于后端部署验证入口，不能随 WebUI 专用脚本整体删除。
原始检查位置和 Git blob 见 `test-inventory.json`；以下用例名是 #61 实施时须落地的名称，本轮尚未创建或执行。
内层脚本的 HTTP 检查改用 Node 原生请求，显式保存安装响应 Cookie，并在 mutation 发送 CSRF 和幂等键；不再从 Web workspace 加载 Playwright。

| 原检查及机制 | 保留的验收与目标 | 退役项 |
|---|---|---|
| 外层：安装状态；内层：`/api/v1/auth/install`、`me`、`teams`，安装后携带 Cookie 和 CSRF | 保留真实安装认证、身份及团队读取；复用 `bootstrap-install.integration.test.ts`，退役集成套件新增 `liteInstallCookieCsrf` 正例及缺 Cookie／CSRF 拒绝；部署脚本验证实际 HTTP 会话 | `/install` 返回 HTML、页面含 WorkMesh |
| 内层：同 key／body 两次创建 provider connection、两次请求 repository context | 保留连接 ID、action ID 相同及单次业务事实；复用 API `stage3-delivery.integration.test.ts`，退役集成套件新增 `liteProviderConnectionReplay`，覆盖不同 body 复用 key 拒绝 | 无；不可随浏览器删除 |
| 内层：仓库列表 `availableOnly`、`can_configure_context`；等待部署 worker 生成准确 `provider_action_id` 的 context | 保留 repository／project ID、null work item／session、base SHA、read 权限及 guidance 原文精确匹配；复用 worker `stage3-provider.integration.test.ts`，退役集成套件新增 `liteExactProjectContext`；原部署入口继续消费真实 worker 输出 | Chromium、workbench 页面、页面错误和配置就绪提示 |
| 外层：准确 `git archive` 构建、角色加载检查、`docker save`／`load` 后镜像 ID 比对 | 就地保留 `liteImageSaveLoadIdentity`，检查 api／worker／migrate 角色；保留构建 SHA、镜像身份和原日志，不由集成测试代替 | web 角色、Next compiled proxy／rewrites |
| 外层：私有安装目录只复制部署文件、Compose 无 bind mount、启动后安装状态及内层验证 | 就地保留 `liteNoSourceInstallation`、`liteDeployedWorkerContext`；安装目录不含源码或 node_modules，容器无源码挂载；直接暴露 API，`WEB_ORIGIN` 兼容值指 API | Web 代理与“仍使用主 Web”的验收结论 |
| 外层：固定 HTTPS Git 提供方、专属 CA、owner 标签、日志脱敏、定向收尾 | 保留 TLS 校验、确定性仓库原件、资源身份及活动引用检查；收尾仅本人已登记资源，历史证据和真实低功耗设备未测状态不改写 | 无；不关闭 TLS 或扩大清理 |

实施责任统一为 #61 产品实施者，方案独审复核断言去向，最终产品独审核实际结果。
不得将缺失验证推给 #62 文档初版或 #20 后续功能。

产品实施后，在独立测试数据库及现行环境预检下执行：

```bash
pnpm test:integration:api
pnpm test:integration:worker
node scripts/verify-a2-backend-lite.mjs
```

前两项须实际执行上述新增用例及既有 API／worker 回归。
外层脚本准备隔离 Lite 环境与固定 HTTPS 夹具，调用 `node scripts/verify-a2-backend-lite-api.mjs`，保存无源码安装、save/load 和真实 worker 输出证据。
单独运行内层命令须使用外层已准备的同一环境，不能连共享业务实例。
全部命令及用例当前状态为“待产品实施后执行”；历史 A2 通过不能代替后端化组合验收。

## 镜像与签名 Skill

复用 `scripts/generate-workmesh-skill-artifact.mjs` 的 `--check` 路径。
该检查比较规范 LF 字节、manifest 中的 SHA-256 和现有公钥的 Ed25519 签名。
迁移不重新签名，不申请签名私钥。新增 API 下载处理器只允许固定资产路径。

| 验收 | 步骤 | 预期 |
|---|---|---|
| 资产原件 | 对比旧 Web 资产、新 API 资产及实际提交 blob | 字节、LF、摘要和签名不变 |
| 生产 API 镜像 | 构建并启动生产 API；校验 discovery，完成配对兑换，使用 `redeemed.skill.download_url` 下载原始响应体 | 镜像文件、HTTP 字节和签名原件一致 |
| Lite API 角色 | 独立启动 Lite 的 API 角色；校验 discovery，完成配对兑换，使用 `redeemed.skill.download_url` 下载 | 不依赖 Web 服务或夹具静态服务器；镜像文件、响应体与原件逐字节一致 |
| 路径限制 | 请求未声明文件、编码后的路径穿越及非法文件名 | 不读取任意文件，不返回秘密 |
| 真实消费 | 修改 `stage5-connector.integration.test.ts`，从真实 API 下载 | SDK／连接器完成校验和兑换，不由 gateway 代供资产 |
| 发现地址 | API 与 MCP 使用不同 origin；核对发现、Skill 和 MCP URL | 前两者由 API 服务，MCP 指向配置的 MCP origin |

下载地址只从兑换响应取得，不增加 discovery 字段。
discovery 的 `AgentConnectionWellKnownSkill` 校验名称、版本、摘要和签名；现行严格 schema 拒绝 `download_url`。
复用 `packages/contracts/src/stage5-contracts.test.ts` 的兑换必含字段、发现不含字段两项合同检查。
分别从现有授权的配对创建和兑换流程取得生产／Lite 响应，再消费其 `skill.download_url`。
纠正来源见 `review-corrections.md`；Saved plan 原件保留原句。

## 通知链接与旧投递

复用 `prepareChannelSend`、`settleChannelSend` 和 `reconcileChannelSend`。
`ChannelContent` 的 `effectKey`、`title`、`body`、`url` 和 `sourceRevision` 参与原摘要。
旧摘要兼容校验必须重建全部字段，使用现行 canonical 序列化；不能只比较来源 ID 或 URL。
Human attention 的复合 ID 须按现有合同编码为路径段，不能只使用底层 UUID。

| 验收 | 夹具和步骤 | 预期 |
|---|---|---|
| 新投递 | 真实 PostgreSQL，fake 通知适配器，正常 claim 后发送 | API 链接不含凭据；按既有状态机结算 |
| 旧摘要兼容 | 保留原格式的 `request_hash`，加载合法待发送记录 | 全字段旧摘要匹配，发送新链接；数据库旧摘要不变 |
| 旧内容篡改 | 改动原摘要字段，保持旧摘要 | `IDEMPOTENCY_KEY_REUSED`，零适配器调用 |
| 不确定状态 | 分别构造 `sending`、`uncertain`，重启 Worker 并尝试再次 claim | 零自动重发；过期 sending 按现行合同进入 uncertain |
| 并发与旧 fence | 两 Worker 竞争，旧 claim／旧 ACK／旧 fence 再执行 | 唯一有效 checkpoint；旧持有者拒绝，无重复外发 |
| 显式重试 | owner 用当前 revision 和幂等键调用 reconcile retry | 只有原状态机批准后可发送，旧摘要继续校验 |
| 撤权 | 用真实 PG 屏障，使撤权提交早于发送 checkpoint | 投递受抑制，零外发；不声称可召回已提交的外部请求 |
| API 链接鉴权 | 本人、匿名、其他 Human 和已撤权者分别读取链接 | 本人读取 JSON；未授权者按既有合同拒绝，无登录页 |
| 原有合同 | 注册／撤销 Web Push 订阅，读取 config，运行 fake worker 投递 | 后端服务和历史数据保留；移除页面与自带 Service Worker |
| 读取无副作用 | 通知与 attention 的列表／详情读取前后比较事实 | 不新增 decision、event、outbox 或投递记录 |

不真实向企业微信或 Web Push 提供方发送。本次修改不增加自动恢复。

## CI、恢复与实施后的命令

更新 `scripts/ci-policy.mjs` 的 `checkIds`、`classifyChanges` 和 `evaluateResults`。
删除浏览器 job 后，迁入 API 的断言必须进入必需检查。
fake Agent 等直接消费者变更也必须触发 API 检查。缺历史全检、缺结果和失败传播保持拒绝。
用删除必需步骤、缺结果、失败结果和未知文件变更的负例验证自举与汇总。

恢复保留 API、worker、Agent 工作流和 durable cursor 验证，增加 MCP 接口检查。
删除 Web 探测不代表恢复已通过；恢复后的实际 API／MCP smoke 必须运行。

以下为产品实施后执行的命令，本轮均未运行：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm ci:test
pnpm ci:validate
pnpm check:route-policy
pnpm check:workmesh-skill
pnpm test:integration
pnpm test:conformance
pnpm smoke:agents:ci
python scripts/validate-development-images.py
pnpm validate:production-images --env-file=<私有环境文件>
pnpm validate:lite:self-test
sh infra/lite/verify-image-roles.sh <Lite镜像>
```

集成环境须有独立测试数据库，通过现行 `require-integration-env.mjs` 预检。
开发镜像逐个无缓存构建，生产与 Lite 逐个实际验证；缓存绿色不能替代本轮执行。
归档准确命令、源 SHA、原日志、首败和本任务资源清理回执。
