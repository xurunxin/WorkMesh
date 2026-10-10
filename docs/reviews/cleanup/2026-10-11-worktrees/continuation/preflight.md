# #54–57 接续删除先行预检

本文件为本卡接续的先行提交内容。#53 原回执保持，不重复执行。用户已授权符合安全条件者直接回收。

| todo/PR | immutable 完成 HEAD | 逻辑长度 B | 原 junction / symlink | 保全 |
|---|---|---:|---:|---|
| #54 / PR212 | `883d279d3b5978680672a6c1d7364d421d0afd10` | 2,466,235,470 | 1925 / 0 | 63471 path，全映射、未匹配 0 |
| #55 / PR213 | `3ff46eb20616dc5488ba46b77b27e1fb2d783a93` | 2,742,944,421 | 1925 / 20 | 64001 path，全映射、未匹配 0 |
| #56 / PR214 | `fb770b62a926e7c27049c2795eafa6da4e0cb085` | 3,374,923,543 | 1925 / 20 | 65070 path，全映射、未匹配 0 |
| #57 / PR215 | `d27cb9be3a19befeae431df08276c9ca94d7dbed` | 4,534,246,620 | 1927 / 20 | 68648 path，全映射、未匹配 0 |

当前远端 main 原返回见 remote-main.json，准确 SHA 为 `87f88b89297c5c1e346f7ef99118c410f4b4a905`；完成分支和 PR head 原返回见 remote-completion-heads.json。四个完成 HEAD 均是主线实际 merge 的第二父，见 preflight.json 的完整 log 原件。每次删除前还须独立刷新 refs/heads/main 和活动/恢复引用。

主线 M0–M3 1613 份报告/JSON/ZIP 原字节来源核验和 148513 成员见 sources-read.json.gz、zip-members.json.gz；四份历史损坏 ZIP 逐项保留错误，不用于放行。必要未归档材料见 additional-evidence-54..57.zip/index；16 条脱敏记录明确原/脱敏哈希，不保存秘密原值。Node22.19.0 原包仅保一份，解包 runtime 原字节逐项映射。

所有链接本体已用 FSCTL_GET_REPARSE_POINT 原 reparse buffer、tag、base64 和哈希记录；解析目标在各自候选内。node_modules/.modules.yaml 的 X:\packages\.pnpm-store\v3 为安装来源配置，不是递归目标。现场普通文件 hardlink 计数 >1 为 0、readonly 为 0，未扫描/操作共享 store。609 个包版本分别绑定真实主线可达历史锁文件；构建/cache 与源码、脚本、工具版本关联，不承诺缓存字节重建一致。

本机同版 Git/PowerShell 受控夹具实证 Git 成功保留 junction、移除普通 hardlink 名称，sentinel 原字节不变。Git 成功后的链接收尾为事先声明步骤：残留核验必须确认普通文件 0、嵌套仓库 0、仅原已核 junction，本体逐项非递归 Remove-Item -LiteralPath，之后仅普通空目录非递归删除。任何失败/自动拒绝立即停原目标；不能套用于旧拒绝目标。

旧 #52 原明确保护精确路径与四个候选无交叉；保护快照 5206 条另存 protected-before.json。#58、#5/旧恢复、#21 首面检查点、当前构建、主仓库及根外登记继续保护。缺少全局恢复 registry/全部 OS handles 的能力边界不隐瞒，旧未确认用途目录保持留存。

执行入口 execute-target.ps1 每次仅一个固定 ValidateSet 候选，拒绝已有执行回执，检查根/祖先非 reparse、先行提交绑定、活动进程、每个现场字节/独占读取/链接原件和 Git 状态后才发正式移除。输入/输出/exit/时间逐项记在 operation-journal-*.jsonl 与 execution-*.json；空间只分列逻辑与卷级读数。

用户新增整体占用/清理机制要求见 ../mechanism.md 和 ../cleanup-rules.json；只读可复用盘点与规则已落盘，不声称平台 daemon 自动删除。
