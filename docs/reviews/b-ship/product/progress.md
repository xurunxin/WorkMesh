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

## 本轮检查与首败

准确 Node 的连接器单元测试 92 项通过，含全部既有真实进程竞争和强制终止。类型检查首次发现锁定 tar 的接口是 Parser/abort，已据实际声明修正。文档静态检查通过 4 个技能文件、78 个本地链接、35 个 REST 与 11 个 MCP 名称。CI 结构及分类单测当前 21 项通过；产品远端检查仍待完整执行。

辅助原生构建 run38341094507 两架构失败，head06e01cb226b5350e6fe5ffbf55bb57840aa7fb0c：未创建输出父目录，原件见 raw/build-first-amd64.zip 和 raw/build-first-arm64.zip。后续 run38341429309/head73a8b9b55944669179c6eb9f339146365de62e72 已构建 SEA，但实际启动因 Koffi 官方运行 loader 被排除而失败；只补回 src/koffi 中 JS/CJS 运行文件，不收录 C/C++ 源码。失败尚不写成通过。

CI483 之后的历史 Required CI 不代本轮：run38341429314 分类明确因 product/current-spec.md 的多余末尾空行失败，后续 job 正确未执行；已修正新增文件的末尾格式，不改历史正文。当前 Required CI 新增双架构 connector-install，保留三系统平台矩阵，遗漏任一架构、失败或意外跳过均阻断。TCG 产品驱动仍须实际验证，包含独有网络 namespace 下离线安装、完整已安装进程协议路径及真实系统重启；缺证不能填通过。


原生辅助 run38342942446 的 amd64 leg 已实际通过 SEA 构建与安装／完整性／卸载 3 项；ARM64 leg 尚待结果，不外推双架构通过。Required run38342942448 的两条产品 leg 在记录输入摘要时因本任务新生成的 __pycache__ 目录被当文件而失败，guest 未启动。已只删除本轮两份已识别 bytecode 和其空目录，加入精确 ignore，并将摘要限定实际源文件；未触碰原策略拒目标。类型和 Python 语法检查随后不生成仓库 bytecode。

升级候选使用独立 prerelease 元数据，不改变协议身份；两次构建仅复用经官方摘要再次核对的任务私有 Node/header 下载。安装加入受保护切换 journal，锁内重启恢复旧入口；卸载和回退只处理账本与归属版本。完整 TCG 驱动新增第二版本、旧配置／秘密复用、跨版本 pending、过期重放负例和卸载真实 Secret Service 秘密保留断言。这些新增断言尚待实测，不倒填通过。
