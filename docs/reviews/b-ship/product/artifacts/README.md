# 连接器版本化仓库工件

## 来源与状态

当前通过快照在 `ec3dafa5/amd64` 和 `ec3dafa5/arm64`。源码为 `ec3dafa58e20b478137d2468e900cddb4205296a`，发行版本为 `0.1.0`。两架构完整产品 guest 与同一快照的 Required CI 全部成功；准确摘要见[证据索引](../evidence-index.json)。

`bc7002ed/` 保留历史候选，它的 ARM64 在并发阶段失败，不是当前通过工件。每个清单绑定源码 tree、锁文件、公钥、运行时、原生库和许可证。最终提交 CI、正式成果独审和合入状态见[产品记录](../progress.md)。本目录不表示 GitHub Release 或注册表已经发布。

## 文件与安装

每个架构目录保存程序归档、安装助手归档、`manifest.json`、`SHA256SUMS` 和 `install.sh`。目录名固定绑定源码快照，后续文档提交不重写这些工件的源码来源。升级候选只用于验收，不作为本次发行版本分发。

通过项目 Files 页面选择本会话分支，进入本目录后下载对应架构的五个文件。放到当前用户独有目录，并按 [B4 安装说明](../../../../integration/installation.md)核受审摘要、展开助手和执行离线安装。助手归档的准确摘要在该架构的 `manifest.json` 中；信任来源由本次审查与[证据索引](../evidence-index.json)确认。

目标端无需 Node、pnpm、workspace、Python 或应用源码。程序归档包含嵌入运行时、原生运行闭包和许可证；Koffi 的 `src/koffi` 仅含上游运行 loader。TypeScript、编译源码、测试、source map 和外部 workspace 链接均不进入工件。

## 原件复核

产品原件 ZIP 的摘要、准确 run/head 与架构在证据索引中。使用[复核脚本](../../../../../scripts/connector-install/verify.py)比对 Git blob、真实系统重启、同用户秘密持久和原 900 秒恢复窗口：

```sh
python scripts/connector-install/verify.py --archive <raw.zip> --sha256 <indexed-sha256> --head <full-source-head> --arch <amd64-or-arm64> --run <run-id>
```

复核在控制机器执行。参数来自索引，不能用当前 HEAD 替换工件清单中绑定的源码；产品最新 Required CI 和正式成果独审分别记录。

后续补齐源码前后绑定的运行，复核命令须加 `--require-full-source`。旧快照仅按原始记录复核，不为旧 ZIP 补造缺失的父链或源码回执。
