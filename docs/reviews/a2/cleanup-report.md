# A2 资源收尾

完整登记、创建信息、删除前归属与活动引用、实际操作退出码及逐 path 回执见 [cleanup-results.json](cleanup-results.json) 和其指向的各 run 原件。汇总不替代逐项回执；未确认项按原记录保留，不推断成功。

两轮 Lite 首败与后续重验均使用独有 project、镜像和安装目录。Compose 容器、卷、网络按 project label 核对；CA 额外卷、装载容器、四角色 probe 和镜像按 task label 及零引用核对。服务结束后保全日志，再清专用资源；安装目录先验证绝对路径、临时目录边界及整树无链接，再逐 path 删除并记录结果。文件类型资源的单独 cleanup 为 null 时，以同目录逐 path 回执核对，不将 null 填成成功。

原始日志与源码快照采用逐文件无损 gzip；目前 3369 份的解压 SHA 和原字节逐项一致。仅已核验的闲置未压缩副本被清理。历史 Git blob 和 Windows 工作树换行分列记录，脱敏 trace 不冒作秘密原字节。复现 HTML 报告时须先按原相对路径解压其归档数据文件，不能把缺失的未压缩引用当完整在线报告。

保留当前 worktree 和交付证据、共享基础镜像/网络/build cache。C3 的审计和新旧目录保持只读；没有重开其清理任务，没有 global prune，没有换工具绕过历史审批拒绝。
