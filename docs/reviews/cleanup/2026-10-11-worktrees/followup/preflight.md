# 本轮四个可执行候选先行预检

五个优先目标中，旧 #60 在只读夹具对象门禁停止，不再尝试；其余四个独立候选已完成保全。当前尚未执行删除；本预检必须先提交并成功推送，再逐目标刷新真实 main 与活动/恢复引用。

| 候选 | 任务 | 完成 HEAD | 逻辑 B | 普通文件 | 原 junction |
|---|---|---|---:|---:|---:|
| g1-plan | #18 | `49cd2136fe5109115fb4f3dcff89ed59b0bc7615` | 946,316,129 | 52,196 | 1918 |
| g1-build | #18 | `af583f71f310e68ade588f9922694dfd8aba7a65` | 946,655,821 | 52,290 | 1918 |
| upgrade-first | #31 | `1078bbcd527550bfabee73093b7ffd0032d3fd24` | 106,749,175 | 2,210 | 0 |
| upgrade-final | #31 | `1078bbcd527550bfabee73093b7ffd0032d3fd24` | 106,749,175 | 2,210 | 0 |

开工真实远端 main：`2da4918682f5238499131cff2c71ab465fcc080e`，原件 remote-main-opening.json。逐 HEAD 与全部 reflog 的主线可达均实跑 exit0。g1-plan 是 PR194 第二父，g1-build 是主线可达早期 checkpoint；#31 两树 HEAD 本来就是 PR204 主线，没有新增产品成果 PR。旧 #60 是 PR216 第二父，当前同卡重建的目录始终保护。

四个前轮用途未映射目录已通过会话元数据 cwd/branch、原用户任务全文和 daemon workspace/step 原记录定位为 #18、#31 的早期构建，见 build-provenance.json。#18 后续构建已完成并合入，#31 已结束；当前可见活动/待审恢复对话未引用这四个路径。旧 #60 主线成果可达，但夹具 Git object 带只读属性，现场完整保全尚未通过，已停止整个目标；精确 blocker 见 blocked-cleanup-old.json。没有据 Done/clean 独立决定删除。

mapping-* 对每个普通文件保现场长度/Windows SHA/属性/fileId/nlink 与准确 Git blob、明确 LF/CRLF 变换、ZIP member 或真实历史锁/逐包 metadata/源码构建输入。8909 个 blob 的实际原字节独立核验；混合换行现场原件另保全，不把 clean 当字节一致。用于放行的四份 ZIP 所有成员已完整读回核 CRC/SHA；准备期 partial ZIP 不用于放行，旧 #60 保全中途停止的原件亦保留。新档案内容寻址去重；大规模源码/文档全部复用 Git，依赖/缓存只保存输入和哈希，不复制整树/依赖。共享 X:\packages\.pnpm-store\v3 只是安装来源，未遍历。

四个可执行候选普通文件 nlink=1、readonly=0；两个 G1 的链接解析仅在各自目录内，reparse buffer/tag/hash 已保。两个升级目录无链接。原同版 Git2.55.0.windows.3/PowerShell7.6.6 链接实证继续适用；事先声明仅 Git 成功且已证原 junction/普通空目录时非递归收尾。原拒绝目标不能使用此流程。

retention-review.json 已逐个复核其余旧树，精确保留原38 node_modules/36 .turbo/2typecache、RAW/trace/恢复输入、G1/D0/C3拒绝父目录、#5待审、#21首面checkpoint及未合UI成果。protected-opening.json保存原source指针与本次存在性；原缺失路径不补造本轮删除。

实时参考门禁：可见进程/执行路径无候选引用，全部77容器（含停止容器）名称/挂载无候选引用，保原只读调用。每次删除前另读 board/#58/#5 与 main；执行器再核所有现场字节/独占读取/链接本体及先行提交。没有平台全局恢复registry/全部OS handles，覆盖边界如实披露。

准备期原失败：第一版遇 .gitattributes 混合LF/CRLF而停止保全；原脚本、partial ZIP和原输出保留。第二版 ignored 全表重复拆分导致过慢，仅终止本人精确Python准备进程，保原输入/回执/partial ZIP，优化为集合查询再准备。一次PowerShell转写引号解析失败也保原返回。此时全部删除尚未发生，不是失败后换工具重试删除。

本轮只做授权清理与适当证据/盘点/源码绑定/diff检查，不改产品功能、迁移、API/事件，不跑无关产品全套；不装新软件、不升级tds、不建timer/daemon、不删除远端分支标签。新成果仍待独审和准确最新RequiredCI条件合入，旧独审/CI不代本轮。
