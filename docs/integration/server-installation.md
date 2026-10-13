# 版本化服务端安装

## 当前状态

本卡正在实现保留 PostgreSQL、Redis 和 S3 的基础交付。以下入口及命令已有代码，双架构完整虚拟机验收尚未完成，当前候选不能作为发行包或已支持声明。Redis-free、filesystem、生产内网接入和物理设备最低配置仍未交付。

## 环境和候选

目标为 Linux amd64 或 arm64，已有 Docker Engine、Docker Compose 和 POSIX sh。目标不需要源码、宿主 Node、pnpm 或 Python。安装器使用可信工具容器，沿用当前 Docker 访问权限；它不安装 Docker，也不修改设备权限。

运营者提供 HTTPS 反向代理及可达的 API、MCP 和 S3 地址。三个地址须同时对实际客户端和服务容器可达。宿主只发布回环端口：API 3001、MCP 3002 和 S3 9000。企业画像要求私有 CA，其他画像可使用系统信任；代理白名单使用准确 CIDR，拒绝全网段信任。

三画像共用领域协议。个人使用 Lite 的 API、worker 和迁移进程，并增加独立 MCP 镜像；团队及企业使用独立 production 镜像。API、worker 和 MCP 各一个副本，Runner 始终外置。裸 Lite Compose 的历史功能不因新包存在而自动增加 MCP。

从本任务受审候选记录取得 `manifest.json` 的可信 SHA-256。随包摘要只能证明内容一致，不能证明发布者身份。候选含安装工具、应用和 PostgreSQL／Redis／RustFS 的全部镜像分块；目标启动使用 `--pull never`。

## 安装和配置检查

先准备 root 持有的专用目录，权限为 `0700`。当前安装工具要求该目录由 root 持有，服务进程仍使用既有非 root 身份。将公开 CA 放入该目录的 `certificates/ca.pem`，公开证书可读权限为 `0644`。配置 JSON 使用 `0600`，按 [示例](../../scripts/server-distribution/config.example.json)填入实际地址、画像和独有 project 名称。示例域名不代表可用服务。

```sh
mkdir -m 700 /srv/workmesh
mkdir -m 700 /srv/workmesh/certificates
chmod 600 /srv/workmesh-config.json
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json check
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json install
```

`install` 返回 `awaiting-validation` 时，候选已健康启动但尚未登记 current。沿 [快速上手](getting-started.md)的正常 API 完成首次用户初始化，再创建可读取的工作项并配对连接器。安装器不会替你命名账号或创建业务数据。将配对取得的安装凭据及该工作项 ID 写入安装目录内的 `validation.json`，权限为 `0600`。该文件只供本次只读验证，不放进候选或审查原件。

```json
{"credential":"REPLACE_WITH_EXISTING_CREDENTIAL","workItemId":"REPLACE_WITH_AUTHORIZED_WORK_ITEM_UUID"}
```

```sh
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json commit \
  --validation /srv/workmesh/validation.json
```

commit 实际校验 MCP 鉴权、读取所选工作项并核迁移账本，然后登记 current。凭据无效、权限不足或读取失败时保留 pending，不填成功。静态 MCP 使用其已配置的边界凭据，Coordination 使用正常配对的安装凭据。

`check` 校验候选、架构、空间、画像和现有配置合同；不会启动业务服务或写安装状态。首次调用会先载入经过可信摘要验证的安装工具镜像。应用镜像导入及服务启动须等配置校验完成。

首次安装生成相互分离的随机密钥，保存在安装目录的 `operator-keys.json`，权限为 `0600`。密钥不进入候选、journal、日志或结果摘要。运营者须单独保管备份密钥和主密钥，不能仅复制恢复 bundle。已有部署缺失密钥文件时停止，不重新生成密钥。

Coordination MCP 须显式设置 `WORKMESH_BETA_COORDINATION_MCP=true`，通过正常配对流程取得安装凭据。静态模式须提供现行 Session 与 MCP 边界凭据。安装器不创建 Runner 注册或执行身份。

## 升级和程序回退

将新候选放到新目录，使用原配置与安装目录执行 `upgrade`。安装器验证全部文件与镜像身份，暂存不可变 release，停止并排空 API、worker 和 MCP，用旧程序捕获加密完整备份，再逐项应用迁移、核健康和账本，验证后保持 pending，再使用有效凭据执行 commit 才原子切换 `current.json`。升级前须关闭代理对外准入；确认维护窗口的参数不代替实际排空。

```sh
sh /srv/new-candidate/install.sh /srv/new-candidate "$NEW_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json upgrade --maintenance-confirmed
sh /srv/old-candidate/install.sh /srv/old-candidate "$OLD_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json rollback --maintenance-confirmed
```

`rollback` 要求真实账本逐项一致，运行程序输入指纹和 PG／Redis／S3 镜像也须一致。拒绝未知迁移、前缀、校验和或运行语义变化；账本相同不单独证明程序兼容。升级不是整批数据库事务。原数据卷不删除；完整恢复写到独立空目标，不覆盖原卷。

写前 journal 记录 `verified`、`staged`、`backed_up`、`migrated`、`healthy` 和 `committed`，以及每个效果的 intent 和结果。失败或中断保留原件。同版本异内容、同 project 跨目录的并发安装、损坏 journal 和不确定恢复会明确拒绝。检查原 journal 与真实账本后，可对可兼容的中断升级执行 `recover-old`；存活或无法证明失效的锁不自动删除。

## 完整恢复

`restore-empty` 沿用 [完整恢复合同](../operations/disaster-recovery.md)。目标须预先准备独立空数据库、启用版本和 Object Lock 的空 bucket。目标配置的 `environment` 只含 `RECOVERY_TARGET_*` 字段，准确变量见现行恢复说明；其 project 与源部署不同。

```sh
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json restore-empty \
  --restore-bundle /srv/workmesh/backups/EXACT_JOURNAL_ID \
  --target /srv/workmesh/empty-target.json
```

安装工具须能读到目标文件，目标文件和 bundle 放在已挂载的安装目录内。恢复认证 manifest、payload、密钥和 journal，核工件、全部对象版本、保留与 legal hold、秘密解密及数据库计数。完成恢复不会切换生产流量；数据损失接受与生产切换须另获具体授权。

## 验收记录

当前结果见 [TA01 验证记录](../plan/ta01-self-hosted-deployment/verification.md)。真实候选和完整 guest 的双架构、三画像证据须先完成，再将本页当前状态改为支持声明。历史 docs CI、控制面采样、fake 测试和静态校验不能替代该验收。

裸 Compose 的迁入尚未实现。当前升级／回退面向此安装器创建的受控部署；同源不同候选的兼容验证不代表已发行历史程序对全部通过。
