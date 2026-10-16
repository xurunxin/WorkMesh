# 三画像配置与服务端交付设计

本次按用户 2026-10-14 12:27 批准的新会话方式接续。PR227 为恢复来源，本次交付和条件合入走当前会话分支；旧树保全、真实主线及双架构首败见 [接续记录](resumption.md)。产品验收尚未完成。

## 基础产品批准与执行范围

用户已选择“先实施基础交付”和“现有 CI 与完整虚拟机”。下文保留 Redis／S3 的基础设计进入获准实现范围；Redis-free、filesystem 和保证变更仍须另行批准。当前执行计划见 [implementation-plan.md](implementation-plan.md)，旧文档原件见 [history](history/README.md)。

仓库规格与阶段已同步。用户明确批准记录例外并继续，平台 Saved plan 同步不再是产品修改前置；字段仍未同步。实现结果、支持声明和产品通过须以新原件及新 CI 为准。当前环境不支持把仓库更新冒充平台 Saved plan 更新。

## 配置矩阵

下表是已获准基础实现的目标矩阵，仍不是已验收支持声明。三画像使用同一领域协议和 PostgreSQL schema，不按画像另建业务逻辑。

| 项目 | 个人 Lite | 小团队 | 企业自部署 |
| --- | --- | --- | --- |
| 起点 | `docker-compose.lite.yml` | `docker-compose.production.yml` | 同 production，叠加受控内网配置 |
| 服务端工件 | 同源 Lite 镜像，`api`／`worker`／`migrate` 分进程 | 同源、摘要固定的 API／worker／MCP 镜像 | 同左，加离线依赖闭包和受审信任材料 |
| 持久依赖 | PostgreSQL、Redis、RustFS | 同左 | 首批同左，外部内网 S3 组合未验收 |
| 首批候选副本 | API、worker、独立 MCP 各一个 | API、worker、MCP 各一个 | 同左；本卡不承诺高可用 |
| MCP | Lite 镜像没有该角色；候选增加独立 MCP 镜像 | 明确启用 `agent` profile | 同左，经内网 HTTPS 路由 |
| Runner | 外部操作系统边界，按自己的权限接入 | 外部 Runner，共享资源仍受租约和 fencing 约束 | 外部受控执行网络，本卡不接管机器池 |
| 数据库 | 现有 Lite 参数，`max_connections=20`；保留 fsync 和 synchronous_commit | production 参数；连接池预算独立核 | 同左，按真实容量复验 |
| 资源 | API heap 320 MiB／容器 640 MiB；worker heap 256 MiB／容器 448 MiB；PG 384 MiB、Redis 128 MiB、RustFS 256 MiB；独立 MCP heap 256 MiB／容器 384 MiB | 根据固定负载量测，不复制个人下限 | 根据企业数据和并发量测 |
| 监听建议 | 新安装默认仅回环发布，由运营者配置可达 HTTPS | 回环或受控接口发布，反向代理终止 TLS | 私有 CA 和代理由运营者提供 |
| 对外路径 | API、discovery、独立 MCP 路由及 S3 上传地址 | 同左 | 同左，内网 DNS 和证书链必须真实验证 |
| Cookie 与代理 | HTTPS 才设 `SESSION_COOKIE_SECURE=true`；`WEB_ORIGIN` 精确匹配 | 同左，明确 `AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS` | 同左，不信任任意 forwarded header |
| 上传地址 | `S3_PUBLIC_ENDPOINT` 须对实际上传客户端可达 | 同左 | 同左，内网地址不由 API 地址自动推断 |
| 可选能力 | Beta／Experimental 默认关闭；连接器接入显式开启 Coordination | 同左，三个角色使用同一 feature 配置 | 同左，不以企业画像默认开启身份扩展 |
| 备份与保留 | 加密完整 bundle，S3 版本及 Object Lock；archive 开、cleanup／prune 关 | 同左 | 同左；密钥、legal hold 和恢复材料由运营者保管 |

现有 Lite 的 LAN HTTP、`0.0.0.0`、Cookie 非 secure 是历史默认；本方案推荐的新安装监听收敛属于待实施变更，当前文件未改。Docker 容器内 API 仍监听 `0.0.0.0`；回环限制作用于宿主发布端口。不能把宿主绑定回环当作禁用服务。

Coordination 模式使用每请求 `X-WorkMesh-Installation-Token`，普通执行写入仍使用准确 Session Bearer。静态 MCP 模式另需其边界凭据，不能混写。Lite 不因环境变量出现 MCP 配置就能运行 MCP。

## 不支持组合

首批候选拒绝无 PostgreSQL、Redis-free、纯 filesystem、在 API 进程运行不可信代码、Lite 内置 MCP／Runner 角色，以及未经组合验收的多副本配置。拒绝必须发生在副作用之前；这些是后续配置校验的要求，不冒称当前 schema 已拒绝未知变量。

保留工件不可达、Object Lock 缺失、无完整备份密钥、镜像来源不一致、迁移账本异常、证书不可信或挂载目录不安全时，停止安装或升级。不使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`，不自动导入系统信任、不改变用户 ACL。

私有 CA 以只读文件挂载至需要连接外部 HTTPS 的 API、worker、MCP，使用标准 `NODE_EXTRA_CA_CERTS`。必须分别验证 provider、S3 和实际 MCP 客户端；SEA 连接器与子进程是否消费信任材料另验，不能从服务器通过推定客户端通过。

## 候选包及安装状态机

服务端交付采用离线 Docker 镜像集合和版本目录，不新增宿主 Node 前置。目标须已有 Docker Engine、Compose、匹配架构、足够空间及受保护环境文件。首批候选设计为 Linux amd64／arm64；现有双架构 CI 与完整 guest 已获批准，物理设备支持范围仍待实测，不把连接器 TCG 结果当成服务端证明。

包内包括应用及所有启动依赖的镜像归档、Compose、无秘密环境模板、配置校验入口、源提交／架构／镜像 ID／摘要／schema 兼容范围清单、摘要文件和操作说明。清单摘要只证明完整性；发布者身份来自受审来源。production 沿用既有签名、来源证明和 SBOM，不将本地 Lite tag 冒官方发行。

安装器使用目录锁、Docker project 锁、持久安装 UUID 和写前 journal，阶段为 `verified → staged → backed_up → migrated → healthy → committed`。清单和 journal 均绑定安装根、原 Compose project、配置摘要和镜像身份。配置摘要不替代秘密安全存储；日志、清单及回执不保存环境文件内容。

1. 校验包、来源、架构、空间、端口和准确已有安装身份；同版本异内容拒绝。可信工具先按摘要载入；配置预检通过后才导入其他应用镜像，并读回 ID 和 OCI revision。
2. 首次安装运行同源 `migrate` one-shot，再启动 API、worker 和选定 MCP；不直接执行 `SCHEMA.sql`。通过 readiness 后保持 healthy／pending；用户沿既有 API 完成首次账号初始化、配对及真实工作项操作，再用受保护凭据执行 commit。commit 实际完成 MCP 鉴权读取，读回目标工作项及账本后才登记 current，不自动创建用户或业务数据。
3. 使用 stage 独立暂存新旧完整镜像集合；仍校验全部候选字节和实际镜像身份，不启动数据服务。同画像版本升级保持原数据卷、数据连接、S3 命名空间、加密与限流身份；变化须另行迁移，当前操作提前拒绝。停止入口准入，排空 API、worker、MCP，确认没有未知写入者；用旧版准确工具执行 `createRecoveryBundle`。备份失败停止迁移，保留原环境。
4. 复用 `applyMigrations` 的 advisory lock、显式 manifest、校验账本和 SQL／账本同事务。逐项迁移提交并不表示整批升级原子；后续迁移失败时已有迁移可能已提交。
5. 启动候选并验证读取、幂等写入、worker/outbox、MCP 与工件读回，通过 commit 的真实鉴权读取后切 current，运营者再恢复代理准入。upgrade／rollback 必须显式确认维护窗口，安装器不接管运营者反向代理。验证阶段保持外部业务入口关闭，记录其测试数据和结果。

| 故障位置 | 固定处置 |
| --- | --- |
| 验包、暂存、配置校验失败 | current、服务和数据卷保持原状；保留失败回执 |
| 备份失败 | 不运行迁移；确认旧环境仍满足启动条件后恢复旧服务 |
| 迁移失败 | 读取真实已提交账本；真实账本、程序输入指纹和依赖镜像均符合旧候选兼容条件才允许程序回退，否则保持维护状态 |
| 候选健康失败 | 先记录停止 intent，核归属并按准确 ID 停止候选程序、实核停止，再按兼容规则恢复；停止失败如实记录且不重试／不启动旧程序，原数据卷保留 |
| 业务证明验证失败 | 保持维护和待验证状态，不登记 current；修正证明或明确调用 recover-old，后者仍按程序／依赖／账本兼容规则处理，不以未切 current 推定数据未变 |
| 不兼容的数据回退 | 使用升级前 bundle 和旧版工具恢复至独立空数据库／空版本桶；原卷保留，人工批准数据损失与流量切换 |
| 进程中断或 journal 损坏 | 重启读回 journal 和实际镜像／账本；不确定时拒绝继续，不手改阶段 |

不执行自动 down migration，不覆盖原卷，不使用 `down -v` 对业务环境清空重装。卸载只处理安装账本归属的程序和无活动引用的服务；数据、环境文件和秘密保留。

离线候选必须包含数据服务、迁移及恢复工具的全部启动闭包，断网条件下实际 `load → install → upgrade → restore`。离线不包含 DNS、TLS 签发、模型、Git 或系统秘密服务；这些独立依赖缺失时不能宣称完整操作链可用。现有客户端 Skill 和连接器工件沿 #20 受审来源取得，不新增发行或外发。

## 后续逐文件实施建议

以下基础文件增量已获准；用户已批准记录例外，平台字段同步不再是产品修改前置；当前已进入实现。与新限流／文件身份表有关的扩展不在本轮范围。

| 路径 | 增量和复用机制 |
| --- | --- |
| `scripts/server-distribution/build.mjs`（已创建，真实候选验收待执行） | 从干净不可变源码生成候选包、镜像身份和闭包清单；复用现有 Dockerfiles，不改变发行签名身份 |
| `scripts/server-distribution/install.mjs`（已创建，真实候选验收待执行） | 在发行镜像中运行预检和 journal 状态机，由宿主 Compose 启动；避免宿主 Node 前置 |
| `scripts/server-distribution/manifest.mjs`（已创建，真实候选验收待执行） | 固定清单、兼容账本及同版本拒异内容规则 |
| `packages/config/src/index.ts`、`runtime-secrets.mjs` | 新画像 schema、配置交叉校验和启动拒绝；保持既有 secret 校验和显式 feature |
| `infra/docker/runtime-guard.mjs`、`packages/config/src/service-command.ts` | 复用 authoritative config 与 `resolveServiceCommand`；Lite 角色边界保持 |
| `docker-compose.lite.yml`、`docker-compose.production.yml`、对应环境模板 | 仅加入已获准配置、只读挂载、稳定卷身份和明确端口；不默认启用新存储模式 |
| `packages/recovery/src/backup.ts`、`restore.ts` | 复用完整加密 bundle 和空目标恢复；增加交付 wrapper 所需安全结果，不削弱现有锁与密钥验证 |
| `docs/integration/README.md`、`reference.md`、`getting-started.md`、`installation.md`、`troubleshooting.md` | 同次解释服务端和连接器的不同安装责任，新增画像、兼容性和失败恢复步骤；配置沿现有参考和快速上手维护 |
| `docs/operations/disaster-recovery.md`、`docs/production-deployment.md` | 同次更新维护窗口、候选包、恢复工具和离线边界 |

本卡基础交付不计划领域 schema／API／event 改动。若保证裁定引入持久限流或文件身份表，另列新增编号迁移、manifest 和 `SCHEMA.sql` 更新，并测试空库及上一阶段升级。不得沿用 ADR 提案的“零迁移”推定。

## 首批兼容规则

首批程序回退只接受相同运行代码／依赖输入指纹、相同 PG／Redis／S3 镜像及完全一致的真实迁移账本。相同 schema 不能推定程序语义兼容。运行程序内容改变后不自动退回旧程序；保留原卷，并按已批准流程恢复独立空目标。后续更宽兼容声明须有具体旧新程序对的验收及审查依据。

当前 guest 的升级夹具为同一程序的不同候选标识，用于实际验证 journal、完整备份、兼容回退和原卷保留；不冒称两个已发行历史程序版本。裸 Compose 的迁入尚未实现，不把已有人工部署视为该安装器创建的受控部署。
