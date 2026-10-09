## 背景

A2 消费 A1 的只读投影，在会话区上方展示可任意顺序解决的配置缺口，并让仓库深链实际通向项目内配置。采用已确认的 URL 工作类型、三个固定提示和既有仓库命令；查询不产生领域写入，配置成功不触发委派或激活。

## 实施假设

工作类型只读取 URL 的 `workKind=repository|non_repository`；缺失、重复或非法值不查询、不推断。展示顺序按真实配置依赖图的最长路径降序：连接→仓库→上下文深度为 2，模型连接→启用模型、Agent 定义→Team 授权深度均为 1，同深度模型在 Agent 前。Runner 不进入缺口计数。

## 文件变更

- `docs/plan/a2-configuration-readiness.md` 及同名目录：保存完整计划、当前规格、原始工具读回、历史仓库规格、来源哈希、平台绑定和逐项验收映射；计划 ID 生成前记 `null`，独审前实读补绑。同步 `docs/plan/activation-task-specs/09.md`、`index.json`、`docs/reviews/r1/test-coverage.json` 的 A2 条目，以及 `docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md`；保留历史来源与原六项测试/DoD，更新新增写入后的九类适用性，不改 ADR 状态。
- `apps/web/features/workbench/configuration-readiness.tsx`、`configuration-readiness.module.css`：新增投影 Hook 与清单组件，复用 `apiRequest`、A1 的 query/response Zod schema、`actorAuthorityScopeKey`、`useAuthorityLifetime` 和 `useRealtimeSubscription`。上下文键包含 Human、workspace、Team、工作类型、Project、WorkItem；请求可取消且仅最新键可落地。加载、失败、401/403/404 和上下文切换清除旧操作；挂载、手动刷新、页面恢复、焦点返回及相关事件/resync 重读。仅 `applicable + blocked + unmet` 成为清单行，全部满足即移除横幅；`unknown` 单独说明“平台无法确认 Runner 是否在线”，不生成故障或运行许可。
- `apps/web/app/workbench/page.tsx`：复用 `useCurrentTeam` 提供已授权 Team 入口；显式 `teamId` 不存在或失权时不换到其他 Team。URL 无工作类型时只显示上下文提示和带明确参数的普通入口链接，不新增选择器。已有会话采用其真实 Team/Project/WorkItem，显式 URL 上下文与会话不匹配时拒绝查询。
- `apps/web/features/workbench/conversation-workbench.tsx`、`conversation-workbench.module.css`：接入清单，保留原创建、发送、Stop、草稿及 Session 校验；空状态仅对首个真实缺口显示配置主动作，模型/Agent 的无数据展示也以对应投影为准。新增三个固定提示：“介绍一下 WorkMesh 的主要功能和使用方式。”“帮我梳理项目目标，整理待办和下一步。”“帮我把一个任务整理成清晰的目标、计划和验收条件。”点击只追加到未发送草稿并聚焦编辑器；没有对话时仅展开既有创建表单并暂存提示，用户显式创建后再填入，不自动创建或发送。
- `apps/web/app/lib/configuration-readiness-navigation.ts`：集中解析上下文和生成链接，复用 `projectWorkspaceHref`。模型到 `/settings/agent-workbench`，Agent 到 `/agents`，仓库到 `/?view=projects&teamId=T&project=P#project-repository-configuration`；工作项用 `repositoryWorkItem=I` 指定配置目标，无 Project 时仍在 Projects 页面处理该工作项，不伪造 Project。出发前合并保存当前 history entry 的会话选择和焦点目标；Back/Forward 后重读，原行消失则聚焦清单标题。保留无关参数，不接受任意返回地址。
- `apps/web/app/page.tsx`：在既有 Projects 页面接入仓库配置区和锚点，复用 `openProject` 的请求门禁与 `ProjectEditor` 创建入口；处理深链 Team、Project、WorkItem 的真实作用域并保持原列表、看板、抽屉和导航行为。没有配置目标时要求选择或显式创建项目；普通空项目列表不增加配置横幅。
- `apps/web/features/projects/project-repository-configuration.tsx`、`project-repository-configuration.module.css`：展示所选 Team 的分页仓库与当前目标上下文。workspace admin 可使用已有连接 ID 注册仓库，并在同区通过既有 `provider-connections` 命令创建 GitHub/Gitea 连接；Gitea 按真实 feature 开关展示。Team admin/maintainer 配置已有仓库上下文，普通成员只读。使用现有三个 input schema 和 `apiMutation`；提供 base branch、base SHA、branch pattern、allowed paths、显式权限，默认只读。凭证只留表单内存，提交、失权和离开时清除，不进入草稿、URL 或日志。
- `packages/contracts/src/repository-configuration-contracts.ts`、`packages/contracts/src/index.ts`、`OPENAPI.yaml`：为既有仓库、上下文、连接创建及待处理动作响应补充共享 Zod DTO；仓库读取增加 `can_configure_context`，Agent 读取固定为 false。不新增端点、配置实体、迁移或事件类型。
- `apps/api/src/delivery/repository-configuration.ts`、`apps/api/src/delivery/routes.ts`：将仓库读取投影封装为加载函数，按既有 workspace admin、当前 Team admin/maintainer 规则派生上述操作提示，保持既有 Agent 读取分支。配置 POST 继续使用原授权、事务、幂等账本和 Worker；响应和提示不授予权限。上下文 POST 返回后显示“已提交，等待解析”，用事件与每两秒的有界重读确认真实上下文，最长一分钟后显示尚未确认并保留手动刷新。校验失败不清非秘密字段；403/404 清除旧操作；响应丢失重试同一请求身份，改正文才建立新身份。并发配置保留既有追加事实语义，展示服务器最新结果；这些 POST 不支持 `If-Match`，不伪造 revision 防护。
- `apps/web/app/lib/i18n.tsx`：扩展现有类型化中英文文案，覆盖计数、状态、三个提示、仓库表单及错误；复用 `@workmesh/ui` 和现有明暗语义 token，窄屏自然换行与滚动，不迁移根 token。
- `apps/web/e2e/configuration-readiness.spec.ts`、`apps/web/e2e/fixtures/configuration-readiness.ts`、`configuration-readiness-provider.ts`：新增真实 API 夹具与 Fake Agent/FakeGitProvider Worker 驱动，执行完整清单、仓库命令与返回重算；延迟/乱序和响应丢失只在相应用例拦截。扩展 `conversation-workbench.test.tsx`，新增 `configuration-readiness.test.tsx`、`configuration-readiness-navigation.test.ts`、`project-repository-configuration.test.tsx`，验证竞态、焦点和提示不自动写入；扩展 `apps/api/integration/stage3-delivery.integration.test.ts` 与新增 DTO 契约测试，覆盖新增读投影权限及既有配置事务、重复请求、Worker 重放和重启恢复。
- `scripts/verify-a2-lite.mjs`、`apps/web/playwright.a2-lite.config.ts`：新增独立 Lite 验证入口，构建精确提交的 `infra/docker/lite.Dockerfile` 镜像、验证四角色并 save/load，在无源码挂载的独有目录用现有 Lite compose 安装，再执行同一验收文件的安装链路。部署 Worker 通过测试专用 HTTPS Gitea 夹具读取固定仓库原件，显式启用该测试实例的 Gitea 并仅追加测试 CA 信任，不关闭 TLS 验证；隔离端口、数据库、卷、网络及服务。不改安装合同，安装或供应商夹具不可用时保留失败与未验收状态。

## 验证

原六项均落到 `configuration-readiness.spec.ts` 的同名用例：依赖深度排序；逐项配置后 Back 重算并允许逆序解决；可观察项全部满足时无横幅；ready/unknown/not_applicable 及普通空列表不长主动作；Back/Forward、键盘焦点、390px 窄屏、中英文和明暗回归；Lite 安装后逐项补齐直到横幅消失。九类逐项场景、文件、用例名及 DoD 去向详见同名目录的 `review-map.md`；新增写命令使幂等、事务失败、重放和恢复适用，未新增 revisioned mutation 的 stale revision 如实不适用。所有结果先记未运行。

在独有测试服务、含 test 的数据库、完整集成环���与绝对 Playwright 输出目录下，先用 `pnpm --filter @workmesh/web exec playwright test --config ../../playwright.config.ts configuration-readiness.spec.ts --list` 核对用例，再执行同命令去掉 `--list`。运行定向组件/契约/API 检查、中英文检查及 `pnpm check:route-policy`，随后顺序执行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm ci:validate` 和 Web build；不并行占用同一 Next 构建目录。执行 `node scripts/verify-a2-lite.mjs`，将本机无源码安装验证与真实设备、真实供应商联通分别记录；Lite 现有 RustFS 凭证映射风险保留为安装缺口，不用仓库 E2E 或 skip 替代通过。

D0 原件、视口、主题设置、栅格参数和比较阈值保持，保存工作台及项目配置区的前后图、diff 与预期设计差异，完成实际视觉评审。开工与交付前按远端 `refs/heads/main` 的精确 SHA 核验输入并整合实际增量；本轮远端与工作树同在 A1 基点，来源记录保存准确参数、观察时间及先前共享 `FETCH_HEAD` 误判的纠正，不新增开工门禁。识别 #21 的共享 CSS/布局范围，在实际整合后重验，A2 独立验收且不增加 #21、D4 或 TA 硬依赖；#13 承接组合回归。

本轮只提交规划和规格同步，停在 confirm 独审；blocking/high 闭合并由 Chief 确认后才实施。产品验收须有本次实际结果、独审、最新 Required CI 和实际 main 落地证据。每轮先登记资源归属，成功及失败收尾均先保全脱敏证据，再逐项清理本任务闲置容器、专用镜像、卷、网络、进程和临时路径；保留共享资源和当前 worktree，旧 worktree 满足合入与保全条件后用正式命令清理，记录逐项回执。

向导、seen、可编辑提示、Runner 活性探测、自动激活及后续 TA/F 功能不在范围内。