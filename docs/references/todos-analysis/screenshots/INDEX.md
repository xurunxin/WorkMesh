# 截图索引

2026-10-07，Chrome RunXin，RunXin Xu's team。27 张原尺寸 PNG，均为 2157 × 919，DPR 1。PNG 通过 Chrome Page.captureScreenshot 原生导出；00 在任何页面操作之前先读取并截图，随后在未变的原始状态导出 PNG。所有截图位于本目录。

**00 的文件名按用户要求保留，但首次实际界面没有创建 Agent 弹窗。该文件展示工作台原始状态，不是创建 Agent 弹窗，不能据文件名推断内容。**

| 文件名 | 页面 | 页面 URL | 这一张展示了什么 | 备注（主题/弹窗） |
|---|---|---|---|---|
| [00-create-agent-modal.png](00-create-agent-modal.png) | 首次屏幕 | https://todos.dev/app/ | 初始暗色总管 + 看板，当前没有创建 Agent 弹窗 | 暗色；无弹窗；与任务所述初始状态不同 |
| [01-workbench-board-dark.png](01-workbench-board-dark.png) | 工作台 | https://todos.dev/app/ | 总管聊天与四阶段看板分栏；初始空状态 | 暗色；无弹窗，最右列局部超出视口 |
| [02-schedules.png](02-schedules.png) | 定时 | https://todos.dev/app/schedules | 定时空状态和自然语言配置引导 | 暗色；无弹窗 |
| [03-connections.png](03-connections.png) | 连接 | https://todos.dev/app/resources/connections | 全部分类与 18 个未连接服务卡片 | 暗色；无弹窗 |
| [04-skills.png](04-skills.png) | 技能 | https://todos.dev/app/resources/skills | SKILL.md 工作手册解释与空状态 | 暗色；无弹窗 |
| [05-usage-tokens.png](05-usage-tokens.png) | 用量 | https://todos.dev/app/resources/usage | Token 指标、日期/运行时筛选和日历热力图 | 暗色；无弹窗 |
| [06-usage-subscription.png](06-usage-subscription.png) | 订阅用量 | https://todos.dev/app/resources/usage?tab=subscription | Codex 账号额度、登录机器、每周窗口 | 暗色；账号已由产品脱敏 |
| [07-machines.png](07-machines.png) | 机器 | https://todos.dev/app/resources/machines | Todos 托管机器与 DarkFlame / 6 并发 | 暗色；无弹窗 |
| [08-machine-detail.png](08-machine-detail.png) | 机器详情 | https://todos.dev/app/resources/machines/6DOlLniZ0sqBYGHeIhRMq?name=DarkFlame | tds 版本、在线、目录、远程 shell 字段 | 暗色；未操作开关/移除 |
| [09-model-providers.png](09-model-providers.png) | 模型服务 | https://todos.dev/app/resources/providers | 内置 pi / Codex / OpenCode，Todos 和 DeepSeek | 暗色；无弹窗 |
| [10-secrets.png](10-secrets.png) | 密钥 | https://todos.dev/app/resources/secrets | 环境变量注入、团队/项目覆盖规则和空状态 | 暗色；未输入凭证 |
| [11-install-app.png](11-install-app.png) | 安装 App | https://todos.dev/zh/install | 下载页面首屏和官网产品演示 | 暗色；演示任务不是当前团队对象 |
| [12-new-task-entry.png](12-new-task-entry.png) | 新任务入口 | https://todos.dev/app/ | 点击新任务后的实际屏幕，没有表单出现 | 暗色；入口响应受限，具体原因未能取到 |
| [13-search-panel.png](13-search-panel.png) | 搜索 | https://todos.dev/app/ | 搜索输入、全部/任务/主题、导航快捷入口 | 暗色；搜索弹窗 |
| [14-user-menu.png](14-user-menu.png) | 用户菜单 | https://todos.dev/app/ | 身份、外观、帐号/API 密钥/MCP 等入口 | 暗色；用户浮层 |
| [15-workbench-light.png](15-workbench-light.png) | 工作台 | https://todos.dev/app/ | 浅色总管/看板分栏 | 浅色；之后已恢复深色 |
| [16-board-full-light.png](16-board-full-light.png) | 工作台分栏切换 | https://todos.dev/app/ | 浅色切换全宽看板过程，左边仍有退出中的聊天区域 | 浅色；过渡态，不用于精确全宽尺寸证据 |
| [17-connections-light.png](17-connections-light.png) | 连接 | https://todos.dev/app/resources/connections | 浅色完整连接服务目录 | 浅色；加载完成后补拍，之后已恢复深色 |
| [18-board-full-dark.png](18-board-full-dark.png) | 工作台全宽看板 | https://todos.dev/app/ | 收起总管后四个状态列完整可见 | 暗色；稳定状态补拍 |
| [19-chief-chat.png](19-chief-chat.png) | Chief / 总管 | https://todos.dev/app/ | 隐藏看板，独立显示总管空状态和输入区 | 暗色；未发送消息 |
| [20-setup-panel.png](20-setup-panel.png) | 完成设置 | https://todos.dev/app/ | 机器/运行时/团队/项目步骤及总管—worker 关系图 | 暗色；设置引导弹窗，未推进创建项目 |
| [21-team-agents.png](21-team-agents.png) | 团队 | https://todos.dev/app/team | 团队计划、2 成员、总管和 worker | 暗色；未点击创建 Agent |
| [22-agent-detail.png](22-agent-detail.png) | worker 详情 | https://todos.dev/app/resources/agents/ylZRCk9jdHaXeh5AuWsvv?name=worker | 职责、默认 skill、Codex 运行时、模型与思考强度 | 暗色；未修改字段/删除 Agent |
| [23-board-guide.png](23-board-guide.png) | 看板指南 | https://todos.dev/app/ | 创建任务的两个入口及快捷键 | 暗色；只读指南弹窗 |
| [24-board-guide-states.png](24-board-guide-states.png) | 看板指南 | https://todos.dev/app/ | 四阶段与按钮、菜单、拖拽说明 | 暗色；只读指南弹窗 |
| [25-board-filters.png](25-board-filters.png) | 看板筛选 | https://todos.dev/app/ | 创建者选项和暂无项目 | 暗色；筛选浮层，未勾选 |
| [26-workbench-restored.png](26-workbench-restored.png) | 工作台结束状态 | https://todos.dev/app/ | 原始深色主题、侧栏展开、总管/看板分栏 | 暗色；已关闭面板，原标签保留 |

## 未能取得的指定画面与原因

| 指定画面 | 观察结果 / 原因 | 替代证据 |
|---|---|---|
| 当前创建 Agent 弹窗 | 首次连接就未出现。没有重新点击创建入口，避免超出只读边界 | 00 首次实际状态；20 设置引导、21 已有团队 |
| 工作台列表/表格视图 | 可见控件只有看板、显示隐藏、分栏、筛选，未找到列表切换。不能断言产品在所有状态下不存在 | 01、18；安装官网演示含任务/负责人表格但不计真实列表 |
| 已存在任务详情 | 四列均 0，没有可打开任务；未新建补齐 | 18、23、24 |
| 项目列表独立页面 | 项目是导航折叠分组，目前仅新建项目；点击不改变 URL | 26 侧栏、25「暂无项目」、20 创建项目未完成 |
| 项目详情/任务列表 | 没有现有项目，无法只读打开 | 同上 |
| 资源独立页面 | 资源是折叠分组，点击只展开/收起用量/机器/模型服务/密钥，URL 不变 | 26 导航树，05—10 子页面 |
| 新任务表单 | 点击入口后未弹出表单，仅显示入口 tooltip。具体原因未能取到，当前也未完成项目设置；未反复试探 | 12 |
| 总管真实消息历史 | 没有现有主题；保留空状态，未给 Chief 发消息 | 19 |

## 完成状态

已恢复原深色主题，项目/资源导航分组展开，恢复总管与看板分栏；原标签 570441147 留在 https://todos.dev/app/，没有关闭。未创建/编辑/删除/归档任何业务对象，未发送消息，未修改账号/语言/权限，未安装 App。实测原始资料在工作目录 JSON 文件，中文分析见 ../ui-inventory.md 与 ../design-tokens.md。
