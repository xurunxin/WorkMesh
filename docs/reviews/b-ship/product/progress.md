# 连接器产品执行记录

## 授权与源码

本轮在用户“采用 TCG 并开始产品实现（推荐）”授权下继续同一任务和分支。当前完整规格及原答复见[产品规格](../../../plan/b-ship/product/current-spec.md)，当前计划见[产品计划](../../../plan/b-ship/product/implementation-plan.md)。平台工具返回 Spec 全文，历史 Saved plan 截断；本轮工具集没有 saved plan 写接口，不冒称旧平台计划已被改写。

开工 HEAD 为 `f67737ed7e8d3a38c418b72e0ad9d42db46071f3`。本轮独立执行 `gh api repos/xurunxin/WorkMesh/git/ref/heads/main --jq .object.sha`，UTC `2026-10-13T03:00:34Z` 取得 main `f6faf54f80850ecee9118d87401e6b5ce73216f1`。当前分支保持 `tds/conv-01a12fd9-e1d0-76a4-aae1-e6b7869c6947`；没有使用 FETCH_HEAD 或删除共享 index.lock。

## 当前实现与未测

已开始实现共享 CLI、SEA 公钥、受控同架构原生编译、清单、离线安装助手、原子切换及卸载。新增功能仍须真实产物和双架构完整产品验收，当前不填已通过；历史 TCG 研究只证明环境可行性。

尚未完成双架构构建／SEA 加载、无源码目标安装、完整 API/MCP 黄金路径、原拒绝恢复、完整 OS 重启、升级卸载及新的 Required CI 绑定。产品 DoD、正式独审、PR ready、最新 CI 和条件合入均待实际证据，不将本卡 Done。

## 环境与文档

本机默认 Node 为不同版本；验证显式使用保留的准确 Node 工具。只读复用既有缓存，新的可写构建和测试状态独有。原策略拒绝的 YAML junction、bootstrap node_modules、`.tmp/b-ship-tcg` 和其他受保护目标不重试删除。

中文文档读取固定技能 `ffda9353768dece8aabd26ccb3a4978025e9437c` 的 SKILL.md、manual-structure 与 typography；不改技能原件或全局安装。API、Schema、端点、领域事件和数据库迁移未改变；B4 文档新增安装入口，其余说明按新增命令同步。
