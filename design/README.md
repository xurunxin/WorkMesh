# WorkMesh Design System

WorkMesh Web UI 的重设计资产，双轨交付：**可交互原型**（评审与决策用）与 **Figma
设计系统构建器**（工程交付用）。两者共享同一套令牌与组件语义。

## 1. 交互原型 `prototype/`

零依赖、零构建的静态站点。任意静态服务器即可运行：

```powershell
cd design/prototype
npx serve .          # 或任何静态服务器
# → http://localhost:3000
```

**路由**（hash 路由）：

| #/ 路径 | 页面 |
|---|---|
| `#/home` | 我的工作 —— 审批注意力队列 + 工作项 + Session 遥测 |
| `#/active` `#/backlog` | 工作项列表（筛选栏） |
| `#/board` | 看板 |
| `#/inbox` | 审批中心 + 自主策略开关 |
| `#/agents` | 智能体注册表 |
| `#/sessions` | Session 详情（计划 diff、活动时间线） |
| `#/detail` | 工作项详情（执行工作区、验收标准、关系） |
| `#/recovery` | 恢复中心 |
| `#/ops` | 运营控制台 |
| `#/connect` | MCP 接入引导 |
| `#/install` `#/login` | 无外壳认证页 |
| `#/settings` | 工作流状态、成员 |

**主题**：默认深色（本设计的英雄模式）。`?theme=light` 强制浅色，左下角按钮切换，
选择记忆于 localStorage。

**交互**：

- `Ctrl/Cmd+K` 或 `/` — 命令面板（跳转、搜索、操作）
- 单击工作项 → 工作间抽屉（计划 diff / 活动 / 执行事实 / 指令）
- 双击工作项 → 详情页
- 审批卡「通过 / 驳回」有状态反馈动画

**移动端**（≤860px，390px 视口实测）：不只是让导航可达，而是整套重排：

- **全屏导航抽屉**：侧边栏铺满整屏（部分宽面板的触摸目标太小），顶部滑入；
  汉堡按钮 44×44，导航项 46px 高 / 15px 字号，遮罩/Esc/跳转后自动收起。
- 触摸目标全线 ≥44px：按钮 42px、tab 44px、输入框 44px（16px 字号同时
  阻止 iOS 聚焦自动缩放）、徽章/状态/芯片 26px、页头操作按钮变两列网格。
- 正文字号同步放大：标题 15px、描述 14px、行标题 14px。
- 搜索：保留文字标签与 44px 高度（纯图标目标是主入口的反模式），
  `Ctrl K` 徽章隐藏。
- 顶栏：面包屑隐藏。
- 工作项行：meta（标签/优先级/预算/状态）折行到分隔线下方。
- 审批卡：时限独占一行，操作按钮等宽铺满，后果预览可换行。
- Session 卡：暂停/停止/介入移到全宽行。
- **数据表 → 堆叠卡片**：表头隐藏，每行变为「标签左 · 值右」的卡片，
  列名由 `data-th` 提供（CSS `content: attr(data-th)`）。
- **计划 diff → 纵向卡片**：表头行隐藏，稳定 ID / diff / 状态纵向排列。
- 看板：横向滚动改为单列纵向分组。
- 筛选栏：搜索占满首行，其余控件每行两个。
- 桌面端零回归（1440px 实测：侧边栏 240、汉堡隐藏、搜索 220 带 kbd）。

## 2. Figma 插件 `figma-plugin/`

生成整个设计系统到打开的 Figma 文档：264 个双模式变量（Light/Dark + Density 集合）、
17 个文字样式、8 个效果样式、124 个颜色样式、7 组真实组件变体集、11 个页面 × 2 模式。

> 为什么是插件而不是 MCP：`figma-mcp-bridge` 的写入能力明确不支持组件 / 变量 /
> 样式（README: "intentionally limited — no components/instances, no variables/styles
> authoring"）。插件 API 是唯一能创建 `ComponentSet` 与多 mode `VariableCollection`
> 的路径。

**构建与验证**：

```powershell
cd design/figma-plugin
node build.mjs              # 拼接 src/*.js → dist/code.js（单文件，插件沙箱无模块系统）
node --check dist/code.js   # 语法检查
node smoke-test.mjs         # 模拟 Figma API 全量执行，抓运行时错误
node verify-structure.mjs   # 结构断言：页面/变量/组件/模式绑定完整性
```

**安装到 Figma**：

1. Figma → Plugins → Development → Import plugin from manifest
2. 选择 `design/figma-plugin/manifest.json`
3. 打开任意可编辑文件，运行插件，点进度条等它跑完

**产出 4 个页面**：`🎨 Tokens`（调色板规范）、`🧩 Library`（组件库）、
`🖥 Screens`（11 页 × 浅/深两列）、`🔍 Compare`（签名组件双模式对照）。

### 源码结构（按加载顺序编号，构建时按序拼接）

| 文件 | 职责 |
|---|---|
| `00-tokens.js` | 令牌源：双模式色板、字阶、间距、圆角、阴影、领域语义 |
| `01-engine.js` | 声明式渲染引擎：spec → Figma 节点，字面值先落、变量绑定后套 |
| `02-variables.js` | 变量构建器：Light/Dark 集合 + 语义别名（VARIABLE_ALIAS）+ Density |
| `03-styles.js` | 文字 / 效果 / 颜色样式 |
| `04-icons.js` | 16px 网格矢量图标（stroke 1.5，round caps） |
| `05-controls.js` | 控件库：Button / Badge / StatusPill / Priority / Input / TabBar / Avatar |
| `06-surfaces.js` | 共享外壳：sidebar + header + screen()，全部页面经此装配 |
| `07-domain.js` | 领域组件：工作项行 / 审批卡（后果预览）/ Session 遥测 / 计划 diff / 时间线 |
| `08-pages.js` | 页面层：11 个页面，每个页面双模式各渲染一次 |
| `09-main.js` | 编排入口：令牌 → 样式 → 令牌页 → 库 → 屏幕 → 对照页；幂等可重跑 |

### 关键实现约束

- **沙箱无模块系统**：所有源码必须是 IIFE + 全局（`BF`、`BF_CONTROLS`…），构建时
  拼成单文件 `dist/code.js`。
- **模式绑定必须显式**：Figma 变量按节点解析 mode。`bindMode()` 递归对每个帧调
  `setExplicitVariableModeForCollection`，否则浅/深两帧会渲染成同一个模式。
- **颜色是 `{r,g,b,a}` 0..1**，不是 hex 字符串；语义别名用
  `{type:'VARIABLE_ALIAS', id}`，且目标变量必须先创建。
- **字体**：设 `fontName` 前必须 `loadFontAsync`；Inter 的 Semi Bold 带空格，
  Roboto 不带 —— 按候选列表逐个 try。

## 3. 设计语言要点

**命题**：WorkMesh 的核心不是展示表格，而是让自主智能体的工作变得可读、可治理。

- **深色为英雄模式**：冷中性底（`#0B0C0E`），层次靠边框与表面阶梯而非阴影；
  浅色沿用产品原有暖中性（`#F7F7F5`）。
- **四个签名组件**：
  1. **审批卡后果预览** —— 先看清后果再决策：`写操作 · 不可逆 · 影响范围`；
  2. **计划稳定 ID** —— 领域不变量可视化：步骤跨版本保持 ID，移除可见而非静默消失；
  3. **Session 遥测条** —— 心跳 + 预算并排，预算 >85% 自动转红，陈旧会话红点区分；
  4. **优先级条形** —— 三格递增条 + 文字，色盲可读（不只靠色相）。
- **状态冗余编码**：色 + 形状 + 文字三通道，任何单通道缺失不损失信息。

## 4. 已知边界

- 原型数据为仿真数据，未接真实 API。
- 覆盖层 EvidenceDrawer / TeamAccessDrawer / ConsequencePreviewDialog 在原型中
  以「查看证据」按钮占位，未单独成页。
- 插件页面的看板列为静态快照，未做拖拽规格说明。
- 移动端断点（≤860px 侧边栏转抽屉 + 全套重排）在原型中已实现并经 390px 视口
  逐页实测；插件页面层未建模移动形态。
- 移动端表格卡片依赖 `data-th` 属性；**新增表格列时必须同步加 `data-th`**，
  否则手机上该列无标签。
- 预览服务需带 `Cache-Control: no-store`（仓库未内置服务器脚本），否则改版后
  可能验证到旧 CSS。
