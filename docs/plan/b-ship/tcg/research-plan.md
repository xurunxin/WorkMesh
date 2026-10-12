# 无需 KVM 的完整虚拟机研究计划

## 当前阶段与输入

本计划执行[TCG 当前规格](current-spec.md)。用户只放行隔离可行性实验、必要研究脚本与方案/证据修订；不放行连接器产品、安装器、SEA 发行物、新机器/runner/凭据或付费资源。原 saved plan 和两项 P1 设计闭合是历史输入，不能当本阶段批准。

开工输入为真实 GitHub main `f6faf54f80850ecee9118d87401e6b5ce73216f1`，本分支 `2daa8b2537a3082f459ea38c2da9a82c52d4d3f2`；以独立只读 API 和本地 HEAD 核，不用 FETCH_HEAD。现有 Windows 主机连接 Docker Desktop Linux x86_64 引擎，8 GiB Docker 内存；现有 GitHub Actions 已启用，API 本次未列自托管 runner。保原分支与纯后端范围。

## 实验方法与改动

- `docs/plan/b-ship/tcg/` 保存本阶段完整规格、原用户答复和本计划。原规格及 saved plan 的原文区间保留；实施/验收方案明确当前处于研究，不预先用 TCG 替代 KVM 产品方案。
- `docs/reviews/b-ship/tcg/` 保存研究脚本、输入身份、测量、首败、脱敏原件、资源账本和报告。使用现有 Docker 权限创建独有 QEMU 工具容器；容器只承载完整 guest 模拟器，容器重启不作为 guest 重启证据。显式 `-accel tcg`，不暴露 `/dev/kvm`，两架构顺序运行。
- 采用官方 Ubuntu cloud image 的 amd64、arm64 完整磁盘，核官方 SHA-256 后保持基础镜像只读，任务 overlay/seed/固件变量与日志私有。guest 默认 2 vCPU、1536 MiB RAM，磁盘按实际镜像扩展需求预检；这是实验配置，不是最低硬件承诺。
- guest 内用同一独有用户、D-Bus session、gnome-keyring Secret Service 和受保护 XDG 数据目录。只生成实验随机秘密，写入系统秘密后端，跨进程和完整 OS 重启只输出摘要比较与安全状态。变化的 guest `boot_id`、QEMU/QMP reset 事件、同一个持久磁盘身份共同证明系统重启。
- 恢复实验区分两层：先实测启动、秘密与 pending 身份持久性、重启用时是否落在现行十五分钟重放窗口；再在条件满足时复用真实 API 加密幂等机制，核原 key/body/origin/user-agent 的窗口内重放和窗口外拒绝。只有时间测量不能填真实服务端恢复通过；源代码探测也不填最终无源码安装通过。

## 执行与结果规则

先准备并计时工具和 guest 软件，再开始受测恢复窗口；不把下载或首启配置从未执行的用例里伪扣除。保每项真实 UTC、宿主单调计时、guest boot_id、uid、系统/架构、QEMU版本/命令、输入哈希与准确源码树。完整 OS reboot 使用 guest 的系统命令，验证 kernel/systemd 重新启动；QMP reset 作为额外观察，不单独代正常持久性重启。

逐架构记录首次启动、完整重启、秘密跨重启、恢复窗口容量、真实 API 重放、源连接器消费和最终发行安装七类状态，分别标可行、不可行、未测。所有失败保留原件和原配置；首败修正后另编号新运行，不覆盖或延长原领域窗口。资源或权限不足就记录真实阻碍，不注册新 runner 或改用容器 restart。

## 验证、CI 与收尾

必要探测 workflow 只用于现有 hosted runner 的研究；本机实验输入与 CI 输入都绑定准确 commit、实际 checkout/tree、guest镜像与脚本摘要、QEMU/固件/架构及运行回执。现有 Required CI 不降级；新增脚本按实际分类运行所有被选必需检查，研究 job 不能冒充产品安装 job。

记录单次及组合耗时、QEMU RSS、guest RAM、overlay 实际字节、基础镜像共享与任务私有空间；比较两架构，提出后续条件，不承诺最低设备。固定 zh-tech-writing 技能与两篇参考、中文手检及 `pnpm check:integration-docs` 持续执行；脚本先做语法和关键证据校验，再实际跑 guest。

只清理账本中的 QEMU/容器/卷、overlay、seed、测试服务和秘密引用。先保脱敏原件，再核 ID/owner/活动与边界；共享基础缓存、他人资源和原策略拒目标保持。交付研究报告与实施/验收方案修订，完成适用检查后回 review，由 Chief 据证据裁定路线；本轮不合卡 Done。
