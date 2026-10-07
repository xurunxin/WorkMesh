# R1 修订交付

审查报告见 [r1-spec-review.md](../r1-spec-review.md)，29卡映射、待开始任务完整替换spec与真实id/依赖/stages索引见 [index.json](../../plan/activation-task-specs/index.json)；原测试/DoD及逐feature九类具体验收见 [test-coverage.md](test-coverage.md)、JSON和legacy-requirements。ADR0037/0074–0078与主计划已按现有决策统一，实际ADR状态、F2自主委派/0062合取/台账、F4独立分派身份、F5共用锁序/根完成、暗色保留和历史门禁均落盘。

没有产品代码、迁移、API或event改动；没有真实外发、权限/凭证授权、合入或看板同步。查看方式：在change review点Markdown文件的预览按钮；JSON与归档可从本构建分支Files页面读取。

本地五项必需检查最新运行均退出0，标准集成310通过/2设计跳过，整套E2E65通过，附加当前CI策略/构建/生成工件/协议smoke通过；初次设置失败、中断和未定位UI超时保留，不能用复测代替原因修复。Node/toolchain与Actions差异见 [检查记录](execution-checks.md)。

未闭合：Chief安排精确最终head成果独审、#6原卡历史范围核验、最新PR/head Required CI；具体设备/渠道及数值预算仅供受影响阶段裁决。当前初稿head为 `f137787faa0979b59dd70668001b09bb5e132421`，main为 `5743f027ec86e8726d2cfdd38e0e038bdebeae49`；最终提交由本回合平台生成，见review提交并与execution-manifest字节核对。不得拿该初稿head或历史规划独审冒作最终通过。

本次成果复核针对已提交 `18027999536ac9ea34961c06ddba8b6bcf60b37d` 新增三项合入前阻塞 high；已逐条修订 Attention/暗色条款、联合验收阶段和各 F 卡授权门禁，处置及逐处读回见 [定向回复](review-feedback-response.md)，本次实际检查见 [记录](review-feedback-checks.json)。之前回归结果保持对应版本，不标成新回合重跑或新 PR CI；三项独立闭合及范围授权仍待 Chief 核验。
