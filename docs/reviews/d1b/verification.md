# D1b 实施前置交接

本轮完成已审计划第 1 步的可审前置包，尚未进行界面迁移或清旧。
按计划第 1 步“另一 agent 针对完整文档独审后由 Chief 确认；此时才允许产品编码”停在此关口。
12:31 的规划放行持续有效；该放行不代表本轮全量映射、规格同步和阶段保护设计已完成审查。

## 精确输入与计划绑定

本轮 `mcp__tds__git ls-remote origin refs/heads/main` 实读 main 为
`1078bbcd527550bfabee73093b7ffd0032d3fd24`，与工作树基点相同，未发现新增主线输入。
已审提交 `40cc065edabdc2a6fbdc72f728fd72259e58811c` 对该基点仅增加四份规划文件；
本轮按该提交 Git blob 原字节恢复计划、历史绑定、来源和 115 行矩阵，保留其历史字段。
当前执行绑定单列在 [execution-binding.json](execution-binding.json)。

本轮 `todos(id)` 完整规格返回 Chief 的交接计划 ID `doc:nnchKV-O25SWiYsj3hXgm`；
`conversation(id)` 仅返回本次新构建消息，没有 savedplan 字段或计划全文。
`currentPlanID` 保留 null，`handoffPlanID` 标明交接来源；没有把交接链接冒充后端文档全文读取。
计划正文仍精确对应已审 Git blob，未修改计划或另存新版本；需 Chief 对当前平台 ID/正文绑定复核。

## 本轮范围和文件

- [theme-token-migration.json](../../../apps/web/features/navigation/theme-token-migration.json)：
  115 旧槽、175 历史声明的显式目标/作用域/来源/依赖；114 目标，唯一合并为 muted/text-muted。
  增补候选→正式 danger、独立 dim、六种非 wm 变量迁移和三个实例变量。
- [consumer-inventory.json](consumer-inventory.json)：生产源码词法引用及 Git/工作区双字节指纹。
  共 8 个有引用文件、2,079 个引用，包含 token 文件内部组件和声明依赖；不是 AST 扫描已通过。
- [stage-assertion-design.md](stage-assertion-design.md)：阶段账本身份、作用域隔离、依赖解析和负向断言设计。
- [test-coverage.json](test-coverage.json)：五项原测试、原 DoD、九类适用性及后续卡责任。
- ADR 0077 与规格 12/13/14/21/22：同步三项裁定和大胆重构方向；保留原历史来源及后续功能责任。
- [verify-preflight.mjs](verify-preflight.mjs)：可重新运行的离线文档校验；不替代功能测试。

普通 card 的暖色是对参考 elevated 值的设计应用，危险色是用户采纳候选；
映射均给出准确来源，不声称参考普通卡片或错误态实测。暗色同值重绑定的设计图
保留原值；新公式只依赖新名称。该映射尚未导入产品或改动 token CSS。

## 验证与门禁

静态校验命令：`node docs/reviews/d1b/verify-preflight.mjs`。
实际结果和执行绑定将归档到 `evidence/preflight/`；独审意见另列，未记录的检查不填通过。

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`
本轮未运行。产品代码未变，本轮只做相称的文档/映射静态核验；最终五项检查、
实际明暗与 D0 前后 diff、人工视觉评审、latest Required CI、成果独审、合入和 Chief 确认均待实施。
无服务启动，无数据库/凭据操作，无服务恢复或清理；无 migration、API 或事件变更。

## 评审入口与后续动作

在变更评审中点击本文件的预览按钮可查看本包。先审完整映射、阶段断言设计、
规格与精确计划绑定；Chief 确认后才新增并存定义与扫描器，并从工作台的全部矩阵组合开始。
每面真实明暗、导航/焦点、前后图和人工评审完成后才进入下一面。
旧值清理门禁全为 false；D1b 尚未验收，D2 等后续卡尚未放行。
