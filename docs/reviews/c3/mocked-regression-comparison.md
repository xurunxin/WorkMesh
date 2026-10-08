# C3 模拟浏览器回归逐项对照

用精确实施前提交 `8aee051c23eca1fc7653f688d6570c5808c0011d` 与产品提交 `c0bb931bf5dbf5c297835ee321b4de69f47e7695` 的独立 Git archive 副本，在同一机器顺序执行原五组完整集合。两者各 **47 项，15 通过、32 失败、零跳过、零 flaky**；47 项状态、逐用例 timeout 与全部失败指纹一致，原报告 32 项全部匹配。本组未发现新增回归，未分类项为零。模拟套件仍失败；相同首个失败之后未执行的步骤不计通过。

## 环境与复现

Windows、Node `v24.20.0`、pnpm `9.15.4`、Playwright `1.61.1`、Next `15.5.22`、React `19.2.8`。Chromium 可执行文件字节哈希、workspace 依赖真实路径和所有非 docs 跟踪文件的 Git blob / SHA-256 见 [mocked-regression-sources.json](mocked-regression-sources.json)。源码副本有独立 `.next` 和 `node_modules`，使用相同锁文件离线安装；没有切换交付分支或运行真实提供方服务。

原端口由其他工作区占用，两份副本都将端口字面量改为 `3240/3241`，原固定外部证据目录改到本轮临时目录。每项调整的原始/运行哈希已登记；除此之外基点的 1372 个与产品的 1378 个跟踪文件字节未变。原配置和测试内已有的 `test.slow()` / `setTimeout` 保持原值；没有增加 timeout、删除断言或修改产品。

Windows 的 `git archive` 按仓库配置展开部分 CRLF。绑定分别记录 Git blob 的 `gitBytes/gitSha256` 与副本的 `bytes/sha256`：基点有 83 项原字节相同、1289 项经 LF→CRLF 展开；产品有 83 项原字节相同、1295 项展开。独立核验逐文件证实该转换，不混称 Git 字节与运行字节；首次核验因混用长度失败的记录也保留在归档中。

完整执行命令（在各副本根目录运行；设置绝对 `WORKMESH_PLAYWRIGHT_RUN_DIR` 与 `PLAYWRIGHT_JSON_OUTPUT_NAME`，`NODE_ENV=development`）：

```powershell
pnpm --filter @workmesh/web... install --offline --frozen-lockfile
pnpm --filter @workmesh/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/operations-ux.mocked.spec.ts e2e/mocked/loading-states.mocked.spec.ts e2e/mocked/overlay-contract.mocked.spec.ts e2e/mocked/page-hotkeys.mocked.spec.ts e2e/mocked/accessibility-keyboard.mocked.spec.ts --reporter=list,json
```

两次退出码均为 `1`，不改写为测试通过。原命令、起止时间、完整 JSON、控制台、DOM、截图、几何附件及本轮 prepare/run/analyze 脚本见 [mocked-regression-evidence.zip](mocked-regression-evidence.zip)，字节与 CRC 索引见 [mocked-regression-evidence-index.json](mocked-regression-evidence-index.json)。源文件和完整 47 项结果可由下列命令独立核验：

```powershell
python -X utf8 docs/reviews/c3/fixtures/verify-regression-evidence.py
```

## 原 32 项失败分类

编号沿用原运行失败序号。文件名均位于 `apps/web/e2e/mocked/`；位置列为基点／产品的测试定义行。完整标题、实际断言行和原始错误见 [mocked-regression-comparison.json](mocked-regression-comparison.json)。每行在两份源码中均失败，分类为既有失败。

| 原编号 | 用例与基点／产品位置 | 相同失败证据 | 原因组 |
| --- | --- | --- | --- |
| 1 | `accessibility-keyboard.mocked.spec.ts:368/368`<br>Task 6.6 desktop English keyboard and semantic journey › covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.agent-registry-card') Expected: 2 Received: 0 Timeout: 10000ms | A |
| 2 | `accessibility-keyboard.mocked.spec.ts:511/511`<br>Task 6.6 phone Chinese keyboard and semantic journey › covers compact selectors, mobile navigation, local table scrolling, top layers, and containment | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.agent-registry-card') Expected: 2 Received: 0 Timeout: 10000ms | A |
| 3 | `accessibility-keyboard.mocked.spec.ts:623/623`<br>Agent and Session deep-link semantic smoke at 1920px en | Error: expect(locator).toBeVisible() failed Locator: locator('.agent-detail-panel') Expected: visible Timeout: 10000ms Error: element(s) not found | A |
| 4 | `accessibility-keyboard.mocked.spec.ts:623/623`<br>Agent and Session deep-link semantic smoke at 390px zh-CN | Error: expect(locator).toBeVisible() failed Locator: locator('.agent-detail-panel') Expected: visible Timeout: 10000ms Error: element(s) not found | A |
| 5 | `loading-states.mocked.spec.ts:451/452`<br>Task 6.4 Home loading authority › distinguishes initial durable failure, real Team empty, and null downstream paths | Error: expect(locator).toHaveCount(expected) failed Locator: getByRole('option', { name: /No team/i }) Expected: 1 Received: 0 Timeout: 10000ms | R |
| 6 | `loading-states.mocked.spec.ts:488/489`<br>Task 6.4 Agents loading authority › keeps Registry authority and focus independent through a failed refresh | Error: expect(locator).toHaveCount(expected) failed Locator: locator('[data-agent-roving-link="true"]') Expected: 1 Received: 0 Timeout: 10000ms | A |
| 7 | `loading-states.mocked.spec.ts:538/539`<br>Task 6.4 Agent secondary surfaces › owns Sessions, Diagnostics, Connections and Approval states without stale actions | Error: expect(locator).toBeVisible() failed Locator: getByRole('region', { name: 'Connections', exact: true }).locator('.skeleton-list') Expected: visible Timeout: 10000ms Error: element(s) not found | C |
| 8 | `loading-states.mocked.spec.ts:621/622`<br>Task 6.4 Settings loading authority › separates Team and State initialization and retains the State surface through refresh failure | Error: expect(locator).toBeVisible() failed Locator: locator('.settings-page').locator('.settings-loading-skeleton .skeleton-list') Expected: visible Timeout: 10000ms Error: element(s) not found | R |
| 9 | `loading-states.mocked.spec.ts:690/691`<br>Task 6.4 Operations loading authority › uses real pending owners, resolves independently, and retains focus through refresh failure | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.operations-tab > .sr-only[role="status"]') Expected: 1 Received: 0 Timeout: 10000ms | S |
| 10 | `loading-states.mocked.spec.ts:770/771`<br>Task 6.4 loading geometry at 390px › fills real Operations, Settings and Board panels without a narrow skeleton island | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.operations-metrics-grid > .operations-metric-card') Expected: 5 Received: 0 Timeout: 10000ms | M |
| 11 | `loading-states.mocked.spec.ts:915/916`<br>Task 6.4 loading geometry at 390px › matches real Registry, Sessions and Connections grids without focusable placeholders | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.registry-list > article') Expected: 4 Received: 0 Timeout: 10000ms | A |
| 12 | `loading-states.mocked.spec.ts:770/771`<br>Task 6.4 loading geometry at 1440px › fills real Operations, Settings and Board panels without a narrow skeleton island | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.operations-metrics-grid > .operations-metric-card') Expected: 5 Received: 0 Timeout: 10000ms | M |
| 13 | `loading-states.mocked.spec.ts:915/916`<br>Task 6.4 loading geometry at 1440px › matches real Registry, Sessions and Connections grids without focusable placeholders | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.registry-list > article') Expected: 4 Received: 0 Timeout: 10000ms | A |
| 14 | `loading-states.mocked.spec.ts:770/771`<br>Task 6.4 loading geometry at 1920px › fills real Operations, Settings and Board panels without a narrow skeleton island | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.operations-metrics-grid > .operations-metric-card') Expected: 5 Received: 0 Timeout: 10000ms | M |
| 15 | `loading-states.mocked.spec.ts:915/916`<br>Task 6.4 loading geometry at 1920px › matches real Registry, Sessions and Connections grids without focusable placeholders | Error: expect(locator).toHaveCount(expected) failed Locator: locator('.registry-list > article') Expected: 4 Received: 0 Timeout: 10000ms | A |
| 16 | `operations-ux.mocked.spec.ts:578/579`<br>proves all eight feature sets on standalone and embedded surfaces without unrelated Operations requests | Error: master-off / embedded expect(locator).toBeVisible() failed Locator: getByTestId('operations-disabled') Expected: visible Timeout: 10000ms Error: element(s) not found | R |
| 17 | `operations-ux.mocked.spec.ts:740/741`<br>restores embedded current state without taking focus when the real Settings tab becomes visible | Error: expect(locator).toHaveAttribute(expected) failed Locator: getByRole('tab', { name: 'Workspace' }) Expected: "true" Timeout: 10000ms Error: element(s) not found | R |
| 18 | `operations-ux.mocked.spec.ts:831/832`<br>keeps Settings route history, shared responsive semantics, and dense 390/1920 geometry | Error: expect(locator).toHaveAttribute(expected) failed Locator: getByRole('tab', { name: 'Planning & Operations' }) Expected: "true" Timeout: 10000ms Error: element(s) not found | R |
| 19 | `operations-ux.mocked.spec.ts:926/927`<br>scopes Team resolution to Workspace with serial deep-link pagination and dense 390/1920 geometry | Test timeout of 30000ms exceeded. | R |
| 20 | `operations-ux.mocked.spec.ts:1136/1137`<br>blocks busy destructive interaction and focuses a surviving context after committed deletion | Error: expect(received).toBe(expected) // Object.is equality Expected: 0 Received: 3 | D |
| 21 | `operations-ux.mocked.spec.ts:1274/1275`<br>keeps all-enabled navigation wide, sticky, focus-owned, and shared with Settings | Error: expect(received).toBe(expected) // Object.is equality Expected: 48 Received: -160 | T |
| 22 | `operations-ux.mocked.spec.ts:1344/1345`<br>filters only loaded localized values, keeps metrics and pagination, and restores the same-tab URL | Error: expect(locator).toHaveValue(expected) failed Locator: getByRole('searchbox', { name: 'Search loaded Operations records' }) Expected: "Agent run" Timeout: 10000ms Error: element(s) not found | R |
| 23 | `operations-ux.mocked.spec.ts:1526/1527`<br>keeps Recent runs semantic, linked, and locally scrollable at narrow and wide widths | Error: expect(received).not.toBe(expected) // Object.is equality Expected: not "none" | F |
| 24 | `operations-ux.mocked.spec.ts:1623/1624`<br>projects precise aggregate metrics without charts at narrow and wide widths | Error: page.evaluate: Error: Usage metrics geometry target missing | M |
| 25 | `overlay-contract.mocked.spec.ts:327/328`<br>overlay contract at 390x844 › keeps Agent Peek and Team Access focus, scroll, containment, and return ownership deterministic | Error: expect(locator).toBeVisible() failed Locator: locator('[data-agent-roving-link="true"]').first() Expected: visible Timeout: 10000ms Error: element(s) not found | A |
| 26 | `overlay-contract.mocked.spec.ts:423/424`<br>overlay contract at 390x844 › keeps busy delete nondismissible and restores the exact background after completion | Error: expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0 | W |
| 27 | `overlay-contract.mocked.spec.ts:327/328`<br>overlay contract at 1920x1080 › keeps Agent Peek and Team Access focus, scroll, containment, and return ownership deterministic | Error: expect(locator).toBeVisible() failed Locator: locator('[data-agent-roving-link="true"]').first() Expected: visible Timeout: 10000ms Error: element(s) not found | A |
| 28 | `overlay-contract.mocked.spec.ts:423/424`<br>overlay contract at 1920x1080 › keeps busy delete nondismissible and restores the exact background after completion | Error: expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0 | W |
| 29 | `page-hotkeys.mocked.spec.ts:165/166`<br>page hotkeys at 390px › keeps global navigation, one visible filter, no-filter surfaces and command-center ownership deterministic | Error: expect(received).toBe(expected) // Object.is equality Expected: "ga" Received: null | H |
| 30 | `page-hotkeys.mocked.spec.ts:278/279`<br>page hotkeys at 390px › wraps Agent links, preserves native controls and keeps focus, Peek and approval state independent | Error: expect(locator).toHaveCount(expected) failed Locator: locator('[data-agent-roving-link="true"]') Expected: 2 Received: 0 Timeout: 10000ms | A |
| 31 | `page-hotkeys.mocked.spec.ts:165/166`<br>page hotkeys at 1920px › keeps global navigation, one visible filter, no-filter surfaces and command-center ownership deterministic | Error: expect(received).toBe(expected) // Object.is equality Expected: "ga" Received: null | H |
| 32 | `page-hotkeys.mocked.spec.ts:278/279`<br>page hotkeys at 1920px › wraps Agent links, preserves native controls and keeps focus, Peek and approval state independent | Error: expect(locator).toHaveCount(expected) failed Locator: locator('[data-agent-roving-link="true"]') Expected: 2 Received: 0 Timeout: 10000ms | A |

## 原因与源码绑定

- **A**：Agent 旧夹具缺少严格 DTO 的必填字段，页面呈现校验错误；卡片、详情或 roving link 因而不存在。DOM 中记录了缺字段错误。 源码：`apps/web/app/lib/agents.ts`、`packages/contracts/src/agent-response.ts`、`apps/web/app/agents/page.tsx`、`apps/web/app/agents/[id]/page.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **R**：断言访问旧 Settings ?tab= 路径，页面直接 notFound；另一项在无 tab 的 Settings 等待已移除的 Planning & Operations 标签。现行 Settings 仅保留 Workspace 标签。 源码：`apps/web/app/settings/page.tsx`、`packages/ui/src/primitives/tabs.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **C**：Sessions 旧用例仍要求同时显示 Connections 区域；当前结构把 Connections 放在独立标签，Sessions DOM 中没有该区域。 源码：`apps/web/app/agents/page.tsx`、`apps/web/app/agent-connections-panel.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **S**：Operations 状态节点已使用 wm-visually-hidden；旧测试查找 sr-only，数量为零。 源码：`apps/web/app/operations-content.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **M**：UsageMetrics 已使用 StatGrid/StatCard；旧测试的 operations-metrics-grid / operations-metric-card 选择器不存在，计数与几何测量无法命中。 源码：`apps/web/app/operations/usage-metrics.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **D**：Delete Team 宽屏对话框几何约束失败：overflowCount 两者都为 3，测试要求 0。对话框组件及应用样式完全相同；这是实际复现的既有溢出失败，未推断为 Agent 夹具问题。 源码：`apps/web/app/settings/delete-team-dialog.tsx`、`apps/web/app/styles.css`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **T**：sticky 断言在 scrollIntoView 后滚动 window，期望导航 top 为 48，两者实测均为 -160。当前 shell 有独立 app-content 滚动容器，测试仍按 window 几何模型测量。 源码：`apps/web/app/styles.css`、`apps/web/app/operations/page.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **F**：Recent runs 滚动区获得焦点后，计算 outlineStyle 为 none，未满足原有焦点可见性断言。两份源码及失败值一致，保留这项既有焦点约束失败。 源码：`apps/web/app/operations-content.tsx`、`apps/web/app/styles.css`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **W**：测试只调用 window.scrollTo；页面使用 shell 内部滚动容器，背景 snapshot.scrollY 仍为 0，未达到 > 0 的准备前提。失败发生在打开删除层之前。 源码：`apps/web/app/styles.css`、`apps/web/app/settings/page.tsx`；列示文件在两提交中的 Git blob 与 SHA-256 相同。
- **H**：Home 输入 ga 后立即同步读取 URL；原有 router.push 通过异步导航更新过滤 URL，断言时 search 仍为 null。控制台随后可见 search=ga 请求；Home/过滤器/快捷键源码未变。此归因限定为原有 URL 提交时序断言失配。 源码：`apps/web/app/page.tsx`、`apps/web/features/work-items/work-surfaces.tsx`、`packages/ui/src/domain/work-item.tsx`、`apps/web/app/lib/use-hotkeys.ts`；列示文件在两提交中的 Git blob 与 SHA-256 相同。

这里的“原因”记录已执行的失败层级及可核对的结构/时序，不宣称对话框溢出和焦点样式等所有旧缺陷已修复。C3 相关变化另含功能枚举、完整注册表夹具补键与数量、LLM 文案和预置表单；已在两份各自完整源码中运行，不能以单个 Agent 夹具对照解释全部结果。

## 交接与收尾

本轮仅追加证据和修正交接说明，保留原 32 失败、首败及上轮原始归档；正式 E2E 的历史通过未用于替代本组对照。未修改目录、安全规范化、连接保存与显式模型登记行为。成果仍须独立复核、最新提交 CI 和 Chief 确认，不代表已发布或合入。资源 ID、路径、清理结果与保留原因见 [mocked-regression-resources.json](mocked-regression-resources.json)。
