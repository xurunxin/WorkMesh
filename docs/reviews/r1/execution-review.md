# 最终独立成果复核交接

初稿基点为 `f137787faa0979b59dd70668001b09bb5e132421`，实际主线输入为 `5743f027ec86e8726d2cfdd38e0e038bdebeae49`。本回合改动由平台提交到原构建分支；最终精确 head 以 change review 的提交为准，不能用初稿 head 代替。文件字节清单见 `execution-manifest.json`。

Chief 按用户委托安排主力开发对该精确 head 定向独立审查。本文件仅交接复核目标，尚未收到该成果的独立结论；历史计划通过不等于本轮规格通过。

- 按 `findings.json` 逐项核验代码事实、修订位置、owner 与处置；重点检查初稿残留的分派身份、九类矩阵、Session/authority/root 锁序。
- 复算两次执行 29 卡全文哈希、索引完整替换正文/真实 id 与两类依赖，检查 `pre-review-deltas.json`；不把 phase 更新时间当 spec 版本，保留原截断及总管补交。
- 核查 `legacy-requirements.json`、原测试/DoD 和 `source-gaps.md`，不能用现已关闭 #6 的吸收记录冒充合并前全文。
- 核查 F3/F4/F5/F6 的阶段输入/输出/owner、三条完成路径原子收敛、并发锁清单与联合验收；F5/F4 不受 F6 反向阻塞。
- 核查实际 ADR 状态、两个 0028、0077 对 0064 的有限视觉修订、现有默认暗色及 #11/#21 回归；0028/0052 的架构与 IA 边界保留。
- 对照最新 `docs/CI.md` 的选中任务、实际日志、失败原因和跳过项。待本提交最新 PR/head 的 Required CI；历史 G1 run 不代替本次。

闭合条件是另一 agent 的逐 finding 证据与最新必需检查成功；Chief 之后才按委托确认合入并逐卡同步读回。本轮不合入、不同步 Todos、不放行产品实现。设备矩阵/渠道部署和未测容量的具体关口见 `decisions.md`。
