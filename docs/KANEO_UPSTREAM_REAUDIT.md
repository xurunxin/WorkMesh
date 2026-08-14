# Kaneo upstream re-audit and selective extraction manifest

状态：`Verified research snapshot`

核验时间：2026-08-11 08:32:31 UTC（2026-08-11 16:32:31 Asia/Shanghai）

范围：仅复审 `usekaneo/kaneo` 的人类可见前端、交互模式、来源与许可；不执行安全扫描，不评价 Kaneo 的安全性，不移植或批准任何服务端、认证、实时协议或权限模型。

## 1. 结论

**[事实]** 截至核验时间，Kaneo 的默认分支为 `main`，可验证 HEAD 是 [`a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41`](https://github.com/usekaneo/kaneo/commit/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)。最新正式 release 是 [`v2.17.1`](https://github.com/usekaneo/kaneo/releases/tag/v2.17.1)，tag 指向 [`4d688c9a05cd0508309b579abda3e8eba048f75a`](https://github.com/usekaneo/kaneo/commit/4d688c9a05cd0508309b579abda3e8eba048f75a)，发布时间为 2026-08-10 21:37:14 UTC。HEAD 比 release 多 2 个提交，只修改 `CONTRIBUTORS.svg`、`packages/mcp/package.json` 和 `packages/mcp/server.json`，没有 Web 前端差异；见 [`v2.17.1...a458d870`](https://github.com/usekaneo/kaneo/compare/v2.17.1...a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)。

**[事实]** 旧方案所用 [`0efc06f9956646be98f3b6c018764459626a5dab`](https://github.com/usekaneo/kaneo/commit/0efc06f9956646be98f3b6c018764459626a5dab) 位于 [`v2.12.1`](https://github.com/usekaneo/kaneo/releases/tag/v2.12.1) tag（`3894504cb08b6e1253001608649f139b0dd974b1`）之后 1 个提交，该提交只更新 `CONTRIBUTORS.svg`；因此旧代码基线与 `v2.12.1` 等价。旧提交到当前 HEAD 前进了 216 个提交，Git diff 涉及 365 个路径（107 新增、257 修改、1 删除）；见 [`0efc06f...a458d870`](https://github.com/usekaneo/kaneo/compare/0efc06f9956646be98f3b6c018764459626a5dab...a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)。

**[推断/建议]** 原“选择性移植人类可见部分”的方向仍然正确，但应把执行基线升级为 `a458d870...`，并优先采用 `adapt` 而非整文件复制。最有价值的顺序是：UI foundation 和应用壳 → Board/List/Backlog → Work Item Sheet/Full Page → Command/Search → Settings/Notifications → 富文本。Kaneo 的 Hono/Better Auth/WebSocket/MCP/数据库/部署实现不应进入 WorkMesh 权威路径。

## 2. 研究方法与可复现性

本文使用以下标记：

- **[事实]**：由 commit-pinned GitHub source、tag/release、manifest、lockfile、官方文档或官方包注册表直接观察。
- **[推断/建议]**：基于事实对 WorkMesh 适配成本、风险或顺序作出的判断，不声称是 Kaneo 上游事实。

主要一手来源：

- [Kaneo repository](https://github.com/usekaneo/kaneo)
- [固定 HEAD](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)
- [最新 release](https://github.com/usekaneo/kaneo/releases/tag/v2.17.1)
- [根 package manifest](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/package.json)
- [Web package manifest](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/package.json)
- [pnpm lockfile](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/pnpm-lock.yaml)
- [官方产品/开发说明](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/README.md)
- [官方贡献与 i18n 说明](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/CONTRIBUTING.md)

复现 ref 与漂移关系：

```powershell
git ls-remote https://github.com/usekaneo/kaneo.git HEAD refs/heads/main refs/tags/v2.12.1 refs/tags/v2.17.1
git rev-list --count 0efc06f9956646be98f3b6c018764459626a5dab..a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41
git diff --name-status 0efc06f9956646be98f3b6c018764459626a5dab a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41
```

## 3. 来源、许可证与 provenance

### 3.1 Kaneo 自有代码

**[事实]** 根许可证在旧 baseline、`v2.17.1` tag 与当前 HEAD 上是同一 Git blob（`ee7aa902ee64e3a1f5ddf8508d08d0a20d0b0fb4`）。当前文本为 MIT，版权行为 `Copyright (c) 2024 Andrej Acevski`，要求复制或实质性复制时包含版权声明和许可声明；见 [固定 HEAD 的 LICENSE](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/LICENSE) 与 [旧 baseline 的 LICENSE](https://github.com/usekaneo/kaneo/blob/0efc06f9956646be98f3b6c018764459626a5dab/LICENSE)。

**[事实]** 本次核验的旧 baseline、release tag commit 和 HEAD 在 GitHub commit record 中没有可依赖的 verified signer 证明。commit SHA 可固定内容，但不能单独证明作者身份：[`0efc06f`](https://github.com/usekaneo/kaneo/commit/0efc06f9956646be98f3b6c018764459626a5dab)、[`4d688c9`](https://github.com/usekaneo/kaneo/commit/4d688c9a05cd0508309b579abda3e8eba048f75a)、[`a458d87`](https://github.com/usekaneo/kaneo/commit/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)。

**[推断/建议]** WorkMesh 若复制 Kaneo 源码，应新增一个集中式 third-party notice（例如后续任务中的 `THIRD_PARTY_NOTICES.md`）并对每个 copied/adapted 文件记录 Kaneo commit、原路径、处置方式和 MIT notice；只借鉴交互语义而独立重写时，也应在设计/实现记录中保留来源链接。

### 3.2 UI registry、字体和品牌资产

**[事实]** Kaneo 的 [`apps/web/components.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/components.json) 使用 shadcn schema，并声明 COSS registry `https://coss.com/ui/r/{name}.json`。部分 UI/字体由 [`5a77539`](https://github.com/usekaneo/kaneo/commit/5a77539cccbd81745fab06032696d5feb16c376e) 以“adds coss ui & base ui”引入。COSS 官方仓库采用混合许可，明确把 `apps/ui/` 与 `apps/origin/` 指定为 MIT，其他目录默认 AGPL-3.0；见 [COSS LICENSING.md](https://github.com/cosscom/coss/blob/e43fa4a8da4c490ebf3e1e1707b2a9af6fa2a217/LICENSING.md)。

**[事实]** Kaneo 的 [`index.css`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/index.css) 引用 Cal Sans UI、Cal Sans Heading 和 Paper Mono 二进制字体；仓库在该 ref 下只包含根 `LICENSE`、`apps/docs/LICENSE`、`packages/mcp/LICENSE` 三个 license 文件，没有与这些字体并列的独立许可文件。Kaneo logo/favicon 也在 `apps/web/public/` 中。

**[推断/建议]** 不复制字体、Kaneo logo、favicon、产品名称或其他品牌资产。对源自 COSS/shadcn registry 的 UI primitive，必须先定位具体生成来源；只有落在 COSS 明确 MIT 的目录或另有明确许可时才允许复制，并同时保留 Kaneo 与实际上游的必要 notice。无法建立逐文件来源链时改为独立重写。

## 4. 当前前端结构与技术栈

### 4.1 可验证结构

| 层面 | [事实] 当前 Kaneo | 一手来源 |
| --- | --- | --- |
| Monorepo | pnpm 10.32.1、Turborepo、Node `>=20.19.0`，根版本 `2.17.1` | [`package.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/package.json) |
| Web runtime | React 19.2.8 + Vite 8 + TypeScript 7；TanStack Router/Query | [`apps/web/package.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/package.json), [`vite.config.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/vite.config.ts) |
| UI foundation | Tailwind CSS 4、Base UI、Radix primitives、COSS/shadcn-style local components、Lucide | [`components.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/components.json), [`index.css`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/index.css) |
| Data/state | TanStack Query、Zustand、Nanostores、Immer；Hono typed client | [`apps/web/package.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/package.json), [`use-update-task.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/hooks/mutations/task/use-update-task.ts) |
| Drag and drop | dnd-kit mouse/touch/keyboard sensors；Board/List/Backlog 各自编排 | [`kanban-board/index.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/kanban-board/index.tsx), [`list-view/index.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view/index.tsx), [`backlog-list-view/index.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/backlog-list-view/index.tsx) |
| Rich text | Tiptap 3、Markdown、tables/task lists、mentions、attachments、Shiki、Mermaid + DOMPurify | [`comment-editor.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/activity/comment-editor.tsx), [`mermaid-block.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/mermaid-block.ts) |
| i18n | i18next/react-i18next；`en-US` 是 key source；schema/check/report scripts；17 locales | [`CONTRIBUTING.md`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/CONTRIBUTING.md), [`i18n/resources.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/i18n/resources.ts), [`scripts/i18n/check.mjs`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/scripts/i18n/check.mjs) |
| Tests | Vitest、Testing Library、jsdom；关键 row/modal/team/i18n helpers 已有单元测试 | [`apps/web/package.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/package.json), [`task-row.test.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view/task-row.test.tsx) |

### 4.2 关键人类可见 surfaces

| Surface | [事实] 上游实现 |
| --- | --- |
| App shell / navigation | [`app-sidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/app-sidebar.tsx), [`nav-main.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/nav-main.tsx), [`nav-projects.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/nav-projects.tsx), [`workspace-switcher.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/workspace-switcher.tsx) |
| Board / List / Backlog | [`kanban-board/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/kanban-board), [`list-view/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view), [`backlog-list-view/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/backlog-list-view), 官方流程说明 [`plan-and-execute-tasks.mdx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/docs/core/functional/plan-and-execute-tasks.mdx) |
| Work item detail | [`task-details-sheet.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-details-sheet.tsx), [`task-details-content.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-details-content.tsx), [`task-properties-sidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-properties-sidebar.tsx) |
| Comments / activity / rich editor | [`activity/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/activity), [`task/extensions/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions) |
| Command palette / global search | [`command-palette/index.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/command-palette/index.tsx), [`search-command-menu/index.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/search-command-menu/index.tsx), [`use-keyboard-shortcuts.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/hooks/use-keyboard-shortcuts.ts) |
| Settings / notifications | [`SettingsSidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/SettingsSidebar.tsx), [`notification-preferences-settings.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/account/notification-preferences-settings.tsx), 官方说明 [`account-notifications.mdx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/docs/core/functional/account-notifications.mdx) |
| Onboarding / team / public view | [`onboarding/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/onboarding), [`team/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/team), [`public-project/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/public-project) |

### 4.3 WorkMesh 适配判断

**[事实]** 当前 WorkMesh `apps/web` 是 Next.js 15.3.1 + React 19.1.0 + TypeScript 5.8.3；`packages/ui` 只有 React peer dependency 和一个最小 Button。Kaneo 则依赖 Vite/TanStack Router、Tailwind 4、Base UI/Radix/COSS local primitives、TanStack Query、i18next、dnd-kit、Tiptap 等。

**[推断/建议]** 直接复制会同时引入路由、样式、数据缓存与状态模型耦合。正确 seam 是：

```text
Kaneo interaction/source reference
        -> packages/ui presentational primitives and tokens
        -> apps/web feature view models/adapters
        -> WorkMesh contracts + REST/durable SSE
        -> WorkMesh domain authority
```

Kaneo 的 `Task.userId`、project columns、client cache 与 WebSocket message 不应成为 WorkMesh 的 `responsibleHuman`、Delegation、Agent Session、workflow state、revision 或 durable event 的替代模型。

## 5. 与旧 baseline 的漂移

| 观察 | [事实] 漂移 | [推断/建议] 对方案影响 | 来源 |
| --- | --- | --- | --- |
| Release | `v2.12.1` → `v2.17.1`；旧 `0efc06f` 实际只比 tag 多一个 contributors commit | 更新固定 ref，不再以 `0efc06f` 作为新实现依据 | [`v2.12.1...v2.17.1`](https://github.com/usekaneo/kaneo/compare/v2.12.1...v2.17.1) |
| 核心 Board/List 编排 | `kanban-board/index.tsx`、`list-view/index.tsx`、`backlog-list-view/index.tsx` 未变化；卡片/行组件有调整与新增测试 | 旧交互分析仍有效，但 extraction 应使用当前 ref 的 card/row 与测试 | [`0efc...a458`](https://github.com/usekaneo/kaneo/compare/0efc06f9956646be98f3b6c018764459626a5dab...a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41), [`task-row.test.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view/task-row.test.tsx) |
| Mobile settings | 新增 responsive `SettingsSidebar` / Sheet 流程 | 提前纳入 UI foundation，而不是放到后期补丁 | [`v2.16.0`](https://github.com/usekaneo/kaneo/releases/tag/v2.16.0), [`SettingsSidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/SettingsSidebar.tsx) |
| Project navigation | `nav-projects.tsx` 有大幅修改，并加入项目 drag-and-drop reorder | 借鉴排序 handle/反馈，不复用 mutation | [`v2.16.0`](https://github.com/usekaneo/kaneo/releases/tag/v2.16.0), [`nav-projects.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/nav-projects.tsx) |
| Rich text | 新增 Mermaid preview、DOMPurify、URL guard；Comment Editor 有小幅变化 | Mermaid 放到富文本二阶段，先完成内容合同与隔离测试 | [`mermaid-block.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/mermaid-block.ts), [`url-safety.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/url-safety.ts) |
| i18n | 新增 hi-IN、it-IT、pt-BR、vi-VN、zh-CN；现有 locale 与 schema 大幅更新 | 借鉴 schema/check/report 工具链，不复制 Kaneo 文案 | [`v2.12.2`](https://github.com/usekaneo/kaneo/releases/tag/v2.12.2), [`v2.14.0`](https://github.com/usekaneo/kaneo/releases/tag/v2.14.0), [`resources.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/i18n/resources.ts) |
| Toolchain | TS 5.8 → 7.0.2、Vite 7 → 8、React compiler beta → 1.0、多个 UI deps 升级 | 不把 Kaneo toolchain 升级隐式带进 WorkMesh；逐依赖决策 | [`apps/web/package.json` old](https://github.com/usekaneo/kaneo/blob/0efc06f9956646be98f3b6c018764459626a5dab/apps/web/package.json), [`current`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/package.json) |
| Realtime/auth/MCP | MCP 新增 stateless 2026 protocol 分支；auth/WebSocket 仍是 Kaneo 自有模型 | 漂移增加而非减少了直接移植风险；全部保持 reject/reference-only | [`v2.17.0`](https://github.com/usekaneo/kaneo/releases/tag/v2.17.0), [`mcp-stateless.mdx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/docs/core/integrations/mcp-stateless.mdx) |

说明：release notes 中出现的 security/fix 条目只用于说明版本漂移；本次任务按授权未执行安全扫描，也不据此给出安全批准。

## 6. Structured extraction manifest

`disposition` 定义：

- `copy`：允许在满足 attribution gate 后实质复制，再做局部路径/命名调整。
- `adapt`：只移植交互和组件结构，重新连接 WorkMesh view model/contracts。
- `reference`：只作为设计或测试参考，默认独立实现。
- `reject`：不得进入 WorkMesh 实现或权威边界。

| Upstream ref/path | Intended WorkMesh destination/seam | Disposition | Rationale | Required attribution | Risk / test gate |
| --- | --- | --- | --- | --- | --- |
| [`components/ui/button.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/button.tsx), [`input.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/input.tsx), [`badge.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/badge.tsx), [`card.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/card.tsx) | `packages/ui/src/primitives/*` | `adapt` | 无业务权威，适合建立组件 API 与状态变体 | Kaneo MIT；逐文件确认 COSS/shadcn lineage 后追加实际上游 notice | React 19/Next build；键盘/focus/disabled；light/dark；不得在组件内调用 API |
| [`sheet.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/sheet.tsx), [`dialog.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/dialog.tsx), [`popover.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/popover.tsx), [`tabs.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/tabs.tsx) | `packages/ui/src/overlays/*` | `adapt` | 可复用 overlay/focus/viewport 语义；Kaneo 版本绑定 Base UI 与 Tailwind classes | Kaneo MIT + 对应 Base UI/COSS notice | focus trap、Escape、restore focus、scroll lock、screen reader、mobile viewport |
| [`empty.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/empty.tsx), [`skeleton.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/skeleton.tsx), [`error-boundary.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/ui/error-boundary.tsx) | `packages/ui/src/feedback/*` | `adapt` | 直接补齐 Loading/Empty/Error 基线 | Kaneo MIT；`empty.tsx` 另核对 COSS MIT lineage | snapshot/a11y；错误信息不得泄露 secret；retry 必须由 caller 提供 |
| [`index.css`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/index.css) 的 tokens、dark/reduced-motion patterns | `packages/ui/src/styles/tokens.css`, `apps/web/app/styles.css` | `reference` | 借鉴语义 token、dark mode 与 reduced-motion；不复制字体或整份编辑器 CSS | 设计记录引用 Kaneo commit；若复制实质 CSS 则 Kaneo/COSS notice | contrast、forced colors、reduced motion、CSS budget；禁止复制 fonts/logos |
| [`app-sidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/app-sidebar.tsx), [`nav-main.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/nav-main.tsx), [`workspace-switcher.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/workspace-switcher.tsx) | `apps/web/features/navigation/*`; shell only | `adapt` | 侧栏层级、collapse、workspace/project navigation 可借鉴；路由绑定需重写 | Kaneo MIT；复制 primitive 时追加来源 notice | Next App Router；权限不可由隐藏 menu 决定；窄屏/键盘/active route E2E |
| [`SettingsSidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/SettingsSidebar.tsx) | `apps/web/features/settings/settings-shell.tsx` | `adapt` | 桌面 aside + 移动 Sheet 是旧 baseline 后新增的高价值模式 | Kaneo MIT + Sheet primitive lineage | responsive 320/768/desktop；focus return；无 client-side authority |
| [`command-palette/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/command-palette), [`search-command-menu/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/search-command-menu) | `apps/web/features/command-center/*`; query adapters separate | `adapt` | 动作分组、最近/搜索、快捷键和 dialog 结构可复用；TanStack Router/Search DTO 不可复用 | Kaneo MIT + Command primitive lineage | keyboard collision、focus、authorization-filtered results、loading/empty/error、无越权快捷 mutation |
| [`kanban-board/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/kanban-board) | `packages/ui/src/board/*` for pure primitives；`apps/web/features/work-items/board/*` for adapters | `adapt` | dnd sensors、overlay、card/column composition、J/K navigation有价值；`ProjectWithTasks` 与 mutation/store 耦合必须剥离 | Kaneo MIT + dnd-kit MIT；逐个 copied component 记录 path | 鼠标/触屏/键盘 + 非拖拽替代；stale revision/403/409 回滚；responsible human 不丢失；SSE reconciliation |
| [`list-view/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view), [`backlog-list-view/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/backlog-list-view), [`bulk-selection/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/bulk-selection) | `apps/web/features/work-items/{list,backlog,bulk}/*` | `adapt` | dense rows、section collapse、bulk affordance 可加速核心 human flow | Kaneo MIT + dnd-kit MIT | 大列表性能；selection/focus；bulk partial failure；每个 mutation exact revision + Idempotency-Key |
| [`task-details-sheet.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-details-sheet.tsx), [`task-details-content.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-details-content.tsx), [`task-properties-sidebar.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-properties-sidebar.tsx) | `apps/web/features/work-items/detail/*` | `adapt` | Sheet → full page、content/property split、relation/activity layout可借鉴 | Kaneo MIT + Sheet primitive lineage | responsible human 与 Agent executions 分栏；session/workflow state 分离；deep-link/back/focus；revision conflict recovery |
| [`task-card.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/kanban-board/task-card.tsx), [`task-row.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/list-view/task-row.tsx), label tests | `packages/ui/src/work-item/*` + WorkMesh view model | `adapt` | metadata density、priority/due/label display 与测试样例可借鉴；单 `userId` assignee 语义不可保留 | Kaneo MIT；icons 按 Lucide ISC | Human/Agent visual distinction；overdue/final-state semantics；label overflow；screen reader text |
| [`comment-editor.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/activity/comment-editor.tsx), [`task-description-editor.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/task-description-editor.tsx) | later `packages/ui/src/rich-text/*`; WorkMesh content adapter in `apps/web/features/collaboration/*` | `reference` | 约 60 KB editor 绑定 Tiptap、workspace query、upload、Kaneo mentions、CSS；直接提取范围过大 | 若实质复制：Kaneo MIT + Tiptap MIT + extension-specific notices | 先冻结 Markdown/mention/attachment contract；sanitize/render isolation；paste/drop；large doc；secret/hidden-CoT policy；SSR/client boundary |
| [`kaneo-mention.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/kaneo-mention.tsx), [`mention-suggestion.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/mention-suggestion.tsx) | WorkMesh-specific mention extension after contract exists | `reference` | Kaneo serializes custom `<kaneo-mention>` and workspace member IDs；WorkMesh actor kinds/visibility不同 | Source citation in design; copied algorithm requires Kaneo/Tiptap notice | mention ID must bind authorized Actor；Human/Agent/Service visible distinction；unknown actor and revoked access tests |
| [`mermaid-block.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/mermaid-block.ts), [`url-safety.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/task/extensions/url-safety.ts) | optional rich-text extension, not M1/M2 | `reference` | strict Mermaid config、DOMPurify 与 caching pattern有参考价值；不是完整内容安全边界 | Kaneo MIT + Mermaid MIT + DOMPurify dual-license obligations | 独立 content safety review（非本次扫描）；SVG sanitization、CSP、error containment、bundle budget |
| [`notification-preferences-settings.tsx`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/account/notification-preferences-settings.tsx) | `apps/web/features/settings/notifications/*` | `reference` | 分层 channel/workspace/project 表单值得借鉴，但 Kaneo channel model、secret fields 与副作用不同 | Design attribution；若复制 presentation pieces 则 Kaneo MIT | secrets never round-trip/log；server policy/outbox authoritative；validation/error/partial save E2E |
| [`scripts/i18n/check.mjs`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/scripts/i18n/check.mjs), [`schema.mjs`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/scripts/i18n/schema.mjs), [`shared.mjs`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/scripts/i18n/shared.mjs) | future `scripts/i18n/*`; generated schema under WorkMesh locale root | `copy` | 独立工具逻辑可减少缺失/额外 key；不复制 Kaneo 文案与 locale JSON | Kaneo MIT notice，文件头/third-party notice 记录 exact paths/ref | fixture tests；missing/extra/dynamic key；deterministic schema；WorkMesh domain glossary review |
| [`i18n/en-US.json`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/i18n/en-US.json), other translations | WorkMesh-owned locale catalog | `reject` | 文案和领域术语属于 Kaneo，不适合作为 WorkMesh truth；翻译质量/provenance 不逐条可验证 | N/A；只引用结构 | 从 WorkMesh English glossary 新建；Human/Agent/Session/Delegation 等术语评审 |
| [`routes/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/routes), TanStack navigation calls | Next App Router pages/layouts | `reject` | 路由框架、URL params 和 loader 生命周期不兼容 | N/A | Next route/deep-link tests independently implemented |
| [`fetchers/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/fetchers), [`hooks/mutations/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/hooks/mutations), `store/project` | WorkMesh contracts/API adapters only | `reject` | Kaneo update sends whole Task through Hono client and invalidates cache；不表达 WorkMesh revision/idempotency/actor/session authority | N/A | mutation must retain If-Match、Idempotency-Key、structured errors、server validation and durable-event convergence |
| [`use-project-websocket.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/hooks/use-project-websocket.ts), [`use-user-websocket.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/hooks/use-user-websocket.ts), [`apps/api/src/ws/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/api/src/ws) | WorkMesh durable SSE adapter | `reject` | Kaneo client WebSocket messages + query invalidation不是 durable cursor/event replay | N/A | SSE cursor resume、disconnect/restart、unknown events、dedupe、server-source-of-truth E2E |
| [`auth-client.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/lib/auth-client.ts), [`components/auth/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/components/auth), [`apps/api/src/auth.ts`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/api/src/auth.ts) | none | `reject` | Better Auth org/role/device/API-key model不是 WorkMesh Human/Agent/Service + Session/Delegation authority | N/A | 保持 WorkMesh authentication/authorization tests；不得把 browser/human credential 转成 Agent authority |
| [`apps/api/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/api), [`packages/permissions/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/packages/permissions), [`packages/mcp/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/packages/mcp) | none | `reject` | Hono/Drizzle/Better Auth/MCP 工具与 permissions 是 Kaneo 权威实现，不是展示层 | N/A | 禁止更改 WorkMesh domain/contracts/MCP authority 以迁就上游 UI |
| [`Dockerfile.kaneo`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/Dockerfile.kaneo), [`compose.yml`](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/compose.yml), [`charts/kaneo/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/charts/kaneo) | WorkMesh install UX may reference docs only | `reject` | Kaneo service topology和启动/迁移假设与 WorkMesh API/Web/Worker/MCP 分层不同 | N/A | 不改变部署边界；安装 UX 仅消费 WorkMesh health/config contracts |
| [`apps/web/public/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/public), [`src/assets/fonts/`](https://github.com/usekaneo/kaneo/tree/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/apps/web/src/assets/fonts) | none | `reject` | 品牌/商标不可移植；字体独立许可在仓库中未被完整证明 | N/A | 使用 WorkMesh-owned branding 与已核验字体；asset provenance gate |

## 7. 依赖与许可证注意事项

**[事实]** Kaneo manifest 使用 semver ranges，`pnpm-lock.yaml` 才固定本次 ref 的具体解析与 integrity。选择性移植不应复制整个 dependency set，应从实际 extraction seam 反推最小依赖。

| Candidate dependency | Ref 中用途 / resolved version | Registry license fact | WorkMesh gate |
| --- | --- | --- | --- |
| `@base-ui/react` | overlay/primitives；1.7.0 | [npm registry: MIT](https://registry.npmjs.org/%40base-ui%2Freact/1.7.0) | 只有选定 Base UI foundation 时引入；与 Next client boundary/a11y 一起验证 |
| `@dnd-kit/core` + sortable/modifiers | Board/List/Backlog；core 6.3.1 | [npm registry: MIT](https://registry.npmjs.org/%40dnd-kit%2Fcore/6.3.1) | 必须提供非拖拽替代、keyboard/touch E2E 和 mutation conflict rollback |
| `@tanstack/react-query` | cache/query invalidation；5.101.4 | [npm registry: MIT](https://registry.npmjs.org/%40tanstack%2Freact-query/5.101.4) | 可选；不得代替 durable source/event cursor；若不需要复杂 cache 则不引入 |
| `@tanstack/react-router` | Kaneo routing；lockfile resolved 1.170.24 | [npm registry: MIT](https://registry.npmjs.org/%40tanstack%2Freact-router/1.170.24) | reject；WorkMesh 已使用 Next App Router |
| `@tiptap/react` 及 extensions | Rich editor；3.29.2 | [npm registry: MIT](https://registry.npmjs.org/%40tiptap%2Freact/3.29.2) | 独立 rich-text decision；bundle/content format/paste/upload/SSR tests |
| `tailwindcss` | local UI styling；4.3.3 | [npm registry: MIT](https://registry.npmjs.org/tailwindcss/4.3.3) | 属于 major UI foundation decision；不能为复制几个组件隐式引入 |
| `dompurify` | Mermaid SVG sanitization；lockfile resolved 3.4.13 | [npm registry: `(MPL-2.0 OR Apache-2.0)`](https://registry.npmjs.org/dompurify/3.4.13) | 需选择并满足适用许可义务；仅安装依赖不等于完成内容安全验证 |
| `mermaid` | diagram preview；lockfile resolved 11.16.1 | [npm registry: MIT](https://registry.npmjs.org/mermaid/11.16.1) | late optional；dynamic import、render isolation、bundle/perf gate |
| `lucide-react` | icons；lockfile 解析 1.29.0 | [npm registry: ISC](https://registry.npmjs.org/lucide-react/1.29.0) | 保留 ISC notice；不得复制 Kaneo/GitHub brand marks |
| `framer-motion` | List animations；13.0.0 | [npm registry: MIT](https://registry.npmjs.org/framer-motion/13.0.0) | 可先用 CSS/reduced-motion；若引入需 bundle budget |
| `i18next` | locale runtime；26.3.6 | [npm registry: MIT](https://registry.npmjs.org/i18next/26.3.6) | 先建立 WorkMesh glossary/catalog；不复制 Kaneo translations |

**[推断/建议]** 依赖批准最小单位应是一个 WorkMesh milestone，而不是一个 Kaneo 文件。每次批准至少记录：直接/传递依赖清单、resolved version、许可、bundle delta、维护活性、Next/React 兼容性和移除路径。本次未执行漏洞扫描，因此本表不是 dependency security approval。

## 8. 明确禁止移植的 authority 边界

以下均为 `reject`，即使它们能让 Kaneo UI 更快跑起来：

1. Kaneo 的 `apps/api/**`、Drizzle schema/controllers、Hono typed API client。
2. Better Auth 配置、organization/role、browser session、API key、device/OAuth flow。
3. `useProjectWebSocket`/`useUserWebSocket`、服务端 WebSocket broadcast 与客户端 query invalidation 作为实时真相。
4. `packages/mcp/**`、`apps/api/src/mcp/**` 的 tool names、identity/authorization/session 语义。
5. `Task.userId` 或单 assignee 投影替代 WorkMesh `responsible_human_actor_id`、Delegation 或 Agent Session。
6. Kaneo project columns/status mutation 替代 WorkMesh workflow state + revision/If-Match。
7. Kaneo client store/optimistic state 绕过 `Idempotency-Key`、structured error、domain event/outbox 或 durable SSE cursor。
8. Kaneo compose/Helm/single-container 边界替代 WorkMesh API/Web/Worker/MCP 分层。
9. Kaneo fonts、logo、favicon、名称与其他品牌资产。

## 9. 推荐 extraction gates

**[推断/建议]** 每个实现 Issue 在进入 Done 前至少通过：

1. **Source gate**：固定 Kaneo ref/path/hash，标注 `copy/adapt/reference`，third-party notice 完整。
2. **Boundary gate**：`packages/ui` 不 import API/contracts/router/domain；`apps/web` adapter 不创建第二套持久模型。
3. **Authority gate**：Human responsibility、Agent delegation/session、workflow/session state separation 保持；所有 mutation 仍有 revision/idempotency/服务端授权。
4. **Realtime gate**：durable SSE cursor、断线重连、server restart、duplicate/unknown event 覆盖；不引入 WebSocket 权威替代。
5. **Interaction gate**：keyboard、touch、screen reader、focus、reduced motion、非拖拽替代、320px 窄屏。
6. **State gate**：Loading/Empty/Error/Forbidden/Conflict/Stale/Offline 都有明确 human feedback 和恢复路径。
7. **Dependency gate**：最小依赖、许可/notice、bundle/perf、版本 pin 与移除策略。
8. **Local CI gate**：按 WorkMesh 变更范围运行 lint/typecheck/unit/integration/E2E；不以 Kaneo 上游测试代替 WorkMesh contract tests。

## 10. 无法验证项与后续决策

1. **逐文件 COSS/shadcn ancestry**：`components.json` 和历史提交能证明 registry/引入关系，但不能为每个 `components/ui/*.tsx` 完整证明原作者与生成版本。复制前必须逐文件核对；无法核对则独立重写。
2. **字体许可链**：Kaneo ref 中没有与三份字体并列的许可文件；不复制，除非后续从字体官方来源单独建立许可与 checksum。
3. **翻译 provenance/质量**：可验证 locale files 与贡献记录存在，不能由仓库直接证明每条翻译的准确性或权利链；不复制文案。
4. **Commit signer identity**：固定 SHA 可保证内容寻址，但本次检查的关键 commits 没有 verified signature；若供应链政策要求签名，需另设来源批准 Gate。
5. **浏览器/可访问性实际质量**：源码含 keyboard sensor、reduced-motion 和 ARIA-oriented primitives，但本次是 source audit，没有运行 Kaneo UI 或执行可访问性/视觉测试；不能把实现意图当作通过结果。
6. **安全状态**：按授权跳过所有安全扫描；未验证依赖漏洞、富文本攻击面或上游 security posture。本文件只定义后续实现时的边界和测试 Gate，不授予安全批准。

## 11. 更新后的推荐路线

**[推断/建议]** 将既有方案的 M0 固定基线更新为 `a458d870...`，然后按以下顺序建立实施 Issues：

1. UI tokens/primitives/provenance foundation。
2. Responsive app shell、navigation、feedback states、command palette skeleton。
3. Board/List/Backlog view models + accessible interactions。
4. Work Item Sheet/Full Page，明确 Human 与 Agent execution 双投影。
5. Settings/notification presentation adapters。
6. i18n tooling（独立 WorkMesh catalog）。
7. 最后单独评审富文本/mentions/attachments/Mermaid；不把它作为早期 UI foundation 的依赖。

这一路线保留 Kaneo 最有价值的“给人看的部分”，同时确保 WorkMesh MCP、domain、event/outbox、durable SSE、身份与授权仍是唯一控制平面。
