# D0 基线与验证记录

**当前 D0 与 D1 门禁关闭。** 已修订 D0 的套件归属及看板覆盖，并通过详情页渲染条件对照定位不稳定来源；最新审查要求的通用 upstream 覆盖已撤回。通用 mocked-dev 的实际失败仍须逐项处理或由总管裁决，不因一个旧失败对照而豁免其余失败。最新结果见 [manifest.json](manifest.json)、[upstream-scope-verification.json](evidence/upstream-scope-verification.json)；[stabilized-verification.json](evidence/stabilized-verification.json)冻结保存上一修订轮。

[修订前报告](evidence/pre-review-verification.md)、[旧清单](evidence/pre-review-manifest.json)、[此前反馈核验](evidence/feedback-verification.json)属于历史版本，其通过结论不代替当前验收。历史报告相对链接按原基线目录解释；历史路径标识与当前保留的原始 PNG 对应关系已逐项核对，见 [historical-assets.json](evidence/historical-assets.json)。

## 授权、资料地址与范围

2026-10-07 18:38（Asia/Shanghai），用户批准仅本批用 Todos 编排、记录执行进度，仓库存放规格与证据，替代 AGENTS.md 的真实 WorkMesh 双轨记录要求；其余领域、安全、测试约束保持。批准已记录于[源计划](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)。未创建或同步真实 WorkMesh 记录。真实新设计、需求、权限、凭证与仓库外发布仍须单独批准。

此次 G1 交接把参考设计资料地址同步为 **`docs/references/todos-analysis/`**。`git ls-tree HEAD -- docs/references/todos-analysis/` 未发现该目录；输入包尚在 G1 审查分支，未假称已进入本基点。此次只同步地址，不导入资料或迁入测量值，不改产品规范、不放行 G1；原外部路径仅作历史来源。

产品基点为 `32789cec4d50db0b85a63d91049cc425d9e917a2`；上一修订轮验证基点为 `0e9968dd24748f864370819a239093b42c80ba61`，最新 upstream 范围修订基点为 `d8dcbbcd151011f5696200e6a99ce99fcaf3a93d`。最新仅删除通用配置的一行、增加配置契约断言及验证记录；14 张 PNG、D0 配置、夹具、比较参数均未改变，无产品/token、数据库迁移、API 或事件变更。当前来源 SHA-256 在 manifest 保存，历史证据保持原来源版本。

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

通用 `playwright.mocked.config.ts` 用 `testIgnore` 排除 D0；专用配置用 `testMatch` 只收集 D0，并以 `testIgnore: []` 解除继承排除。显式 viewport 检查继续保留，只由固定视口的专用入口执行。按最新审查撤回通用入口新增的 `NEXT_DEV_API_UPSTREAM: apiUrl`，恢复继承调用环境；仅 D0 专用配置保留隔离夹具 `3201` 覆盖，不改产品代理。新增契约断言以不同 upstream 输入验证这两个入口的边界。

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

## 上一修订轮的五项必需检查与通用入口

上一修订轮实际命令、退出码、摘要、完整原始日志 SHA-256 见[栅格修订运行证据](evidence/stabilized-verification.json)。该轮配置及采集修订后重跑 lint/typecheck/test，集成及正式 E2E 也已实际执行；这些历史结果不冒称最新 upstream 范围修订后重新执行。最新执行与沿用边界另列下文。

| 检查 | 上一修订轮实际结果 | 条件范围 |
| --- | --- | --- |
| `pnpm lint` | 18/18 Turbo 任务成功 | 无 |
| `pnpm typecheck` | 18/18 成功 | 无 |
| `pnpm test` | 29/29 成功；1655 通过、2 跳过；web 776 通过 | Windows 跳过两个 Linux FD/flock 用例 |
| `pnpm test:integration` | DB 77、API 154、Worker 78 通过 | 原跳过真实模型、retention upgrade、恢复各 1 项；后两项另启用补验各 1 通过 |
| `pnpm test:e2e` | 74/74 通过；12/12 Turbo 任务成功 | 不含通用 mocked-dev/D0，不能证明两者通过 |

剩余 3 项条件跳过：`retention-soak-lock.test.ts` 的 `passes a wrapper prelock across exec and rejects unlocked, unrelated, symlink, mode, and inode cases`；`retention-soak-formal-launch.test.ts` 的 `preserves the private prelocked FD through Node and the tsx registration loader`（均受 Linux 条件控制）；`workbench-runner.integration.test.ts` 的 `runs an exact-session MiniMax-M3 Pi turn through the durable API`（需 `RUN_WORKBENCH_LIVE=1` 及真实模型凭据）。未执行不记作验收通过。

通用 mocked-dev 首轮在 12 通过、12 失败后主动中止，115 项未执行。首个旧基点配置对照只证明该用例。后续已对这 12 项逐项完成修订前/当前配置专项对照，两边各 12 失败，错误要点分别相同；9 项页面明确出现 Agent DTO 缺字段警告，另三项涉及成功提示、返回 Approvals 导航、读取审批详情 404。不能由这 12 项推断其余 115 项结果。每项结论与下一步见 [mocked-failures.md](evidence/mocked-failures.md)。

历史环境保护、缺 S3 上传 500、reducedMotion 位置错误、定位器/DTO/样式注入及截图失败保留于 [attempts.md](evidence/attempts.md)、[checks.json](evidence/checks.json)、本轮 review/stabilized 记录。前一服务未退出造成的本轮端口冲突另列启动顺序错误，用例未执行，不算产品失败或成功重放。

## 最新 upstream 范围修订与验证

按审查选择最小修复：通用 Next server 的 `env` 只显式设置 `NEXT_PUBLIC_API_URL: apiUrl`，继续展开 `...process.env`；删除新增 upstream 默认覆盖。D0 专用配置仍明确设置 `NEXT_DEV_API_UPSTREAM: 'http://127.0.0.1:3201'`，有效代理目标不变。契约测试注入 `http://127.0.0.1:1/fixture-upstream`，分别断言通用入口原样继承、D0 覆盖为自己的夹具。没有通过全局环境强制同一个值来替代边界验证。

本轮实际结果与完整日志 SHA-256、两份修改来源的新旧 SHA-256、逐项原始附件绑定见 [upstream-scope-verification.json](evidence/upstream-scope-verification.json)。日志原文保存在 [upstream-logs/](evidence/upstream-logs/)。

[本轮最终证据核验](evidence/upstream-evidence-audit.json)确认 14 个当前来源、14 张基线、28 次新附件绑定、56 个历史采集哈希、28 张历史原图、六份未改写的历史证据及六份新日志哈希一致。

| 本轮命令 | 实际结果与范围 |
| --- | --- |
| 配置契约 `vitest run e2e/playwright-config-contract.test.ts` | 2/2 通过，包含 upstream 继承/覆盖断言 |
| `verify-playwright-suite-scope.mts` | 四入口发现通过：root 74、mocked-dev 139、D0 14、production 50；不代表实际全套执行 |
| `pnpm lint` / `pnpm typecheck` | 各 18/18 成功，其中各 17 项缓存 |
| `pnpm test` | 29/29 成功；web 实际执行 776/776，其余 28 个任务缓存，未把缓存输出记作重新执行 |
| D0 `--update-snapshots=none` | 独立启动重放 14/14 通过；两次上下文共 28 个原始 PNG 附件逐字节及 SHA-256 与已有基线一致 |
| `pnpm test:integration` / `pnpm test:e2e` | 本轮未重跑；沿用上一修订轮结果，三项条件跳过的边界不变 |
| 通用 mocked-dev | 本轮未执行 139 全套，也未重跑 12 项专项；历史实际失败和 115 项未执行原样保留 |

原始字节核验不使用容差；视觉重放仍使用 `threshold=0.005,maxDiffPixels=0`。此前两轮的 **56 次**采集、来源与日志冻结在上一修订轮证据中；本轮新增 **28 次**单独记录，不能冒称旧两轮在新来源版本下重跑。HTML 报告会对相同 PNG 去重，核验按每用例的 `capture-1`、`capture-2` 两个命名附件逐项读取原始字节；首次归档脚本错误要求两个独立文件而停止，修正核验方式后通过，未把它误判为产品或视觉失败。

本轮未改变产品/领域、D0 有效 upstream 或采集条件，因此没有为此次撤回重复集成及正式 E2E。撤回新增默认变更解决本次 blocking；旧的 12 项强制同值对照仍只证明各项错误，不证明其余 115 项结果。剩余旧失败继续按 [mocked-failures.md](evidence/mocked-failures.md) 的逐项下一步处置；涉及产品行为或验收边界时交总管裁决。门禁保持关闭，不以此次修复宣称 D0 完成，也不放行 G1/P1/R1。

## 真实剩余原因与定向复核

已核对 `dae4620366f33136d65e533d85823db49b9a3fe1` 主动删除 `WORKMESH_PRD.md`，为本基点祖先。2026-08-22 计划第 34 行改用 Issues、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql`、Accepted ADR；2026-09-24 工作台基线第 62 行要求修陈旧引用、不重造 PRD。引用修订属 G1，不等重传、不编造 PRD，不作为真实采集/检查阻塞。

目前不缺用户资料或凭据重传。定向复核需先核对归属、看板 viewport 断言、栅格 A/B、旧 PNG 和最终原始哈希，再逐项处理通用 mocked-dev 的实际失败。需无关产品修复或改变验收边界时由总管裁决；D0 不自行豁免或扩大实现范围。

在变更评审点本 Markdown 的预览按钮即可查看。重放命令见 [README.md](README.md)；正式与 mock Next 共享 `apps/web/.next`，必须顺序启动并等待退出。所有数据库/Redis/S3 为隔离本地测试资源，不是真实控制面。上一轮三个隔离容器及临时卷已移除；[final-evidence-audit.json](evidence/final-evidence-audit.json)保存上一修订轮的原图、历史原图、来源和容差依据核对。最新来源与原始采集核对见上述 upstream 范围修订证据，不改写旧审计版本。
