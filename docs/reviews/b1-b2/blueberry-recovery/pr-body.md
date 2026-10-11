连接器首次发送前持久化受保护的稳定请求身份，重试复用同一 key/body/context。完整协议、Skill及当前凭据身份验证通过后，才写系统秘密存储和仅含引用的正式配置；失败补偿新增秘密并保留旧配置。用户流程为 connect 后 run；零Schema/迁移及服务端生命周期变化。

独审指出开发镜像安装前遗漏 connector postinstall 脚本。本次四个开发Dockerfile提前复制 prepare-native.mjs，并补齐现有workspace依赖manifest，保留正常安装钩子。Source gates 新增四镜像完整构建；使用 --no-cache 保证各自实际执行钩子，失败阻断Required CI。独审后的受测源码不再改连接器/领域、API、Schema、事件或lockfile。

准确修正源 afffde68fe257b86a5a4a9338091552e801b7e13 的[CI453](https://github.com/xurunxin/WorkMesh/actions/runs/38154334929)13项全部成功，包括四个开发镜像各自正常postinstall、lint/typecheck/build/unit、集成、E2E、灾难恢复、Agent smoke及三OS原生。四镜像/专用builder/容器/卷、Windows测试账户和目录均有定向清理回执。完整日志原字节、各1104文件源码绑定及中文独审报告在 docs/reviews/b1-b2/blueberry-recovery/review-handoff.md；开发修正与逐镜像原行见 development-images/review-fix.md。本机TLS首败、CI452缓存证据拒绝及全部历史失败不改为通过。

最终证据提交自身的Required CI以本PR最新head检查为准；正式成果复审及Chief/main门禁保持，actual main落地后才能Done或推进#7/#20。该仓库验证不冒无源码设备发布。完整中文计划及saved plan出处/原正文hash保留于报告与原计划文件，原任务授权/规范边界保持。
