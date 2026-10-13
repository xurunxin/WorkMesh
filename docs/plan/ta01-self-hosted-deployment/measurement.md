# 现有 Lite 基线测量

## 实测范围和固定条件

本轮只测现有 Lite 的控制面工作项创建／读取及 durable outbox。首任务定义为首个 Human 工作项的 POST 和 GET；并发定义为三个调用者，各创建、读回二十个工作项。没有执行模型或代码任务，不冒完整 fake Agent、Runner、MCP、工件、备份或三画像联合验收。

执行主机为 Windows／PowerShell，Docker Desktop 的 Linux x86_64 daemon 报告 32 个 CPU、8,381,870,080 字节内存。CPU 未人为限到低核数，没有把整个 Docker VM 限到低内存。本次开始前没有其他运行容器，但宿主负载未冻结；这不是独立低功耗硬件。

源码固定 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`，通过 Git archive 构建原 `infra/docker/lite.Dockerfile`。成功镜像 ID 为 `sha256:af4aeb31f8a157e13fabdbef208592483cd9527a09e54510383d734cd7eb894e`，读回 OCI revision 相同。镜像实际 Node 运行基于锁定 Node 22.19.0 Alpine；依赖由原 frozen lock 安装，没有改源码、Dockerfile 或跳过 lifecycle。

使用独有 Compose project `workmesh-ta01-pui_xhb6`、数据库 `workmesh_ta01_test`、bucket `workmesh-ta01-pui-xhb6`、回环动态端口和独有卷。所有 Beta／Experimental 关闭。PG、Redis、RustFS 为现有准确镜像输入。原 Compose 参数和 Node heap 保持；PG／Redis／RustFS／API／worker 容器限额为 384／128／256／640／448 MiB。独有 labels 只用于归属核验。

测试从空业务库安装，无既有工件。空闲固定等待 60 秒；首工作项后等待 30 秒；并发每调用者二十个工作项、每轮间隔 0.1 秒，结束后等待 30 秒。采样器在每次 `docker stats --no-stream` 结束后再等待 2 秒；实际间隔由原 UTC 时间戳决定，不能写成严格 2 秒周期。

## 实际结果

以下内存是同一采样中的五个运行服务 Docker stats 用量之和，不是整个宿主 RSS；一并保存各服务原行、容器上限、CPU、BlockIO、NetIO 和 PID。采样峰值可能漏掉短暂峰值，不能当作容量安全上限。

| 阶段 | 完整采样数 | 服务内存合计范围（MiB） | CPU 合计观测峰值 | HTTP 请求数 | HTTP p95（ms） |
| --- | --- | --- | --- | --- | --- |
| idle | 12 | 324.11～376.03 | 46.36% | 0 | 不适用 |
| first-work-item | 7 | 322.26～361.33 | 53.72% | 2 | 63.00 |
| concurrency-three | 7 | 335.18～378.62 | 21.92% | 120 | 63.00 |

夹具修正后的启动就绪耗时 15.39 秒。数据库最终有 61 个工作项；outbox 63 条均为 delivered。五个长运行服务 healthy，检查时 OOMKilled=false、RestartCount=0；migrate 与 minio-init 正常退出。不能由本次末态推定所有历史运行状态。

PG 数据目录逻辑长度 75,477,252 字节，Redis 4,096 字节，RustFS 16,568 字节；PG 数据库报告 18,133,475 字节。目录逻辑长度、Docker BlockIO、镜像层和宿主物理占用不同，不能相加称物理磁盘净占用。

## 首败和修正

首轮构建在 Alpine `apk upgrade` 读取仓库时出现 IO ERROR，原命令 exit 1、构建步骤 exit 99。原日志及回执保持。宿主对同一索引 URL 的只读 HEAD 返回 HTTP 200；随后只复核相同构建命令，未改网络权限、Dockerfile、CA 或包版本，构建 exit 0。首败仍是首败。

首次启动 `minio-init` 返回 HTTP 400。测量脚本误将带下划线的 owner 用作 bucket，API 未启动、HTTP 业务请求为零。修正前逐对象验证独有 project／task label，核 workspace 和 work_item 业务计数均为零；保持原测试密码、卷与源码，仅将夹具 bucket 改为合法名称后重跑。首轮 startup 和 samples 分别保留，不能并入成功阶段。

## 复现及下一阶段测量

完整原件见[运行证据索引](sources/evidence-index.md)，本轮工具见[临时脚本](sources/measurement-tools.md)。先校验准确源码和镜像来源，创建新的独有 owner／路径／测试库／bucket，再执行归属预检、原镜像构建及测量。不要复用本次已登记资源，不把私有环境文件提交仓库。

真实候选设备须冻结架构、OS／kernel、Docker／Compose、CPU／RAM、swap、磁盘介质／可用量及背景负载。每画像按相同数据集重复冷启动、空闲、首个真实任务及声明并发，追加 API／MCP／Worker／限流／上传下载／完整备份恢复与重启故障；固定记录 p95／p99、错误率、OOM、磁盘、启动和恢复耗时。阈值由实测及用户使用目标裁定，不凭本轮小数据推最低值。

当前没有 2 GB、1 GB、ARM64 服务端、完整离线服务端、私有 CA／企业身份或新 Redis-free／filesystem 组合的测量。建议准备匹配 Docker 的 Linux 主机、SSD 和独立备份空间；内存及 CPU 数量不作未测最低承诺。设备与访问条件未指定的结果均未测。
