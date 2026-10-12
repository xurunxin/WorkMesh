# B-ship 方案准备证据

本轮只执行文档准备。当前状态为 Proposed，正式独审与 Chief 产品放行待完成。零数据库迁移、零 API/事件变化、零产品代码或 CI 工作流变化；没有构建连接器发行物、创建 Linux guest 或执行设备安装。

## 平台输入与原件

卡片为 [#20](todo:JfGwKk3prfIie6X2u2J51)，项目 `DzkLDn6UW-IbfoTJzN9Ro`。本轮 `tds.todos(id)` 读取时，平台 phase 为 building，`Updated` 为 `2026-10-12T12:44:05.893Z`；当前 spec 首条说明只允许五个方案文档路径，产品门禁仍关闭。building 是平台执行文档准备的状态，不是产品实施授权。

| 来源 | 保存位置与完整性 | 结果 |
| --- | --- | --- |
| `tds.todos(id=JfGwKk3prfIie6X2u2J51)` 的完整 Spec | [spec.md](../../plan/b-ship/spec.md) 的 `BEGIN-CURRENT-SPEC` 区间；13,463 UTF-8 字节，SHA-256 `5d6b38561d82ce062c04a2e55e2f292eb0d169a52a7e4635d40f7c4eacd44f18` | 与本次工具输入字符串逐字比较一致；不是事务快照 |
| saved plan `doc:Sq2Il0gKZRLrp-8L4RFk3` | [implementation-plan.md](../../plan/b-ship/implementation-plan.md#已确认的文档准备计划原文) 的 `BEGIN-SAVED-PLAN` 区间；5,333 UTF-8 字节，SHA-256 `ad2455f98dab736b556cc51c82278ac0642449efb9a0d2aa30f73172144e4796` | 来源为本会话完整计划及用户执行请求的完整重贴；逐字保存 |
| 同次 `tds.todos` 的 Saved plan 返回 | 返回文本总长 8,013 字符，完整 Spec 区间在 plan 前；plan 尾部返回 `…(truncated)` | 不用工具截断片段补造完整计划；完整来源与截断分别记录 |
| 问题卡 `doc:q-rojM7Z-OYYSGaTPRD04Td` 与用户答复 | 本会话真实答复：“Linux amd64、arm64（推荐）”和“独有干净虚拟机／原生 CI（推荐）”；[规格答复表](../../plan/b-ship/spec.md#用户答复与当前含义) | 确认矩阵及环境类型，不确认最低硬件或产品实施 |
| 用户执行请求 | “Now carry out this plan. Make all the file changes it calls for.”，附完整计划 | 按被引用计划只准备文档，不覆盖 Chief 当前 spec 的产品门禁 |

区间正文 SHA 不等于整份 Markdown 文件 SHA，也不等于 Git blob。Spec 原字符串包含末尾 LF，saved plan 字符串不含末尾 LF；比较按各自实际字符串进行，不为了哈希统一它们。历史来源 SHA `108c7e4bcc8d97b527a07a95b2cda6a090da16ae2ae91e8fc20e42d42900348e` 仍来自原规格声明，不当成本次 spec 或工作树文件哈希。

## 真实主线与本次分支

本轮通过已有 GitHub CLI 的只读 API，直接读取 `repos/xurunxin/WorkMesh/git/ref/heads/main`。在 `2026-10-12T13:00:25Z` 开始的复读中，远端真实 main 与本次远端分支均为 `f6faf54f80850ecee9118d87401e6b5ce73216f1`；本地分支 HEAD 相同，tree 为 `d825ba1e6500e36d9f26c52ec13a40f97514d55c`。

当前分支为 `tds/conv-01a12fd9-e1d0-76a4-aae1-e6b7869c6947`。本地 `refs/heads/main` 仍为旧值 `20fb7358f6c6818a452e78c1fd3da096cdc31286`，不能用它代真实 main。本轮未用 FETCH_HEAD 代主线，未执行工作树远端 fetch，也未删除或绕过 Chief 共享缓存的 index.lock。

真实主线合入提交的 parents 为 `abf6813a439feab4b17b0602cc9295216634586e` 和 `d41b3cb0cf8243b14728feef23fbd9300402fb23`，提交说明为 PR224 merge。本轮 API ref 与本地 Git 父链共同提供来源绑定；历史 CI480 的成功只作为交接事实，不当本轮新组合验收。

上一规划回合中，本次远端分支曾返回 HTTP 404。当前复读分支已存在且与 main 相同；两次读取的时间和结果分别保留，不用先前 404 推断当前状态。文档新增以本轮提交为交付，当前证据中的 main SHA 是输入基线。

## 读取与复用的源码绑定

以下为本轮输入 HEAD 的准确 Git blob；工作树 CRLF 原字节摘要与 Git blob 分开。R1 decisions 本轮只追加当前确认，历史前缀须保持与输入 blob 一致。

| 文件 | 输入 HEAD 的 Git blob |
| --- | --- |
| `CONTEXT.md` | `c6b6544e2c80ebb207bceb19eb45b48ff5855ac6` |
| `AGENT_PROTOCOL.md` | `433a8e7cfc37f704111d695d3dc484b7f5aae201` |
| `OPENAPI.yaml` | `01b63733c9314efe1551d676c315ea8cb9377bc1` |
| `SCHEMA.sql` | `6b4d99d910c7db0a6547bf7e4cf88c38ea01c563` |
| `docs/reviews/r1/decisions.md` | `6b3c2e35c089626fcdaf4bae91a4d044094c0b36` |
| `docs/reviews/r1/test-coverage.json` | `97ba54f1e0b65c25f44546b61aeb269899522714` |
| `docs/plan/activation-task-specs/20.md` | `d0caa7a87c866168a6cbde78fe93972984f45dc1` |
| `.node-version` | `e2228113dd09b59b7a0398d4e70af19b5d2aff4c` |
| `pnpm-lock.yaml` | `f1bb1a82a9270ee753bc91b19fae3b5d52d4114e` |
| `apps/connector/src/pending.ts` | `70e47ecfa5c1d5d8b306a76085af96a24ba81ba0` |
| `apps/connector/src/protocol.ts` | `54e3f047e2b42dc33326dbf097215de55dca28b8` |
| `apps/connector/package.json` | `0a946f319640c95c755f10edc36e13ac54eb413d` |
| `packages/contracts/package.json` | `c30138faa1a54c0bd31dbd8e390ce3ba8cb5e301` |

读取了 ADR 目录索引及适用的 0043、0046、0079、0087、0088 决定，保留 Proposed Lite 边界。没有重建已删除 PRD。核现有 `main`、`getPending`、`verifyPairing`、`validateBootstrap`、`SystemSecretStore` 和提交点后，方案才列出 SEA 入口、公钥来源、原生加载与未决身份处理。

## 官方依据与可行性缺口

| 来源 | 本轮读取方式 | 可证明与不可证明的范围 |
| --- | --- | --- |
| [锁定 Node SEA](https://nodejs.org/download/release/v22.19.0/docs/api/single-executable-applications.html) | web 读取官方完整页面 | CommonJS 嵌入脚本、资产、文件模块解析和同版本 Node 要求；不证明本连接器已打包成功 |
| [锁定 Node BUILDING](https://raw.githubusercontent.com/nodejs/node/v22.19.0/BUILDING.md) | web 读取官方原件 | kernel/glibc/libstdc++ 的运行时基础要求；不代原生模块闭包或设备实测 |
| [esbuild API](https://esbuild.github.io/api/#bundle)、[postject 仓库](https://github.com/nodejs/postject) | web 官方页面 | 确定封装工具及配置方法，未安装/运行产品构建工具 |
| npm 官方 keyring 2.1.0、Koffi 3.3.2、node-pty 1.1.0 元数据 | web 访问 registry 失败；本机 PowerShell HTTPS GET 成功 | 两 GNU 架构的 keyring/Koffi optional package 条目及锁定版本存在；node-pty 声明 `node-addon-api`；未下载或执行这些发行组合 |

官方 registry 请求为 `https://registry.npmjs.org/@napi-rs%2fkeyring/2.1.0`、`https://registry.npmjs.org/koffi/3.3.2` 和 `https://registry.npmjs.org/node-pty/1.1.0`。响应只投影 name/version/engines/依赖及 integrity，没有读取凭据。后续动态库、helper 执行位、SEA＋原生模块可行性、两架构 guest/KVM 条件和最低硬件均待真实验证，方案不标为已支持。

## 本机工具与隔离准备

| 项目 | 实际观测 |
| --- | --- |
| 系统 | Windows 11 专业版 Insider Preview，OS `10.0.26300`，64 位，32 逻辑处理器，34,227,982,336 字节 RAM |
| 工作目录 | 入口 `C:\Users\xurx\.tds\workspaces\01a12fd9-e1d0-76a4-aae1-e6b7869c6947`；真实路径 `I:\tds_workspace\workspaces\01a12fd9-e1d0-76a4-aae1-e6b7869c6947` |
| 初始 PATH | Node `v25.4.0`；pnpm 不可识别；根及 bootstrap node_modules 不存在；没有 autocorrect |
| 已有工具缓存 | codex runtime Node `v24.19.0`，已有 pnpm 管理器在仓库上下文实际取得 `9.15.4`；缺管理器缓存前基线，不推断是否曾自动写入缓存；不把缓存 Node 当仓库锁定版本 |
| 本轮验证 Node | 官方 Node `v22.19.0` Windows zip，在任务 `.tmp/b-ship-doc-checks/` 解压；与官方 SHASUMS256 相等 |
| zip SHA-256 | `ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86`，来自 `https://nodejs.org/dist/v22.19.0/SHASUMS256.txt` |
| YAML 依赖 | 使用 Node 22 对 `scripts/ci-bootstrap` 执行 `npm ci --ignore-scripts --no-audit --no-fund`；只安装锁定 YAML 2.9.0 |
| 根模块解析 | 新建本任务 root `node_modules/yaml` junction，指向本任务 bootstrap YAML；未手工修改共享包缓存/配置，锁文件不变 |

初始执行 `pnpm --version` 的原始环境失败为 `The term 'pnpm' is not recognized`；这是工具准备观测，不填写文档检查失败。未放宽仓库 Node/pnpm 要求；验证子进程只在当前命令 PATH 前置私有 Node 22，既有系统 PATH 不改。缓存管理器发出旧 `pnpm` 配置字段警告，实际选择输出为 `9.15.4`；本轮没有执行 pnpm workspace 安装或产品构建。

唯一工具临时目录为 `.tmp/b-ship-doc-checks/`，另创建 bootstrap node_modules 和根 YAML junction。它们属于本轮验证准备，不是连接器产物，结束定向收尾；本轮没有创建容器、VM、数据库、Secret Service 或系统秘密，也没有全局工具安装、新登录或外发。

收尾已完成：先按真实 `I:` 工作树边界核四个绝对目标、YAML junction 类型及指向的本任务包，确认任务 Node 无活动进程、两个删除树没有 reparse 对象。只删除 junction 本体后先核目标 YAML 仍在，再删除空 root node_modules、本任务 bootstrap node_modules 和工具目录；未递归删除工作树父目录。四个目标的不存在证明均为 true，系统 Node 复读仍是 `v25.4.0`。原日志已投影结果和摘要至本文件，临时副本随私有工具目录收尾。

## 本轮检查结果

| 检查 | 实际结果与范围 |
| --- | --- |
| `pnpm check:integration-docs` | Node 22、pnpm 9.15.4；exit 0，4 个技能原件、72 个手册链接、35 个 REST 端点、11 个 MCP 工具、human 示例语法通过；不覆盖新增方案链接，另行核验 |
| `pnpm ci:validate` | exit 0，CI/release/Lite 结构校验通过；24 个已有测试通过，0 失败/跳过；原始证据校验 280 entries、61 members、21,268,498 字节，无 errors |
| `node --test scripts/ci-policy.test.mjs` | Node 22；exit 0，20 个测试通过，0 失败/取消/跳过；未新增测试 |
| Spec 与 saved plan 区间比较 | 与各自完整输入字符串逐字相等，UTF-8 摘要见上表 |
| 新增方案链接与来源自检 | Node 22 临时只读校验脚本 exit 0；20 个本地链接及锚点有效，5 个原验收和九类映射齐全，R1 历史前缀不变，完整凭据形态为 0 |
| 当前改动分类 | 五个 Markdown 路径，`classifyChanges` 实际为 `mode=docs`、packages/testPackages 为空、七项 runtime checks 全 false；现有汇总策略接受正确 skipped，不能写成产品测试通过 |
| 空白检查 | `git diff --check` 与五文件暂存后的 `git diff --cached --check` 均 exit 0 |

前三项验证临时原日志 SHA-256 分别为 `acf24bb4ada41db7b8f393240b9867f181d1b6bd7486332bef0f24399b6f4b43`、`300f1434ed5fff155083f6675e6ad7cab2e857dcb91ea076ad7c66985f697bdb` 和 `9474a7d425971db19d3eb7213ac78a88d35866c33fe4256fbe57fae1a201d3f7`。日志不作为分发产物，收尾前保留上述结果和摘要；这三项检查首次执行成功。最终源绑定以本次 Git 提交为准。

临时范围自检首次通过；暂存后复跑曾失败，原错误为 `AssertionError [ERR_ASSERTION]: 超出五文档范围`，actual 为 `[]`，expected 为五个允许文档路径。原因是夹具只用 `git diff --name-only` 和 untracked 列表，漏掉已暂存文件。改为 `git diff --name-only HEAD` 后重新核完整范围，exit 0；未修改产品、CI 策略、源文件或预期五文件集合，也未忽略失败。

## 文档适用性与写作自检

使用仓库固定 `leter/zh-tech-writing` commit `ffda9353768dece8aabd26ccb3a4978025e9437c`，读取 SKILL.md、manual-structure.md 和 typography.md。4 个原件的 hash 由文档检查验证，不全局安装，不修改上游原件。

原创段落逐项检查：读者为方案评审者和后续执行者；首句给结论；短句、主动语态；不写宣传形容词、套话、设问自答或生造词；只对并列项目用表格/列表；半角数字、中英文空格、全角标点、引号和单位手检。没有 autocorrect，按技能允许的手检方式完成。归档原文保持原字节，不改其历史措辞。

| 当前未改的接入文档 | 具体依据 |
| --- | --- |
| `docs/integration/README.md`、`getting-started.md`、`rest.md`、`reference.md` | 本阶段无新路径、DTO、权限或可用能力，接入入口不宣传 Proposed 发行物 |
| `docs/integration/mcp.md`、`troubleshooting.md` | MCP 注册、鉴权、协议与已实现错误/恢复消费均未改变 |
| `docs/agent-integration.md`、`AGENT_PROTOCOL.md`、`AGENTS.md`、connector README | 当前源码命令保持；B4 后续修改清单与参数现状已列在方案和验收设计 |

后续安装页和 `--version`、安装 dry-run 目前不存在；现有 `cli.main` 没有 dry-run 支持。计划示例全部标注待实现，不可拿文档命令当本轮实测。零迁移、零 API/事件变化，规格差异只有本轮确认矩阵及准备范围的真实追加，没有产品范围偏离。

## 未测、复核与交付

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:conformance`、双架构发行/设备验收和真实接入示例均未在本轮执行；这不是通过记录。当前只有 Markdown，必须按原 CI 分类检查适用门禁，不扩大 prose 豁免；产品实施时保留全部必需检查。

本人仅核方案与输入的一致性。正式独审仍须在任务 review 进行，仅报告 P0/P1；方案准备不等于 ADR Accepted、安装成功或产品放行。交付通过本会话分支及正常 review 流程，不创建其他分支、不对外发布。人工清单只检查这批方案是否准确表达用户已确认目标和授权边界，不要求用户执行尚不存在的安装器。

## P1 反馈修订与复核

本次依据用户转交的正式独审反馈，修订两项 P1 方案问题。开始时工作树干净，HEAD 与 PR225 head 均为 `259da4d232ad75f630a3ae3757af54a4afd97fe0`；GitHub API 独立读取真实 `refs/heads/main` 仍为 `f6faf54f80850ecee9118d87401e6b5ce73216f1`。本轮只修改实施方案、验收设计和本证据文件，当前 spec、saved plan 归档与 R1 历史追加保持。

| 问题 | 新依据与修订 |
| --- | --- |
| ARM64 hosted 环境不能提供 KVM | 独立读取 [GitHub 官方说明](https://github.com/actions/runner-images/issues/14062)，确认是宿主限制。方案改用 `[self-hosted, linux, ARM64, workmesh-connector-kvm]`，明确 Chief 落实专用裸机、管理员受控注册、KVM/guest 重启预检和未就绪时不放行。Required CI 须绑定同一 run/attempt 的两架构回执、准确源码及受测产物；不以 skip 或容器重启代验收。资源尚未取得，本轮没有新增 runner/凭据。 |
| Linux node-pty 必须在构建机编译 | 读取官方 npm 归档并校验完整 integrity，列出 286 成员，无 Linux `.node`。已将 hook/node-gyp 禁令限定在目标安装/运行，构建机两架构执行源构建，锁定 Node/headers、node-gyp、node-addon-api 和工具链；收录 `build/Release/pty.node` 并要求 SEA 实际 PTY 加载。 |

node-pty 归档来源为 `https://registry.npmjs.org/node-pty/-/node-pty-1.1.0.tgz`，15,468,777 字节，SHA-256 `c7517f19083ddcb05f276904680eb2b11a6b5ecab778b8e4e5685a6d645b3f60`。实际 SHA-512 integrity 与官方 metadata 相等：`sha512-20JqtutY6JPXTUnL0ij1uad7Qe1baT46lyolh2sSENDd4sTzKZ4nmAFkeAARDKwmlLjPx6XKRlwRUxwjOy+lUg==`。仅列成员并从归档 stdout 读取 `package.json`、prebuild/postinstall 脚本、`binding.gyp` 和 loader；未安装该包或执行构建钩子。

上游 install 是 `node scripts/prebuild.js || node-gyp rebuild`。`binding.gyp` 的 Linux target 生成 `pty.node`；`spawn-helper` target 仅 macOS，修订中不把该 helper 当 Linux 必需产物。当前 lock 中 node-addon-api 为 7.1.1；node-gyp 11.4.2 是后续拟锁定的构建工具，本轮没有添加依赖或改锁文件。[上游 package.json](https://raw.githubusercontent.com/microsoft/node-pty/v1.1.0/package.json)、[node-gyp 要求](https://github.com/nodejs/node-gyp#installation) 与[自托管标签语义](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)均已独立核读。

继续使用同一固定写作技能和两篇 references，autocorrect 缺失时手检。本轮在被引位置直接复读修改后段落：实施方案第 50 行已将禁令限定为目标安装/运行，52～56 行补编译、headers 和 SEA 加载；原 runner 段落已改为 134～138 行的 ARM64 自托管与资源前置，验收设计 105～109 行同步 matrix 和 Required CI 回执。没有仅靠关键词搜索声称旧段落已移除。

本轮以独有 `.tmp/b-ship-review-checks/` 的官方 Node 22.19.0、已有管理器实际选出的 pnpm 9.15.4，运行 `pnpm check:integration-docs` 和 `pnpm ci:validate`，均 exit 0；文档检查为 4 个技能原件、72 个链接、35 个 REST 端点、11 个 MCP 工具，CI 结构及 24 项已有测试通过。两个检查本轮首次执行通过；没有新增测试或修改门禁。

独有只读脚本再核：只改三个允许文档，11 个本地链接/锚点有效，两处被引段落及验收同步符合修订，Spec/saved plan 原区间与 R1 文件不变，CI 分类仍为 docs，完整秘密形态为 0，exit 0。`git diff --check` 通过。本轮源码、workflow、依赖锁和产品均未修改；原生编译、SEA 加载与 KVM 设备验收保持未运行，修订方案不等于问题已经实测或获产品实施批准。

本轮临时目录、bootstrap node_modules 与 root YAML junction 均按真实工作树边界登记。收尾前确认无任务 Node 进程、删除树无 reparse，先删 junction 本体并确认目标 YAML 仍在，再移除本任务依赖与工具树。root node_modules、bootstrap node_modules 和 `.tmp/b-ship-review-checks/` 的不存在证明均为 true，系统 Node 仍为 `v25.4.0`。只读归档副本和临时校验脚本随工具树收尾，未清理公共缓存或其他任务资源。人工清单 c2/c3 已改为两项 P1 修订的审阅结果，c1 的授权边界保持。
