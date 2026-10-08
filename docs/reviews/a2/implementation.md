# A2 实施记录

## 范围与输入

用户已确认实施完整计划。批准的计划正文仍在 `docs/plan/a2-configuration-readiness.md`，平台 ID 为 `FkfKZkAdoHUa-nr2Hq1mA`，版本字段未提供，保持 `null`。正文 UTF-8 为 17436 字节，SHA-256 为 `b9586ccbe50666ee7a5530ea9ce8f5a295ec9385b8711d81e0fb14648476c4a2`；没有覆盖历史计划或重新生成自引用计划。

当前规格源快照为 `docs/plan/a2-configuration-readiness/current-spec.md`，SHA-256 为 `7afb314d31400fc4ccb3d63d4ce8e097dec3692fda66f375a171f5c732f68be1`。三个用户裁定均落地：URL 明确工作类型、三个固定 WorkMesh 起始提示、项目内真实仓库配置入口。没有新增向导、seen、提示设置、Runner 探测或自动激活。

开工输入 `5b9c76b5f79917697906520edcd6947bfbfa925f` 的观察留在 `execution-input.json`。C3 更新前成果保存在 `22a27a9fe5184a5eb9ba13c8d8ec94652962a24b`；最新观察及共享影响见 `c3-integration/input.json`。同分支正常整合精确 main `18252ba8761aa810c3fd12d31ecae83e8b24d985`，整合提交为 `ca5daf4c0f024ce1b42f8c940125d824ebfcfe03`。两个冲突原件分别保全；同时保留 A2 DTO 和 C3 预置合同、测试开关。主线判断来自远端精确 ref，未把共享 `FETCH_HEAD` 当 main。

其后实际 main 为 `74f247f9240eaf21e74ef248f71a445c1d4276d7`，只有历史清理文档增量；Lite 第二轮结束后同分支整合为 `5f052960325c92154486eab6d1c93689d4489899`。精确 ref 原读回、实际 diff 和整合证据见 `late-main-input.json`、`late-main-final-readback.json`。旧输入观察保留历史含义，没有因清理文档重跑无变化产品，也没有清理 C3 目录。

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

Lite 入口从精确提交构建并 save/load，目标服务不挂载源码，使用独有 compose 项目及 HTTPS Gitea 夹具。第一轮 `a2-lite-c4424791` 因主机 CA 文件共享失败；第二轮 `a2-lite-9b8957e6` 的命名 CA 卷、Compose 和角色加载成功，但 Web 固化了 `localhost:3001` 上游，真实安装失败。两轮失败不计通过，原件与收尾回执保留。按既有部署合同，在 Lite 构建阶段绑定内部 `http://api:3001`，不改变通用 Next 默认、认证、TLS 或只读镜像，具体根因见 [修补说明](lite-proxy-repair.md)。新镜像同时检查真实编译 manifest 与经 Web 的安装状态，再运行原安装用例；真实设备和真实供应商联通分别记结果。

原始日志、源码快照、冲突原件及失败上下文采用逐文件无损 gzip，完整映射、工作树与历史 Git blob 字节、解压核验及未压缩副本清理回执在 `raw-evidence-archives.json`。用 `read-evidence-bytes.mjs` 读取原字节；查看归档 HTML 报告前须按其原相对路径解压数据文件。脱敏 trace 的前后摘要另列，不冒作秘密原字节，不通过格式化日志或忽略 CI 掩盖检查。

## 上次交付验收与收尾

以下为实施独审恢复修补前的交付结果，保留旧输入意义，不代表本轮 UI。根单元、集成运行期间仅浏览器入口测试文件发生变化，API、Worker、组件、契约和锁清单保持当轮受测字节；当轮完整浏览器和静态检查期间无源码变化。修补后的当前结果在下文及 `configuration-recovery-review.md`，当前受测原字节与 Git blob 在 `checked-source-binding.json` 分列绑定。

| 检查 | 运行与实际结果 |
| --- | --- |
| `pnpm check:route-policy`、`pnpm lint`、`pnpm typecheck` | `a2-static-1791476564371` 均退出 0 |
| `pnpm test` | `a2-22323ec0`，29 个 task 全部成功；Web 803、API 179、Worker 163 通过，Worker 2 跳过 |
| `pnpm test:integration` | 同轮退出 0；DB 80、API 216、Worker 113 通过；API 1、Worker 1、recovery 1 跳过 |
| 撤权、HMAC、分页组合 | `a2-21cc8a38`，56 项通过；覆盖两种授权恢复路径、十类撤权、真实锁等待、秘密冲突/旧账本及当前 SQL 重验 |
| `pnpm test:e2e` | `a2-46fe0e21`，78 项通过、2 项跳过，退出 0；Lite 与关闭 Gitea 场景分别验收 |
| 关闭 Gitea 的 A2 浏览器 | `a2-c2def680`，11 项通过、1 项 Lite 跳过，退出 0 |
| `pnpm ci:validate`、Web build | `a2-c2def680` 两条均退出 0 |
| Lite 代理修补配置检查 | `a2-proxy-a5b51ab5`，配置包测试、Compose 校验及 16 反例、脚本语法、`ci:validate` 均退出 0；前后源码不变 |
| 锁清单生成与验证 | `lock-inventory-check.json`，生成后去掉更新变量再验证，均 8 项通过 |
| 全站 i18n | 最新静态轮退出 1，21 条均位于未修改的 C1 `notification-channel-settings.tsx`；A2 新文案无诊断，不加忽略规则 |
| D0 原截图比较 | `a2-6f596da7`，8 通过、6 失败；五项设计差异仍失败并待人工确认，详情页网络首败单独原用例重跑 `a2-40208d29` 1 项通过；详见 `visual-review.md` |
| Lite 无源码安装 | `a2-lite-333f7614`，精确 `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` 镜像；四角色/save-load、编译 manifest、无源码 Compose 和经 Web 的安装状态均通过；原 `@lite` 用例实际 1 项通过（10.7s），退出 0 |

早期首败未覆盖或删除。`a2-24d1b785` 的记录器因 Windows 活动日志占用异常退出，浏览器最终码缺失，不计产品通过；异常及单独归属收尾回执保留，日志写入器已加入有界重试。其三个容器已逐 ID 清理并确认不存在，认证材料脱敏成功。

第三轮 Lite 的真实安装、认证、Agent/模型显式 API 配置、Projects 仓库表单与生产 Worker HTTPS 解析完成，Back 后横幅消失；没有对运行许可或自动激活作推断。`source-before-browser.json` 与 `source-after-install.json` 证明关键宿主测试/Compose 输入在浏览器前后不变，镜像源码绑定精确提交，五条编译规则见实际 image ID 回执。第三轮 Compose 的容器/卷/网络、四角色 probe、CA 装载容器及卷、专用镜像和安装目录均清理退出 0，HTTPS 服务关闭，逐路径结果均不存在。真实低功耗设备与真实厂商未验收。

代理修补后应用/API/Worker/契约与共享锁序没有代码变化，原必需检查只复用于这些真实未变输入；Docker 的新编译上游由新镜像构建和实际安装用例重新验证，不冒用旧通过。唯一组件测试文件改动是末尾空行清理，原 6 项已独立重跑通过，原字节及工具回执在 `test-eof-check.json`。

原六项、九类适用性、DoD 和三安全修补的实际用例绑定见 `execution-map.json`，规划矩阵仍保留历史要求。不因文档存在、旧 source 通过或主线历史 CI 标记本次通过。最终独审、最新 Required CI、实际 main 落地及人类视觉确认仍单列；本记录不标记整卡完成。

完整材料提交 `52c314be740ca6e7d2769c96f8614b44101ed6db` 与受测产品提交 `bb86b1fe31e9b23f6e91171b526c860a0a0fcb22` 间无产品差异。`delivery-git-byte-proof.json` 核 3045 个已提交归档 blob 与清单一致；`delivery-remote-readback.json` 的实际查询未发现本分支工作流，最新 Required CI 仍未完成，远端 main 仍为 `74f247f9240eaf21e74ef248f71a445c1d4276d7`。后续只读回执和本文增量属于文档收尾，不伪补未来提交 ID 或未来 CI。

只清理登记归属本任务的测试资源，并保存逐 ID/path 检查和操作回执；汇总及原件入口见 [收尾报告](cleanup-report.md)。共享镜像、默认网络、当前 worktree 保留。C3 的拒绝/违规审计及其新旧目录不修改、不删除，旧 worktree 未满足合入/保全/无活动引用条件时不清理。

## 配置恢复独审修补

本轮三项 blocking 的最小修补、被审代码位置的直接读回及精确场景见 [配置恢复报告](configuration-recovery-review.md)。确认使用动作、仓库、目标及正文，不排除重载基线中的原结果；刷新已展开分页保留有效选择；等待与动作记录分离，挂起读取也按期限释放，原动作只读重试和显式修改均可恢复。没有修改 API、Worker、锁、秘密指纹、服务端分页或部署合同，批准计划及当前规格快照保持。

最终产品源码运行 `a2-e9a97c5f`：路由/lint/typecheck、根单元 29 task（Web 819 项）、完整浏览器 78 项/2 跳过、关闭 Gitea 11 项/1 Lite 跳过、CI 校验及 Web build 全部退出 0。随后只加强两处测试的可见基线断言，由 `a2-99deca8f` 验证；组件 22 项及真实 i18n 3 项通过，最终浏览器及新 Lite 结果结束后另绑定，不用旧镜像覆盖此次 UI。

`a2-99deca8f` 最终关闭 Gitea 浏览器 11 项通过/1 Lite 跳过，lint/typecheck/CI 校验通过，运行前后源码不变；四轮专用容器收尾与脱敏完成。当前产品源码与 `a2-e9a97c5f` 相同，新增可见基线断言的两处测试原字节由后续定向运行独立覆盖。新 Lite 镜像安装待精确提交后执行。

旧映射、源绑定和 CI 原字节存于 `configuration-recovery/history/`；首轮原焦点失败和同源码独立/完整重跑均保留。当前 `execution-map.json`、`execution-results.json` 以及相应原件逐输入给出结果，不标记整卡完成。人类五项视觉差异、真实设备/厂商、实施独审、最新 Required CI 和实际 main 仍待完成。
