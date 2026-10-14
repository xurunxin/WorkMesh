# TA01 新会话接续记录

## 来源和旧树保全

用户于 2026-10-14 12:27 批准同卡新会话接续。本次交付分支为
`tds/conv-01a138ab-2566-7f87-9d06-5b16bebd86c2`。
[PR227](https://github.com/xurunxin/WorkMesh/pull/227) 只作恢复来源；合入沿本分支正常门禁。

开工用现有 GitHub 只读接口核实际主线及旧远端分支。主线为
`c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。旧远端分支、PR227 和旧本地树均为
`93e70603372966fe97d8c12364319c613cefb3c5`。共同祖先就是上述主线；整合没有冲突，
保留旧 Git 祖先和全部实现。平台 git 工具因共享缓存 index.lock 失败，本次没有删除锁。

旧树准确路径、Git 状态及日志哈希见 [旧树登记](../../reviews/ta01-product/resumption-old-tree.json)。
Git 未发现已跟踪改动或未跟踪文件。被忽略的顶层验证日志保存在
[原字节归档](../../reviews/ta01-product/resumption-old-ignored-logs.zip)。旧树、候选副本、
远端分支和其他项目保留，没有 reset、clean 或覆盖旧树。

[本次平台读取](sources/resumption-todo.json)逐行保留实际返回；返回在历史测试清单中自行
截断，不补造尾部。完整规格来自本次用户注入正文。Saved plan 字段仍未同步，23:41 的
本阶段记录例外继续适用。工具集没有 WorkMesh Project／WorkItem 写接口，沿 Todos 与仓库登记。

## 双架构失败原件

CI #521／run 38461233576 的双架构及 Required CI 均失败。分别下载 raw artifact，核
source-commit.txt、result 中脚本哈希和 Git blob。两份受测源码都是上述旧 HEAD，
tree 为 `91579a20247080608d5111a0670d6f71a21d9a1c`。

| 架构 | 原件和首败 |
| --- | --- |
| amd64 | [索引](../../reviews/ta01-product/ci521-amd64-installed-product-failure.json)、[ZIP](../../reviews/ta01-product/ci521-amd64-installed-product-failure.zip)；1,516.09 s，journal 为 migrated，verify-health-and-ledger 失败，外层 INSTALL_DOCKER_COMMAND_FAILED |
| arm64 | [索引](../../reviews/ta01-product/ci521-arm64-installed-product-failure.json)、[ZIP](../../reviews/ta01-product/ci521-arm64-installed-product-failure.zip)；5,106.39 s，journal 为 staged，initialize-locked-bucket 仍为 intent，guest 记录 TimeoutExpired |

两架构仅完成离线无默认路由、错误组合和 project 锁负例。画像操作、资源样本、升级、
完整恢复及重启尚未通过。run.py:184 是宿主失败汇总，不能证明相同根因。
原件没有底层 Docker stderr，具体健康失败原因和超时期间底层状态仍未知。

## 修正和检查边界

安装工具新增固定分类、输出 SHA-256 和归属容器状态，失败诊断入 journal 和 guest 回执。
参数、环境、密钥和原始服务输出不进入证据。guest 超时时记录准确预算及捕获输出哈希。
原超时和健康断言保持。

应用镜像复用前核全部角色的清单绑定 ID、架构和来源。每次仍核全部候选字节；任一角色
缺失则导入原归档，身份不符则拒绝。减少重复导入不证明旧候选或新画像验收通过。

锁定 Node 22.19.0 的安装器单元 9 项通过，含诊断秘密排除断言。Python AST 首次因
Windows 默认 GBK 解码失败，显式 UTF-8 后通过。静态结果不代根五门禁和完整 guest。

中文文档使用固定 zh-tech-writing 提交 ffda9353768dece8aabd26ccb3a4978025e9437c，
已读 SKILL、manual-structure 和 typography。autocorrect 缺失，按清单手检。
接口、events、schema 和 ADR 状态未变；更新服务端安装说明，其余接入合同及示例沿原实现。

基础范围、原九类测试、真实验收、正式 P0/P1 成果独审、最新 Required CI 和条件合入保持。
Redis-free、filesystem、生产接入、物理最低配置及对外发布未交付。历史匿名卷、两处受拒
目录和共享资源没有重试清理。
