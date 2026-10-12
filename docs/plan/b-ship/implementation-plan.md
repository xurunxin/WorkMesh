# B-ship 分发与安装实施方案

Status：Proposed。当前另获准[无需 KVM 的 TCG 可行性研究](tcg/current-spec.md)，按[研究计划](tcg/research-plan.md)执行必要隔离实验。下面的产品文件清单、发行命令与最终验收仍待 Chief 单独放行；不预先宣称 TCG 可替代当前 KVM 路线。历史文档准备计划原件保留，研究结果另列。

## 当前工作与后续关口

本轮交付 [当前规格](spec.md)、本方案、[验收设计](acceptance.md)、[准备证据](../../reviews/b-ship/planning-evidence.md) 和 [R1 追加记录](../../reviews/r1/decisions.md)。使用 Todos＋仓库记录，不创建真实 WorkMesh Project 或 WorkItem。

首批 Linux amd64、arm64 与独有干净虚拟机／原生 CI 已由用户确认。Node SEA、esbuild、postject 是执行者提出的具体封装方案。方案复核只推进 P0/P1；必需 CI 与必需实测继续独立生效。方案完成后回 review，独审闭合后由 Chief 修改当前实施阶段并单独放行产品工作。

## 现有机制与封装边界

| 现有位置 | 复用机制 | 发行时的处理 |
| --- | --- | --- |
| `apps/connector/src/cli.ts` | `main`、`runClient`、`finishClientProcess`、`formatConnectionError` | 分离可复用命令与 ESM 自动启动判断，SEA 入口显式执行相同命令与退出收尾 |
| `apps/connector/src/connect.ts` | `connect`、`abandonPending`、`clientSnippet` | 保持锁内恢复、验证、提交和无秘密片段输出 |
| `apps/connector/src/pending.ts` | `getPending` | 保持原 key、精确 body、origin、user-agent；发行升级不修改既有请求身份 |
| `apps/connector/src/protocol.ts` | `discover`、`verifyPairing`、`validateCurrent`、`validateBootstrap`、`bootstrapMcp` | 共享 Zod、MCP SDK、当前凭据证明和完整身份比较继续执行 |
| `apps/connector/src/commit.ts` | `recoverCommit`、`commitConnection` | 配置替换仍为提交点；失败补偿与旧引用保护不变 |
| `apps/connector/src/platform-security.ts` | `withDirectoryLock`、`readPrivate`、`atomicWrite` | 不改变祖先校验、POSIX 权限、Windows ACL 和 OS 句柄锁 |
| `apps/connector/src/secret-store.ts` | `SystemSecretStore` | Linux 显式 Secret Service，系统后端失败关闭 |
| `apps/connector/src/client-process.ts`、`output-redaction.ts` | `launchClient`、`redactChildOutput` | 保持 PTY／管道选择、信号、尺寸变化和跨 chunk/ANSI 脱敏 |
| `packages/contracts/package.json` | 导出指向 `src/index.ts` | 构建时将实际使用的合同打入应用 bundle，目标端不解析 workspace 源码 |
| `apps/connector/assets/workmesh-public-key.pem` | 固定可信公钥 | 公钥原字节作为 SEA 资产嵌入，与 `skills/workmesh/public-key.pem` 比较 |

现行安全依据为 ADR 0043、0046、0079 的连接器本地安全决定和 ADR 0088 的错误恢复决定。ADR 0071 的 Lite 资源估算不用于证明连接器最低硬件。

## 设备与最低环境建议

| 项目 | amd64 | arm64 | 当前证据级别 |
| --- | --- | --- | --- |
| 发行标识 | `linux-amd64`，Node 架构 `x64` | `linux-arm64`，Node 架构 `arm64` | 用户确认目标架构 |
| 拟验收系统 | Ubuntu 24.04 LTS amd64 | Ubuntu 24.04 LTS arm64 | 执行者建议，尚无该设备实测 |
| Node 基础软件下限 | kernel ≥ 4.18、glibc ≥ 2.28、`GLIBCXX_3.4.25` | kernel ≥ 4.18、glibc ≥ 2.28、`GLIBCXX_3.4.28` | 来自锁定 Node 的官方 BUILDING；不是完整产物支持承诺 |
| 秘密后端 | 当前用户 D-Bus 会话、可解锁 Secret Service | 同左 | 当前 `SystemSecretStore` 强制要求 |
| 测量起点 | 1 vCPU、1 GiB 内存、2 GiB 可用磁盘 | 同左 | 仅连接器与系统后端；不含模型、客户端、API 或数据库 |

运行时固定来自 `.node-version`，当前为 Node 22.19.0。构建工具使用仓库 `packageManager` 指定的 pnpm；不把宿主 PATH 的版本作为发行运行时。Node 基础下限参见[固定 BUILDING](https://raw.githubusercontent.com/nodejs/node/v22.19.0/BUILDING.md)。最终软件下限取运行时和全部原生模块 ELF 要求的较高值，并在目标系统实际加载。目标发行版须仍在供应方支持期内。

当前依赖固定为 `@napi-rs/keyring` 2.1.0、Koffi 3.3.2 和 node-pty 1.1.0。keyring 的 GNU/Linux x64、arm64 optional packages，以及 Koffi 的两种 Linux optional packages 存在官方元数据；这只能证明分发条目存在。node-pty 和其他原生二进制的实际加载、动态库闭包与秘密后端仍须新组合实测，不能由 npm `engines` 推导 glibc 下限。

目标系统准备 `sh`、GNU tar/coreutils、CA 证书、D-Bus、gnome-keyring 和原生模块所需动态库。系统包由设备准备阶段安装，连接器安装脚本不联网、不 sudo、不建立或解锁用户 keyring。无桌面环境也须显式提供受保护的用户会话与 Secret Service；缺后端直接拒绝，不能回退文件、内存或 keyutils。

## 固定封装方法

采用 Node SEA（Single Executable Application，单可执行应用）。esbuild 以 `platform=node`、CommonJS 输出打包应用及合同，postject 将 SEA blob 注入同架构、同版本的官方 Node ELF 副本。关闭 snapshot 和 code cache；不在 Windows 上构造 Linux 原生模块后宣称原生验收通过。构建工具只作为锁定开发依赖，不增加服务端运行依赖。[固定 SEA 文档](https://nodejs.org/download/release/v22.19.0/docs/api/single-executable-applications.html)、[esbuild](https://esbuild.github.io/api/#bundle) 和 [postject](https://github.com/nodejs/postject) 是依据。

SEA 的内置 `require` 只加载 Node 内置模块。bundle 的启动 banner 建立以真实 `process.execPath` 为锚点的 `createRequire`，用它加载发行物内的原生包；不从当前工作目录、`NODE_PATH` 或 workspace 查找原生依赖。目标程序启动时清理会改变模块加载的继承环境，保留现有客户端启动行为的受控环境边界。

三个原生包保持官方 loader 和匹配的 `.node`/helper 文件布局，作为随归档携带的 sidecar。只收录该架构的运行必需文件及许可证；目标设备安装和运行阶段禁止调用安装生命周期脚本、node-gyp 或网络临时补件。构建机阶段必须执行下面的 node-pty 原生编译，构建禁令不适用于它。构建时核 ELF 架构、动态库、包版本及锁文件 integrity；原生库损坏或缺失必须失败。

node-pty 1.1.0 官方归档没有 Linux amd64/arm64 `.node`；其 [安装入口](https://raw.githubusercontent.com/microsoft/node-pty/v1.1.0/package.json) 为 `node scripts/prebuild.js || node-gyp rebuild`。两架构各自在同架构 Linux 构建机编译，不能仅复制上游 prebuilds。构建前从受核来源准备 GCC/G++、Make、Python 3、锁定的 node-gyp 11.4.2 和 lock 中的 node-addon-api 7.1.1；记录工具链实际版本、系统包来源及架构。Python 和编译器仅属于构建机，不成为目标安装前置。[node-gyp 构建要求](https://github.com/nodejs/node-gyp#installation)

Node 执行程序和 headers 都使用 `.node-version` 的准确版本。headers 从 `https://nodejs.org/dist/v22.19.0/node-v22.19.0-headers.tar.gz` 取得，按同版本官方 `SHASUMS256.txt` 核摘要；解压到本任务独有 header 目录。在无公共 CAS 硬链接的私有 node-pty 源码副本中，以锁定 Node 执行上游 install/postinstall，设置 `npm_config_build_from_source=true`、`npm_config_nodedir=<verified-header-root>` 和 `npm_config_python=<verified-python>`，PATH 指向锁定 node-gyp。编译期间阻断自动下载，缺 headers 或工具立即失败。强制源构建可能删除私有 prebuilds，因此不得在共享缓存副本执行。

将产出的 `build/Release/pty.node` 放入归档的 `node_modules/node-pty/build/Release/`，保留上游 `lib/` loader 和许可证。上游 `binding.gyp` 的 Linux target 生成 `pty.node`，`spawn-helper` target 仅属于 macOS；Linux 归档不要求这个 macOS helper。逐文件摘要与 ELF 架构、动态库要求、Node ABI、headers 摘要、工具链和原始编译日志进入 manifest/构建回执；构建源码、headers、编译器和 node-gyp 不随目标发行物交付。每架构必须在无源码/宿主 Node 的 guest 中，通过已安装 SEA 的 `run` 实际建立 PTY 并加载该 `pty.node`，检查交互和退出；单独编译成功或 `--version` 不算加载验收。

`cli.ts` 的 ESM 自动启动判断不进入 SEA bundle。抽取共享命令模块，源码入口保留自动启动与公开重导出，发行入口显式调用 `main` 并复用退出、信号和脱敏收尾。`protocol.ts` 改为调用可信公钥读取函数；源码函数保留原文件来源，发行构建通过 esbuild 插件替换该模块为 `node:sea.getAsset` 实现。避免 CommonJS bundle 运行时求值 `import.meta.url`，不得静默换用网络公钥。

发行元数据与协议身份分开。新 `--version` 返回连接器发行版本、源码、运行时、OS/架构；不访问配置、网络或秘密后端。现有 `getPending` 和 MCP 客户端的固定 `0.1.0` 标识保持，不能把发行版本替换进请求 user-agent。已有 pending 的 exact-retry 不因升级改变。

## 产物、清单与信任

后续构建按架构输出到 `linux-${ARCH}/`，其中包含 `workmesh-connector-${VERSION}-linux-${ARCH}.tar.gz`、同版本 `manifest.json`、`SHA256SUMS`、`install.sh` 及 `installer-linux-${ARCH}/`。安装助手位于该子目录的 `bin/workmesh-connector-installer`，原生闭包位于 `node_modules/`。安装助手同样为 SEA ELF，只打包清单解析、归档校验和安装逻辑，不依赖系统 Node 或 Python。归档内固定布局如下，`${VERSION}` 与 `${ARCH}` 由构建脚本严格验证。

```text
bin/workmesh-connector
node_modules/<运行必需原生 loader 与同架构依赖>
release.json
uninstall.sh
LICENSES/<随产物依赖许可>
```

应用与合同代码嵌入 ELF，官方依赖 loader 属运行文件。归档没有 WorkMesh `src/`、`.git/`、TypeScript、测试、source map、包管理器、宿主 Node 启动脚本或指向归档外的 workspace 链接。公钥原字节与构建元数据嵌入 SEA，不依赖目标目录的源码文件。

清单使用严格 schema：`connectorVersion`、`sourceCommit`、`sourceTree`、`lockSha256`、`nodeVersion`、`platform`、`arch`、`archive`（文件名、字节数、SHA-256）、`files`（相对路径、类型、mode、字节数、SHA-256）、`nativeDependencies`（包版本、上游 integrity、ELF/动态库要求）、`publicKeySha256`、`installScriptSha256`、`installer`（架构、文件名、字节数、SHA-256）、`licenses`。各归档、脚本及安装助手都由外层清单绑定，避免归档包含自己的摘要循环。未知 schema、重复路径、错误架构和清单缺成员均拒绝。

SHA-256 证明完整性，不独自证明发布者身份。本批仅从受审构建证据取得本地归档、清单和安装脚本，全部提交为可审查产物的后续交付证据。对外下载地址、发行签名身份和发布信任机制属于另批发布方案；不使用新的签名私钥、注册表令牌或 GitHub Release 权限。Skill 的既有 Ed25519 校验不变。

## 安装、升级与卸载

下面是待实现的安装样例，当前仓库不存在这些发行文件。`ARCHIVE` 和 `MANIFEST` 指向经受审来源取得的本地文件，不含真实秘密。

```sh
sh ./install.sh --archive "$ARCHIVE" --manifest "$MANIFEST" --prefix "$HOME/.local"
"$HOME/.local/bin/workmesh-connector" --version
"$HOME/.local/bin/workmesh-connector" connect --expect /path/to/expectation.json
"$HOME/.local/bin/workmesh-connector" run -- /path/to/client
"$HOME/.local/bin/workmesh-connector" abandon-pending
```

安装脚本离线工作。脚本按 `uname` 选择脚本所在目录内的同架构 SEA 安装助手，先用构建时写入脚本的 SHA-256 清单校验助手及随附原生闭包，再执行；不存在或摘要不同即失败。助手放在 `installer-linux-${ARCH}/bin/`，Koffi 闭包放在该目录的 `node_modules/`；外层清单逐文件绑定它们。脚本与助手的来源信任由上一节受审产物取得规则保证。助手使用嵌入的严格 schema 和锁定 tar 解析库，逐项验证清单、归档及脚本摘要，不调用系统包管理器。先枚举 tar 成员并拒绝绝对路径、`..`、重复/覆盖成员、控制字符、设备文件、FIFO、链接、setuid/setgid、异常 mode 和清单外成员，再向私有暂存目录逐成员写入。检查路径祖先与所有者；不解包到现存用户配置，不对现存祖先改权限。SHA 与长度不合、空间不足、缺动态库时不切换入口。

程序安装在 `${PREFIX}/lib/workmesh-connector/releases/${VERSION}-${ARCH}/`；入口 `${PREFIX}/bin/workmesh-connector` 指向受管理的 `current/bin/workmesh-connector`。安装助手携带同架构 Koffi loader，复用 POSIX `flock` 语义；随助手提供的原生文件也由脚本先核摘要。锁对象首次创建时验证所有者、类型、mode 和单硬链接，贯穿校验、暂存、重命名与入口切换。连接配置仍走现有 `defaultDirectory` 和自身 OS 锁，不把安装锁当配对授权。

版本目录使用私有暂存、验证后同文件系统重命名；已有同版本目录必须逐文件摘要一致才幂等返回，不能覆盖。启动验 `--version` 后，通过同目录临时链接和原子 rename 切换 `current`；已有不同用途的 bin 入口拒绝覆盖。新进程固定实际版本位置加载 sidecar，运行中的旧进程不改依赖文件。

升级保留当前版与一份回退版。安装、校验或切换失败保留旧入口、旧配置、pending、journal 和系统秘密；临时记录不含配对码或令牌。回退只能切换经原清单验证的已安装旧版。程序目录的 `current` 链接是显式受管理对象；现有配置目录仍拒绝链接，不修改这项安全规则。

卸载样例为 `sh "$HOME/.local/lib/workmesh-connector/current/uninstall.sh" --prefix "$HOME/.local"`。卸载脚本使用安装时保存且由清单绑定的同架构 SEA 安装助手，只删除安装账本证明归本连接器的程序目录与入口；拒绝来源变化、活动进程或不安全路径，保留配置及系统秘密。卸载不撤销服务端 Connection；完整下线由管理员走现有 DELETE＋If-Match，随后按单独授权清理准确秘密引用，不增加 `--purge`。

## 后续产品文件清单

以下文件是单独放行后才修改的清单。本轮只写方案文件。

| 文件 | 后续改动与目的 |
| --- | --- |
| `apps/connector/src/commands.ts` | 从现有 CLI 抽取共享命令、错误呈现与进程收尾，不改连接策略 |
| `apps/connector/src/cli.ts` | 保留源码 ESM 入口与现有导出，调用共享命令 |
| `apps/connector/src/release-entry.ts` | 显式 SEA 启动、发行版本输出、受控模块加载环境 |
| `apps/connector/src/trusted-key.ts`、`release-trusted-key.ts` | 源码文件公钥读取与 SEA 资产读取，发行时替换模块 |
| `apps/connector/src/protocol.ts` | 仅接入可信公钥读取函数；保留全部验证和现有协议客户端标识 |
| `apps/connector/scripts/build-release.mjs` | 严格元数据、两架构 node-pty 原生编译与 headers/工具链回执、原生依赖闭包、esbuild、SEA、postject、归档及清单；拒绝错误版本/架构 |
| `apps/connector/scripts/install.sh`、`install-entry.ts`、`uninstall.sh` | 自包含 SEA 安装助手与 shell 引导；严格归档解析、受保护暂存、OS 锁、原子切换、回退和归属卸载 |
| `apps/connector/test/install.integration.test.ts`、`vitest.install.config.ts` | 只测安装后的入口，非空且串行；把服务端夹具与目标设备分开 |
| `apps/connector/test-support/install-server.ts`、`install-driver.mjs` | 在测试控制端启动真实 API/MCP，向目标以 stdin 传测试配对码，绑定准确产物路径 |
| `apps/connector/package.json`、`tsconfig.json`、`tsconfig.build.json`、`pnpm-lock.yaml` | 锁定 esbuild/postject/tar/node-gyp 与发行元数据，添加 build/release/install 验收入口，测试夹具排除生产构建 |
| `scripts/verify-connector-install.mjs` | 创建隔离目标、运行两架构安装、重启与收尾，拒绝宿主源码和 Node 可见 |
| `.github/workflows/ci.yml`、`scripts/ci-policy.mjs`、`ci-policy.test.mjs`、`validate-ci.mjs` | 新双架构原生产物＋安装验收纳入 Required CI；保留三系统 native storage |
| `scripts/ci-test-inputs.mjs`、`turbo.json` | 声明新服务端夹具实际消费的跨包源码，防缓存漏检 |
| `docs/integration/installation.md`、`README.md`、`mcp.md`、`troubleshooting.md` | B4 安装、客户端配置、错误恢复与发布状态说明；新页由手册入口链接 |
| `docs/agent-integration.md`、`AGENT_PROTOCOL.md`、`AGENTS.md`、`apps/connector/README.md` | 核实际命令与参数，区分源码验证入口和设备发行入口 |
| `docs/adr/0089-connector-versioned-distribution.md`、`docs/adr/README.md` | 放行产品阶段前补 Proposed ADR，记录新封装依赖与安全边界，接受状态由正式裁定决定 |
| `docs/reviews/b-ship/` | 后续准确产物、命令、目标条件、首败、原生验收和收尾证据 |

构建与验收脚本固定仓库命令为 `pnpm --filter @workmesh/connector build:release -- --output <owned-output>` 和 `pnpm --filter @workmesh/connector test:install`；均待实现。新 devDependencies 的准确版本与 integrity 在实施开始时核官方元数据并锁定，不能用 `latest` 或临时 npx 安装。本轮只确定工具选择，不伪造未生成的 lock 条目。

## 秘密、资源与空间

配对码只从隐藏终端或 stdin 输入，允许保存在受保护 pending；令牌唯一持久化落点仍是系统秘密存储。日志、manifest、命令参数、预期清单、安装账本、普通环境文件和模型上下文都不保存秘密。`run` 继续只向客户端子进程注入令牌；发行器不配对、不发令牌、不修改服务端认证。临时测试秘密不打印，不传到构建任务。

共用 pnpm CAS、工具和镜像缓存只读借用；任务 virtual store、node_modules、build 输出、DB、D-Bus、keyring 和目标磁盘私有。构建至少计入依赖副本、bundle、SEA blob、ELF、归档与清单；安装剩余空间须覆盖压缩归档、解压暂存、新版、当前版与回退版。2 GiB 是测量起点，实际预检按文件实长和可用磁盘拒绝，不借其他任务空间承诺成功。

验收目标由两架构原生 Linux runner 创建独有、可重启的 KVM 虚拟机，客户机不挂载仓库。amd64 使用 `ubuntu-24.04` 并实际预检 KVM；ARM64 使用专用自托管原生 runner，labels 固定为 `[self-hosted, linux, ARM64, workmesh-connector-kvm]`。不再选择 ARM64 hosted runner：其宿主不提供 `/dev/kvm`，安装软件无法补齐。[GitHub 官方说明](https://github.com/actions/runner-images/issues/14062)、[自托管 labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)

ARM64 资源取得是后续实施前置条件。Chief 先落实专用原生 ARM64 裸机来源、owner 和隔离额度；仓库管理员在该主机准备 Ubuntu 24.04、可用 `/dev/kvm` 及同架构 guest，并实测 KVM 启动和完整重启，再通过已有受控管理面注册仓库专用 ephemeral runner、赋予上述 labels。主机只承接 WorkMesh 受信任分支任务，执行后恢复干净环境；注册凭据留管理员侧，不进入本任务文件或测试 job。缺现成设备或注册授权时，先另批资源/凭据，ARM64 实施不得放行；本轮没有取得或注册该设备。

guest 采用上表系统。每个 job 启动前确认宿主实际架构、`/dev/kvm` 访问、KVM 加速 guest 启动、镜像来源、RAM、磁盘和同用户秘密后端；labels 不代能力实测。缺能力必须失败或保持未执行，不能用 skip、x64 模拟 ARM64 或容器重启代替。保存 guest 镜像身份、runner 实际系统、kernel、glibc、libstdc++ 与软件包版本，并按[验收设计](acceptance.md#必需检查与-ci)将两架构同一 run/attempt 的回执绑定 Required CI。

创建前记录 owner、准确目录、VM/进程/卷 ID、秘密引用与服务端测试库。收尾只操作这些对象，先核活动和身份，再保存停止、删除与不存在回执。遇到真实权限拒绝不绕过、不扩大删除范围；共享缓存和其他任务数据保留。独审、最新适用 Required CI、双架构真实安装验收和 Chief 确认都完成后，才能交产品成果验收。外部发布仍需单独批准。

## 本次研究与历史 KVM 方案的关系

上面的 KVM 资源段是前次独审闭合后的产品方案；本次不取得裸机或注册 runner。TCG 实验使用现有 hosted 双架构资源，显式禁用 KVM，验证完整 guest 重启、真实 Secret Service 持久性和原加密重放窗口。研究结果单独归档，供 Chief 裁定后续路线；只读技术原理、普通容器 restart 或源码探测都不能解除最终安装门禁。

原生 node-pty 构建、SEA 实际加载、完整 API/MCP/Skill 校验、秘密边界、升级与卸载断言继续保留。研究通过也不等于这些产品断言已通过；旧 saved plan 仅作为下面的历史原件保留。

## 已确认的文档准备计划原文

来源为 `doc:Sq2Il0gKZRLrp-8L4RFk3` 对应本会话完整计划，及用户在执行请求中完整重贴的正文。平台 `tds.todos` 的 plan 部分截断；下列原文从会话完整副本保留。工具截断不用于补造内容。

<!-- BEGIN-SAVED-PLAN -->
## 背景

现有连接器已实现完整协议验证、系统秘密存储和故障恢复，但仍依赖源码入口。目标是准备版本化可执行分发、B4 文档及无源码安装验收的完整实施方案。

首批发行覆盖 Linux amd64、arm64，使用独有干净虚拟机或原生 CI。当前阶段保持“尚在规划、未批准实施”，采用 Todos＋仓库记录。

## 约定

- Linux 采用 glibc 环境，要求同一用户的 D-Bus 会话及可解锁 Secret Service。最低软件条件取锁定运行时与原生依赖要求的较高值。
- 连接器单独验收以 1 vCPU、1 GiB 内存和 2 GiB 可用磁盘为测量起点，作为建议记录；实测前不宣称这是最低硬件要求。
- 卸载保留连接配置及系统秘密；服务端撤销沿用既有管理员操作。

## 文件改动

- **`docs/plan/b-ship/spec.md`**：保存当前完整规格及用户答复，区分已确认矩阵、环境建议和实施放行门禁。保留历史来源、原测试及 DoD，不改写旧验收结果。

- **`docs/plan/b-ship/implementation-plan.md`**：保存完整后续实施方案及逐文件改动清单。固定采用 esbuild 打包应用与共享合同、postject 生成 Node SEA 可执行程序，并携带同架构 keyring、Koffi、node-pty 的原生依赖及许可证。运行时来自 `.node-version`；目标端不依赖 Node、pnpm 或 workspace。[Node SEA 说明](https://nodejs.org/api/single-executable-applications.html)

  明确处理 `packages/contracts/package.json` 的源码导出、`apps/connector/src/cli.ts` 的 ESM 启动判断，以及 `src/protocol.ts` 的公钥相对路径。发行入口显式调用 `main`，公钥作为 SEA 资产加载，原生模块通过安装位置建立文件模块解析；保留现有源码运行入口。

  固定产物为带版本的双架构归档、安装脚本、清单和 SHA-256。清单绑定源码、锁文件、运行时、架构、原生依赖及逐文件摘要；安装包排除仓库源码、测试、source map 和外部 workspace 链接。安装阶段离线校验架构、摘要、权限、动态库及归档路径安全，不临时下载依赖。

  安装样例固定为 `sh ./install.sh --archive "$ARCHIVE" --manifest "$MANIFEST" --prefix "$HOME/.local"`；随后使用 `workmesh-connector --version`、`connect --expect <file>`、`run -- <client>` 和 `abandon-pending`。这些均标为待实现命令。升级先验证独有版本目录，再原子切换入口；失败保留旧命令，不改 pending、journal 或秘密引用。

- **`docs/plan/b-ship/acceptance.md`**：逐项承接 R1 的原测试、九类适用性和 DoD，落实待创建的 `apps/connector/test/install.integration.test.ts`。复用 `src/connect.ts` 的 `connect`、`src/protocol.ts` 的 `verifyPairing`、`validateBootstrap` 和 `src/commit.ts` 的 `recoverCommit`，验收必须通过安装后的进程入口。

  黄金路径使用真实 API/MCP、签名 Skill 和 `SystemSecretStore`；覆盖指纹、身份、能力、active 凭据及完整引导顺序。拒绝与恢复覆盖秘密后端故障、损坏 pending、同身份重放、窗口外、撤销、overlap、提交中断、并发、升级失败和重启持久性；输出与日志检查秘密泄露。

  明确双架构原生构建及安装验收接入 Required CI；保持现有三系统平台回归，缺夹具、失败或意外跳过不能放行。B4 后续同步 `docs/integration/`、`docs/agent-integration.md`、`AGENT_PROTOCOL.md`、`AGENTS.md` 和连接器 README，并逐项核命令与 dry-run 支持。

- **`docs/reviews/b-ship/planning-evidence.md`**：记录真实 GitHub `refs/heads/main`、当前分支、来源差异、设备条件、固定写作技能来源及检查结果。复用 `scripts/capture-connector-source.mjs` 的源码绑定规则设计后续证据，保存首败和未测事实。

  共享包缓存只读复用；构建目录、秘密服务、测试库及目标设备均独有并登记归属。空间预检计入归档、暂存、当前版本和回退版本；仅收尾本任务资源。说明本阶段无接口行为变化，因此现有接入能力说明无需改写。

- **`docs/reviews/r1/decisions.md`**：追加本轮已确认的矩阵和验收环境，并链接上述方案。保留历史建议原文，明确设备确认不等于产品实施批准。

外部注册表、GitHub Release 发布、新凭据操作、真实外发和 WebUI 均不在范围内。

## 验证与交付

- 对照当前协议、OpenAPI、Schema、已接受 ADR 和 R1 测试映射，检查仓库方案、saved plan、当前规格一致；所有新增安装能力标为待实现。
- 使用仓库固定版 `zh-tech-writing` 及手册结构、排版参考逐项自检；已有 `autocorrect` 时执行，缺失时手检。运行 `pnpm check:integration-docs`、`pnpm ci:validate`，检查新增文档链接及 `git diff --check`，按实际 CI 分类完成必需检查。
- 后续实施验收清单保留 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:conformance`，以及双架构无源码安装、真实秘密存储、升级卸载和完整连接验收。本阶段不填写这些产品验收已通过。
- 方案及证据提交本会话分支，完成仅针对 P0/P1 的独立复核；Chief 单独放行后才进入产品实现。
<!-- END-SAVED-PLAN -->
