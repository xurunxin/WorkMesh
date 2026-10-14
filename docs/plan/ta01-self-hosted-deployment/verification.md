# TA01 方案交付验证

## 当前产品阶段准备

用户已批准本阶段记录例外并继续。平台 Saved plan 字段仍未同步，但不再是产品修改前置；当前进入基础产品实现。授权顺序和保留缺口见 [product-stage-sync.md](product-stage-sync.md)。以下控制面测量与 docs CI 是历史方案交付事实，不作为新产品验收。

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

## 基础产品实现检查点

本次已加入候选清单、无源码工具入口、三画像校验、写前 journal、兼容账本回退、完整恢复调用和双架构 server-install 必需 CI。CLI 尚未完成真实安装验收，所有支持声明保持待执行；不会用本段静态结果填产品 PASS。API、events、schema 和 ADR 状态未变。

| 实际检查 | 结果 |
| --- | --- |
| Node 锁定工具上的 installer 单元 | 6 项通过；首次共享测试 fixture 被负例修改导致 2 项失败，已改为逐测试复制；原工具返回在本会话，未保存为独立完整日志，本段仅为摘要 |
| ci-policy | 22 项通过，含 server-install 丢架构／跳过／吞失败负例与 Required CI 失败传播 |
| validate-ci | 11 jobs、46 个不可变 action 引用通过 |
| packages/config typecheck、test | typecheck 通过；3 个文件、38 项通过，含新画像 8 项；依赖安装完成前一次 typecheck 因 tsc 未就绪失败，不记为通过 |
| check-integration-docs、git diff --check、Python AST | 通过；仅静态检查 |
| 根五门禁、完整 guest 三画像／双架构 | 尚未执行完成，不填通过 |

锁定 Node 与 pnpm 沿已有 TA00 可读缓存复用。workspace 依赖本次新建，正常 lifecycle 已执行；实际 storeDir 为 I:\.pnpm-store\v3\v3，首装 510 个包全部下载，没有命中共享 store。此路径选取多加了一层 v3，未更改共享配置，后续沿该已产生缓存复用，不冒称本轮命中共享包缓存。历史被拒目录与无标签卷未重试处理。

完整 guest 固定 2 vCPU、4,096 MiB 和 40 GiB 虚拟盘，仅作为受测条件，不作为最低配置。兼容升级夹具使用同源镜像的两个候选标识，不能冒充两个已发行历史程序版本；后续按实际结果记录该边界。

## 首轮产品失败与纠正

产品 HEAD 5ee89e6a3289dfebec375e163890e5d4c68f074e 的 CI #511／run 38431425238 失败。分类 job 的真实 range diff 拒绝两个新来源编码文件的末尾空行，产品 jobs 因分类失败未执行；Required CI 同样失败。工作树零 diff 检查曾漏过已提交范围，现改为核完整 main 至候选范围。编码尾部空白已纠正，原工具正文的 JSON 行数组内容不变，来源指纹随编码字节更新。实际 log tail 见 [原返回](sources/product-ci-first-failure.md)。

本机候选首次构建失败于 Alpine community 仓库 IO ERROR，未跳过 apk 更新；根五门禁尝试在 lint 阶段找不到 pnpm PATH 入口，后续四项未执行。本次专用 pnpm.cmd 只引用已有锁定工具，不安装全局工具。原件及实际 3 个容器／3 个卷的归属收尾回执见 [首败索引](../../reviews/ta01-product/first-local-failures.json)与 [原日志压缩包](../../reviews/ta01-product/first-local-failures.zip)。

## 基础源码门禁与待执行产品关口

锁定 pnpm 的本任务 PATH 入口就绪后，实际根 lint、typecheck、test、test:integration 和 test:conformance 均通过。另用 recovery opt-in 执行真实 PG／S3 完整恢复套件，通过。两轮各自登记的 3 个容器和 3 个命名卷均取得不存在回执，历史匿名卷和受拒目录没有重试。原件及成员哈希见 [foundation-checks.json](../../reviews/ta01-product/foundation-checks.json)和 [压缩原件](../../reviews/ta01-product/foundation-checks.zip)。

实际运行起点 HEAD 为 47b1c123cb803eccb42d6a0e3ff5ecbb1378ecda。期间 CLI 持续修订，根门禁不当 CLI 完整 guest 验收；索引另列当前 CLI 工作树哈希。本机第二次候选构建仍失败于 Alpine main 索引 IO ERROR，没有跳过依赖或编译。Linux 容器单元的宿主 bind 请求未产生容器或输出，等待后按准确本任务进程身份取消；未取得政策拒绝，不补造拒绝，也没有换方式或申请文件共享权限。该尝试不记通过，Linux 条件分支由后续真实双架构 CI 核验。

CI #512 的分类及 API／DB／worker／recovery／agent-smoke 已成功；server-install 双架构在目录拒绝单元断言处失败，尚未执行构建或 guest。断言现同时接受明确 PATH／ANCESTOR 拒绝，拒绝实现保持。根门禁通过、旧 CI 或本机单元都不代当前 CLI 候选支持通过。

CLI 当前另有健康后 pending／真实鉴权读取再 commit、持久安装 UUID、同 project 全局锁与卷名冲突拒绝、程序输入指纹和依赖镜像兼容条件。安装包中加入配置示例及实际工具版本。新接口只为安装工具，没有业务 REST／events／schema／ADR 状态变化；文档同步说明首次用户由既有 API 创建，安装器不自动命名用户。

CI #513／run 38443222251 的双架构安装器 7 项单元通过，构建前检查因未跟踪的 ci-logs/server-install 输出目录失败。现仅给该明确运行输出及 Python __pycache__ 登记忽略，不改干净源码检查；未开始构建或 guest，不记为通过。

CI #514 的 ARM 原返回证明 API／worker／MCP／Lite／installer 五镜像已构建，但候选未封包。随后 docker pull 成功，继承 stdout 的 execFileSync 返回 null，构建 wrapper 对 null 调用 trim 导致失败。已修正仅不捕获输出的成功命令返回处理；进程非零仍抛错，不吞失败。原返回见 [ARM 构建首败](sources/product-ci-arm-build-failure.md)，该结果不当 guest 或最终候选通过。

CI #515 的分类 job 在完整历史 fetch 中耗尽 5 分钟预算并取消，源码与产品检查未执行。原返回见 [fetch 首败](sources/product-ci-history-fetch-failure.md)。仅将该基础资源预算调为有界 15 分钟，fetch-depth: 0、完整 diff、分类安全验证和失败传播继续；没有放宽领域测试或断言，也没有重跑健康结果。

CI #516／run 38447218904 的 amd64 候选完成五镜像构建及封包，完整 guest 随后失败。准确受测 HEAD 为 b670f3d0a468aa51a75ccbf2b77ec8aba79a8c7d；固定 2 vCPU、4,096 MiB，执行 516.54 秒，仅完成 offlineNoDefaultRoute。后续命令退出 125，原回执没有 stderr，不能从退出码认定具体原因。原件与成员哈希见 [guest 首败索引](../../reviews/ta01-product/ci516-amd64-first-guest-failure.json)及[压缩原件](../../reviews/ta01-product/ci516-amd64-first-guest-failure.zip)。任何画像闭环、重启及新安装器恢复均未取得通过依据。

独立源码核查发现 docker save 按镜像 ID 导出的归档不保证原标签存在，安装器仍将 PG／Redis／S3 的 Compose 镜像写成原标签。现统一使用清单中经校验的镜像 ID，包括 minio-init；这项修正尚不属于上述受测候选。guest 同时新增不含参数或原始 stderr 的固定错误分类及 stderr 哈希；OOM 样本先保全、后台测量错误传播、有界重启就绪等待和 1 MiB 回执上限一并待新候选复验，未改业务断言或保证。

随后下载同一 amd64 候选，逐分块校验后实际导入其 bootstrap 归档。Docker 明确导入 sha256:fcb4b553a31aded073bc7df79a56399df44e4615cd025ac67ecc0deac00ba065，但构建清单中的 sha256:1bb9723ad5448993fd942efed6daccfd7ac889495571c87525673c9f780a1939 不存在，按该 ID 启动实际退出 125。归档原件中前者是 OCI manifest 摘要，后者是该 manifest 引用的 config 摘要。这是本机归档复现，不能倒填为上一 guest 的原始 stderr。

针对实际归档差异，封包器以流式 tar 解析绑定准确 OCI manifest 摘要与构建 config ID，二者均入可信清单。安装工具仅在这两个 ID 中解析并核架构和来源，导入后记录实际目标 ID、原子写入 Compose；不靠名称、标签或猜测生成替代 ID。未知 ID、摘要不符和截断归档拒绝。新候选待完整 guest 复验；此前 CI #517 不包含此项修正，不记通过。

CI #518 的 amd64 guest 进一步通过配置检查和部署锁负例，但应用镜像导入后报 INSTALL_IMAGE_MISSING；受测 HEAD 为 96b15c4fc5d70ac4bdac103321b55c414abbfe73，1,087.42 秒，尚无资源样本或画像闭环通过。原件见 [导入首败索引](../../reviews/ta01-product/ci518-amd64-import-failure.json)及[压缩原件](../../reviews/ta01-product/ci518-amd64-import-failure.zip)。ARM 运行尚未终结，不推断其结果。

旧 amd64 候选的实际应用归档包含七项 classic manifest，但 OCI index 只有 MCP 一项；在可信工具容器中实际 Docker load 也只导入该项。封包器现按唯一镜像引用导出，并验证每个 config 对应的准确 OCI manifest 确实进入索引；索引漏项在构建端拒绝。真实双镜像带标签导出取得两个索引项，原件见 [named-archive-probe.json](../../reviews/ta01-product/named-archive-probe.json)。归档内容、目标 ID、来源和架构校验保持，不按标签放宽安装接受。

现行 apps/mcp/src/index.ts 的 tool() 返回 structuredContent: { data }；安装器的业务验证已改为读取 structuredContent.data，再核准确 Work Item ID。此修正来自实际源码，不冒为前述 guest 已执行。guest 同次增加 Redis-free／filesystem 错误组合实际拒绝、无宿主 Node／pnpm 检查、OS／Docker／Compose 环境回读和无秘密 journal 阶段诊断。安装器八项单元、文档静态与 Python AST 检查通过；完整 guest 仍待新候选结果。

进一步核 runtime-guard.mjs 与 loadDeploymentProfile：所有长期服务均要求三个公开 HTTPS 地址，而原 MCP Compose 只提供 WORKMESH_BROWSER_ORIGIN，不能替代 WEB_ORIGIN。安装器现将 WEB_ORIGIN／PUBLIC_MCP_ORIGIN 同 S3_PUBLIC_ENDPOINT 注入 API、worker、MCP，并逐角色执行现行画像校验，避免全局配置有效而 MCP 启动时缺字段。此项是源码核查修正，尚未取得完整 guest 通过；不沿用修正前候选结果。

bootstrap 现复用已导入且实际 ID 等于清单中两个可信摘要之一的工具镜像，避免每个 check／commit／回退调用重复导入相同大归档。每次仍核 manifest 和所有 bootstrap 分块摘要，工具容器仍完整核全部候选分块与配置；没有使用名称、时间戳或缓存收据替代哈希。找不到确切镜像时才从已校验分块导入，导入后仍明确拒绝未知 ID。此项待最新完整 guest 复验，不以估计耗时写通过。

## 2026-10-14 新会话接续

本次旧树保全、PR227 来源、CI #521 两架构原件、修正和检查边界见 [接续记录](resumption.md)。旧结果没有改写，新候选仍待完整验收。
