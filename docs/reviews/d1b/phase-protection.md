# D1b 阶段保护与清旧门禁

本文件为实施前置设计。当前产品消费、主题行为与 `theme.test.tsx` 的冻结保护尚未改动；完整映射在 `apps/web/features/navigation/theme-token-migration.json`。计划正文不变，当前绑定读取方式及来源限制见 `plan-source.json`。

## 消费身份与阶段账本

复用 `theme.test.tsx` 的 `parseTokenDeclarations`、`sourceWithoutComments` 和 `runtimeTokenDefinitions`，将冻结断言演进为迁移账本，保留 `theme-token-baseline.json` 的原件。每个消费使用稳定身份：文件、CSS 选择器／TS 表达式、属性、原表达式归一内容及同表达式出现序号；行号仅定位证据。CSS 内部组件、别名／derived、inline style、字符串、嵌套 fallback、测试断言和活动夹具均纳入。实例变量的定义和引用分开，不能把它们当旧槽删除。

`verify-preflight.mjs` 给出当前源码的保守词法清单与源码双字节指纹，不把该清单冒称 AST 阶段账本已实现。进入首面前，在扫描辅助文件中使用 TypeScript AST 和 CSS 解析器按上述身份建立可执行账本；字符串常量、模板、CSS Module、fallback 及定义 API 的生产者都必须可追溯。原引用即使在 fallback 中仍算旧消费。历史文档、冻结 PNG／基线 JSON、映射的退役名称元数据明确排除；正在执行的夹具、断言表达式不得排除。

账本分 `unmigrated`、`scoped`、`migrated`。未迁项原作用域、表达式和值不变；scoped 项同时保存旧分支、新分支、映射目标、矩阵边界及批准的阶段记录，不能只减计数。migrated 项必须消除旧消费且新目标匹配映射。新增未知旧消费、未批准区域切换和已迁项回退均失败。全局样式中的选择器只有在其所有使用点获准后才可统一，阶段中用局部边界分支保护未迁区域；共享组件 inline style 按实例边界选择，不进行无条件全局替换。

## 声明与依赖

115 个旧槽各有显式目标和全部 175 条作用域声明。名称冲突默认失败；唯一批准合并是 `--wm-muted` 消费迁到 secondary，声明由 `--wm-text-muted` 单独负责，禁止生成 secondary 的自引用。候选名称 `--wm-ref-danger-candidate` 另列退役项；正式危险色来源是用户批准候选，不是错误态实测。

18 个既有暗色 ref 别名单独列出同值重绑定；canvas/card/elevated、hover/secondary、tertiary/dim 不混并暗色。旧槽没有暗色覆盖时保留继承其原 root 值；同值不仅验证字面值，也验证 browser computed style。panel/border/gradient/focus-ring 公式在 root、显式 light/dark、compact 及 light/dark+compact 边界重声明；light 子树重声明亮色新槽，避免继承暗色父级的解析结果。组合及嵌套主题验证来源 token 在本层解析，不继承父层已解析的结果。

`--wm-status-color` 保留 `workflow.tsx`／`work-item.tsx` 的实例生产者及服务器自定义颜色，fallback 转到新语义槽；`--wm-dismissal-depth` 保留 overlay 的生产者、清除与消费。所有依赖（包括嵌套 fallback）要求可达声明或登记生产者；任一作用域中未知依赖、自引用或循环失败。AgentWorkspace 的七类非 wm fallback 与硬编码值单列，不漏扫。

## 删除前置与失败用例

旧声明仍有消费或别名依赖时必须拒绝删除。测试覆盖删除 canvas 而 panel/ref 别名仍引用、未知嵌套 fallback、A/B 循环、muted 合并误输出自引用及 runtime 生产者缺失；不能删除原行为断言来使测试通过。

只有矩阵全部适用行的迁移前／后截图、diff、实际 computed／焦点／导航与人工视觉意见通过，且全局对全部组合复验通过，才移除临时分支。统一后全矩阵再次检查无意外变化，全消费扫描为零才删除 root/dark/density 的旧声明和候选旧名。清理后的扫描还须证明无退役声明、无悬空／循环以及 runtime 完整，随后执行本轮必需回归与最新 Required CI、独审及合入。

文档核验命令：`node docs/reviews/d1b/verify-preflight.mjs`。此命令不启动服务、不改产品、不代表动态／视觉验收；当前清旧门禁必须为关闭。
