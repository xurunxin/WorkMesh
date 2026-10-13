# TA01 自部署交付具体方案

## 当前阶段

用户已批准保留 PostgreSQL、Redis、S3 的基础产品交付，以及现有双架构 CI／完整虚拟机验收。当前先同步规格与执行计划；平台 Saved plan 编辑接口未提供，该同步关口尚未完成，因此本轮尚未修改产品代码。

基础范围包括版本化服务端包、三画像配置校验、安装升级 journal、兼容程序回退、空目标完整恢复和离线依赖闭包。Redis-free、filesystem、保证变更、物理设备最低配置及生产内网接入继续未交付。旧方案与旧验证不是基础产品验收证据。

| 阅读目标 | 文件 |
| --- | --- |
| 核授权及完整任务要求 | [当前规格](spec.md)、[已确认计划](implementation-plan.md) |
| 核准确主线、平台来源及截断 | [来源登记](sources.md) |
| 审个人、团队、企业配置及升级行为 | [部署设计](deployment-design.md) |
| 裁定限流、文件工件与保留保证 | [保证决策输入](guarantee-decisions.md) |
| 核测量条件、首败和未测 | [基线测量](measurement.md) |
| 核原 DoD、九类测试和联合责任 | [验收矩阵](acceptance-matrix.md) |
| 核本轮检查、文风和资源收尾 | [验证记录](verification.md) |

## 复用与剩余工作

#61 的纯后端 Lite／production、TLS、API 安装、worker 和配对 Skill 下载是现有输入。#62 的中文 API/MCP 接入说明是维护入口。#20 的连接器双架构无源码安装、升级、回退和系统秘密存储已交付，不能记为本卡新增成果。

本卡剩余工作是服务端版本化交付、三画像配置校验、升级失败处置、低资源测量，以及 Redis-free／文件工件保证裁定。现有组件和旧 CI 不能证明这些新组合通过。

保留 Redis 与 S3 的基础交付已获批准，执行依据为[当前计划](implementation-plan.md)。Redis-free 与文件模式继续分别等待合同和 ADR 裁定。已审规划原件见 [history](history/README.md)，不倒填旧授权、不更新 ADR 状态或原路线文件。

## 责任及关口

本卡 owner 负责配置、安装恢复、测量与保证方案。TA16 负责企业身份、多人隔离和恢复组合；TA19 负责三画像完整操作链。#20 已完成最终验收输入，不反向阻塞其已交付能力。实施依赖关系承接[已合入路线](../backend-infrastructure-roadmap/dependencies-and-acceptance.md)。

基础产品完成全部适用验收、最新 Required CI 和正式 P0/P1 成果独审后，按本次条件合入授权处理。当前仍停在产品修改前的计划同步关口，不能报告基础产品完成。WorkMesh 控制面写接口缺口仍按 Todos＋仓库记录，不虚构双轨同步。

演示从本文件的 Markdown 预览开始，依次查看配置矩阵、升级故障表、保证决策表和验收状态。没有 WebUI 或浏览器 CI。
