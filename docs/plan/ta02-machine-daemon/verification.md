# 本轮方案检查回执

## 受测范围

本轮只新增 `docs/plan/ta02-machine-daemon/` 中的 Markdown。没有产品源码、实际合同、迁移、CI、安装发行脚本、守护进程配置或 ADR 状态变更。准确产品基线和开工 HEAD 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`。新文档的实际提交由本分支提交回执绑定，不预写未来 SHA。

本轮成功检查的完整 stdout/stderr 和命令边界见[原始检查回执](checks-raw.md)。日志采用 JSON 行数组保存，按 LF 拼接还原，避免更改日志尾空格。

当前仅交付方案，不声明产品完成或可合入。正式 P0/P1 独审未完成；方案和产品合入都需另行裁定。

## 环境与工具

本机为 Windows x64、PowerShell、Python 3.11.15。用户给出的工作树路径位于 `C:/Users/xurx/.tds/workspaces/01a15cd3-1e81-7581-9e17-ebb6e0b679d0`；pnpm 解析出的同一工作树位于 `I:/tds_workspace/workspaces/01a15cd3-1e81-7581-9e17-ebb6e0b679d0`。

初始 PATH 的 Node 为 `v25.4.0`，pnpm 不在 PATH，workspace 没有 node_modules。这是环境发现，不拿该版本执行项目检查。正式文档检查复用 `D:/Cache/TEMP/workmesh-ta00-nf20n0st/` 的 Node 22.19.0 与 pnpm 9.15.4，只读使用其工具文件，不修改共享目录。

Node 可执行字节已与仓库提交的官方 ZIP 成员核对，二者 SHA-256 相同；ZIP 与可执行摘要见 [source-binding.md](source-binding.md)。未解包或复制连接器和 #33 的镜像、ZIP、core 或 workspace 依赖。

分类所需 yaml 2.9.0 使用仓库 `scripts/ci-bootstrap/package-lock.json`，在本轮独有 `.tmp/ta02-docs-tools/ci-bootstrap/` 执行 `npm ci --ignore-scripts --offline --no-audit --no-fund`，退出 0，只装 1 个锁定包。设置局部 `NODE_PATH` 供静态脚本解析，未改变产品依赖或全局环境。项目检查进程的 PATH 首位为准确 Node 目录。

## 实际检查

| 检查 | 实际结果 | 证明边界 |
| --- | --- | --- |
| main 与 hosting 只读查询 | 两次 main 查询均为准确基线；PR225／226 为 MERGED，PR229 为 OPEN/draft | 不以缓存 ref、候选或旧 CI 冒 main；平台 Git 缓存拒绝单列 |
| 归档／基线专项 | 57 个源码文件 blob／clean hash 绑定；17 个 ADR 状态片段；5 个实际工具正文归档；Spec 逐字相等；Node ZIP 成员相等 | 只核源字节和原状态，不代产品测试 |
| `pnpm check:integration-docs` | exit 0；4 个技能原件、80 个链接、35 个 REST 引用、11 个 MCP 名称、Human 示例语法通过 | 此脚本主要检查现行 integration 手册；新增方案链接另核；不证明真实请求或中文语义 |
| `node --test scripts/ci-policy.test.mjs` | exit 0；21 项通过、0 失败、0 取消、0 跳过 | 核现行分类和 Required CI 拒绝错误跳过，不是机器功能测试 |
| 新方案链接、源路径、规格原件与职责检查 | [专项脚本](document-checks.md) exit 0；57 个源文件、5 个归档、九类测试和 6 项原责任核对；最终文件数／链接数见原始回执 | 不以关键词覆盖证明未来功能完成 |
| 实际路径 `classifyChanges` | exit 0；mode=docs，packages/testPackages 为空，八类产品检查均 false | 保持现行 CI 策略，不扩大 prose 豁免 |
| `git diff --check`／新文件空白检查 | 工作树 diff exit 0；专项脚本另核所有新增 Markdown 无尾空格、单一终止 LF；提交后再核准确范围 | 新文件尚未纳入 Git diff 时另核原始文件，不能用空 diff 证明 |

## 首败、纠正和未执行

平台 Git 在缓存 reset 时因现存 `index.lock` 拒绝，没有进入所请求的 ls-remote。原调用与返回逐字保留，未删锁或改用缓存写命令。#34 首次读取为空，再读取得完整 Spec；两者不冒成第一次已读全文。

源码研究中两项初拟 worker 路径不存在：`workbench-execution.ts` 和 `workbench-waits.ts`。存在性检查拒绝后，计划改为真实的 `apps/worker/src/session-lifecycle.ts` 和 `packages/db/src/workbench-execution-waits.ts`。这是文档草稿修订，不是产品缺陷或验收通过。一次 Windows rg 通配路径无效，已改为准确文件路径读取，没有据该错误断言表不存在。

历史 TA02 两个源文件在 main 不存在，`git cat-file -e` 返回拒绝；这是缺源证据，不作为“检查通过”隐藏。完整当前规格从实际卡读取，未补造历史方案。

专项脚本首次提取用了未锚定的代码围栏表达式，遇到 Python 字符串内的三个反引号而截短，产生 SyntaxError。脚本没有执行文件写入或产品操作。已改为仅匹配行首围栏，后续完整脚本结果另记，不将首败覆盖为通过。

本轮按实际纯 Markdown 分类核适用门禁。五项根产品检查 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:conformance` 未在本轮执行，不记通过。未运行 integration 示例、镜像、VM、后台进程、安装／升级、设备注册、模型或真实外部服务。

## 提交与 CI

方案候选 `85498b825ac2ac6912c956d216b31d39d8496f0c` 已推送到本会话分支，并建立草稿 [PR230](https://github.com/xurunxin/WorkMesh/pull/230)。提交后重读 16 个文件，Git 原字节与本地文件逐一相同；5 个来源归档的实际 Git blob 与登记值一致。准确基线到候选的 `git diff --check` 退出 0。

候选的 [CI575](https://github.com/xurunxin/WorkMesh/actions/runs/39549341333) 已 completed/success。changes 与 Required CI 两项成功，八类产品 job 按 docs 计划 skipped。跳过不计产品通过，原始工具回执附在 [checks-raw.md](checks-raw.md)。

候选之后补充 service Actor 与启动意图检查点，明确 Machine 不增加 Actor kind，以及 spawn 窗口未知不重启。专项脚本也改为核从固定基线起的完整范围，避免提交后仅检查剩余工作树。上述文档和本回执仍须最新候选 CI；CI575 不冒后续 HEAD 通过。没有取消旧 CI、重跑 job、正式产品复审或合入。

根 `test:e2e` 已不存在，浏览器 CI 已按 ADR0087 退役。未来产品端到端责任映射到 API/MCP/daemon、现行 conformance、connector 平台／安装和真实后端部署，不重建浏览器命令。只有文档分类成立才按当前策略不选产品检查；未知路径、真实源码或 CI 变化必须按实际分类执行。

## 文风与同步自检

已使用固定 `zh-tech-writing` commit `ffda9353768dece8aabd26ccb3a4978025e9437c` 的主文件与两份参考。`autocorrect` 不存在，按技能逐条手检，不安装全局工具。

原创正文逐项核开场／结尾套话、客套、对比／递进句、设问、宣传形容词、黑话、解释用破折号、翻译句式、模糊限定、感叹号／emoji、过度标题和加粗。另核中英文／数字空格、单位、全角标点、引号、缩写及标题层级。规格原文、工具原件、代码与标识符保留原语言和字节，不为润色改写来源。

本轮没有改变现行能力、端点、认证、MCP 注册、错误消费、配置或示例，因此 `docs/integration/` 的入口、REST/MCP、installation、troubleshooting、reference、configuration 和可运行 examples 无需改动。未来 P0—P5 的合同／功能变更必须同次维护相应中文说明和真实示例，不能把本方案当成已发布手册。

## 资源与交接

本轮只创建独有忽略目录 `.tmp/ta02-docs-tools/`，保存静态工具依赖与检查日志。没有新建容器、卷、镜像、数据库、VM、daemon、注册、凭据或生产连接，没有外发消息或付费请求。共享 npm 缓存仅由离线安装读取，旧 Node/pnpm 和所有其他工作树保持。

没有触碰 #33 现场、共享 index.lock、安装目录、设备权限或用户数据。临时目录保留供本轮复核，不进行共享清理或全局 prune。本分支由正常平台流程提交和推送；不创建或切换用户命名分支。

下一关是指定独审者的 P0/P1 方案审查。问题闭合后向 Chief 报告；未获产品和环境裁定前，不执行任何 P 阶段。
