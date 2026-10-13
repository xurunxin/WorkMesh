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


最新原生辅助 run38344079595/head0b3f1b2755ed5094e6c3c83f324a41cb6286ce30 两架构均通过 SEA、安装完整性、真实第二版本升级回退及卸载 4 项。对应 Required run38344079493 的 amd64 完整 guest 已实际启动，但在准备／离线安装根包装器阶段失败，尚未进入 connect 或 reboot；原件 raw/product-first-amd64.zip，provider artifact11787813661，下载 SHA-256 824ffc04062d121b2aa11abe6fdde9ecf63baaddb09de61fb2772167aaa990b7 与 provider digest 一致。现原件只有 GuestServiceFailure 与串口 systemd 失败，不含具体命令错误；不猜根因。新增服务 journal+console 输出，仅输出无秘密安装和安全诊断，以复跑定位。ARM64 同轮仍在运行，结果另核。


run38345379545/head45634e7f19839c2ac134839c14635f47d2fd847a 的 amd64 完整 guest 再次在根服务阶段失败，原件 raw/product-second-amd64.zip，artifact11788669477，SHA-256 ba4a3554b669013f1398605d2758e9f142b19b225e43f0e769b8a27def0c532a，与 provider digest 一致。journal+console 未出现在串口原件中，未据此猜原因。下一轮收集失败的阶段、退出码和固定错误码／固定系统诊断签名，不上传自由文本或秘密；下载助手先核摘要，hash 失败明确给 INSTALL_HELPER_HASH。

安装拒绝矩阵已增加八类身份／能力／profile 清单偏差，以及损坏 pending 不重建和显式 abandon；GNU 归档删除不可运行的 musl sidecar，仅保 GNU 原生闭包，并纳入 WorkMesh 自身 MIT 许可。原保护与全部原断言继续保持，新增验证尚待真实运行。


run38347067626/heada73bae62331f4026de6133d1bec123f304fa3ca7 的 amd64 原件进一步定位为 offline-install，退出码 1，无固定错误签名，尚不能区分路由检查、干跑零写入或安装。原件 raw/product-third-amd64.zip，artifact11788843614，SHA-256 bd6fd88396a2b756172931946430676c1d959ac8f40f7d394f7ee4281b7eac45。下一轮记录更细的安全步骤与路由行数，按“实际没有路由”验证离线，不依赖路由表头必有一行的格式。

辅助本机诊断使用独有 Docker 容器 f246610347465a7d599ecd5f3cdf8c0dda1e0b6628646910dec3f26a9878df9d，owner 为本卡，network=none、1536 MiB、2 CPU。复用受核原生 artifact11787912929/SHA-256 0698985707f17729652fae69bec8b622575c0bc8b774519b5e302eb2841593b5，仅用于隔离安装启动定位：UID22020 实际 dry-run、安装和 --version 成功，源码绑定 0b3f1b...，不证明 TCG 或完整连接。Windows 转移的临时准备脚本首次因 CRLF 失败，改为明确 LF 后成功；保首败，不改发行原件。

封装加入单独压缩的安装助手，清单绑定其摘要，避免提交超出 GitHub 单文件限制的原始 ELF。guest 将按实际交付形式核摘要并解包助手，再执行无网络安装。新增真实事务失败恢复及并发进程屏障，仍待实测。历史 TCG 研究 workflow 改为手动复现入口；研究源与原件不改，产品 Required CI 保留完整 TCG，以避免每次产品提交重复运行已完成的非必需研究。
