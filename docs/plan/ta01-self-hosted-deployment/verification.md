# TA01 方案交付验证

## 当前产品阶段准备

本轮仅同步完整新规格、已批准基础执行计划、阶段和历史归档。平台 Saved plan 编辑接口未提供，按最新规格的前置同步要求，尚未修改产品代码；缺口见 [product-stage-sync.md](product-stage-sync.md)。以下控制面测量与 docs CI 是历史方案交付事实，不作为新产品验收。

本轮没有重跑健康 CI、试删历史受拒目录或匿名卷、生产操作、外发及新增权限。基础产品的五门禁、双架构完整 guest 与三画像实际候选验收仍未执行，不填通过。

阶段同步适用检查已执行：`pnpm check:integration-docs` exit 0，21 项既有 CI 策略回归通过，完整目录专项复核通过 116 个链接、9 份原规划平台来源、14 份 Git 原件、12 份运行原件与九类测试承接；16 个本轮暂存文件与实际 index 字节一致。当前 Spec 和两份新工具归档另逐字／哈希核验，四份 history 原件与已审 Git blob 相同。未生成新的测试秘密，因此本轮不运行依赖私有环境文件的秘密值比对。

实际分类仍为 docs，八类产品检查按现行策略不触发；新候选的 Required CI 另核，不沿用先前 CI #509。本轮没有产品实现，不把文档阶段检查写成基础产品五门禁通过。一次追加文档的 patch 因上下文未匹配被拒，未修改文件；最终记录按实际上下文写入，不改来源或哈希以掩盖失败。

## 范围与源码

本轮仅新增 `docs/plan/ta01-self-hosted-deployment/` 的 Markdown 文档、可逆来源及运行证据。没有业务、API、event、数据库迁移、CI、实际安装器发行代码或 ADR 状态变化，也没有修改其他卡。服务端产品及新存储模式尚未获准实施。

固定产品基线为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`；开工真实 `refs/heads/main` 与 HEAD 相同。完整 Spec、完整平台计划 `doc:X7D1XMP5_XpGdpyYKCVNZ`、原材料及截断见 [sources.md](sources.md)。本轮当前规格完整；相关 Saved plan 的工具截断不补写。

## 实际命令与结果

| 命令／步骤 | 本轮结果及适用边界 |
| --- | --- |
| `git ls-remote origin refs/heads/main`、不可变源码读取 | 已执行，独立核准确主线；不使用平台共享缓存锁推定状态 |
| 原 Lite Dockerfile 的准确 Git archive 构建 | 首轮 Alpine IO ERROR，exit 1；同命令环境复核 exit 0，OCI revision 与固定源码一致 |
| 独有 Lite `up --wait` 与控制面采样 | 首轮夹具 bucket 非法，HTTP 400；身份与空业务门后修正夹具，复核完成。完整边界见 [measurement.md](measurement.md) |
| `pnpm check:integration-docs` | exit 0；4 个技能原件、80 个相对链接、35 个 REST 引用、11 个 MCP 名称与 Human 示例语法通过。不是新目录或真实接口组合验收 |
| `node --test scripts/ci-policy.test.mjs` | exit 0；21 项通过，0 失败、0 跳过；没有修改 CI 策略 |
| 本目录专项核验与 `git diff --cached --check` | 最终实际回执在下方追加；不把只看工作树而未暂存的空白检查当全部检查 |
| `classifyChanges`、当前候选 Required CI | 按实际提交和远端回执登记，不使用旧路线 CI 代本卡 |

主机默认 Node 为其他版本、PATH 没有 pnpm。本轮明确复用已有 Node 22.19.0 和 pnpm 9.15.4，可执行文件位于原任务保留的工具目录；只读取，不在旧目录写入或重试删除。Node 官方 zip 原件 SHA-256 为 `ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86`，本轮重新核一致。只在本工作树安装 `scripts/ci-bootstrap` 已锁定 YAML 依赖，`npm ci --ignore-scripts --no-audit --no-fund` exit 0，没有安装全 workspace。

本轮 Docker 原构建保留正常 lifecycle，与文档检查的 bootstrap `--ignore-scripts` 用途分开。镜像内部运行时版本实际读回另登记。所有采样、回执和日志见[原件索引](sources/evidence-index.md)。

五项根产品检查在本轮按真实文件分类判断适用性，未执行不写通过。未来产品保持 lint、typecheck、test、integration、conformance 五项门禁，以及实际配置闭环和恢复 opt-in。没有根 `test:e2e`，没有浏览器 CI。

## 首败与处理

Lite 构建的网络首败、夹具 bucket 命名错误、身份预检和复核分别保留。夹具修正未修改产品文件、设备权限、真实凭据或外发策略；没有为了测量降低容器限制、存储锁或校验断言。

首次将多个工具正文合在一条 PowerShell 命令时，Windows 以路径／扩展名过长拒绝创建进程，未执行文件写入；后改为 `apply_patch` 归档。源码登记曾引用不存在的 `.env.production.example`，生成器明确失败，随后核实际 `.env.example` 并修正，不把缺文件补造为来源。

生成器改 LF 时先发生 PowerShell 文本解析错误，未执行；随后误给 Python `read_text` 添加不支持的 newline 参数并失败。已仅在写入时固定 LF，重新生成并复核。原件字符串、日志和 Git 原字节保持，没有 trim 原返回。首败不冒产品回归故障或独审发现。

新目录链接检查先拒绝证据索引多余的 `sources/` 层级；修正时曾误改测量页入口，随后检查再次准确拒绝。已分别修正两个目录的相对路径，并复核全部链接，不扩大检查豁免。

## 文风、文档同步与限制

本轮使用固定 zh-tech-writing 主技能、manual-structure、typography 和 MIT 来源。原创页逐项核套话、客套、对比递进、设问、宣传词、黑话、破折号、翻译句式、模糊限定、感叹号及过度结构；手检标点、引号、数字／英文空格、单位和层级。未找到 `autocorrect`，手检，不安装全局工具。可逆原件保留原语言和原字节，不进行中文改写。

接入入口、REST／MCP、配置参考、安装恢复及可运行示例本轮不改：没有新增可用接口、header、feature、默认配置、CLI 命令或 SDK 消费。未来更新位置已列入[部署逐文件建议](deployment-design.md)；接口和功能实施时须同次维护并运行真实示例。

本轮没有低内存整机、ARM64 服务端、企业 CA／身份、断网完整交付、Redis-free、filesystem、工件备份或 Runner 任务验收。完整当前产品测试、真实服务和 fake 的责任在[验收矩阵](acceptance-matrix.md)中。规划完成不能满足原产品 DoD。

## 资源与批准关口

任务 owner 为 `workmesh-ta01-pui_xhb6`；新临时目录为 `D:/Cache/TEMP/workmesh-ta01-pui_xhb6/`。容器、卷、网络和私有应用镜像只按准确归属与活动引用处理；共享依赖镜像、公共 build cache、旧工具目录及历史受拒目标保留。临时环境文件和安装 Cookie／CSRF／随机密码不进入归档。

收尾前保全最小持久证据，逐对象核 ID、project／task label、停机状态、挂载和外部引用；删除首败停对应目标，不改属性、ACL、父路径或换工具绕过。实际收尾回执在下方追加，未完成不报资源已清空。

平台人工清单已填写三项，分别覆盖配置范围、保证与验收责任、来源和实测边界。生产者自查不等于正式独审；交付等待平台 P0/P1 独审及用户具体范围裁定。没有合入、标 Done 或新功能构建批准。

## 最终回执

按实际专项检查、暂存 blob、当前候选 CI 和资源收尾结果追加于此。

第一轮完整专项核验通过：9 份平台来源、14 份 Git 原件、12 份运行原件、88 个导航链接和九类测试承接；46 个暂存文件与工作树字节一致，生成测试秘密值没有进入归档。后加入的复核与收尾脚本文档在最终轮一并核验。

实际 `classifyChanges` 为 `docs`，packages／testPackages 为空，八类产品检查均为 false。五项根产品检查本轮按既有分类不执行，不写通过。Node 运行时在实际应用镜像中读回 `v22.19.0`。提交前再次真实 main 查询仍为固定产品基线。

48 个文件的第二轮专项核验通过，文件字节与实际 index 一致；已推送提交 `0320be7213040505a788ac5d8aff727b84a0b75f`，草稿 [PR #227](https://github.com/xurunxin/WorkMesh/pull/227) 已创建。该候选 [CI #507](https://github.com/xurunxin/WorkMesh/actions/runs/38406462337) 已完成 success，准确 head_sha 由 GitHub API 独立读回一致，八类产品检查按文档策略跳过。当前提交继续增加收尾记录，最新 Required CI 须独立核，不沿用此候选结果。

新增目录的最终文档检查器支持已提交或已暂存分支，分别比较实际 HEAD 或 index blob；不因工作树干净而跳过原件和字节核验。完整最终结果在 PR 当前 HEAD 的实际检查中读回，CI 后没有为登记同一次 CI 再修改文件。

Docker 收尾预检首次误将默认短 ID 与完整账本比较，未派发删除；独立 `--no-trunc` 读回证明七个准确容器集合一致。第二次预检因 minio-init 的无 project 标签匿名 `/data` 卷停止，同样未派发删除。其镜像声明 VOLUME，未来部署需明确登记或隔离这类初始化挂载，避免重复产生无归属卷。

实际收尾只删除已登记的七个容器、三个命名卷、一个网络及一个私有应用镜像，十二个对象各有明确不存在回执。匿名卷 `8cb9c40dd18ce0dbe135e4ba5186943cb684af64790072c28675a43650fd820e` 保留，不修改其标签，不再尝试删除。共享镜像、公共 build cache 和旧工具目录保持。原预检及最终回执见 [cleanup-receipts.md](sources/cleanup-receipts.md)，临时目录与本工作树 YAML 依赖的收尾另记实际结果。

临时目录及本工作树 YAML 依赖的文件收尾请求在进程创建前被自动策略拒绝，返回 `blocked by policy`；没有执行删除或预检，不属于 OS 权限失败。两目标只读确认仍存在，没有换工具、拆批或重试。原调用和带自身截断的实际返回见 [filesystem-cleanup-refusal.md](sources/filesystem-cleanup-refusal.md)；更细策略理由未知。
