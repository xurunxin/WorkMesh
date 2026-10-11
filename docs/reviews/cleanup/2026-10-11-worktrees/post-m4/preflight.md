# 第三轮先行预检与保全

本轮基于真实远端 main `6a06ce338f90bf16ce27e3cca1a76771eba42e6e`。只准备回收第二轮 #60 的旧 linked worktree `C:\Users\xurx\.tds\workspaces\01a12766-4132-7d8c-a542-dcbfb2008b49`，完成 HEAD `a27c1616ea532a39c609006ccdc4289a1641b21a` 是 PR217 的不可变 merge 第二父。

扫描有 12,617 个普通文件，逻辑 3,030,837,288 B。除 `.git` 管理指针外，12,616 个文件全是已提交文件，原字节逐路径映射到准确 Git blob；Windows/Git 长度、SHA256、BOM、LF/CRLF 变换分列。没有未提交、ignored、链接、嵌套仓库、只读文件或 hardlink。源码、证据、日志均已在 main 可达，不新增整树/依赖副本；22 B 空 ZIP 仅沿用已合核验接口，未保全新原件。

当前本卡已换成本轮新工作区。准确旧会话、daemon workspace/结束 step、HEAD/ref/reflog、PR217 merge、当前 M4/M5/#5 对话、全部容器挂载和可见进程已联合核查；没有该候选活动或恢复引用。不是凭 Done 或干净 status 放行。没有全局历史恢复 registry 或全部 OS handles，边界如实记录；执行前另核全部普通文件独占读取及字节。

本预检与完整映射必须先提交并成功推送，再独立读取远端 `refs/heads/main`、刷新任务/容器/进程/恢复对话、验证已推送源码与保全，最后发正式 `git worktree remove`。候选没有链接，不提供备用删除或残留收尾；失败或拒绝停止原目标，不 Force、不改属性/ACL、不拆子目录或换工具。

全部其他旧树已只读刷新 head/status/ignored、普通文件身份长度、链接和嵌套仓库。旧九只读夹具对象、G1/D0/C3及父目录、38/36/2旧依赖缓存保护、M4/M5恢复目录、#5待审、#21首面checkpoint和历史未提交成果保持保留。没有后台timer/daemon，没有 Docker 修改或远端分支/标签删除。最终报告与剩余台账在操作后生成；此页不表示删除已经执行。
