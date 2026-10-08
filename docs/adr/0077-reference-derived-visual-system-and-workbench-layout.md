# Reference-derived visual system, card anatomy, and workbench layout

Status

Proposed

Reads with, retaining these boundaries except the bounded ADR 0064 visual baseline
amendment below: ADR 0028 (Accepted) frontend architecture and
M1-M5 staging, ADR 0045 (Proposed) single-token theme unification, ADR 0052
(Accepted) information architecture, ADR 0064 (Accepted) unified shell, ADR 0073
(Proposed) column position, ADR 0074 (Proposed) configuration readiness.

与 Accepted ADR 0064 的实际冲突限定在视觉基线：0064 曾把当时的产品 token/密度作为权威，
并拒绝复制第三方视觉语言；本批用户已批准采用参考实测亮色值、卡片结构和三栏布局，
因此在这个范围修订该基线，不能宣称视觉完全未变。单一 authenticated shell、canonical
URL、授权 read model、焦点和页面责任仍遵循 0064；0028 的模块/依赖边界和 0052 的 IA
不重新决定。0077 保持 Proposed，不把本次方案审查冒写成全部 ADR 已 Accepted。

Context

WorkMesh's frontend direction is already decided and mostly written down. ADR 0028
sets the architecture and the M1-M5 staging, and makes an explicit choice that
matters here: **CSS variables and authored CSS are the M1 baseline, Tailwind is
deferred, and shadcn/ui, MUI and Chakra are rejected.** ADR 0045 then converges the
palette onto a single `--wm-*` token set. ADR 0045 是 Proposed，其历史亮色范围不能描述
当前产品状态：`packages/ui/src/tokens.css` 已有 `[data-wm-theme='dark']`，D0
`apps/web/e2e/baselines/d0/README.md` 已记录产品支持且默认暗色。这里迁移参考亮色值，
保留既有暗色能力、切换与 token 消费，不用旧提案删除已存在的行为。

参考产品的完整测量原件保存在[`docs/references/todos-analysis/`](../references/todos-analysis/)，
包括 `design-tokens.md`、`kanban-cards.md`、五份引用的测量 JSON、截图索引和 28 张原始截图。
`SOURCE-MANIFEST.json` 记录原始字节数与 SHA-256。Markdown 文件包含测量值摘要；JSON 和截图是
支持证据，不能替代原件。直接照搬参考产品会违反 WorkMesh 已作出的决策；复制前必须明确三处张力。

**The reference implements its design with Tailwind utility classes.** A real card
carries `flex flex-col gap-1.5 rounded-lg border border-line bg-white px-3 py-2.5
dark:bg-surface-secondary`. Those classnames are the *implementation* of a
measurement, not the measurement. WorkMesh has deliberately not adopted Tailwind.
Copying the class strings would smuggle in a framework decision that ADR 0028
rejected, and would couple WorkMesh's markup to a class-name vocabulary that a
token rename would then have to rip out of every card.

**参考值同时包含明暗两套，本批仅迁移其亮色值；WorkMesh 已支持暗色。** The
reference's values are worth having — a warm off-white light surface
(`#faf7f2`) against a neutral near-black dark surface (`#18181b`) is a more
deliberate pairing than the current slate/blue legacy palettes — but taking the
dark half 会改变既有暗色值，需要另行评审；现有暗色值及解析必须继续成立。

**The reference has no semantic status tokens at all.** Its board status colours
are hardcoded utilities: gray-400 for pending, blue-500 for running, amber-500 for
needs-you, green-500 for done. WorkMesh has the opposite position: ADR 0045 keeps
`--wm-info`, `--wm-success`, `--wm-warning`, `--wm-danger` as tokens precisely so
status colour is themeable. Importing the reference's mechanism would re-create
the exact problem 0045 exists to fix, in a new place.

What is genuinely worth taking is the reference's **measurements** and its
**structural patterns**, both of which are mechanism-independent: a warm-neutral
surface ramp, a 4-column board whose columns are inset surfaces rather than
outlined regions, a card with a fixed three-region anatomy and a hard two-line
title clamp and no shadow at all, and a workbench whose conversation and board sit
side by side behind a draggable splitter that can be hidden or maximised with its
state remembered.

And one pattern is a genuine design rule rather than a taste preference: **only
the state that requires a human is rendered in the attention hue.** In the
reference, pending is gray, running is blue, done is green, and only *needs you* is
amber. 人需要处理与否来自当前调用者可响应的 Human Attention，不来自虚构的工作流
`awaiting_review`：工作流 category、Agent Session execution state 和 Attention 分开保留。

Decision

WorkMesh adopts the reference's **measurements and structural patterns** into the
mechanism ADR 0028 and 0045 already chose. It does not adopt its framework, its
classnames, or its colour mechanism.

### Values move into the existing token namespace

保留单一语义 token 与 authored CSS 机制；D1b 按已批准映射逐面迁名、迁移消费方，
依赖清零后删除旧名称。参考实测、用户采纳候选与 WorkMesh 沿用值分别登记，不把全部值称为实测：

| Slot | WorkMesh today | Reference measured | Adopt |
| --- | --- | --- | --- |
| light surface | legacy slate / operations white | `#faf7f2` warm off-white | yes |
| light inset surface | — | `#f2ede6` | yes, as a new slot |
| border | legacy | `#e2dbd1` | yes |
| text primary / secondary / tertiary | legacy | `#1c1917` / `#57534e` / `#78716c` | yes |
| primary action | — | `#4f46e5` (indigo-600) with `#6366f1` focus | yes |
| status: pending / running / needs-human / done | `--wm-*` slots already exist | `#9ca3af` / `#3b82f6` / `#f59e0b` / `#22c55e` | values yes, **as tokens** |
| radius: control / card / column | mixed | 6px / 8px / 12px | yes |
| spacing scale | mixed | 2, 4, 6, 8, 10, 12, 16, 24 | yes |

Semantic status tokens **stay semantic**. The reference's hardcoded utility colours
are recorded as the reason WorkMesh must not import its mechanism: a status colour
that lives in a classname cannot be themed, and WorkMesh already has the tokens
that make it themeable.

参考暗色值只作为待另行评审的测量资料，不替换产品现有暗色值。#11 新增并存槽时定义
暗色映射到既有暗色语义值，#21 逐面迁移与清理时验证明暗切换、继承和 computed token。
D0 固定亮色取样不是删除暗色的许可。

### D1a coexistence mapping

D1a adds parallel `--wm-ref-*` slots only. It does not change the declarations or
consumers of the existing slots; #21 owns consumer migration and eventual cleanup.
The light values below are transcribed from the controlled measurement source
[`design-tokens.md`](../references/todos-analysis/design-tokens.md), with the
underlying observations in `design-observations.json` and `css-evidence.json`.
The source file records RGB/HEX values in “1. 色彩”, action/focus/status evidence
in “强调与状态色”, and theme-independent geometry in “3. 间距、圆角、阴影与边框”.

| Existing slot / meaning | Parallel slot | Reference light measurement and evidence | Existing dark alias |
| --- | --- | --- | --- |
| `--wm-canvas` | `--wm-ref-surface` | `#faf7f2`, semantic variable `--surface` | `--wm-canvas` |
| `--wm-surface-raised` | `--wm-ref-surface-elevated` | `#fdfaf6`, `--surface-elevated` | `--wm-surface-raised` |
| `--wm-surface-hover` | `--wm-ref-surface-hover` | `#f2ede6`, `--surface-hover` | `--wm-surface-hover` |
| `--wm-surface-subtle` | `--wm-ref-surface-secondary` | `#f2ede6`, `--surface-secondary` | `--wm-surface-subtle` |
| `--wm-surface-inset` | `--wm-ref-surface-inset` | `#f2ede6`, `--surface-inset` | `--wm-surface-inset` |
| `--wm-border` / `--wm-border-strong` | `--wm-ref-border-default` / `--wm-ref-border-strong` | `#e2dbd1` / `#cec6bb`, `--border-default` / `--border-strong` | `--wm-border` / `--wm-border-strong` respectively |
| `--wm-text` / `--wm-text-muted` / `--wm-text-subtle` | `--wm-ref-text-primary` / `--wm-ref-text-secondary` / `--wm-ref-text-tertiary` | `#1c1917` / `#57534e` / `#78716c`, `--text-primary` / `--text-secondary` / `--text-tertiary` | `--wm-text` / `--wm-text-muted` / `--wm-text-subtle` respectively |
| no direct existing dim slot | `--wm-ref-text-dim` | `#a8a29e`, `--text-dim` | `--wm-text-muted` |
| `--wm-neutral` / `--wm-info` / `--wm-warning` / `--wm-success` | `--wm-ref-status-pending` / `--wm-ref-status-running` / `--wm-ref-status-needs-human` / `--wm-ref-status-done` | `#9ca3af` / `#3b82f6` / `#f59e0b` / `#22c55e`, status dots in “强调与状态色” | corresponding existing dark semantic slot |
| `--wm-danger` | `--wm-ref-danger-candidate` | `#ef4444`, utility declaration candidate only; no error state was actively measured | `--wm-danger` |
| `--wm-accent` / `--wm-focus` | `--wm-ref-accent` / `--wm-ref-focus` | `#4f46e5` / `#6366f1`, primary action / secondary emphasis and focus evidence | `--wm-accent` / `--wm-focus` respectively |
| `--wm-radius-sm` / `--wm-radius-card` / `--wm-radius-panel` | `--wm-ref-radius-control` / `--wm-ref-radius-card` / `--wm-ref-radius-column` | `6px` / `8px` / `12px`, primary button and radius observations | theme-independent; no dark override |

The two `#f2ede6` surface measurements remain separate semantic slots: the
reference reports the same light value for hover and secondary surface, while the
existing dark values differ (`#262A2F` and `#1F2226`). Each slot therefore aliases
its own prior dark token, preserving #21's migration boundary. The danger value is
not evidence of a rendered error state. The rounded values do not vary by theme.

### The card becomes a structural contract

The card's three regions are adopted as a **layout** contract, implemented in
authored CSS and shared components, with these measured properties:

| Property | Value | Why it is a contract, not a style |
| --- | --- | --- |
| regions | meta row, title, footer | every card must expose assignment, subject, and recency in the same places |
| title | 14px / weight 500, **`-webkit-line-clamp: 2`** | a hard two-line constraint makes title length a product rule, and it is testable |
| container | 8px radius, 1px border, 10px 12px padding, 6px column gap, **zero shadow** | shadow is reserved for overlays, so a dense board does not blur |
| column | 12px radius, **inset** surface, 1px border, 12px column gap | the board separates by surface depth, not by outline weight |
| meta typography | project identity at 11px, identifier at 10px, both in the tertiary text colour | density is a deliberate choice for a triage surface |

Zero shadow on the card is the load-bearing one: it is what lets a board hold
forty cards without turning into a texture, and it is cheap to get wrong later by
adding a hover shadow for polish.

### One warm colour, and it means "a human is needed"

This becomes an explicit, testable invariant for the board and any status
vocabulary:

> 当前读取授权决定 Human Attention 可见性，`relationship`/负责人归属不替代权限。
> attention 色仅表达 `audience.canRespond=true` 的未决 Human Attention；负责人是别人但
> 当前人有权响应的合法内容仍可见且用暖色，可读不可响应的内容保持中性，不可读不显示。
> `statusId/statusCategory` 保留自定义工作流，`activeAgentState` 保留真实执行枚举。
> 两者都不能按 `awaiting_*` 前缀推导暖色；已决定/过期 Attention 及单独 blocked 执行态
> 不渲染为可操作 Attention。中性、信息、完成色按相应维度映射，未知工作流回退中性；
> blocked 与 attention 使用不同语义槽，不发明色距阈值。

The invariant is testable as a rendered assertion over every status the board can
display, which is the point: a design rule that cannot be asserted is a preference.

### The workbench is conversation and board, side by side

The three-pane workbench — navigation, conversation, board — is adopted as the
target layout, with a draggable splitter, a hideable board, a maximised board, and
the layout state remembered. This **composes with** ADR 0052 and ADR 0064 rather
than replacing them: the panes are two views over the same authorized read
models, the conversation is the Chief surface, and the board is the triage
surface. Neither pane becomes a second source of truth, and the splitter changes
no URL ownership — ADR 0064's canonical navigation rules are untouched.

The reference's empty-state pattern — a short title, one sentence of explanation,
and a single primary action — is adopted for surfaces that correspond to an unmet
configuration check, and is left alone everywhere else. That boundary belongs to
ADR 0074 and is not widened here.

### Card interactions are adopted as governed commands

Adopted, because each is an improvement over a detail page round-trip:

- the card's primary action changes with state rather than sending the user to a
  detail page to discover what to do next;
- a context menu whose first item is the next action, with edit, duplicate, copy
  link, close, delete, and reopen behind it;
- dragging between columns, with modifier-click multi-select for a batch move;
- **dragging a card into the conversation composer**, which inserts it as a task
  reference so a Human can brief the Chief without leaving the board.

领域写入复用既有命令、授权、`Idempotency-Key`、适用的 `If-Match` 与乐观并发。
导航、复制链接、选择与拖卡插入草稿仅为本地操作，断言零 mutation，不要求领域 revision。
#14 承接主动作和菜单；#22 承接拖拽、多选逐项结果与恢复、草稿引用。批量移动复用单项
适配器，逐项提交并展示部分失败；未知网络结果重用原 key 查询/重放，409 重新读取并由用户
确认。没有批次原子回滚；拖卡只插入引用，不自动发消息或激活总管。

**One reference behaviour is explicitly not adopted.** Dragging a started card
back to a pending column resets the task, interrupts the build, and clears the
conversation, plan, and diff records, with no confirmation. WorkMesh does not add
that. Any destructive transition in the board requires an explicit confirmation
surface, and the column-position model from ADR 0073 already provides the revision
that makes a safe transition expressible.

## Alternatives

- **Adopt Tailwind because the reference uses it.** Rejected: ADR 0028 deferred
  Tailwind pending a measured migration and ADR 0045 rejected it again, both on
  evidence. A card redesign is not that evidence.
- **Copy the reference's classnames.** Rejected: same objection, and it couples
  markup to a vocabulary that a token rename must then rip out.
- **Take the reference's status colours as hardcoded utilities.** Rejected: it
  re-creates ADR 0045's problem in a new place, and WorkMesh already has the
  tokens that make status colour themeable.
- **迁入参考暗色值。** 延后，保留测量资料；现有暗色能力必须保留并回归。
- **Replace WorkMesh's information architecture and navigation with the
  reference's.** Rejected: ADR 0052 and ADR 0064 are Accepted and answer questions
  the reference does not ask — what is at risk, what was verified, who is
  accountable.
- **Copy the destructive drag-to-reset.** Rejected: an unconfirmed data-destroying
  gesture is a defect, not a pattern, and WorkMesh's governed-command model exists
  precisely to prevent it.
- **Redesign the visual system from scratch instead of using measured values.**
  Rejected: a measured scale is cheaper than taste and is defensible in review.

## Consequences

WorkMesh's board and shell gain a coherent measured visual system whose values
came from a real product rather than from a preference argument, and it gains one
design rule that is now testable: only a Human-blocked state is warm.

The costs are real. Changing token **values** is a visible change across every
screen, and the first consequence is procedural: a visual baseline must be
captured **before** the switch, or there is no way to review the diff. That is a
gate on this work, not a nicety. The card anatomy becomes a contract that every
future card must satisfy, which constrains later work on the board. And the
palette visibly shifts from slate/blue toward warm neutral, which some will read
as a downgrade; the values are defensible, the shift is not optional once made.

参考暗色值迁移延后；现有暗色支持仍是本批回归范围，不能宣称产品仅有亮色。

## Migration

No domain change, no schema change, no endpoint change. This is presentation only.

The migration order is fixed and gated:

1. Capture a visual baseline of the affected screens in the current palette.
2. Introduce the reference values as **additional** semantic slots alongside the
   existing ones, so nothing is switched yet.
3. Migrate one surface at a time to the new slots, reviewing the visual diff
   against the baseline at each step.
4. Only once no surface consumes the old values, remove them.

Steps 2 and 3 are what make step 4 safe. Removing the old tokens first, or switching
the root values first, is the failure mode this ordering exists to prevent.

The Playwright spec added by ADR 0045 (`theme-unification.spec.ts`) is the
regression gate for steps 3 and 4, and this ADR adds to it rather than replacing
it: a status-hue assertion per board state, a two-line title clamp assertion, and a
zero-shadow assertion on cards.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green. No statement added to the agent lock inventory is
required by this ADR, because presentation owns no locked row.

## Spec changes

- `packages/ui/src/tokens.css` gains the adopted values, documented as a mapping
  from ADR 0045's semantic slots to the reference measurements, with the old
  values retained until step 4.
- `docs/plan/` gains the implementation plan for this ADR, with the baseline
  capture as an explicit gate and per-surface migration steps.
- A design-token reference document records the measured scale, its source, the
  date it was measured, and which values are adopted, which are captured for the
  dark follow-up, and which were rejected as mechanism.
- The board gains a card-structure test and the one-warm-colour invariant test
  described above.

## D1b 已授权 UI 方向同步（2026-10-08）

来源为 #21 平台完整规格中的 11:32 三项裁定、11:33 UI 方向及 12:31 实施交接；
历史来源哈希与 R1 原始快照仍保留，不能把这些后续授权冒作原始测量。

允许大胆替换或删除旧布局、组件设计、样式和 token；旧像素或旧结构不是兼容目标。
补齐来源映射后完整迁移并清旧，暗色允许同值重绑定并删除旧名称，保留切换与值；
参考暗色重新选值仍未授权。危险语义采用用户批准的 #ef4444 CSS 候选，
明确它不是参考错误态实测。D0 原件与固定比较参数保持，仅作为历史前后证据；
预期设计差异必须实际评审，不要求伪造零差异。

旧条款中要求保留旧结构、禁止一切暗色迁名或遇到既定方向内取舍都重新裁决的部分，
以本段授权为准。功能、真实领域状态、权限、导航与键盘可达、事务命令与审查 CI 门禁保持。
本卡的原测试和 DoD 不因 UI 重构而删除；本卡独有功能责任、依赖和放行门禁保持。
后续实现须记录新 token 的实际 computed style、明暗、焦点、导航及历史视觉差异；
它们不能以 #21 的文档或 token 检查替代自己的功能验收。
验收映射见 `docs/reviews/d1b/test-coverage.json`；原始映射保留在 `docs/reviews/r1/test-coverage.json`。

### D1b 全量映射与设计理由

完整机器可审映射位于 `apps/web/features/navigation/theme-token-migration.json`，
覆盖 175 条历史声明及 115 个旧槽的作用域、目标值、公式依赖和来源。它是待独审的
迁移定义；本次未修改 token CSS 或产品消费。D1a 的历史表仍描述当时并存状态。

普通卡片新槽 `--wm-ref-surface-card` 亮色取 #fdfaf6，是将参考 elevated 观测值
用于 WorkMesh 卡片的设计应用；不是参考普通卡片实测。暗色保留 #141619，
与 canvas #0B0C0E、raised #1A1D21 分开。hover 与 secondary、tertiary 与 dim
各自保留独立的暗色语义。危险候选转 `--wm-ref-danger`，并存期候选不提前删除。
`--wm-muted` 合并到 secondary；其他未映射文字、语义 bg/border/fg、阴影、字体、
间距、尺寸、层叠和动效全部同值迁名（公式引用改为新槽），不伪称新增实测。
间距虽有参考观测刻度，本阶段保持当前产品刻度；组件所需改变在逐面方案中说明并评审。

根/暗色/compact 的新槽必须能在实际子树切换，panel/border/gradient/focus 公式
在切换边界重声明，避免父级解析值错误继承。暗色最终不依赖任何旧名。
实例 `--wm-status-color`、`--wm-dismissal-depth`、`--wm-overlay-depth` 保留生产者和
fallback 能力；自定义工作流色仍来自服务端，不把 Attention 色映射为工作流权威。
AgentWorkspace 未定义的普通变量及硬编码 fallback 转为对应语义槽，作为该面可见差异评审。

每面评审包含文字可读性、焦点、hover/active、危险动作和真实明暗计算样式；
按钮/状态配对的 bg/fg 不能仅因 token 有定义就视为视觉通过。卡片三区、单暖色 Attention、
三栏布局和拖拽等后续功能由 #12/#13/#14/#22 原卡验收，未随此次映射提前实施。
