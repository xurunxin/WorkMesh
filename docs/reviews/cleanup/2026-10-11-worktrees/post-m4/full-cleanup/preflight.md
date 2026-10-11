# 15:05 全清接续：发布前预检

本轮从当前会话分支接续用户的全清裁定，旧 `1266d651cc9760b20a6a83aba5ce3a0a7d7e2b78` 独审仅作为第三轮历史。本文件是删除前声明，不是执行成功回执。

开工真正远端 main 为 `6a06ce338f90bf16ce27e3cca1a76771eba42e6e`，原返回在 `remote-opening.json`。盘点入口原采样为19工作树、40,836,624,893 B逻辑，主仓库另6,460,728,286 B；不是物理释放基线。

14 个非当前、非系统拒绝父目录逐路径核查，并保存最终映射；仅 `execution-plan.json` 中 `safe=true` 且删除前再次通过 `verify-target.py` 的目标可执行。未合业务使用远端原 branch 的 immutable commit 恢复，未提交代码和真实 staged/index 状态单独保全；不以清理接受业务或变更其他任务卡。保全来源优先 Git/已有 ZIP，依赖与缓存按准确源码、历史或现场锁、逐包 metadata 分类。脱离锁的旧 zod 按仍受保护的真实 CAS 字节核验；原生派生物以已核共享原生工具和受控运行源码重建。

M4/M5 六个准确测试容器 ID、独占卷与账本的对应在 `containers-plan.json`。执行前仍须确认实际停止、名称/镜像/挂载一致、无其他卷消费者；不删除共享镜像或默认 compose 业务数据，不做全局 prune。

G1/D0/C3 的三个拒绝父目录及 G1 审计 JSON 原拒绝所在 #52 父目录，共四目录永久排除。九个只读 Git fixture 不是系统拒绝：只按 `readonly-exception.json` 的九路径/696 B清 ReadOnly 位；不改 ACL。dirty 的两个旧树和受控 fixture 的正式 Git 参数在预先声明的执行计划中；任何真实删除失败/拒绝立即停原目标，无第二种删除方式。

正式 Git 返回成功后，若留下预先记录的 pnpm 链接，只在零普通文件的证明后对准确本体做非递归收尾，再删除普通空目录；外部 store/共享工具目标不递归、不清理。每目标保存原输入输出、原子子进程真实 exit，cmdlet 的归一结果与 native exit 分列。

必要预检、最终脱敏归档及执行脚本必须先提交推送并独立回读远端本分支；后续绑定文件核 Git blob 与 Windows 运行字节（CRLF/BOM/二进制区别）。每个删除前另外独立查询 main 与该恢复 branch。当前工作树、主仓库、workspace 根、其他项目、用户配置、共享原始资源及审计历史保持。

环境验证首次单包尝试误继承本仓库的19个 pnpm workspace package 范围，已终止，真实 exit 为4294967295，`rebuild-verification.json`保留失败；没有下载新包或修改源码/锁。随后隔离 workspace/`--ignore-workspace` 单包重建成功。`clone-or-copy` 实测与 CAS 同身份，最终改用 `copy`，实核不同身份、nlink=1、修改私有文件不改变 CAS。测试形成的本轮环境属于当前构建，另登记收尾，不混入旧工作树回收数字。

重建入口是前景手动命令，不是平台或 daemon 的自动配置。当前平台共享仓库没有 `extensions.worktreeConfig=true`，稀疏检出入口会停止，避免修改共享 cache/config；不宣称历史证据检出已经变薄。具体新任务在用户选定后重拉最新代码，先盘点、调用 `rebuild-environment.py plan`，必要时在自己的干净新工作树 `install`，结束后 `finish-plan`登记精确候选。

本轮后续须新的正式独审、准确最新 head RequiredCI，通过前不合入。最终实际摘要、剩余目录、组成与原件见随后生成的 `report.md`；本预检不提前声称清理、CI或合入成功。
