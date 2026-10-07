# D0 基线与验证记录

2026-10-07：仓库内基线已产出并通过重放，五项必需检查均成功退出。用户已批准仅本批采用 Todos＋仓库，批准已写入[源计划](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)。**D0 仓库交付满足测试清单与 DoD，交付 Todos 审核；D1a 的其他门禁仍独立关闭。** 本轮不再等待真实 WorkMesh MCP，也不声称已创建或同步真实 WorkMesh Project、WorkItem 或 Agent Session。

## 本批批准与后续门禁

批准时间：2026-10-07 18:38（Asia/Shanghai）。用户选择「本批使用 Todos＋仓库」「采用并独立复核」「按条件持续推进」：本批以 Todos 编排和记录执行进度，仓库保存规格及证据，替代 AGENTS.md 的真实 WorkMesh 双轨记录要求；其余领域、安全、测试约束保持。总管可在门禁与必需检查通过、blocking/high 已解决后继续派工、独立审查、确认计划及合并仓库改动。真实新设计分歧、新需求、团队权限变更、凭证授权和仓库以外发布仍需用户单独批准。

已读取当前 [D1a](todo:IJQA_DfxU0hF5e8L5Xb3v) 规格：只新增并存语义槽与映射，保留根值和消费方；[D1b](todo:2j2sxT5wJ-l001efH_meJ) 再逐面迁移、视觉 diff 与人工评审后清理。两者沿用本目录原始基线。D1a 的前置是 G1、P1、R1、D0；本报告只证明 D0 的仓库交付，不证明 [G1](todo:Tws50k02Pi52R-RJEXP_N)、[P1](todo:qJKk_SAxN29AdBHERBl7u)、[R1](todo:q_1zKPuGsG-2ZRUwOwQx4) 已通过，不能据此开工 D1a 或放行其他链。Todos 审核、合并及后续派工由获授权流程处理。

## 范围、文件与来源

改动前产品提交为 `32789cec4d50db0b85a63d91049cc425d9e917a2`。本轮只新增 e2e 配置、测试夹具、PNG 和证据文档；没有产品实现、token 值、数据库迁移、API 或事件变更。`git diff --exit-code -- packages/ui/src/tokens.css apps/web/app/styles.css` 返回 0。所有 token、样式、主题、夹具、锁文件与测试配置的 SHA-256 见 [manifest.json](manifest.json)。

来源为 [本地计划 D0](../../../../../docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md)、ADR 0028、0045、0077。参考实测值 `G:\Projects\MetronX\todos-dev-analysis\design-tokens.md` 已阅读，但未迁入。ADR 0071 的 lite 部署不能作为当前基线环境的验收证明。

- [playwright.d0.config.ts](../../../playwright.d0.config.ts)：两个固定视口、亮色、Windows 快照目录与视觉比较策略。
- [d0-visual-baseline.mocked.spec.ts](../../mocked/d0-visual-baseline.mocked.spec.ts)：复用 final-tour 数据、补齐只读 DTO、两次独立上下文采集、页面就绪与错误断言、截图比较及哈希附件。
- [d0-screenshot.css](../../mocked/d0-screenshot.css)：仅隐藏 Next 开发工具浮层，不遮罩产品界面。
- 本目录 `win32/`：14 张改动前 PNG；[README.md](README.md)：开工前测试清单映射、DoD 与重放命令；[manifest.json](manifest.json)：机器可读的来源和逐项哈希；`evidence/` 与 `failures/`：实际检查记录和保留的失败证据。

## 测试清单与 DoD

测试文件：`apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts`。组名：`D0 亮色视觉基线`。七个实际用例名均为下表“界面”后接 `：覆盖、两次采集一致、D1 可直接比对`，在 `desktop-1440x1000` 和 `mobile-390x844` 两个项目执行。三个清单项在开工前已映射到该文件与这些用例，结果如下：

- [x] 覆盖全部受影响界面：七个页面、两个视口，共 14 张基线。
- [x] 同一视口两次采集可重复：每个用例重置固定数据并新建两次浏览器上下文，原始 PNG SHA-256 必须相同；此断言不使用容差。两轮各 14 项均通过，另行核对到当次 56 次采集均与对应基线哈希相同。
- [x] 基线可被 D1 的视觉 diff 直接消费：重放使用 `--update-snapshots=none`，全部 `toHaveScreenshot` 直接读取已落盘 PNG；不生成替代基线。

DoD 原文：**基线产出并可重放；D1 开工前以此为门禁。** 仓库证据已满足基线测试清单与 DoD；本批以 Todos＋仓库交付，取消等待真实 WorkMesh 同步的旧阻塞。D1a 的其余前置未由本任务验收，仍不得放行相应实现。

| 界面 | 固定路由 | 桌面基线 | 移动基线 |
| --- | --- | --- | --- |
| 工作台 | `/workbench` | [查看](win32/desktop-1440x1000/workbench.png) | [查看](win32/mobile-390x844/workbench.png) |
| 看板 | `/?view=projects&project=project-1&tab=board` | [查看](win32/desktop-1440x1000/board.png) | [查看](win32/mobile-390x844/board.png) |
| 项目总览 | `/?view=projects&project=project-1` | [查看](win32/desktop-1440x1000/project.png) | [查看](win32/mobile-390x844/project.png) |
| Agent 详情 | `/agents/agent%2F1` | [查看](win32/desktop-1440x1000/agent-detail.png) | [查看](win32/mobile-390x844/agent-detail.png) |
| 工作项列表 | `/?view=my-work` | [查看](win32/desktop-1440x1000/issues-list.png) | [查看](win32/mobile-390x844/issues-list.png) |
| 工作项详情 | `/?view=my-work&workItem=work-101` | [查看](win32/desktop-1440x1000/issue-detail.png) | [查看](win32/mobile-390x844/issue-detail.png) |
| 设置 | `/settings?team=team-page-2` | [查看](win32/desktop-1440x1000/settings.png) | [查看](win32/mobile-390x844/settings.png) |

## 可重放条件与实际结果

环境：Windows 11 专业工作站版 `10.0.26300`；Node `24.20.0`、pnpm `9.15.4`、Playwright `1.61.1`、Chromium `149.0.7827.55`。锁文件安装成功。视口固定为 `1440 × 1000` / `390 × 844`，DPR 1、`zh-CN`、UTC、亮色、固定时间 `2026-08-22T09:30:00.000Z`。等待字体加载，禁用截图动画与光标，浏览器使用软件渲染和 sRGB。

亮色不仅设置媒体偏好，还在启动前固定现有 `workmesh.theme=light`，并断言实际根节点 `data-wm-theme=light`。当前产品已支持暗色且默认暗色；最新版任务规格已修正为本任务固定亮色，产品已有明暗切换。未修改主题功能。

固定夹具来自既有 `project-work-preview-server.mjs` 的 `final-tour`。补充工作台对话、消息、轮次、模型列表，以及 Agent Session context、预算利用率的只读 DTO。预算固定为 09:00 开始、09:30 观察，消耗 3600 秒预算的一半。不调用真实模型、不进行领域写入。原 tour 的设置 `?tab=workspace` 路由已失效，本次使用当前有效设置路由。

截图前要求页面标志数据已渲染，无可见加载态、页面异常、错误提示和 HTTP 4xx/5xx API 响应。保留既有实时连接状态、布局、文字、缺陷与内部滚动容器；`fullPage` 不会展开产品自己的滚动区域。当前字体依赖 Windows 系统字体，不能把不同系统的新截图直接当作此次验收。

| 运行 | 命令的关键参数 | 实际结果 |
| --- | --- | --- |
| 最终首次采集 | `--config playwright.d0.config.ts --update-snapshots=all` | 14 通过，1.4 分钟；每项两个独立上下文 |
| 最终重启重放 | `--config playwright.d0.config.ts --update-snapshots=none` | 14 通过，1.2 分钟；每项两个独立上下文 |
| 哈希核验 | 基线 + 两轮各两次采集 | 14 项均四次哈希一致，共 56 次；逐项值见 manifest |

这三行分别记录采集、视觉重放和原始数据核验。用例内 `captureSha256[0] === captureSha256[1]` 证明两次原始 PNG 逐字节一致；重启后的 `toHaveScreenshot` 则用容差比较器检验已有基线，**比较器通过不蕴含 PNG 哈希相同**。manifest 的 `identicalAcrossFourCaptures` 是额外比较四个原始哈希的结果，不由视觉通过状态推导。采集附件与重放记录已在本轮再次核对，结果见 [反馈复核记录](evidence/feedback-verification.json)。相同字节的 PNG 在仓库保留一份原始基线及四个哈希，不重复存四份相同图片。

比较配置保持 `threshold=0.005`、`maxDiffPixels=0`。此前零颜色阈值重启检查出现一次圆角边缘取整差异：移动端详情原始像素有 13 处 RGB 每通道最多相差 1，Playwright 默认抗锯齿处理后报告 1 像素，导致 12 通过、1 失败、1 未执行。已保留 [实际截图](failures/strict-mobile-issue-detail-actual.png)、[diff](failures/strict-mobile-issue-detail-diff.png)、[解码指标](failures/strict-pixel-difference.json) 与 [失败摘录](failures/README.md)，没有修图或更新基线掩盖该次失败。`threshold` 是比较器的颜色感知阈值，不是 RGB 通道差值上限；也可能容许其他微小颜色差异。超出比较器阈值的差异像素允许数量仍为零。用例内两次采集继续要求原始哈希完全相同；此次两轮四次哈希也恰好相同，不保证未来每次重启都如此。调整比较参数只处理基线测试的稳定性，**不代表产品视觉、色彩位移或后续 token 迁移已获用户验收**。

本轮还用当前 Playwright `1.61.1` 自带的 PNG 比较器，直接复算保留的 expected / actual：`threshold=0` 仍报告 1 个差异像素而失败，`threshold=0.005` 则通过，但两份原始 PNG 的 SHA-256 不同。这提供了容差依据，也直接证明视觉通过与字节一致是两个不同判断；结果写入反馈复核记录的 `toleranceEvidence`，不修改历史截图或失败结果。

## 五项必需检查

命令均在前轮实际执行，退出码均为 0。完整日志的 SHA-256、命令、结果与摘录见 [checks.json](evidence/checks.json) 和 [checks.md](evidence/checks.md)。本轮仅修改计划与证据记录，未改配置、测试、锁文件、PNG 或产品输入；复核其哈希及既有运行记录后沿用结果，未声称重新执行五项检查。checks 中 `d1Gate=closed` 为检查记录生成时的历史状态，当前 D0 与 D1a 其他前置的区别见 manifest 和本报告。

| 检查 | 实际结果 | 未执行范围 |
| --- | --- | --- |
| `pnpm lint` | 18 / 18 个 Turbo 任务成功 | 无 |
| `pnpm typecheck` | 18 / 18 个 Turbo 任务成功 | 无 |
| `pnpm test` | 29 / 29 个 Turbo 任务成功；18 个包的测试通过 | Worker 有 2 个 Linux 专属用例在 Windows 跳过，未声称已验收 |
| `pnpm test:integration` | DB 77、API 154、Worker 78 个用例通过；无失败 | 原运行跳过真实 MiniMax 调用、retention upgrade 与恢复各 1 项；后两项已分别启用并补验通过 |
| `pnpm test:e2e` | 74 / 74 个 Playwright 用例通过；12 / 12 个 Turbo 任务成功，3.4 分钟 | 无 |

补验命令 `pnpm test:integration:recovery`：`complete WorkMesh recovery bundle > backs up, safely resumes an interrupted empty-target restore, and verifies all state`，1 项通过；[恢复报告](evidence/recovery-report.json)。

补验命令 `pnpm --filter @workmesh/worker test:integration -- integration/retention-upgrade-barrier.integration.test.ts`（`RUN_RETENTION_UPGRADE_INTEGRATION=1`）：`retention upgrade barrier with real PostgreSQL and MinIO > proves one exact version with versioned HEAD and zero delete markers`，1 项通过。实际使用具有版本与 Object Lock 的 RustFS S3 服务，报告见检查摘录。

剩余跳过项：`retention-soak-lock.test.ts` 的 `passes a wrapper prelock across exec and rejects unlocked, unrelated, symlink, mode, and inode cases`；`retention-soak-formal-launch.test.ts` 的 `preserves the private prelocked FD through Node and the tsx registration loader`，两项由 `process.platform === "linux"` 控制；以及 `workbench-runner.integration.test.ts` 的 `runs an exact-session MiniMax-M3 Pi turn through the durable API`，由 `RUN_WORKBENCH_LIVE=1` 和 `MINIMAX_CN_API_KEY` 控制。本次使用确定性 fake Agent 和模型夹具，未为视觉基线请求真实模型凭据或产生调用费用。

此前必需检查未配置测试数据库而触发环境保护；补齐数据库、bootstrap、master key、Redis 限流夹具后，又发现 Stage 3 的两个上传用例因缺 S3 返回 500。失败信息已归档。配置独立 S3 后完整集成检查通过，产品代码未因这些环境问题变更。初版 D0 配置把 `reducedMotion` 放在不受支持的顶层选项，导致 lint/typecheck 失败；移入 `contextOptions` 后两项检查通过。旧定位器、只读 DTO 缺口与截图样式注入不一致导致的早期采集失败也保留在 [历次运行摘要](evidence/attempts.md)，没有将未执行项标记为成功。

所有服务均是本任务隔离测试资源：PostgreSQL 16、Redis 7、RustFS 1.0.0，分别使用 loopback 15432、16379、19000。正式 E2E、集成、恢复使用独立且名称含 `test` 的数据库；未连接用户实际 WorkMesh 数据库。测试夹具配置参照 `.github/workflows/ci.yml`，bootstrap 由既有脚本生成，检查证据不保存任何认证令牌。检查结束后已移除本任务三个测试容器及其临时卷，3100/3101/3200/3201 端口没有遗留测试监听；重放视觉基线仅需 mock 服务，不依赖这些已移除的数据库。

## 演示与 D1 消费

在仓库根目录执行 [README.md 的 PowerShell 命令](README.md)，会启动已有 mock API 和 Next Web、逐页采集并比对。必须保持对应 Windows、浏览器与字体环境；完整检查的服务配置按既有 CI 设置。Next dev 的正式和 mock 测试应顺序运行，避免同时写入 `apps/web/.next`。

D1a 只有在全部前置通过后才能新增并存槽，不得改根 token 值或迁移消费方；D1b 才按面迁移，并继续执行 `--update-snapshots=none`。差异会生成 expected / actual / diff，读取本目录现有 PNG，不会自动更新基线。视觉差异须人工评审，真实新视觉取舍须用户裁决后才能决定后续资产变更。

打开此 Markdown 在变更评审中的预览按钮即可查看证据与相对路径图片。以下为工作台的桌面与移动基线，其他页面见上表链接。

![工作台桌面改动前基线](win32/desktop-1440x1000/workbench.png)

![工作台移动改动前基线](win32/mobile-390x844/workbench.png)

## 已解除阻塞与已知限制

1. **控制面决定已落盘**：源计划和本目录记录用户批准的本批例外。不再请求真实 WorkMesh 连接，不修改 AGENTS.md 或产品领域规则，不声称真实记录已同步。此前等待控制面裁决的结论已被用户最新批准取代。
2. **PRD 为已删除文档，陈旧引用不构成采集阻塞**：已自行核对本分支历史，提交 `dae4620366f33136d65e533d85823db49b9a3fe1`（`chore(docs): 移除过时的需求文档`）删除 `WORKMESH_PRD.md`，且该提交是当前 HEAD 的祖先。[2026-08-22 计划第 34 行](../../../../../docs/plan/2026-08-22-agent-connection-runtime-reliability.md) 明确改用 Issues、`AGENT_PROTOCOL.md`、`OPENAPI.yaml`、`SCHEMA.sql` 与 Accepted ADR；[2026-09-24 基线第 62 行](../../../../../docs/plan/2026-09-24-prototype-pi-agent-workbench.baseline.md) 明确修正 AGENTS.md / MANIFEST.json 的陈旧引用、不重造 PRD。输入一致性修正已交 G1；D0 不修改这两份规范、不等待重传、不编造 PRD，也不把陈旧引用列为真实采集或检查阻塞。来源哈希、提交及核验结果见反馈复核记录。
3. **条件跳过及跨平台限制**：两个 Linux FD/flock 用例与一个真实模型用例没有执行；不会因本条完成记为通过。基线只验证记录中的 Windows/Chromium/字体环境，其他环境及后续视觉变化需另行验证。

原规格的测试清单和 DoD 均保留。已核实的差异为当前暗色默认、旧设置路由与只读夹具 DTO 缺口、已删除 PRD 的陈旧引用；本批批准的控制面例外已落实，未扩大到 D1 或其他链的产品实现。

## 独立审查入口

- 按 README 的文件与用例映射核对七个面、两个视口和三个测试清单项；检查配置、夹具与产品输入的来源哈希。
- 分别核对 manifest 的四个原始哈希、用例内两次采集断言、重启视觉比较与 `toleranceEvidence`；不得把容差通过解释成字节一致或用户视觉批准。
- 核对必需检查原始退出码、历史失败、补验与剩余三个条件跳过，不能把未执行记为通过。
- 核对源计划的本批批准、PRD 删除证据与现行文档集合；确认 D0 仅交付基线，D1a 的 G1/P1/R1 仍分别验收。本轮没有执行独立审查或合并，待获授权流程处理。
