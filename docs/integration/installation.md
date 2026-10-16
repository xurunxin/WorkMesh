# 连接器离线安装

## 适用范围与交付状态

连接器发行目标为 Linux amd64 和 arm64。仓库内构建命令生成本地版本化产物，不发布 npm 包或 GitHub Release。Linux 双架构完整产品已在已记录源码快照验收，仓库工件见[版本化工件](../reviews/b-ship/product/artifacts/README.md)。最终提交检查、成果独审与合入状态以[产品交付记录](../reviews/b-ship/product/progress.md)为准。

应用和离线安装助手均为 Node SEA（Single Executable Application，单可执行应用）。Node 运行时嵌入 ELF，原生 loader 与库随归档携带。目标端无需 Node、pnpm、workspace、Python 或仓库源码。

## 系统准备

使用同一 Linux 用户的 D-Bus 会话和可解锁 Secret Service。系统须有 `sh`、`sha256sum`、GNU tar、CA 证书及原生库动态依赖。GNU tar 只用于展开已核摘要的安装助手。连接器不 sudo、不安装系统软件、不建立或解锁 keyring，秘密后端不可用直接失败。

目标软件门槛为 Linux 内核不低于 4.18、glibc 不低于 2.34，以及提供 `GLIBCXX_3.4.25` 的 libstdc++。本次两架构 node-pty ELF 均引用 `GLIBC_2.34`；其余原生库要求更低。libstdc++ 门槛沿用 [Node 锁定版本的官方支持说明](https://github.com/nodejs/node/blob/v22.19.0/BUILDING.md#official-binary-platforms-and-toolchains)。这些是软件门槛，不能代替目标发行版实测。

当前产品目标为 Ubuntu 24.04 LTS 完整 TCG 虚拟机，分配 2 vCPU、1,536 MiB 内存和独有 12 GiB 逻辑磁盘。控制侧 Python 只驱动验收，连接器和安装助手不调用 Python。1 vCPU、1 GiB 内存和 2 GiB 可用磁盘保留为原测量起点，不是最低配置承诺。具体运行时间与磁盘分配见产品交付记录。

## 构建与验证来源

在同架构 Linux 构建机使用仓库锁定 Node 和 pnpm，并准备 GCC/G++、Make、Python 及 binutils：

```sh
pnpm install --frozen-lockfile
pnpm --filter @workmesh/connector build:release -- --output /path/to/new-owned-output
```

构建要求已提交、干净源码；输出目录须不存在。运行时和 headers 按准确 Node 版本下载并核官方摘要。node-pty 在私有源码副本中编译，编译器和 headers 不进入目标产物。

通过受审构建记录取得程序归档、`manifest.json`、`SHA256SUMS`、`install.sh` 和同架构 `installer-linux-*.tar.gz`。助手压缩包允许在仓库保存，避免直接提交超过 GitHub 单文件限制的 ELF。SHA-256 证明完整性；发布者身份来自受审来源，不能仅凭随包清单信任外来下载。没有公开下载地址或新增发行签名密钥。

先把下述文件放到当前用户独有的目录。目录权限为 `0700`，目录祖先不得允许其他用户写入。用受审记录中的摘要核助手压缩包，再用系统 GNU tar 解包；安装入口会再次校验助手闭包。连接器安装本身使用 SEA 解析程序归档，不调用系统 tar、Python 或包管理器。

## 安装与连接

以下以 amd64 为例；arm64 使用对应的两个归档。将 `$HELPER_SHA256` 设为受审来源记录的助手摘要，不从未知下载自行确认信任。以下路径和摘要不含秘密。先校验，再离线安装：

```sh
set -eu
cd /path/to/verified-distribution
umask 077
HELPER=installer-linux-amd64.tar.gz
ARCHIVE=workmesh-connector-0.1.0-linux-amd64.tar.gz
MANIFEST=manifest.json
printf '%s  %s\n' "$HELPER_SHA256" "$HELPER" | sha256sum --check
tar --extract --gzip --file "$HELPER" --no-same-owner --keep-old-files
sha256sum --check SHA256SUMS
sh ./install.sh --archive "$ARCHIVE" --manifest "$MANIFEST" --prefix "$HOME/.local" --dry-run
sh ./install.sh --archive "$ARCHIVE" --manifest "$MANIFEST" --prefix "$HOME/.local"
"$HOME/.local/bin/workmesh-connector" --version
"$HOME/.local/bin/workmesh-connector" connect --expect /path/to/expectation.json
"$HOME/.local/bin/workmesh-connector" run -- /path/to/client
```

安装 `--dry-run` 只读校验，不创建目录或锁。产品 `connect` 没有 dry-run；它从隐藏终端或 stdin 接收完整配对码，不接收秘密参数或链接。管理员清单沿用[连接器示例](../../apps/connector/examples/expectation.json)。完整协议、原始 Skill 字节、公钥签名、指纹和实时 MCP 身份验证均发生在提交前。

`--version` 输出发行版本、源码、运行时和架构，不访问配置或秘密。客户端配置片段只引用 `WORKMESH_INSTALLATION_TOKEN`；`run` 从系统秘密后端读取后注入子进程。恢复步骤见[故障处理](troubleshooting.md)。窗口外请管理员重新配对；原 pending 的 key/body/origin/user-agent 不因升级改变。

## 升级、回退与卸载

升级执行相同安装命令，使用受审的新归档和清单。助手验证私有版本目录，再原子切换 `current`。失败保留旧入口、配置、pending、journal 和秘密引用；同版本内容不同拒绝覆盖。

```sh
sh ./install.sh --rollback --prefix "$HOME/.local"
sh "$HOME/.local/lib/workmesh-connector/current/uninstall.sh" --prefix "$HOME/.local"
```

回退仅切换受账本清单验证的旧版。卸载拒绝活动进程和不安全路径，仅删除账本归属的程序文件。配置和系统秘密保留。完整下线仍由管理员执行原 DELETE＋If-Match 撤销 Connection，再按独立授权清理准确秘密引用；安装器没有 `--purge`。

## 安装失败处理

| 错误码 | 恢复步骤 |
| --- | --- |
| `INSTALL_ARCH_MISMATCH` | 重新核目标架构，取得对应的五个交付文件；保留旧命令。 |
| `INSTALL_ARCHIVE_HASH`、`INSTALL_HELPER_HASH`、`INSTALL_SCRIPT_HASH` | 从同一受审来源重新取得完整文件组，再核摘要；不要混用不同快照的清单或助手。 |
| `INSTALL_UNSAFE_DIRECTORY`、`INSTALL_UNSAFE_FILE`、`INSTALL_FOREIGN_ENTRY` | 选择当前用户独有的安全目录。保留已有对象，不修改共享目录权限或覆盖他人入口。 |
| `INSTALL_SPACE_REQUIRED` | 按清单核可用空间，计入暂存与回退版本。只收尾本人已登记资源，不清共享缓存。 |
| `INSTALL_VERSION_CHANGED` | 保留现有版本文件；同版本不同内容不能覆盖。核来源和版本，按受审升级步骤处理。 |
| `INSTALL_VERSION_ACTIVE` | 正常退出本人的连接器和客户端进程，再重试卸载或回退。保留运行中的版本依赖。 |
| `INSTALL_LEDGER_INVALID`、`INSTALL_JOURNAL_INVALID` | 停止修改安装目录，保留账本与 journal，交管理员核来源。不要手改账本或连接器 pending。 |
| `INSTALL_FAILED`、`CONNECTOR_RELEASE_NATIVE_INVALID` | 核系统动态库、文件完整性及受审版本。使用仍可运行的旧入口；完整文件组与软件条件恢复后再试。 |

安装故障不授权重建配对身份或删除系统秘密。连接故障按[故障处理](troubleshooting.md)中的既有安全下一步执行。

## 服务端基础交付候选

版本化服务端包的配置检查、安装、升级、程序回退和独立空目标恢复见 [服务端安装说明](server-installation.md)。当前处于 TA01 实现与验收阶段，尚未形成双架构三画像支持声明；连接器已交付能力沿原安装说明保留。
