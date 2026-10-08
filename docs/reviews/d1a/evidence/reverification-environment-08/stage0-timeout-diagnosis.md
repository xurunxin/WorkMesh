# Stage 0 超时诊断

## 失败观测

- 失败轮次：`reverification-environment-07`；其原始失败日志与附件均保留。trace 显示 `apps/web/e2e/stage0.spec.ts:387` 正在执行 `getByLabel("Current team").first()` 的 `selectOption`。测试超时前没有对应的 `after` 事件；最后页面快照仍是 `http://127.0.0.1:3100/workbench`。
- 前一步在第 380 行点击了 `view-my-work`，随后立即切换语言，没有等待目标 URL。该路由不提供预期选择器：`apps/web/app/workbench/page.tsx` 没有向 `AuthenticatedWorkspaceShell` 传入 `teamSwitcher`；`packages/ui/src/layout/app-shell.tsx` 只在提供该属性时渲染团队选择器。
- 失败 trace 记录了安装、登录、workbench API 成功以及已渲染的认证页面。因此证据将超时定位到 Stage 0 浏览器导航和选择器步骤，而非服务启动或初始认证。仅凭原 trace 无法确定选择器等待时导航未提交的更深层原因，故记录为未知；可直接证实的问题是该步骤缺少显式导航同步。

## 最小修复与复验

`apps/web/e2e/stage0.spec.ts` 现在在点击 `view-my-work` 后等待 `/?view=my-work`，与 `apps/web/e2e/stage2.spec.ts` 已有的显式导航等待一致。没有放宽超时、跳过测试、删减断言或改变应用行为。使用新的隔离环境复验时，各命令执行前后的受测源码指纹一致；主题 E2E 10/10、`pnpm test:e2e` 67/67（含 Stage 0）、D0 replay 14/14 均通过，快照未更新。本目录保存服务就绪、执行绑定、清理、日志及全量通过 HTML 报告。

此前失败轮次仍可在 `../reverification-environment-07/e2e-failure-captures/` 独立审阅，包括 `error-context.md`、截图、视频、脱敏 trace ZIP 和归档 HTML 报告。ZIP 中填入的凭据、cookies、CSRF 值和授权头均已脱敏；它是该轮实际 trace 的审阅副本。
