# D0 基线与验证记录

**当前 D0 与 D1 门禁关闭。** 已修订 D0 的套件归属及看板覆盖，并通过详情页渲染条件对照定位不稳定来源；通用 mocked-dev 的实际失败仍须逐项处理或由总管裁决，不因一个旧失败对照而豁免其余失败。最终结果见 [manifest.json](manifest.json)、[stabilized-verification.json](evidence/stabilized-verification.json)。

[修订前报告](evidence/pre-review-verification.md)、[旧清单](evidence/pre-review-manifest.json)、[此前反馈核验](evidence/feedback-verification.json)属于历史版本，其通过结论不代替当前验收。历史报告相对链接按原基线目录解释；历史路径标识与当前保留的原始 PNG 对应关系已逐项核对，见 [historical-assets.json](evidence/historical-assets.json)。

## 授权、资料地址与范围

2026-10-07 18:38（Asia/Shanghai），用户批准仅本批用 Todos 编排、记录执行进度，仓库存放规格与证据，替代 AGENTS.md 的真实 WorkMesh 双轨记录要求；其余领域、安全、测试约束保持。批准已记录于[源计划](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)。未创建或同步真实 WorkMesh 记录。真实新设计、需求、权限、凭证与仓库外发布仍须单独批准。

此次 G1 交接把参考设计资料地址同步为 **`docs/references/todos-analysis/`**。`git ls-tree HEAD -- docs/references/todos-analysis/` 未发现该目录；输入包尚在 G1 审查分支，未假称已进入本基点。此次只同步地址，不导入资料或迁入测量值，不改产品规范、不放行 G1；原外部路径仅作历史来源。

产品基点为 `32789cec4d50db0b85a63d91049cc425d9e917a2`；本轮验证基点为 `0e9968dd24748f864370819a239093b42c80ba61`。本轮只改采集、夹具、套件归属验证、PNG 与记录；无产品/token、数据库迁移、API 或事件变更。输入 SHA-256 在 manifest 保存。

G1、P1、R1、D0 独立验收。D1a 新增并存槽与映射；D1b 才逐面迁移、视觉评审与清理。本交付不放行这些任务。

## 测试清单与 DoD

开工前已映射文件 `apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts`，组名 `D0 亮色视觉基线`。用例名为下表界面名称后接 `：覆盖、两次采集一致、D1 可直接比对`，分别在 `desktop-1440x1000`、`mobile-390x844` 执行。逐项当前执行结论见 manifest，不拿中间轮替代最终验收。

- 覆盖全部受影响界面：七面、两个固定视口、14 张原始 PNG；看板须让目标列头及卡片完整进入视口。
- 同一视口两次采集可重复：重置夹具、两个独立上下文，原始 PNG SHA-256 必须相同；此断言不使用容差。
- 基线可被 D1 的视觉 diff 直接消费：`--update-snapshots=none` 与 `toHaveScreenshot` 直接读取本目录 PNG，生成 expected / actual / diff。

**DoD：基线产出并可重放；D1 开工前以此为门禁。** 视觉验证与通用入口失败分别记录；尚有审查阻塞时不宣称 D0 完成，不开 D1。

| 界面 | 固定路由 | 桌面 PNG | 移动 PNG |
| --- | --- | --- | --- |
| 工作台 | `/workbench` | [查看](win32/desktop-1440x1000/workbench.png) | [查看](win32/mobile-390x844/workbench.png) |
| 看板 | `/?view=projects&project=project-1&tab=board` | [查看](win32/desktop-1440x1000/board.png) | [查看](win32/mobile-390x844/board.png) |
| 项目总览 | `/?view=projects&project=project-1` | [查看](win32/desktop-1440x1000/project.png) | [查看](win32/mobile-390x844/project.png) |
| Agent 详情 | `/agents/agent%2F1` | [查看](win32/desktop-1440x1000/agent-detail.png) | [查看](win32/mobile-390x844/agent-detail.png) |
| 工作项列表 | `/?view=my-work` | [查看](win32/desktop-1440x1000/issues-list.png) | [查看](win32/mobile-390x844/issues-list.png) |
| 工作项详情 | `/?view=my-work&workItem=work-101` | [查看](win32/desktop-1440x1000/issue-detail.png) | [查看](win32/mobile-390x844/issue-detail.png) |
| 设置 | `/settings?team=team-page-2` | [查看](win32/desktop-1440x1000/settings.png) | [查看](win32/mobile-390x844/settings.png) |

## 审查问题修订

通用 `playwright.mocked.config.ts` 用 `testIgnore` 排除 D0；专用配置用 `testMatch` 只收集 D0，并以 `testIgnore: []` 解除继承排除。显式 viewport 检查继续保留，只由固定视口的专用入口执行。通用 mocked-dev 将 Next upstream 显式指向隔离夹具 `3201`，不改产品代理。

套件归属校验、配置与 runner 契约已同步：[发现记录](evidence/review-suite-scope.json)中 root 74 项/27 文件、mocked-dev 139 项/16 文件、D0 14 项/1 文件、production 50 项/2 文件全部通过。发现通过不等于实际执行通过。应用配置契约 2 项，脚本归属与 runner 契约 17 项通过。

看板先滚动到 `work-101` 所属列顶部，再对卡片和列头执行 `toBeInViewport({ ratio: 1 })`。两次滚动位置也必须相同，写入采集记录。手机列头 `x=1,y=385.390625,w=318,h=45.1875`；卡片 `x=12.1875,y=430.578125,w=295.625,h=292.75`，均完整落在 `390×844` 内。`fullPage` 不展开内部滚动，不能替代此断言。

旧[移动看板](failures/pre-review-mobile-board.png)、[桌面看板](failures/pre-review-desktop-board.png)原始 PNG 保留。只对手机滚动的早期尝试导致桌面卡片约 46.7% 入视口，保留失败；修订为两个视口均滚动后，看板补采 2/2 通过。最终四次原始哈希及位置在当前清单。

## 详情页来源定位与修复

修订前两轮各 13 通过、1 失败：桌面详情比较器报告 3 差异像素；重启后手机详情比较器通过、但两个 PNG 哈希不同。[完整失败证据](evidence/review-fix-verification.json)分别保留原始图、diff、哈希与解码指标。桌面原始差异 134 像素/最大通道差 2；手机视觉失败 13/2；手机两个原始帧 13/1。原始像素数量与比较器抗锯齿处理后的计数不同。

只采原始帧而不执行基线比较，10 次诊断仍出现 2 次手机哈希失败，排除“仅由比较器触发”。仅加 `--disable-partial-raster` 后，两个独立启动轮各 10/10 通过，40 次原始 PNG 在各视口内哈希相同；显式移除此参数的恢复原条件对照为 6 通过、4 失败。后面三轮的两次上下文布局、计算样式、焦点及动画状态完全相同。对照支持定位至部分栅格复用条件下的圆角边缘渲染差异，尚未定位 Chromium 内部具体绘制函数。[Chromium 参数源码](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/common/switches.cc)说明参数用途，不声称上游 main 与运行浏览器源码版本相同。

修复仅在 D0 浏览器配置增加此参数，不改产品边框、圆角、样式或内容，不处理 PNG 或遮罩产品。全部对照、完整状态、像素坐标及可执行复现见 [raster-diagnosis.json](evidence/raster-diagnosis.json)、[诊断说明](evidence/raster-diagnosis.md)。原始帧诊断不代替正式全量重放。

固定栅格后，旧基线实际比较为 12 通过、2 详情失败。保留 14 张[修订前 PNG](failures/pre-stabilization/)及[清单](evidence/pre-stabilization-manifest.json)后，只重采四张受渲染条件影响的基线：桌面详情 134 像素/最大通道差 2、手机详情 65/2、桌面项目 36/1、桌面设置 44/2；另外十张逐字节不变。项目和设置旧基线比较本已通过、原始哈希不同，故同步固定采集条件下的原始图。四图差异完整列出，不解释为用户产品视觉批准。

## 环境与独立判断

Windows 11 `10.0.26300`、Node `24.20.0`、pnpm `9.15.4`、Playwright `1.61.1`、Chromium `149.0.7827.55`；固定 `1440×1000` / `390×844`、DPR 1、`zh-CN`、UTC、亮色、时间 `2026-08-22T09:30:00.000Z`。媒体 light 与现有 `workmesh.theme=light` 同时固定，并断言 `data-wm-theme=light`。产品已有明暗切换且默认暗色；本任务只采亮色。

使用既有 `final-tour`，补工作台、Agent context/预算的只读 DTO，不调用真实模型、不写领域。等待字体、网络、标志内容就绪，断言无异常、骨架和 API 错误。截图禁动画、光标，仅隐藏 Next 开发工具；当前产品状态、缺陷及内部滚动照实保留。平台目录和 Windows 字体是重放条件。

比较参数保持 **`threshold=0.005,maxDiffPixels=0`**，本轮未放宽。依据是此前零阈值手机详情原始 13 个边缘像素/通道差最多 1，比较器报告 1 像素失败；微小颜色感知容差可通过。旧 [PNG](failures/strict-mobile-issue-detail-actual.png)、[diff](failures/strict-mobile-issue-detail-diff.png)、[指标](failures/strict-pixel-difference.json)保留。颜色感知阈值不是 RGB 差值上限，也可能容许其他微小变化，产品视觉批准仍为 false。

**两次原始 PNG 哈希一致**、**使用容差比较器的重启重放通过**、**四次采集均与落盘基线哈希一致**是独立判断，当前清单分别记录。哈希证据在断言前落盘，失败也保留；完整通过才写 `*-replay.json`。

## 五项必需检查与通用入口

本轮实际命令、退出码、摘要、完整原始日志 SHA-256 见[最终运行证据](evidence/stabilized-verification.json)。配置及采集修订后重跑 lint/typecheck/test；集成及正式 E2E 本轮已实际执行。后续参数仅由 D0 消费，没有重跑无关检查或冒称缓存包全部重新执行。

| 检查 | 本轮实际结果 | 条件范围 |
| --- | --- | --- |
| `pnpm lint` | 18/18 Turbo 任务成功 | 无 |
| `pnpm typecheck` | 18/18 成功 | 无 |
| `pnpm test` | 29/29 成功；1655 通过、2 跳过；web 776 通过 | Windows 跳过两个 Linux FD/flock 用例 |
| `pnpm test:integration` | DB 77、API 154、Worker 78 通过 | 原跳过真实模型、retention upgrade、恢复各 1 项；后两项另启用补验各 1 通过 |
| `pnpm test:e2e` | 74/74 通过；12/12 Turbo 任务成功 | 不含通用 mocked-dev/D0，不能证明两者通过 |

剩余 3 项条件跳过：`retention-soak-lock.test.ts` 的 `passes a wrapper prelock across exec and rejects unlocked, unrelated, symlink, mode, and inode cases`；`retention-soak-formal-launch.test.ts` 的 `preserves the private prelocked FD through Node and the tsx registration loader`（均受 Linux 条件控制）；`workbench-runner.integration.test.ts` 的 `runs an exact-session MiniMax-M3 Pi turn through the durable API`（需 `RUN_WORKBENCH_LIVE=1` 及真实模型凭据）。未执行不记作验收通过。

通用 mocked-dev 首轮在 12 通过、12 失败后主动中止，115 项未执行。首个旧基点配置对照只证明该用例。后续已对这 12 项逐项完成修订前/当前配置专项对照，两边各 12 失败，错误要点分别相同；9 项页面明确出现 Agent DTO 缺字段警告，另三项涉及成功提示、返回 Approvals 导航、读取审批详情 404。不能由这 12 项推断其余 115 项结果。每项结论与下一步见 [mocked-failures.md](evidence/mocked-failures.md)。

历史环境保护、缺 S3 上传 500、reducedMotion 位置错误、定位器/DTO/样式注入及截图失败保留于 [attempts.md](evidence/attempts.md)、[checks.json](evidence/checks.json)、本轮 review/stabilized 记录。前一服务未退出造成的本轮端口冲突另列启动顺序错误，用例未执行，不算产品失败或成功重放。

## 真实剩余原因与定向复核

已核对 `dae4620366f33136d65e533d85823db49b9a3fe1` 主动删除 `WORKMESH_PRD.md`，为本基点祖先。2026-08-22 计划第 34 行改用 Issues、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql`、Accepted ADR；2026-09-24 工作台基线第 62 行要求修陈旧引用、不重造 PRD。引用修订属 G1，不等重传、不编造 PRD，不作为真实采集/检查阻塞。

目前不缺用户资料或凭据重传。定向复核需先核对归属、看板 viewport 断言、栅格 A/B、旧 PNG 和最终原始哈希，再逐项处理通用 mocked-dev 的实际失败。需无关产品修复或改变验收边界时由总管裁决；D0 不自行豁免或扩大实现范围。

在变更评审点本 Markdown 的预览按钮即可查看。重放命令见 [README.md](README.md)；正式与 mock Next 共享 `apps/web/.next`，必须顺序启动并等待退出。所有数据库/Redis/S3 为隔离本地测试资源，不是真实控制面。本任务三个隔离容器及临时卷已移除，3100/3101/3200/3201 无遗留监听；当前原图、历史原图、来源和容差依据的最后核对见 [final-evidence-audit.json](evidence/final-evidence-audit.json)。
