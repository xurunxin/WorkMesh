# 连接器离线安装

## 适用范围与交付状态

连接器发行目标为 Linux amd64 和 arm64。仓库内构建命令生成本地版本化产物，不发布 npm 包或 GitHub Release。当前产品实现与完整验收正在进行，实测状态以[产品交付记录](../reviews/b-ship/product/progress.md)为准。

应用和离线安装助手均为 Node SEA（Single Executable Application，单可执行应用）。Node 运行时嵌入 ELF，原生 loader 与库随归档携带。目标端无需 Node、pnpm、workspace、Python 或仓库源码。

## 系统准备

使用同一 Linux 用户的 D-Bus 会话和可解锁 Secret Service。系统须有 `sh`、`sha256sum`、CA 证书及原生库动态依赖。连接器不 sudo、不安装系统软件、不建立或解锁 keyring，秘密后端不可用直接失败。

当前实测目标准备为 Ubuntu LTS 完整虚拟机。最终软件下限须结合 `manifest.json` 中 Node 版本、原生 ELF 所需动态库和符号版本核定。1 vCPU、1 GiB 内存和 2 GiB 磁盘只是测量起点，不是最低配置承诺。

## 构建与验证来源

在同架构 Linux 构建机使用仓库锁定 Node 和 pnpm，并准备 GCC/G++、Make、Python 及 binutils：

```sh
pnpm install --frozen-lockfile
pnpm --filter @workmesh/connector build:release -- --output /path/to/new-owned-output
```

构建要求已提交、干净源码；输出目录须不存在。运行时和 headers 按准确 Node 版本下载并核官方摘要。node-pty 在私有源码副本中编译，编译器和 headers 不进入目标产物。

通过受审构建记录取得归档、`manifest.json`、`SHA256SUMS`、`install.sh` 和同架构 `installer-linux-*` 目录。SHA-256 证明完整性；发布者身份来自受审来源，不能仅凭随包清单信任外来下载。没有公开下载地址或新增发行签名密钥。

## 安装与连接

以下路径不含秘密。先校验，再离线安装：

```sh
cd /path/to/verified-distribution
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
