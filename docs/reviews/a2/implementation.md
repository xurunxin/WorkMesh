# A2 实施记录

## 范围与输入

用户已确认实施完整计划。批准的计划正文仍在 `docs/plan/a2-configuration-readiness.md`，平台 ID 为 `FkfKZkAdoHUa-nr2Hq1mA`，版本字段未提供，保持 `null`。正文 UTF-8 为 17436 字节，SHA-256 为 `b9586ccbe50666ee7a5530ea9ce8f5a295ec9385b8711d81e0fb14648476c4a2`；没有覆盖历史计划或重新生成自引用计划。

当前规格源快照为 `docs/plan/a2-configuration-readiness/current-spec.md`，SHA-256 为 `7afb314d31400fc4ccb3d63d4ce8e097dec3692fda66f375a171f5c732f68be1`。三个用户裁定均落地：URL 明确工作类型、三个固定 WorkMesh 起始提示、项目内真实仓库配置入口。没有新增向导、seen、提示设置、Runner 探测或自动激活。

开工输入 `5b9c76b5f79917697906520edcd6947bfbfa925f` 的观察留在 `execution-input.json`。C3 更新前成果保存在 `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b`；最新观察及共享影响见 `c3-integration/input.json`。同分支正常整合精确 main `18252ba8761aa810c3fd12d31ecae83e8b24d985`，整合提交为 `ca5daf4c0f024ce1b42f8c940125d824ebfcfe03`。两个冲突原件分别保全；同时保留 A2 DTO 和 C3 预置合同、测试开关。主线判断来自远端精确 ref，未把共享 `FETCH_HEAD` 当 main。

## 实现与兼容

- 工作台消费 A1 三态投影，按仓库、模型、Agent 依赖深度排列；只有 applicable/blocked/unmet 被计数。Runner 始终说明未知。刷新、失败、上下文切换和撤权屏蔽旧操作；URL 不合法或与当前会话不匹配时不发投影查询。
- 起始提示仅追加未发送草稿并聚焦；无对话时只展开创建表单，用户显式创建后再填入。canonical 页面往返保留会话选择和焦点，原缺口消失时聚焦清单标题。复用现有主题和语义 token。
- 项目配置复用连接创建、仓库注册和异步上下文命令。凭证仅在表单内存；权限提示不授予写权限。按目标、命令正文和 provider action 精确关联解析结果，不把 POST 成功或旧上下文当已配置。失去响应的同文重试沿用请求身份；新增 POST 保留追加事实语义，没有虚构 If-Match。
- Worker 外部请求前及最终落库/结果 checkpoint 恢复均重新核验授权。采用 C1 workspace 前置锁与既有完整资源锁计划，授权行锁持有至上下文、pinned 事件及 outbox 提交，供应商请求期间不持锁。撤权事实自己的 outbox 与被禁止的上下文 outbox 分开断言。
- 跨 Team 场景揭出的拒绝事件事务回滚已修正：目标锁持有期间由既有事件解析器读取目标当前作用域，拒绝事实只向原请求人开放且仍受资源权限约束，不强行套用动作请求时的旧 Team、不更改动作原始目标。解析期间与 checkpoint 恢复各覆盖十类撤权；拒绝事实精确一次，context/guidance/pinned 及对应 outbox 无新增。
- 三个连接秘密分别参加稳定 HMAC 指纹：独立用途域、字段名和原始秘密字节；账本仅保存最终摘要。旧脱敏指纹不能证明正文相同，拒绝不安全重放，保留 TTL 语义，不自动换键。明文不进入账本、事件、响应或日志。
- 新 Human 仓库列表在 SQL 分页前限制 Team/active/provider；游标绑定筛选及启用 provider 集合。旧无参数 Human/Agent 分支、200 条上限、游标信封、排序和权限保留，Agent 拒绝新增 Human 筛选。C3 模型预置默认关闭、读取与草稿不出站或保存的语义保留。
- 仓库列表最后一条 SQL 仍核当前 workspace 角色、membership 和非删除 Team；预检后的撤权不能凭缓存的管理员身份返回旧数据。两种真实数据库竞态用例覆盖降级并删除 membership，以及 Team 删除。

没有新增迁移、领域实体、端点或事件类型。新增读取字段 `can_configure_context` 和可为空的 `provider_action_id` 是非授权 DTO；后者关联已完成动作及其结果，历史未关联上下文仍可读取。

核心改动位于 `apps/web/features/workbench/configuration-readiness.tsx`、`conversation-workbench.tsx`、`apps/web/features/projects/project-repository-configuration.tsx`、工作台/Projects 页面及导航/i18n 模块；API 的 `delivery/repository-configuration.ts`、`delivery/routes.ts`，Worker 的 `provider-actions.ts` 和共享 `repository-configuration-contracts.ts` 对应读取、命令与落库边界。`OPENAPI.yaml`、ADR、当前规格索引及覆盖矩阵同步更新；具体用例和源码绑定在同目录记录。

## 演示步骤

登录后在工作台的普通入口选择仓库工作；URL 必须含唯一 `workKind=repository` 及真实 Team。缺配置时清单按仓库、模型、Agent 排列，可以先解决任意项。仓库链接到项目内配置锚点；管理员显式创建连接/注册仓库，管理员或维护者显式提交只读上下文，等待真实解析后返回工作台，缺口重算。模型与 Agent 链接使用既有页面，不自动激活。

空会话点击三个起始提示只展开创建表单或填入草稿，用户自行创建、发送。使用 Back/Forward、键盘 Tab，并切换中英文、明暗和窄屏，检查清单与配置区可达；配置已满足时横幅消失，Runner 仍显示未知。

## 验证与证据

每个实际运行目录的 `receipts.json` 保存命令、退出码、开始/结束时间及资源归属；日志记录实际数量和 skip。带 `source-before.json`、`source-after.json` 的运行保存工作树原字节及精确 HEAD，不将 Windows 换行展开冒作 Git blob。早期探索运行未完整捕获源码的缺口如实保留；其通过不能替代整合后的组合结果。当前结果以 `execution-results.json` 为准，未写入该文件的检查不预填通过。

浏览器和集成首败均保留。trace 和认证存储按 `sanitize-evidence.ps1` 脱敏或移除，逐路径/归档项记录原哈希、最终哈希及原因；脱敏副本不冒作秘密原字节。D0 原图及固定比较参数保持；新增 UI 的预期视觉差异与真正回归分别记录，自动截图不能冒称人类视觉审批。

Lite 入口从精确提交构建并 save/load，目标服务不挂载源码，使用独有 compose 项目及 HTTPS Gitea 夹具。沿用原始 Lite 安装合同，保留 RustFS 凭证映射风险；本机实际安装、真实设备和真实供应商联通分别记结果，普通仓库 E2E 的 Lite skip 不计通过。

## 验收与收尾

当前实际结果如下，后续提交的 Git blob 与受测工作树原字节由 `checked-source-binding.json` 分列绑定。根单元、集成运行期间仅浏览器入口测试文件发生变化，API、Worker、组件、契约和锁清单保持受测字节；完整浏览器和最新静态检查期间无源码变化。

| 检查 | 运行与实际结果 |
| --- | --- |
| `pnpm check:route-policy`、`pnpm lint`、`pnpm typecheck` | `a2-static-1791476564371` 均退出 0 |
| `pnpm test` | `a2-22323ec0`，29 个 task 全部成功；Web 803、API 179、Worker 163 通过，Worker 2 跳过 |
| `pnpm test:integration` | 同轮退出 0；DB 80、API 216、Worker 113 通过；API 1、Worker 1、recovery 1 跳过 |
| 撤权、HMAC、分页组合 | `a2-21cc8a38`，56 项通过；覆盖两种授权恢复路径、十类撤权、真实锁等待、秘密冲突/旧账本及当前 SQL 重验 |
| `pnpm test:e2e` | `a2-46fe0e21`，78 项通过、2 项跳过，退出 0；Lite 与关闭 Gitea 场景分别验收 |
| 关闭 Gitea 的 A2 浏览器 | `a2-c2def680`，11 项通过、1 项 Lite 跳过，退出 0 |
| `pnpm ci:validate`、Web build | `a2-c2def680` 两条均退出 0 |
| 锁清单生成与验证 | `lock-inventory-check.json`，生成后去掉更新变量再验证，均 8 项通过 |
| 全站 i18n | 最新静态轮退出 1，21 条均位于未修改的 C1 `notification-channel-settings.tsx`；A2 新文案无诊断，不加忽略规则 |
| D0 原截图比较 | `a2-6f596da7`，8 通过、6 失败；五项设计差异仍失败并待人工确认，详情页网络首败单独原用例重跑 `a2-40208d29` 1 项通过；详见 `visual-review.md` |
| Lite 无源码安装 | 独立镜像与安装入口已实现；以稍后的精确提交运行记录为准，普通 E2E 跳过不计通过 |

早期首败未覆盖或删除。`a2-24d1b785` 的记录器因 Windows 活动日志占用异常退出，浏览器最终码缺失，不计产品通过；异常及单独归属收尾回执保留，日志写入器已加入有界重试。其三个容器已逐 ID 清理并确认不存在，认证材料脱敏成功。

原六项、九类适用性、DoD 和三安全修补的实际用例绑定见 `execution-map.json`，规划矩阵仍保留历史要求。不因文档存在、旧 source 通过或主线历史 CI 标记本次通过。最终独审、最新 Required CI、实际 main 落地及人类视觉确认仍单列；本记录不标记整卡完成。

只清理登记归属本任务的测试资源，并保存逐 ID/path 检查和操作回执；共享镜像、默认网络、当前 worktree 保留。C3 的拒绝/违规审计及其新旧目录不修改、不删除，旧 worktree 未满足合入/保全/无活动引用条件时不清理。
