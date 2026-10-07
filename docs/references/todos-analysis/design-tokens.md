# todos.dev 设计 token 实测

## 取值方式与范围

取证于 2026-10-07，2157 × 919 CSS px，DPR 1。颜色以 CSSOM 规则和 getComputedStyle 为准，布局以 getBoundingClientRect 为准，未用截图目测猜色。根主题类实际为 dark/light；明暗切换通过用户菜单完成，结束恢复 dark。工作台深/浅色、连接深/浅色均读取根变量，定时深色再验证一致。每个其他页面读取字体/根表面和主文本摘要。完整测量在 design-observations.json，完整可访问 CSS 规则在 css-evidence.json（1263 条、无拒绝访问的样式表）。

本文的刻度是「已观察到的计算值」，不等于源码完整设计规范。历史路由组件可能保留在 DOM，通用值应和当前截图交叉理解。空串明确区分未定义/未赋值，不能解释为黑色或零。未测试所有响应式视口，也没有主动产生 Toast、报错或加载任务。

## 1. 色彩

### 语义 CSS 自定义属性

表内原值是空格分隔 RGB 通道，通过 rgb(var(--...)) 使用。浅色是偏暖米色，深色是中性近黑。

| CSS 变量 | 浅色：原始 RGB / HEX | 深色：原始 RGB / HEX |
|---|---|---|
| --border-default | 226 219 209 / #e2dbd1 | 39 39 42 / #27272a |
| --border-strong | 206 198 187 / #cec6bb | 63 63 70 / #3f3f46 |
| --surface | 250 247 242 / #faf7f2 | 24 24 27 / #18181b |
| --surface-elevated | 253 250 246 / #fdfaf6 | 31 31 35 / #1f1f23 |
| --surface-hover | 242 237 230 / #f2ede6 | 31 31 35 / #1f1f23 |
| --surface-inset | 242 237 230 / #f2ede6 | 9 9 11 / #09090b |
| --surface-secondary | 242 237 230 / #f2ede6 | 31 31 35 / #1f1f23 |
| --surface-tertiary | 232 226 217 / #e8e2d9 | 39 39 42 / #27272a |
| --text-dim | 168 162 158 / #a8a29e | 82 82 91 / #52525b |
| --text-primary | 28 25 23 / #1c1917 | 250 250 249 / #fafaf9 |
| --text-secondary | 87 83 78 / #57534e | 212 212 216 / #d4d4d8 |
| --text-tertiary | 120 113 108 / #78716c | 113 113 122 / #71717a |

--surface 为整体背景，--surface-inset 为看板内凹背景；--surface-elevated 为浮层/弹窗；--surface-secondary 用于选中导航与次级表面。边框为 --border-default / --border-strong，文字层级为 --text-primary / secondary / tertiary / dim。没有取到品牌强调或业务状态专用的语义 --* 变量，它们使用工具类固定颜色。

### 强调与状态色

| 用途 | 浅色 | 深色 | 方式 / 证据 |
|---|---|---|---|
| 主按钮强调 | #4f46e5 | #4f46e5 | 工作台「去设置」计算背景，bg-indigo-600 |
| 次级强调/焦点 | #6366f1 | #6366f1 | text-indigo-500 图标计算值；focus ring CSS |
| 待开始 / 中性 | #9ca3af | #9ca3af | 看板 8×8 圆点计算背景 |
| 执行中 | #3b82f6 | #3b82f6 | 看板圆点计算背景 |
| 待处理 / 警告 | #f59e0b | #f59e0b | 看板圆点计算背景 |
| 已完成 / 成功 | #22c55e | #22c55e | 看板圆点计算背景 |
| 错误/危险色候选 | #ef4444 | #ef4444 | CSS .bg-red-500 / .text-red-500 声明；没有主动触发错误态，不声称实测错误 Toast |
| 浅/深 hover 附加覆盖 | rgba(0,0,0,.04) | rgba(255,255,255,.06) | CSS hover 规则，适用组件依类名而定 |

--tw-ring-color 的根默认是 #3b82f680（50% 蓝），--tw-ring-offset-color 为 #fff；这是框架默认，不应当直接当作所有产品组件的可见焦点色。

### 其余所有已发现的颜色相关 --tw-* 根变量

| 变量 | 浅色根计算值 | 深色根计算值 |
|---|---|---|
| --tw-backdrop-opacity | 空串（根未赋值） | 空串（根未赋值） |
| --tw-bg-opacity | 空串（根未赋值） | 空串（根未赋值） |
| --tw-border-opacity | 空串（根未赋值） | 空串（根未赋值） |
| --tw-divide-opacity | 空串（根未赋值） | 空串（根未赋值） |
| --tw-drop-shadow | 空串（根未赋值） | 空串（根未赋值） |
| --tw-gradient-from-position | 空串（根未赋值） | 空串（根未赋值） |
| --tw-gradient-to-position | 空串（根未赋值） | 空串（根未赋值） |
| --tw-gradient-via-position | 空串（根未赋值） | 空串（根未赋值） |
| --tw-ring-color | #3b82f680 | #3b82f680 |
| --tw-ring-offset-color | #fff | #fff |
| --tw-ring-offset-shadow | 0 0 #0000 | 0 0 #0000 |
| --tw-ring-opacity | 空串（根未赋值） | 空串（根未赋值） |
| --tw-ring-shadow | 0 0 #0000 | 0 0 #0000 |
| --tw-shadow | 0 0 #0000 | 0 0 #0000 |
| --tw-shadow-colored | 0 0 #0000 | 0 0 #0000 |
| --tw-text-opacity | 空串（根未赋值） | 空串（根未赋值） |

这些变量不少只在具体组件上赋值。当前加载 CSS 中相应的非空声明全集如下（作用域和类名请查 css-evidence.json，不能当作全局统一 token）：

| 变量 | 可访问 CSS 中所有非空声明值 |
|---|---|
| --tw-border-spacing-x | 0 |
| --tw-border-spacing-y | 0 |
| --tw-ring-color | #3b82f680；rgb(255 255 255/var(--tw-ring-opacity,1))；rgb(99 102 241/var(--tw-ring-opacity,1))；rgb(var(--surface-secondary) / var(--tw-ring-opacity,1)) |
| --tw-ring-offset-color | #fff |
| --tw-ring-offset-shadow | 0 0 #0000；var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color) |
| --tw-ring-shadow | 0 0 #0000；var(--tw-ring-inset) 0 0 0 calc(3px + var(--tw-ring-offset-width)) var(--tw-ring-color)；var(--tw-ring-inset) 0 0 0 calc(1.5px + var(--tw-ring-offset-width)) var(--tw-ring-color)；var(--tw-ring-inset) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color) |
| --tw-shadow | 0 0 #0000；0px 1px 4px #00000059；0px 12px 38px #00000059；0 10px 30px -8px #00000047；0 10px 30px #0000002e；0 18px 40px -8px #00000047；0 24px 50px -12px #00000024；8px 0 24px -4px #0000002e；0px 4px 10px #00000059；0px 1px 1px #00000059 |
| --tw-shadow-colored | 0 0 #0000；0px 1px 4px var(--tw-shadow-color)；0px 12px 38px var(--tw-shadow-color)；0 10px 30px -8px var(--tw-shadow-color)；0 10px 30px var(--tw-shadow-color)；0 18px 40px -8px var(--tw-shadow-color)；0 24px 50px -12px var(--tw-shadow-color)；8px 0 24px -4px var(--tw-shadow-color)；0px 4px 10px var(--tw-shadow-color)；0px 1px 1px var(--tw-shadow-color)；0 0 var(--tw-shadow-color) |
| --tw-divide-opacity | 1 |
| --tw-border-opacity | 1 |
| --tw-bg-opacity | 1 |
| --tw-text-opacity | 1 |
| --tw-ring-opacity | 1 |

--css-interop、--css-interop-darkMode、--css-interop-nativewind 属于互操作元数据，--expo-image-timing 属于图像时序，不是颜色 token。

## 2. 字体

产品可见文字计算字体族以 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji" 为主。根/容器另有 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif 与 emoji fallback。计算字体族声明不能证明每个中文字符实际用 Inter 渲染，实际字形 fallback 未能取到。

| 项目 | 已观察值 | 取值说明 |
|---|---|---|
| 字号 | 8、10、11、12、13、14、15、16 px | 8 px 用于 FREE 徽标；12 px 导航与大量文案；14/15 px 标题/输入；13 px 出现在管理页说明；16 px 含容器默认值 |
| 字重 | 400、500、600 | 正文、导航/按钮、标题层次 |
| 行高 | 11、16、18、20、24 px，normal | FREE 徽标 11；12 px 文字常用 16；连接说明可见 18；14 px 标题常用 20；根 16/24 |

未能取到正式字号 token 变量和完整类型规范；上表为 DOM 计算值集合，不能把根容器默认字号当作所有正文大小。

## 3. 间距、圆角、阴影与边框

| 类型 | 实测值 / 规则 | 证据 |
|---|---|---|
| 常见间距刻度 | 2、4、6、8、10、12、16、20、24、40 px | padding / gap 计算值组合；2/4 px 用于徽标与紧凑控件，16/24 px 用于页面与空状态 |
| 圆角 | 2、4、5、6、8、12 px；圆形 9999 px | 快捷键小框、按钮、Tab、卡片、看板、头像/状态点；5 px 在连接组件出现 |
| 导航行 | 外行 36 px；可点击内块 32 px；左右 8、上下 6 px；图文 gap 10 px | 计算框尺寸和 padding |
| 主按钮 | padding 6px 12px；radius 6px | 工作台去设置计算样式 |
| 常规边框 | 1 px solid | 标题栏、看板、卡片/输入等；容器也有 0 px 默认边框 |
| 页面表面阴影 | 大部分 none | 工作台/定时/连接深色计算值 |
| 浅色小控件阴影 | rgba(0,0,0,.05) 0px 1px 2px 0px | 浅色连接页面计算样式 |
| 指南弹窗阴影 | rgba(0,0,0,.35) 0px 25px 50px -12px | 弹窗计算样式；圆角 12px |

没有取到正式 spacing/radius CSS token 变量；这些是计算样式刻度。阴影的其他组件变体及浅色弹窗阴影未能取到。

## 4. 布局与断点

桌面整体为侧栏 + 可变主区，侧栏实测 240 px；顶栏高 44 px。初始主区剩余 1917 px，主题/总管与看板近似各半，以可拖动分隔线分栏；四列看板超出右侧半屏宽度，末列需要横向查看或收起总管聊天。全宽看板四列都可见（18）。总管独立显示时正文/输入区居中，实测宽 864 px 左右；这是当前 DOM 几何值，不是已确认全局最大宽度。

管理页面采用窄内容居中，连接页面为三列服务卡片。定时空状态 max-w-md 实测 448 px。加载 CSS 可读取 max-w-3xl=48rem（768 px）、max-w-4xl=56rem（896 px）、max-w-md=28rem（448 px）、max-w-sm=24rem、max-w-xs=20rem、960px 及多种局部上限；没有一个能据此认定是全站统一内容最大宽度。

CSS media 实测包含 640、768、1024、1280、1536 px 的 width >= 断点，以及 width < 768 px、prefers-color-scheme: dark、prefers-reduced-motion: reduce、display-mode: standalone and pointer: fine。container 对应 max-width 640/768/1024/1280/1536 px。这些为已加载 CSS 规则，未逐个调整视口验证页面重排。

## 5. 通用组件清单

| 组件 | 用途与视觉特征 |
|---|---|
| 侧栏导航项 | 单色线性图标 + 12px 文本；浅次级背景表示当前项；快捷键靠右 |
| 折叠分组 | 项目/资源用小箭头与缩进组织子入口 |
| 页面标题栏 | 44px 高，细下边框；返回、居中标题、右侧操作 |
| 主/次按钮 | 靛蓝填充主按钮、6px 圆角；次按钮为透明/表面边框 |
| 输入框/消息输入 | 多行文本区域，表面底色、1px 边框、圆角；语音/附件/提及/发送图标位于底部 |
| Tab / 分段选择 | 连接分类、用量、Agent/机器详情；紧凑文本，选中表面底色 |
| 下拉/弹出面板 | 搜索范围和筛选/用户菜单，浮层表面与局部阴影 |
| 复选框 | 看板创建者筛选，细边框小方框；未改变选中值 |
| 标签/chip | FREE、订阅等级、模型名/状态；小字号与表面底色 |
| 头像/状态点 | 用户/Agent 圆头像；看板阶段 8×8 有色圆点 |
| 模态弹窗 | 搜索、设置引导、看板指南；背景遮罩、抬升表面、关闭图标，指南 520×450px、12px 圆角 |
| 卡片 | 连接服务、机器、模型、Agent；标题/品牌图标/描述/状态组成，细边框和圆角 |
| 看板列 | 四阶段、数量、空状态；整列内凹背景与圆角；执行中/待处理带列内筛选 |
| 组织图 | 总管与 worker 用连线呈现上下级分派关系（设置引导） |
| 统计卡/日历热力图 | Tokens/预估费用/运行/调用，日历方格配少/多图例 |
| Tooltip / 快捷键提示 | 深色小浮层，标示导航/面板操作名称与组合键 |
| 空状态 | 小图标、标题、说明、CTA/文档与总管建议；未见大型专属插画 |
| 表格 | 真实任务表格未观察；安装官网演示存在任务/负责人表格，不能当作团队工作台列表视图证据 |
| 抽屉 / Toast | 未观察到，外观未能取到 |

## 6. 交互与加载态

CSS hover 支持 surface-hover / surface-secondary 背景及 border-strong；active 支持表面背景，靛蓝主按钮 active 使用 indigo-700。CSS focus-visible 有 1px inset ring、indigo-500（#6366f1），同时存在 html[data-suppress-focus-ring] 的条件性 outline:none；未做完整键盘可访问性测试，不能确认每个组件采用哪一种。提示层存在 group-hover 显示与 400ms delay 规则；真实点击后 tooltip 已截图。切分栏有过渡动画，16 保留了切换过程；18 已补拍稳定全宽状态。

| 快捷键 | 界面标注含义 / 来源 |
|---|---|
| Ctrl K | 全部搜索；侧栏/搜索面板 |
| Ctrl P | 搜索任务；搜索面板 |
| Ctrl J | 搜索主题；搜索面板 |
| Tab | 切换搜索范围；搜索面板 |
| N | 新任务；侧栏/看板指南 |
| Ctrl Alt B | 隐藏/展开看板；指南 |
| Ctrl Shift Enter | 看板全屏/还原；指南与 tooltip |
| Ctrl Alt S | 任务页同步到机器；指南，未执行 |
| Ctrl / | 全部快捷键；指南 |
| Ctrl B | 展开侧栏；安装页产品演示标注，未在真实工作台验证 |
| Ctrl / ⌘ + 点选 | 多选卡片；指南，未操作真实任务 |

页面导航后个别 DOM 首次只出现标题/Tab，随后异步填充内容；未捕获可靠的 spinner/skeleton 外观。截图可见正式空状态，但不能把载入中的空白当成实体不存在。用户菜单原位切主题，结束已恢复深色。未发消息、创建对象、改业务数据、切换语言、修改账号或安装软件。
