# todos.dev 界面清单

取证日期：2026-10-07（Asia/Shanghai）。Chrome RunXin，团队 RunXin Xu's team，FREE，简体中文。截图视口 2157 × 919，DPR 1。原主题为深色，结束恢复深色，原标签页保留在 /app/。所有观察来自当前页面 DOM、可访问树、计算样式和截图；未读取后台私有状态或调用业务接口。

## 取证边界与缺口

首次连接时没有创建 Agent 弹窗，00-create-agent-modal.png 按要求保留该文件名，内容实际为首次工作台屏幕，不能当作弹窗证据。团队已有总管和 worker、在线机器和模型配置，但没有项目、任务、主题会话、技能、密钥或定时。项目详情和任务详情没有可打开对象；没有通过新建数据补齐。新任务入口点击后没有出现表单，准确原因未能取到，和未完成项目设置同时存在。可见看板没有列表/表格视图切换，不能断言所有产品状态都不存在该功能。「项目」「资源」点击仅折叠导航，不改变 URL，没有观察到独立聚合页面。安装页展示的 Inkwell 任务为官网演示，不是当前团队真实数据。

## 1. 全局信息架构

左侧导航完整树：

| 分组 | 中文入口 | 英文含义推测 | 实际目标路径 / 行为 |
|---|---|---|---|
| 顶部团队 | RunXin Xu's team、FREE | Team / Plan | 团队名与免费计划徽标；团队实际页另由搜索到达 /app/team |
| 主导航 | 搜索 | Search / Command palette | 原 URL 上打开搜索弹窗 |
| 主导航 | 新任务 | New task | /app/ 上点击未展开表单；未提交 |
| 主导航 | 工作台 | Workbench | /app/ |
| 主导航 | 定时 | Schedules | /app/schedules |
| 主导航 | 连接 | Connections | /app/resources/connections |
| 主导航 | 技能 | Skills | /app/resources/skills |
| 项目（折叠分组） | 项目 | Projects | 仅折叠/展开，不导航 |
| 项目 | 新建项目 | New project | 未点击，目标未能取到；无现有项目子项 |
| 资源（折叠分组） | 资源 | Resources | 仅折叠/展开，不导航 |
| 资源 | 用量 | Usage | /app/resources/usage |
| 资源 | 机器 | Machines | /app/resources/machines |
| 资源 | 模型服务 | Model providers | /app/resources/providers |
| 资源 | 密钥 | Secrets | /app/resources/secrets |
| 底部 | 安装 App | Install app | /zh/install，在同一标签导航 |
| 底部用户区 | RunXin Xu | User menu | 原 URL 上打开用户菜单 |

工作台顶栏分为主题/总管区和看板区。前者有「新主题」、加号、总管设置；后者有返回、看板、指南、全局筛选、总管聊天展开/收起与看板显示控制。管理页面使用返回 + 居中页名 + 右侧新建或自定义连接的结构。工作台没有独立的右上角用户头像；用户入口位于左栏底部。用户菜单包含姓名、邮箱、外观（浅色/深色）、帐号、API 密钥、MCP、反馈、新功能、快捷键。未打开账号修改或凭证操作。

## 2. 页面清单与关键交互

以下路径均以 https://todos.dev 为前缀。

| 页面 / 面板 | URL | 主要区块 | 关键交互与字段（存在不代表已操作） |
|---|---|---|---|
| 工作台 | /app/ | 总管主题对话、设置引导、看板 | 消息输入、语音、附件、提及、发送；主题选择/新主题；看板四列与计数、最近 7 天、全局/列内筛选、分栏收起 |
| 定时 | /app/schedules | 定时、空状态 | 新建、新建定时、查看文档；周期/指定时间重新运行任务，确认/审核关口暂停 |
| 连接 | /app/resources/connections | 引导、分类 Tab、服务卡片 | 自定义连接、建议添加连接；全部、已连接、项目管理、文档、沟通、监控、数据库、云服务、支付、自定义；卡片名称、说明、分类、连接状态 |
| 技能 | /app/resources/skills | 技能、空状态 | 新建、添加技能、查看文档；说明 SKILL.md 文件夹及授予 Agent |
| 用量（Token） | /app/resources/usage | Token 用量 / 订阅用量、日期筛选、统计、日历热力图 | 近 7 天、30 天、一年、运行时筛选；Tokens、预估费用、运行、模型调用；少/多图例；当前全部为 0 或 — |
| 用量（订阅） | /app/resources/usage?tab=subscription | coding agent 额度窗口 | Codex、脱敏账号、pro、登录机器 DarkFlame、每周窗口、重置倒计时、3%、更新时间 |
| 机器 | /app/resources/machines | Todos 托管机器、用户机器列表 | 托管机器未启用；DarkFlame、Codex/OpenCode 图标、6 并发；添加机器 |
| 机器详情 | /app/resources/machines/6DOlLniZ0sqBYGHeIhRMq?name=DarkFlame | 信息 / 构建 | 名称、机器 ID、tds 版本 0.1.59、在线=是、工作目录、远程 shell 开关、移除机器；未操作开关或移除 |
| 模型服务 | /app/resources/providers | 内置 (pi) / Codex / OpenCode | 新建；Todos（内置）9 模型、未启用；DeepSeek、API 密钥、4 模型；Agent 列表和总管设置入口说明 |
| 密钥 | /app/resources/secrets | 密钥、空状态 | 新建、添加密钥、文档；团队/项目密钥覆盖规则；安全输入卡 |
| 安装 App | /zh/install | 下载 Todos、在每台设备上使用 Todos、桌面端、移动端/网页/命令行、把 Todos 放到主屏幕 | Windows/macOS/Linux 下载；Apple Silicon/Intel、AppImage/.deb；安装方法、网页版、CLI 安装指南；未下载或安装 |
| 搜索 | /app/（弹窗） | 搜索框、范围、前往 | 搜索任务、项目、成员…；全部/任务/主题；工作台、定时、团队、连接、技能、密钥、机器、模型服务、帐号、API 密钥 |
| 用户菜单 | /app/（浮层） | 身份、外观、工具入口 | 浅色/深色切换、帐号/API 密钥/MCP/反馈/新功能/快捷键 |
| 完成设置 | /app/（弹窗） | 添加机器、添加运行时、设置团队、创建项目 | 设置团队展示总管和 worker；下一步、创建 Agent 可见，未使用；流程停在项目创建之前 |
| 团队 | /app/team | 团队名、成员、网格/组织图 | 设置、2 个成员、FREE、升级；grid/chart Tab；总管 gpt-6.1-sol · 高；worker gpt-6-luna · 最高；创建 Agent 可见但未点击 |
| worker 详情 | /app/resources/agents/ylZRCk9jdHaXeh5AuWsvv?name=worker | 概览 / 记忆 / 权限、进行中 | 名称、职责、默认 skill、运行时 Codex、模型 GPT-6-Luna、思考强度最高、active、创建日期；无进行中任务；删除 Agent 可见但未操作 |
| 看板指南 | /app/（弹窗） | 创建任务、任务阶段与推进、筛选与识别、对话与看板并排、在本机预览改动 | 5 步，只读上/下一步、关闭；说明卡片操作、专属分支和本机同步 |
| 看板全局筛选 | /app/（浮层） | 创建者、项目 | 我创建的、总管或 Agent 创建的、其他成员创建的；暂无项目；未勾选 |

连接服务完整目录：Linear、Notion、Jira / Confluence、Slack、Sentry、Datadog、PostHog、Mixpanel、Amplitude、Supabase、Neon、Cloudflare、Netlify、Vercel、Railway、Expo、DigitalOcean、Stripe，全部显示「未连接」。

## 3. 核心实体与关系

| 实体 | 界面含义与出现位置 | 界面证据支持的关系 |
|---|---|---|
| Task | 看板的一张卡片，真实任务为 0；指南解释生命周期 | 可由人通过新任务或由总管主题对话创建；可归属项目；Agent 执行；每个任务有专属 Git 分支；完成需确认/验收 |
| Project | 左栏项目分组、全局筛选、设置流程 | 任务归属/筛选维度；项目密钥进入项目任务并覆盖同名团队密钥；真实项目为空，更多字段未能取到 |
| Topic | 总管对话的主题，新主题与搜索「主题」范围 | 主题对话描述需求可自动创建任务；可将任务卡片拖入对话成为任务标签；无真实主题消息 |
| Agent | 团队网格/组织图及 worker 详情 | 总管分派工作；职责注入每个任务；默认 skill 自动携带；模型、思考强度与运行时独立配置 |
| Chief | 中文「总管」，工作台聊天与团队总管节点 | 规划并分派任务，可按自然语言协助组团队、装技能、设定时、改模型；需要可运行机器和可用模型才能接收消息 |
| Machine | 机器页及 DarkFlame 详情 | 运行 tds，承接任务与 CLI；远程 shell 允许已授权 Agent 执行命令；本机同步接收任务分支提交 |
| Model provider | 模型服务页 | 给团队添加可用模型；Agent 模型在其详情指定，总管模型在总管设置指定 |
| Connection | 连接目录 | 让 Agent 读取外部工单、文档、报错、数据库；授权与已连接后的细节未观察 |
| Skill | 技能页、Agent 默认 skill | 包含 SKILL.md 的工作手册文件夹，授予后 Agent 在合适任务主动使用；默认 skill 无需 @ 引用 |
| Schedule | 定时页 | 周期/指定时间从任务描述开始全新运行；到确认/审核关口暂停交给负责人 |
| Resource | 导航「资源」分组及 /app/resources/ 路径 | 基础设施/能力入口集合；未观察到独立 Resource 对象的字段和生命周期 |
| Usage | 用量页两种视图 | Token/费用/运行/调用与运行时关联；订阅额度和机器上登录的 coding agent 账号关联 |

可见状态与分类（仅列界面观察，不声称后台枚举完整）：

- 看板阶段：待开始、执行中、待处理、已完成。已完成默认最近 7 天。
- 指南与筛选细分：规划、构建、待确认的方案、待验收的改动；指南另外描述构建失败、等待回复、运行中（这些为文案描述，未取到对应真实任务状态值）。
- Agent：active；任务摘要：进行中。机器在线：是；托管机器：未启用。模型：未启用。连接：未连接，筛选范围含已连接。
- 成员思考强度当前值：高、最高；未展开选择器，因此不推测其他选项。
- Task 按钮文案由指南提供：开始、确认、完成、重试、回复、重跑；菜单还描述中断、编辑、复制、复制链接、关闭、删除、重开。未执行这些动作。
- 连接分类：项目管理、文档、沟通、监控、数据库、云服务、支付、自定义。

## 4. 空状态与引导文案

| 场景 | 实际文案 |
|---|---|
| 工作台 | 「选择一个主题开始」；「完成设置（机器、模型、Agent 团队和第一个项目），就可以开始和总管协作了。」 |
| 总管建议 | 「介绍一下 Todos 这个产品怎么用」「帮我组建 Agent 团队」「如何让 Agent 在我的电脑上写代码？」 |
| 待开始 | 「没有等待开始的任务」 |
| 执行中 | 「没有执行中的任务」 |
| 待处理 | 「没有等你处理的任务」 |
| 已完成 | 「最近 7 天没有完成的任务」 |
| 定时 | 「尚无定时。」；「按周期或在指定时间自动重新运行任务。每一轮都会依据任务描述从头开始一次全新运行，到达确认或审核关口时暂停，交由负责人接手。」；「也可以直接告诉总管某个任务要多久重跑一次，它会替你写好规则。」 |
| 技能 | 「尚无技能。」；「技能是写给 Agent 的工作手册：一个包含 SKILL.md 的文件夹，用于将可复用的流程传授给 Agent。授予后，Agent 会在合适的任务中主动使用。」；「你也可以直接让总管从 GitHub 安装技能，或帮你制作新技能。」 |
| 密钥 | 「尚无密钥。」；「密钥以环境变量注入任务的 shell。团队密钥对所有项目生效；项目密钥只进入该项目的任务，并覆盖同名的团队密钥。」；「也可以让总管添加：它会开一张安全输入卡填写值，值不会进入对话。」 |
| 用量 | 「该时段内没有模型调用。」；「以下数据不含 Cursor 和 Devin，由于它们的 CLI 不上报 token 用量。」 |
| 项目筛选 | 「暂无项目」 |
| Agent 任务 | 「暂无进行中的任务」 |
| 完成设置 | 「总管接收消息之前，团队需要一台可运行的机器和一个可用的模型。」 |

引导模式：小图标 + 空状态标题 + 功能解释 + 主行动/文档 + 可交给总管的自然语言替代路径。工作台先展示设置依赖，再展示提示问题；人工确认/审核关口被明确写进自动化说明。

## 5. i18n 观察

导航和核心任务阶段均为中文；英文主要留给产品/平台和技术术语：Todos、Agent、Chief 的中文映射总管、worker、FREE、active、Token/Tokens、coding agent、Codex、OpenCode、DeepSeek、pi、API、MCP、CLI、shell、SKILL.md、Git/GitHub，以及全部连接服务品牌。模型名称在团队卡片使用 gpt-6.1-sol / gpt-6-luna，在详情使用 GPT-6-Luna；订阅等级为 pro。团队名保留 RunXin Xu's team，日期以中文显示。安装页含 macOS、Windows x64、Linux、Apple Silicon、Intel、AppImage、Debian / Ubuntu 等技术名。CSS/可访问树中 grid/chart 与 Toggle theme/Switch language 为英文标签，属于辅助信息，不是所有用户可见的中文导航。

## 证据附件

截图逐项见 screenshots/INDEX.md。observations.json 保存每次截图附近的 DOM/文案/URL（重复文件名以最后一次为准）；design-observations.json 保存计算样式；css-evidence.json 保存 1263 条当前加载 CSS 规则；component-observations.json 保存弹窗和 hover/focus 规则；board-guide-observations.json 保存指南后续步骤。部分 DOM 保留隐藏或正在退出的路由组件，实体归属以当前 URL 与截图为准，不能将残留 DOM 当作当前可见功能。
