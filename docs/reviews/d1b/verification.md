# D1b 工作台首面恢复交付

2026-10-08 18:07，用户明确答复「接受，继续下一面」，适用首面提交
`567f68dc9b2905a166184c24686a9f2fd74f2832`。首面视觉停点已通过。
17:39平台定向独审未实测Files/preview宿主加载的限制仍保留，不编造浏览器记录。
当前看板已完成140组迁前/迁后取证，等待本面人工视觉评审，详见
[看板报告](board-verification.md) 与 [视觉页](board-visual-review.html)。
原8项移动主题失败保留，本轮修复后完整40项主题检查通过；全仓单测1659通过、2项条件跳过。
未推进项目下一面、清旧或整项合入，未放行#12。

以下为首面恢复交付时的历史正文；其中“当前”“待审”“未推进看板”等描述指该次历史交付，
不覆盖上述后续授权。旧运行/截图/归档不重写；当前活动阶段见看板报告与阶段账本。

## 首面恢复交付历史正文

当前只交付工作台首面，停在本 todo 的平台独立阶段审查与人工视觉评审。
未推进看板或其他面，未清旧，未放行 #12，未将整项合入 main。

## 历史、授权与本轮整合

本轮实读远端 main 仍为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`，
旧分支 checkpoint 为 `d2e1a656df73f5afd7d91060c2f7e4b4fd1ebcf5`，父为已独审前置
`0ebb986ee963e69473a3be2779717d0e7a1da948`。
用户确认 13:02 前置三项 blocking 已闭合、13:03 工作台首面已放行，本轮继承这些授权。

当前分支从 `4067ecd3573d392114c8adb51534bcdb3a52dfb4` 正常 merge checkpoint，
保留历史关系；14 个重叠路径、12 个文档/映射冲突已解决。
活动实现、映射和账本恢复 checkpoint；前置绑定继承已独审 0ebb986，首面成果尚待独审；
4067ecd 新增的来源指针、断言设计和历史执行记录保留，补充证据中的 accent 漏项与门禁循环已修正。
精确决议见 [integration.json](recovery/integration.json)。
这是本地待平台提交/推送的整合，不声称远端已更新或 main 已合入。

已审完整计划 `40cc065edabdc2a6fbdc72f728fd72259e58811c` 的正文不变，
UTF-8 SHA-256 为 `91a9eb7451ff2799754d4207863c67cff09112d1470b5ad1049066309f8dbdb8`。
本轮 conversation 没有返回当前 savedplan 字段，执行绑定如实保留 currentPlanID=null，
继承已审正文、交接 ID 和授权，不重新保存或重新确认。
[execution-binding.json](execution-binding.json) 是当前绑定；
plan-binding/plan-source 保留前置时的历史字段，旧冻结前置脚本不作为当前产品阶段验收。

## 首面实现和材料

工作台局部消费迁入新槽；仅本面使用受控共享和 Markdown 分支。
并存槽、暗色同值重绑定与主题/密度派生公式已恢复；旧声明仍保留。
执行账本有 2,316 项、320 个受控新增项、1,854 个剩余旧依赖表达式；
清旧和下一面门禁均为 false。这些是表达式数，不冒作最终消费清零。

当前观察与证据关联见 [current-stage.json](recovery/current-stage.json)。
[视觉评审页](workbench-visual-review.html) 提供 32 组原始前后图和 30 组固定比较器差异，
含桌面/移动、明暗、根跳转、就绪/创建/加载/错误/空态/富文本/portal。
在变更评审中点击该 HTML 文件的预览按钮即可查看。
D0 原件保留；threshold=0.005、maxDiffPixels=0 未放宽。
比较器结果和技术检查均不代表人工颜色接受，所有人工意见仍待实际评审。

## 证据审计及实际验证

[historical-run-audit.json](recovery/historical-run-audit.json) 核对 14 次历史运行、
372 份 checkpoint 证据（156 PNG、19 ZIP）、11 个既有原始归档及 stdout/stderr 哈希。
原 Git blob 和本轮检出工作区字节分别记录在
[checkpoint-artifacts.json](recovery/checkpoint-artifacts.json)。

原 source 归档脚本对混合 CRLF/LF 恢复失败；本轮只读原工作树，
逐项与运行记录的字节数/SHA-256 精确匹配后归档，共 10,946 个源码字节版本、
774 个唯一成员，实际缺失对象/字节为 0。新 [源码索引](recovery/source-inputs-index.json)
与 ZIP 自包含，不伪称 checkpoint 原已有该包。
15 个原始日志/上下文路径另以 Git/工作区双字节无损包装，
[raw-evidence-index.json](recovery/raw-evidence-index.json) 精确映射旧路径/版本/byteKind；
没有 trim 原件或改 CI。失败 PNG/trace 原件仍保留。

| 检查 | 实际结果与边界 |
| --- | --- |
| 本轮主题单测 | 11/11 通过，执行前后输入相同；最终运行见 recovery-theme-unit-final/execution.json |
| 本轮阶段账本自检 | 7 类负例拒绝，清旧/下一面均不放行；同时由上述单测覆盖 |
| 本轮恢复核验 | 372 证据、双字节源码包、32 比较和原 D0 哈希通过 |
| 历史 before-capture-c / after-capture | 各 32/32；不是本轮新采集，前两次 before 首败保留 |
| 历史 final-stage | 52/52：含首面 32 项与桌面原主题 20 项；移动原主题被阶段配置排除，不能证明旧失败已修 |
| 历史 lint/typecheck/unit | 均退出 0；单测 1,658 通过、2 个 Windows 条件跳过，不冒本轮新组合验收 |
| 历史 theme-contract | 32 通过、8 失败，退出 1；完整失败仍保留 |
| integration / 全量 E2E / latest Required CI | 本轮未运行，后置；不得声明 D1b 已完成 |

8 个原主题失败中，6 个在第 84 行的首个文本 locator 可见性断言失败；
2 个在第 94 行点击移动端隐藏 theme-toggle 超时。
移动 CSS 已隐藏 wm-shell-actions，支持后者定位；六项的逐元素原因未重新运行确认。
这属于现有套件移动使用假设与隐藏控件/文本的冲突，保持未解决状态，
未改断言、超时或产品路由去伪造通过。证据精确位置见 raw-source-map。

本轮产品相对 checkpoint 只删除 fixture、Markdown CSS 与 tokens.css 末尾各一个空行，
没有更改样式值、表达式或功能；因此补验相称的账本/主题单测与归档，
没有重复采图或把历史完整回归重算为当前通过。运行留证器对已归档原件改为
绑定归档 ZIP/索引；未知缺失输入仍拒绝，不丢弃历史输入保护。
无 migration、API 或事件改变，也没有新增 TA 实现或开工前置。

## 资源收尾与复核入口

本轮没有创建 Docker 容器、镜像或测试服务；3200/3201 未发现监听。
五个临时脚本及一个诊断目录的原字节先归档再按精确路径删除，
未使用 global prune。测试子进程结束，宿主配置未改变。
当前与旧工作树、锁文件依赖继续保留；旧工作树须实际合入 main、证据保全且无人运行后再清理，
不 force 抹 dirty。逐路径结果见 [resource-cleanup.json](recovery/resource-cleanup.json)。

可运行 `node docs/reviews/d1b/recovery/verify-recovery.mjs` 复核归档，
以及 `node docs/reviews/d1b/stage-ledger.mjs --self-test` 复核阶段保护。
当前范围与历史检查的限制如上；下一步仅平台独立阶段审查和实际人工视觉评审。

最终定向补验：`recovery-theme-unit-final` 于 2026-10-08T09:18:05.425Z 完成，退出码 0、11/11 通过、无 skip、运行前后源码指纹一致；stdout 无损 ZIP 与自包含索引保存于该 run 的 `raw-archive/`。恢复验证器另逐项检查本轮受测产品源码、映射及阶段断言与运行记录的 Git blob / 工作区字节，报告补齐不冒作新视觉执行。
