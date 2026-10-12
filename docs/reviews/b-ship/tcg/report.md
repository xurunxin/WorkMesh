# QEMU TCG 完整虚拟机可行性研究

## 范围、输入与判定

本研究执行[当前规格](../../../plan/b-ship/tcg/current-spec.md)和[研究计划](../../../plan/b-ship/tcg/research-plan.md)。用户只放行无需 KVM 的隔离实验和方案修订。首批 Linux amd64、arm64 保持；本轮不开发连接器产品、安装器或发行物，不注册 runner，不增加机器、生产凭据或付费资源。原 saved plan 是历史文档准备计划。

开工 HEAD 为 `2daa8b2537a3082f459ea38c2da9a82c52d4d3f2`。通过 GitHub REST `git/ref/heads/main` 独立核真实 main 为 `f6faf54f80850ecee9118d87401e6b5ce73216f1`，未用 FETCH_HEAD 或本地过期 main。完整当前规格文件 SHA-256 为 `618ae72e6538b4711b916df11705b370abf45079d486630cb94215585c4a7884`；历史 Spec 与 saved plan 原文区间和开工 HEAD 逐字一致。平台本轮读取在历史正文末段截断，完整正文来自用户全文与保留原件，不冒称工具完整返回。

本机为 Windows，Docker Desktop 引擎是 Linux x86_64、8 GiB 内存；原生 ARM64 资源由已有 `ubuntu-24.04-arm` hosted runner 提供。本次 API 没有列出自托管 runner；没有注册或借用旧离线 runner。准确时间、CPU、内存、磁盘和来源见 [research-inputs.zip](raw/research-inputs.zip)，不是最低设备承诺。

只有完整 kernel/systemd 再次启动、不同 `boot_id`、同 UID 的真实秘密后端重读、同一个持久磁盘，以及原窗口内的真实 API 重放同时成立，才将对应研究项写为可行。时间容量和源码实验不代表最终无源码安装通过。[QEMU 官方系统模拟说明](https://www.qemu.org/docs/master/system/introduction.html)证明 TCG 是软件模拟，不能单独证明本项目验收。

## 实验方法与复现

[探测 workflow](../../../../.github/workflows/b-ship-tcg.yml)在现有两架构 hosted runner 执行；没有 `/dev/kvm`、特权容器或容器 restart。工具容器只承载 QEMU，guest 是官方 Ubuntu 完整 qcow2 磁盘。基础镜像固定官方日期目录和 SHA-256，独有 overlay 扩展为 8 GiB，guest 为 2 vCPU、1536 MiB RAM，工具容器上限为 2 CPU、3 GiB。配置是测量条件，不是产品最低环境。

[run.py](tools/run.py)显式使用 `-accel tcg`；ARM64 加载 AAVMF 固件及独有变量文件。NoCloud seed 创建 UID 22020 用户，通过 `cloud-init.target` 启用研究服务。两次执行各自创建同用户 D-Bus session、解锁同一个 gnome-keyring，实际运行 `secret-tool` 存取，并核 D-Bus 服务进程的可执行文件和 UID。[guest.py](tools/guest.py)只保存摘要和非秘密身份，真实兑换请求保存在 Secret Service，秘密不进入日志、命令参数或普通文件。

[api-controller.mts](tools/api-controller.mts)复用 `buildApp`、`applyMigrations` 和 `loadFeatureConfig`，只接受独有 `workmesh_tcg_test` 数据库。安装、创建连接及兑换均走现有 API；依据 `apps/api/integration/stage5-connector.integration.test.ts` 的夹具方式调用 `app.inject`。第一次兑换后保留原 key/body/origin/user-agent，核 `auth_idempotency_records.replay_ciphertext`；guest 完整 reboot 后从真实秘密后端重取请求，核原身份重放返回完全相同响应及原十五分钟窗口剩余量。过期负例仅提前过期该测试回执行并验证 409，不冒称自然等待十五分钟，也不修改生产窗口。

guest 使用 `systemctl reboot`，随后 `systemctl poweroff`；QMP `RESET`、`SHUTDOWN` 与两次 kernel 日志交叉核对。当前不执行 `SystemSecretStore`、连接器 `connect`/`recoverCommit` 或完整 API/MCP/Skill 黄金路径，这些产品断言继续保留为未测。

复现本轮修订后的 CI 输入须检出对应完整 HEAD，再由现有 PR workflow 执行。单个 Linux 宿主的原始步骤如下；API 控制器先按 workflow 启动独有 PostgreSQL/Redis、安装锁定源码依赖并就绪，再启动 guest。所有目录、名字及环境属于本次实验，不能改成共享数据库。

```sh
docker build --label workmesh.owner=b-ship-tcg --tag workmesh-b-ship-tcg:research \
  --file docs/reviews/b-ship/tcg/tools/Dockerfile docs/reviews/b-ship/tcg/tools
mkdir -p ci-tcg/data
docker run --name "$PROBE_NAME" --label workmesh.owner=b-ship-tcg \
  --network host --cpus 2 --memory 3g \
  --mount "type=bind,source=$PWD/docs/reviews/b-ship/tcg/tools,target=/probe,readonly" \
  --mount "type=bind,source=$PWD/ci-tcg/data,target=/data" \
  workmesh-b-ship-tcg:research --arch "$PROBE_ARCH" \
  --source "$(git rev-parse HEAD)" --api-url http://127.0.0.1:18081
```

## 首败与修订

| 输入与首败 | 原件和处理 |
| --- | --- |
| Windows 两次 bind mount 启动未创建容器，也未返回错误 | 中止准确 Docker client PID；未确认根因，不写为系统权限拒绝。改用本任务独有 Docker 卷及 `docker cp` 后能够启动完整 guest。没有改宿主共享或安全设置。 |
| 本机第一轮完成 OS reboot，但 systemd 删除第二轮研究服务 job | [local-amd64-first-failure.zip](raw/local-amd64-first-failure.zip)保存完整两次 kernel、ordering cycle 日志、第一次秘密存取、QMP reset 和失败回执。`WantedBy=multi-user.target` 与 `After=cloud-final.service` 形成循环；改为 `cloud-init.target`。没有将缺第二次秘密验证记为通过。 |
| 本机第一轮命令的 source 参数与复制脚本不一致 | 原件保留声明的 `663e6c…`，两份复制脚本逐字匹配 `f55cd05264e108b90027534b34bd18d179e601f8`。对应 provenance 明列两者；该轮只作首败及工具可运行证据，不能当准确 HEAD 的验收成功。 |
| 修订前 CI 被取消 | 保留原始 artifacts；缺 `result.json` 的 run 标为证据不完整，不补造秘密或恢复结果。定位夹具问题后取消尚在运行的旧研究 job，避免重复资源增长。 |
| CI `9853b1…` amd64 首次操作前出现 `CalledProcessError` | [原件](raw/ci-38295082254-amd64.zip)显示失败发生在第一次兑换之前，API 回执为空。仅记录错误类型，未取得具体命令 stderr；不能断言是产品秘密存储故障。owner 探测移到原生存取完成之后；新失败回执只增加命令名，不打印参数或捕获的秘密输出。 |
| ARM64 `2c4d7d…` 在探测总预算到期时缺第二次回执 | [原件](raw/ci-38296559927-arm64.zip)显示首次真实 Secret Service 存取及加密兑换已在 2268.31 秒完成，2360.26 秒出现 QMP RESET，2401.46 秒以 `research deadline reached` 结束。第二次启动到 EFI stub，但没有第二次秘密/重放回执。仅将下一轮总预算调为 3000 秒，job 保持 55 分钟；原 900 秒重放窗口、guest 配置与所有断言不变。该轮不能证明窗口失败或成功。 |

修订还加入 SIGTERM/SIGINT 的失败落盘，避免取消时丢失已经收到的回执。旧失败和取消记录保留，未改领域超时或必需断言。原始 zip 的 SHA-256 与成员身份由后续证据索引记录；GitHub 下载 zip 与官方 artifact digest 相符。

## 结果与路线门禁

amd64 已取得完整研究实证。对应 [CI 原件](raw/ci-38296559927-amd64.zip)经 [verify.py](verify.py)交叉复核通过：同 UID 22020 的 gnome-keyring 服务完成跨完整 reboot 的秘密重读，原请求得到完全相同的 200 响应，原十五分钟窗口仍剩 754.80 秒；提前过期该独有测试行后返回 409。源码消费、SEA/原生加载、最终无源码安装、升级卸载和完整黄金路径均未测。ARM64 结果仍在收集，不把 amd64 成功投射到另一架构。

| 测量 | amd64 | ARM64 |
| --- | --- | --- |
| 完整 guest 与 OS reboot | 可行，两次 kernel 和不同 boot_id | 待原件 |
| 同用户真实秘密跨 reboot | 可行，服务进程与 UID 核实 | 待原件 |
| 原窗口内真实 API 重放 | 可行，原请求与响应相同 | 待原件 |
| 启动到首次秘密与兑换完成 | 451.37 秒，含下载与软件准备 | 未完成测量 |
| reboot 到秘密重读及 API 重放 | 144.38 秒 | 未完成测量 |
| 本次探测总耗时 | 617.77 秒 | 未完成测量 |
| QEMU 峰值 RSS | 2,906,681,344 字节，约 2.71 GiB | 未完成测量 |
| overlay 实际分配 | 1,115,897,856 字节，约 1.04 GiB | 未完成测量 |

峰值是模拟器宿主占用，不能写成 Lite 目标设备最低内存。测量起点、冷启动准备、真正重放窗口和最终发行安装分开记录。过期负例不是自然等待十五分钟的边界测试。

历史 KVM 产品方案保持 Proposed。本研究只提供 TCG 路线的实证，Chief 据结果裁定后续方案与放行；不提前取得 ARM64 裸机，也不自动解除 runner 注册或最终产品门禁。

## 检查、空间与收尾

使用固定 `zh-tech-writing` 来源及 SKILL、manual-structure、typography。原创段落按短句、主动语态、单位、全角标点和中英文空格手检；autocorrect 未安装，不改上游原件。`check:integration-docs`、`ci:validate` 和现有 CI policy 测试已经实际通过，研究脚本按原 classifier 触发 full，不增加 prose 豁免。全量 Required CI 与研究 workflow 分别记录，研究结果不能代既有门禁。

研究代码 `2c4d7dcca6a0975e6b5842fe22eadf65a5ac5376` 的 [Required CI](https://github.com/xurunxin/WorkMesh/actions/runs/38296559920)已成功，十一项 job 全部通过，含三系统连接器存储、源检查、DB/API/worker 集成、完整灾难恢复及协议 smoke。对应 [原始汇总 artifact](raw/required-ci-38296559920.zip)和 [本机检查/收尾记录](raw/local-checks-and-cleanup.zip)保留。文档与后续证据提交还须按 PR 的最新 HEAD 完成适用门禁，不能将这个祖先 HEAD 的成功写为后续 HEAD 已检查。

本机仅运行一个 guest；原件保全后按准确容器 ID、owner 和 exited 状态移除两只本任务容器及无消费者的私有卷。删除卷同时收尾该轮未清除的实验 keyring；不操作共享 PostgreSQL/Redis、其他项目、原策略拒目标或默认 builder。公共基础镜像和构建缓存不 prune。CI 在各独有 job 中保存容器 stop/remove 回执，测试服务由原生 runner 的 job 收尾。

工具和基础镜像可按内容摘要复用，overlay、seed、固件变量、keyring、数据库和日志必须独有。当前 workflow 为冷启动测量，每轮重新下载 guest；共享只读 guest 缓存尚未实现，不能声称本轮已节省这些重复字节。空间预检同时计算工具镜像、基础盘、私有 overlay 和输出；8 GiB 是逻辑上限，实际分配、峰值 RSS 和两架构耗时须按运行回执比较。
