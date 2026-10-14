# 版本化服务端安装

## 当前状态

本卡正在实现保留 PostgreSQL、Redis 和 S3 的基础交付。以下入口及命令已有代码，双架构完整虚拟机验收尚未完成，当前候选不能作为发行包或已支持声明。Redis-free、filesystem、生产内网接入和物理设备最低配置仍未交付。

## 环境和候选

目标为 Linux amd64 或 arm64，已有 Docker Engine、Docker Compose 和 POSIX sh。目标不需要源码、宿主 Node、pnpm 或 Python。安装器使用可信工具容器，沿用当前 Docker 访问权限；它不安装 Docker，也不修改设备权限。

运营者提供 HTTPS 反向代理及可达的 API、MCP 和 S3 地址。三个地址须同时对实际客户端和服务容器可达。宿主只发布回环端口：API 3001、MCP 3002 和 S3 9000。企业画像要求私有 CA，其他画像可使用系统信任；代理白名单使用准确 CIDR，拒绝全网段信任。

三画像共用领域协议。个人使用 Lite 的 API、worker 和迁移进程，并增加独立 MCP 镜像；团队及企业使用独立 production 镜像。API、worker 和 MCP 各一个副本，Runner 始终外置。裸 Lite Compose 的历史功能不因新包存在而自动增加 MCP。

从本任务受审候选记录取得 `manifest.json` 的可信 SHA-256。随包摘要只能证明内容一致，不能证明发布者身份。候选含安装工具、应用和 PostgreSQL／Redis／RustFS 的全部镜像分块；目标启动使用 `--pull never`。

清单分别绑定构建端镜像 ID 与归档中 OCI manifest 的准确摘要。不同 Docker 存储后端可能以其中不同的摘要寻址导入镜像；安装器只接受这两个已绑定 ID，并核架构与来源标签，记录实际目标 ID 后写入 Compose。标签名或来源标签相同不足以接受其他镜像；未知 ID 明确拒绝。

## 安装和配置检查

先准备 root 持有的专用目录，权限为 `0700`。当前安装工具要求该目录由 root 持有，服务进程仍使用既有非 root 身份。将公开 CA 放入该目录的 `certificates/ca.pem`，公开证书可读权限为 `0644`。配置 JSON 使用 `0600`，按 [示例](../../scripts/server-distribution/config.example.json)填入实际地址、画像和独有 project 名称。示例域名不代表可用服务。

```sh
mkdir -m 700 /srv/workmesh
mkdir -m 700 /srv/workmesh/certificates
chmod 600 /srv/workmesh-config.json
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json check
sh /srv/candidate/install.sh /srv/candidate "$TRUSTED_MANIFEST_SHA256" \
  /srv/workmesh /srv/workmesh-config.json stage
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

`stage` 先完成同样的候选与配置预检，再导入清单绑定的完整镜像集合，返回 staged-candidate 和实际镜像 ID。该步骤不启动部署容器、不生成运营密钥、不登记 current。后续 install 仍重新校验全部候选字节和镜像身份；暂存结果不替代安装验收。

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

当前 upgrade／rollback 只支持同画像、原数据卷与原数据身份。画像、数据库连接、S3 bucket／凭据、主密钥、备份密钥或限流键空间／HMAC 身份变化时，在停止服务或迁移前拒绝。普通版本升级不承担这些数据迁移或密钥轮换；公共 HTTPS 地址等接入设置仍按现行配置合同校验。

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

## 安装失败诊断与镜像复用

Docker 命令失败时输出 INSTALL_DOCKER_COMMAND_FAILED 和 INSTALL_DIAGNOSTIC。诊断含固定分类、标准错误类型、PG 错误码白名单、分离的 stdout／stderr 字节数与哈希、已知模块的有界行号及归属容器状态，并写入 journal；参数、环境和原始服务输出不进入结果。先核阶段和动作，外层错误不能单独证明根因。诊断不改变恢复、超时或健康判定。

每次仍校验候选全部文件和分块。应用镜像已载入时，全部角色的准确 ID、架构和来源符合清单才复用；身份不符即拒绝。当前支持状态仍以双架构完整 guest 结果为准。

健康验证开始前，journal 保存已核候选清单的原始 JSON，并绑定候选摘要。recover-old 在新程序启动后，先核清单摘要、程序输入和依赖兼容，再核真实账本。即使 pending 尚未写入，也不能跳过程序检查。旧 journal 缺少候选原件或原件损坏时明确拒绝，须先保全证据并按完整恢复流程处置。

健康探针使用镜像内的 curl 读取本机 readyz，要求完整 2xx 响应，不跟随重定向，不使用代理环境变量。HTTP 2 s、Docker 3 s 和安装健康验证 180 s 的预算保持；超时、非 2xx、不完整响应、非法协议和带凭据 URL 均失败。curl 及其依赖随镜像离线交付，不要求目标设备联网安装。此修正待双架构完整虚拟机验收。

业务校验按 JSON-RPC 请求 ID 选择唯一响应，SSE 中的前置通知和注释不作为读取结果；重复或缺失响应、RPC／tool 错误、鉴权失败和工作项不匹配仍拒绝。失败回执可查看安全 HTTP 状态、已知错误码及响应哈希，并附归属容器的日志分类与哈希；不输出凭据或消息正文。请求预算保持 30 s，校验失败不会登记 current。

完整 guest 中直接 API／MCP 请求失败时，也按安装 UUID 和根哈希核归属后提取安全服务日志分类，保持源码／回执绑定。标准错误类型和已知模块行号用于定位首败，不能单独证明原因；支持声明仍须完整验收。

每个画像的完整 guest 验收还要求真实凭据限流返回 429／AUTH_RATE_LIMITED 和有效 Retry-After，并与 Redis 故障时 503 失败关闭分别记录。使用独有测试主体、原生产预算和 Redis 时钟，不删除限流键或将根集成用例代替已安装组合。新增断言尚未实测通过。

CI 的 native-diagnostic 参数默认关闭，仅用于隔离 guest 的原生崩溃定位。该模式强制非零退出且标记 diagnostic-only，不能用其结果登记完整支持或满足 Required CI；用户正常安装不依赖 GDB。详见 [接续与首败记录](../plan/ta01-self-hosted-deployment/resumption.md)。

显式原生诊断的自然运行捕获仅在独有、无 swap 的 guest 中临时开启，经核准确 MCP PID／启动时间／程序摘要 后将崩溃流在匿名内存解析；只保安全符号与摘要，处理后恢复设置。普通安装不配置 core 管道，不要求 GDB。该诊断仍不产生产品 PASS，当前自然崩溃原因尚未定位。
