# 版本化服务端安装

## 当前状态

本卡正在实现保留 PostgreSQL、Redis 和 S3 的基础交付。以下入口及命令已有代码，双架构完整虚拟机验收尚未完成，当前候选不能作为发行包或已支持声明。Redis-free、filesystem、生产内网接入和物理设备最低配置仍未交付。

普通 CI558 的 `f53f20b` 候选已在三个独立 AMD64 guest 完成个人、团队、企业的安装／升级／回退／恢复和整机重启；ARM64 企业首次安装超时，个人与团队取消，Required 失败。CI559 的 AMD64 仍自然退出 139，根因未闭合。这些结果只覆盖实测组合，完整状态及原件见 [验收矩阵](../plan/ta01-self-hosted-deployment/acceptance-matrix.md#ci558-当前基础矩阵)及[当前报告](../plan/ta01-self-hosted-deployment/current-delivery.md)。

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

三画像均按上述 `check → stage → install` 顺序验收。独立 guest 的首个请求画像先暂存，按其实际 project 检查没有部署容器、current 或运营密钥。CI558 ARM64 企业曾因助手只给个人画像暂存，在首次安装中导入镜像并达到原 1,800 s 期限。本次只修助手的画像选择，保各命令原期限；尚待新候选真实验证，不据此宣称 ARM64 已支持或 MCP 139 已修复。

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

每次仍校验候选全部文件和分块。 流式读取使用有界缓冲，散列及归档身份核验仍覆盖全部字节；不缓存跳过或依赖文件时间、标签代替完整性检查。缓冲调整的实际guest性能尚未验证，不能据此放宽超时或登记支持。应用镜像已载入时，全部角色的准确 ID、架构和来源符合清单才复用；身份不符即拒绝。当前支持状态仍以双架构完整 guest 结果为准。

健康验证开始前，journal 保存已核候选清单的原始 JSON，并绑定候选摘要。recover-old 在新程序启动后，先核清单摘要、程序输入和依赖兼容，再核真实账本。即使 pending 尚未写入，也不能跳过程序检查。旧 journal 缺少候选原件或原件损坏时明确拒绝，须先保全证据并按完整恢复流程处置。

健康探针使用镜像内的 curl 读取本机 readyz，要求完整 2xx 响应，不跟随重定向，不使用代理环境变量。HTTP 2 s、Docker 3 s 和安装健康验证 180 s 的预算保持；超时、非 2xx、不完整响应、非法协议和带凭据 URL 均失败。curl 及其依赖随镜像离线交付，不要求目标设备联网安装。此修正待双架构完整虚拟机验收。

业务校验按 JSON-RPC 请求 ID 选择唯一响应，SSE 中的前置通知和注释不作为读取结果；重复或缺失响应、RPC／tool 错误、鉴权失败和工作项不匹配仍拒绝。失败回执可查看安全 HTTP 状态、已知错误码及响应哈希，并附归属容器的日志分类与哈希；不输出凭据或消息正文。请求预算保持 30 s，校验失败不会登记 current。

完整 guest 中直接 API／MCP 请求失败时，也按安装 UUID 和根哈希核归属后提取安全服务日志分类，保持源码／回执绑定。标准错误类型和已知模块行号用于定位首败，不能单独证明原因；支持声明仍须完整验收。

每个画像的完整 guest 验收还要求真实凭据限流返回 429／AUTH_RATE_LIMITED 和有效 Retry-After，并与 Redis 故障时 503 失败关闭分别记录。使用独有测试主体、原生产预算和 Redis 时钟，不删除限流键或将根集成用例代替已安装组合。团队 amd64 诊断已有该局部通过，双架构三画像完整组合仍未通过。

CI 的 native-diagnostic 参数默认关闭，仅用于隔离 guest 的原生崩溃定位。该模式强制非零退出且标记 diagnostic-only，不能用其结果登记完整支持或满足 Required CI；用户正常安装不依赖 GDB。详见 [接续与首败记录](../plan/ta01-self-hosted-deployment/resumption.md)。

显式原生诊断的自然运行捕获仅在独有、无 swap 的 guest 中临时开启，经核准确 MCP PID／启动时间／程序摘要后将崩溃流在匿名内存解析；只保安全符号、摘要及已核公开 Node 程序内的位置，处理后恢复设置。普通安装不配置 core 管道，不要求 GDB。该诊断仍不产生产品 PASS，当前自然崩溃原因尚未定位。

默认完整 guest 在整机重启后要求每画像用原身份读回 API／MCP 工作项和原工件字节，并通过正常 API 新建工作项、验证对应 outbox 投递。两次 boot_id、kernel 与 QMP 生命周期另核；单独 API 可读不能代表全部恢复。新增完整重启闭环尚待实际候选验收。

候选健康失败后，journal 先记录 stop-unvalidated-runtime，再按安装 UUID／根哈希绑定的完整容器 ID 停止 API／Worker／MCP，核全部 Running=false 后才尝试兼容恢复。不能兼容时记 stopped-restore-required；停止失败记 runtime-stop-failed，不重试停止或启动旧程序，也不宣称已经停止。其他未证明停止的失败记 restore-required。数据服务和原卷继续保留；这个新增真实故障场景尚待 guest 验收。

业务证明或凭据校验失败时，commit 保留待验证候选及维护状态，不登记 current。先核实际失败并修正证明；需要 recover-old 时仍核原候选、程序／依赖和账本兼容性，不按未切 current 推断数据未变。

当前可选原生诊断针对 CI549 的团队回退后 commit。前序保留普通模式的个人画像安装／升级／故障恢复／停止、团队业务及升级回退步骤和端口，再观察原提交命令；不执行企业及整机重启，不能构成三画像完整支持。旧诊断针对团队首次业务读取，其未复现记录保留，不能替代这个新首败场景。

诊断注册先核镜像／只读根文件系统、PID／启动时间及程序文件身份；实际程序摘要延至崩溃处理时计算，减少请求前的完整读取。旧诊断未复现不代表普通模式退出139已解决，捕获方式的影响须与产品结果分开。

失败时的诊断先保留经安装 UUID／根哈希核验的全部容器状态，再分类各容器日志。某个日志分类器超时仅记异常类型，不丢弃已核状态；准确容器主进程的 CPU tick／线程数只作数字快照，不输出命令行或环境，也不能单独证明根因。新增采集路径尚待完整 guest 验证，安装与健康期限保持。

显式原生诊断在团队回退后 commit 的原预检期间并行核准确进程，不在请求前等待准备或额外串行调用 Docker。提交仍执行一次；事后核注册时间不晚于 journal 的 validate-business-read 开始时间，迟到或缺少边界均拒绝此次诊断。失败保原异常，finish 负责一次恢复，受拒目标不重试。仍核安装／镜像／只读根及进程身份，原始 core 预算保持。新路径未完整 guest 验证，并发准备的观察影响未量化；旧未捕获记录不证明退出139解决。普通产品模式不启用此准备。

PostgreSQL备份／恢复工具通过只读文件描述符提供stdin，允许仅列归档目录的工具正常提前结束读取；成功仍要求工具退出0、stdio及完整输出文件关闭。非零退出、输入错误或目标已存在均失败，不将目录检查当完整恢复。该管道修正已有真实子进程回归，新完整guest与备份／恢复仍待复验。

启用init的容器主PID不能直接当Node PID。显式诊断在已核容器中按受信Node文件device／inode、直属父子关系选择唯一Node，缺失／歧义拒绝；不读argv／环境，不回退到init。回执保安全注册身份与主PID，原匿名RAM／超时边界保持。本机真实PID实验与8项边界通过，新guest崩溃捕获未完成，既有“未捕获”不证明MCP139解决。

完整guest的serial另记录固定操作名、画像、序号和耗时，最多128次操作／256条记录，不输出命令参数、路径、环境或正文。finished只表示达到该次预期结果，也包括预期拒绝，不等于安装／升级成功；完整支持仍按原业务、故障和重启断言判定。详见[接续记录](../plan/ta01-self-hosted-deployment/resumption.md)。

安装器的 `--trace-timings` 默认关闭，显式启用时向 stderr 输出固定阶段的耗时与当前 Node 进程的 CPU 用量，不含 Docker 子进程 CPU。完整 guest 每次最多提取 16 条、最多覆盖 128 次操作；只接受固定阶段及非负整数，丢弃未知字段和原始 stderr。这些数字用于区分完整包校验、配置加载、镜像导入和业务读取成本，不改变成功判定或期限。

完整 guest 失败时，先向 serial 输出最多三条固定快照，分别记录捕获异常、journal 阶段及已核归属容器状态，再执行原有日志分类。快照不含异常消息、参数、路径、环境或身份，也不作为验收回执。若后续收集未完成，仅承认已保存的快照，不能补写完整诊断或根因。CI549 AMD64 已实际保存三条快照及 failure 回执，首败为团队回退后真实 MCP 初始化连接重置；历史退出码未知，完整支持仍未通过。

失败收集还按已核安装 UUID／根哈希的准确完整容器 ID 读取当前 journal 时间段内的 die／restart／oom 历史事件。仅请求时间、事件、ID 和 die 退出码，最多保留 64 条，不请求完整标签、环境或原始日志。事件查询限 10 s，失败只记采集不可用，保原异常；Docker 历史缓存可能不完整，空记录不能证明没有退出。本机合成 Node 退出7的投影已通过，新完整 guest 中的 MCP 历史事件仍待实测。

业务读取失败诊断另记 requestFinished、responseStarted、responseCompleted、responseBytes 和本次读取耗时。requestFinished 仅表示 Node 已完成请求写入，不证明服务端已接收；响应阶段只含布尔值、字节数和 HTTP 状态，不输出响应头值或正文。原 30 s socket 超时、完整响应和准确 JSON-RPC ID 判定保持。CI549 ARM64 在个人升级后 tools/call 超时，原件缺这些新进度字段；不能由健康及重启数 0 推断超时根因。新增字段尚待实际 guest 验证。

CI551 AMD64 显式诊断已保存 requestFinished=true、尚无响应头、0 响应字节和约31.68 s 超时，并由已核容器历史事件确认 die／139。注册早于团队回退后提交的业务读取，但 GDB 达到60 s，旧处理未保存部分输出或内存流元数据；不能倒填栈、流大小、摘要或根因。捕获可能推迟进程退出，不将诊断中的超时与普通模式的连接重置直接等同。

后续捕获先登记实际内存流大小、摘要和阶段，读取有界 ELF64 note，仅输出信号及 Node 文件内偏移／链接地址；不输出映射路径、寄存器、进程绝对地址或原始字节。内存流读完不代表有效 core，公开位置也不等于回溯或根因。GDB 只取当前故障线程的12层回溯，保留默认符号展开；到期只保白名单部分输出和摘要。512 MiB／90 s 总捕获、GDB 最多60 s 保持，预算不足不启动 GDB；元数据读取权限拒绝停止本次捕获，不换读法重试。新路径仅有25项边界检查，尚待实际 guest。

配置校验现从合同包的轻量入口加载版本和功能登记；原公共入口继续导出同一对象，配置、默认值及全部校验保持。本机编译后的生产闭包已验证，实际 TCG 开销及完整安装组合仍待新候选；不据原生微测登记支持。
### 当前验收限制与内部诊断

CI550 普通双架构及 CI551 显式诊断均失败：AMD64 普通运行达到原150分钟总期限，ARM64 在个人升级后的 MCP 读取中超时；AMD64 诊断观察到 Node 退出139，但 GDB 超时，尚无可用栈。三画像完整支持及整机重启仍未验收，不据局部健康或其他绿色 job 宣称可用。

后续候选完整校验包内每个文件的类型、真实路径、大小和全部字节 SHA，最多两个工作线程，单可用 CPU 顺序执行；所有工作线程成功退出后才继续，无缓存或跳过校验。原安装、健康、请求和虚拟机期限保持，实际 TCG 效果待测。

CI552 AMD64 已在企业回退提交时再次出现 MCP 退出139，个人与团队闭环完成仍不代完整支持；当时 PG 上限100、连接数3的快照不能解释原生故障。CI553 的旧单窗口观察在 AMD64 团队回退、ARM64 个人升级均提交成功且未捕获自然崩溃，不据此关闭旧问题。

后续显式诊断覆盖每画像首次、升级、回退的九个正常提交窗口，每个原动作执行一次，并行准备后核早于业务，结束仅恢复一次；准备或恢复受拒即停止诊断，不继续其他窗口。每个成功窗口即时保回执，窗口完成不表示整套或自然捕获通过。普通模式的原命令参数、动作数和全部验收保持；诊断仍非零、不含完整重启、不满足产品验收。33项本机边界检查通过，完整新候选待测。

guest 的测试反向代理只对原 POST /mcp 请求记录固定阶段，失败时保每画像最近8条、每代理最多128个请求的观察；覆盖请求读取／发送、上游响应头、上游响应体完成及客户端发送完成。记录不含正文、凭据、路径或异常消息，不额外发请求、不改变原30秒客户端与90秒上游期限。阶段快照用于定位等待位置，不是重试、完整历史或根因证明。

失败时对本安装已核归属的 PostgreSQL 只读采集连接上限、包含采集自身的连接数和活动跟踪开关，均为聚合数字，不更改数据库配置。采集可用不表示已经确认超时根因。源码、首败和收尾见 [接续记录](../plan/ta01-self-hosted-deployment/resumption.md)。
CI555 的扩大观察运行已因助手边界缺陷主动取消，普通CI554继续；可取得的取消原件没有result.json，不冒产品或收尾结论。首次正常提交之前会保留无效凭据校验的失败读取，因此后续助手仅认本次追加的读取，并核原journal ID及旧记录前缀不变；不删旧失败、不复用旧读取为新观察。新34项本机检查通过，未实测新guest，旧33项记录另保。公开Node符号索引仅已准备，目标二进制SHA未匹配前不用于定位或归因。详见 [接续记录](../plan/ta01-self-hosted-deployment/resumption.md)。
后续普通验收按三画像×双架构拆为六个独立完整TCG guest，每架构候选只构建一次，按工件ID和生产者manifest摘要复用。每VM仍4 vCPU／4 GiB及150分钟、原请求／健康／安装与完整恢复／重启断言保持；每架构从一台串三画像变为三台独立VM，合计计算预算增加，不能称总体预算或性能未变。普通Required同时要求生产者和六组全部成功，单配置成功不代表完整支持。当前仅40项Python／22项门禁单元通过，真实新组合未验，MCP退出139与ARM64读取超时根因仍未闭合，不能合入或登记支持。

显式诊断的每个窗口使用独有标记／回执ID，不覆盖或重用旧窗口；出现core处理回执即停止整轮，coreObserved不等于有效core或可用栈。捕获仍限内存512 MiB、无swap、90秒总／60秒GDB。准确源码、预算变更、首败及未测范围见 [接续记录](../plan/ta01-self-hosted-deployment/resumption.md)。安装器参数、目标依赖及REST/MCP请求示例均未变化。
