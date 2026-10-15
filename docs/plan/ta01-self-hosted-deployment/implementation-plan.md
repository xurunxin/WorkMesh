## 当前授权与执行关口

本次按用户 2026-10-14 12:27 批准的新会话方式接续。PR227 为恢复来源，本次交付和条件合入走当前会话分支；旧树保全、真实主线及双架构首败见 [接续记录](resumption.md)。产品验收尚未完成。

用户已批准保留 PostgreSQL、Redis、S3 的基础产品交付及现有 Linux amd64／arm64 CI、干净完整虚拟机验收。当前路线、设备环境和条件合入许可见 spec.md；Redis-free、filesystem、保证变更、生产接入与仓库外发布不实施。

原规划计划 doc:X7D1XMP5_XpGdpyYKCVNZ 和四份已审文档完整保存在 history/。本文件是基础产品执行计划。用户先选择平台同步，随后明确批准本阶段记录例外并继续。平台 Saved plan 字段仍未同步；本阶段以仓库计划、完整规格和对话批准记录执行，字段同步不再是产品修改前置。不能把旧平台计划或聊天 <plan> 正文冒充已更新的字段。

## 基础产品文件增量

- scripts/server-distribution/build.mjs、manifest.mjs：从已提交干净源码按架构构建 API／worker／MCP／Lite 和安装工具镜像，保留现有依赖镜像，记录源码 tree、镜像 ID／摘要、工具版本及准确迁移账本。候选采用离线 Docker 归档和摘要清单；大归档分块并按内容复用，不提交 guest 磁盘、源码安装副本或明文秘密。源身份来自受审渠道，随包 hash 不代发布者身份。
- scripts/server-distribution/install.mjs、install.sh 与 infra/docker/server-installer.Dockerfile：交付包含 Node、Docker CLI／Compose 的可信安装工具镜像及 sh 启动入口，目标不需要源码、workspace、宿主 Node／pnpm／Python。启动入口先核用户取得的可信 manifest 摘要，再验证和装载工具镜像；不自行安装 Docker 或修改宿主权限。安装目录在宿主和工具镜像使用同一准确绝对路径，避免 Compose bind mount 指向其他目录。
- packages/config/src/deployment-profile.ts 与对应测试：固定 personal／team／enterprise 三画像，只有 Redis／S3 组合；拒绝未知画像、不支持后端、副本或角色、缺 CA／代理约束及不安全路径。沿 loadConfig、loadFeatureConfig、loadRealtimeRedisHintConfig、loadRetentionConfig 和 runtime-secrets 校验；可信工具镜像经摘要认证后先载入；配置预检先于其他应用镜像导入及业务服务启动，错误不包含秘密。
- docker-compose.lite.yml、docker-compose.production.yml、配置 JSON 示例及 runtime-guard：安装工具对既有 Compose 生成受控 JSON，接入显式画像、只读 CA、回环发布和准确 feature／MCP 模式，保持正常服务非 root 与硬化。初始化镜像的临时 /data 使用显式独有挂载，不新增无归属匿名卷。Runner 外置；Lite 的 MCP 使用独立镜像。
- 安装器使用独占锁、原子写入和写前 journal。阶段固定 verified、staged、backed_up、migrated、healthy、committed，绑定原 project、配置摘要、候选身份和账本；同版本异内容拒绝，损坏或不确定 journal 拒绝继续。排空 API／worker／MCP 后用旧工具完整备份，沿 applyMigrations 逐项 SQL／账本同事务迁移，再验证候选；首次用户沿现有 API 初始化账号及配对，commit 使用受保护凭据执行实际 MCP 读取后才切 current；不将整批升级说成单事务。
- packages/recovery 的现有 createRecoveryBundle／restoreRecoveryBundle 由安装工具调用，保持加密、密钥分离、全部 S3 版本／Object Lock／legal hold、空目标和认证 journal。迁移前失败保旧，迁移后仅在真实账本、运行输入指纹和依赖镜像均符合旧候选兼容条件时允许程序回退；不兼容时保留原卷，恢复到独立空目标，数据损失与切换另取具体授权。基础范围不新增领域 schema／API／event。
- docs/integration/README.md、reference.md、getting-started.md、installation.md、troubleshooting.md 及部署／恢复文档：同次维护服务端包、三画像、离线闭包、CA 和失败恢复的可运行示例，使用仓库固定 zh-tech-writing；支持声明仅覆盖实际通过组合。

## 验收与 CI

创建 server-distribution 的安装、manifest、journal 测试及 apps/api/integration/deployment-profiles.integration.test.ts。沿 acceptance-matrix.md 冻结的名字覆盖安装、重复／并发、拒绝和 journal 中断、迁移失败、兼容程序回退、不兼容空目标恢复、原卷保留、限流 store 失败关闭、丢 hint／worker 重启、工件上传下载和完整备份恢复。所有断言使用真实接受状态与外部效果证据，不用 fake 结果代真实原子性和存储锁。

新增必需双架构 server-install CI 入口，并同步 ci-policy、结果汇总和入口删除负例。复用现有固定 Ubuntu 完整 TCG guest／QMP 生命周期代码；先准备 Docker 及工具，再对无源码候选关闭外部默认路由、禁止自动 pull，实际证明离线启动闭包。三画像分别建立独有环境，API／MCP／Worker／outbox／限流／工件／完整恢复均在实际安装的候选中验证；隔离 CA、身份与 fake provider 不冒企业生产实网。

明确原 guest image／firmware、实际 kernel、boot_id、CPU／RAM／磁盘和候选／源码／脚本摘要；保留首败、采样、重启与收尾回执。固定资源采样不宣称物理最低配置，不上传含秘密的 guest 磁盘。 首轮2 vCPU／4 GiB的完整TCG记录保留；ARM64首次安装未通过，数据服务也有连续健康探针超时。下一候选验收环境改为固定4 vCPU／4 GiB作容量对照，现有健康、安装、请求和guest总期限及全部业务／故障／重启断言保持；CI547已执行该对照、两架构仍达到总期限，不能认定CPU为根因或宣称物理最低配置。后续保同一固定条件与全部断言，优化完整校验的有界读取缓冲并补固定操作耗时；不缓存跳过字节／SHA／OCI核验，实际性能与完整组合仍待新候选。执行 lint、typecheck、test、integration、conformance 五项及真实示例／恢复 opt-in，核新支持组合和当前 HEAD Required CI；不复用 docs CI 或控制面基线。

## 交付与收尾

全部产品、候选索引和有界证据交付本会话分支，复用共享工具／store／镜像内容。只定向收尾身份已证且无活动引用的本人资源，历史匿名卷、两处 policy-blocked 目录及其他受拒目标保持，删除首败停止该目标。

本会话分支的 PR 随最终基础范围更新标题正文，并保留 PR227 恢复来源。实际产品验收及最新必需检查成功后回 review，完成正式 P0/P1 成果独审；问题闭合、PR ready、无新范围分歧时按已获条件授权合入。正式独审前不合并、标 Done、外发或声明产品完成。
