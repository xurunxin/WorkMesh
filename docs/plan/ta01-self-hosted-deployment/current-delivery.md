# TA01 当前交付与诊断报告

## 当前结论

基础交付仍未完成，PR228 保持 draft，未进入正式 P0/P1 产品审或合入。本轮起始 head 为 `4d549c41c8126226dc78f254a9c565ad3c0d919a`；交付提交以 PR 的真实 ref 为准。产品受测来源、资料提交和微测工具分别绑定，新增事实仅来源执行者。

本轮已执行一次预展开公开输入的固定 ARM 小测。原 VM 1,200 秒截止触发，含停止收尾为 **1,200.65 s**，状态 incomplete。已实时保存 **8 条阶段回执**；目标 GET 开始／返回回执各 0，Node 最终报告缺失，**实际目标 GET 数未知**。没有据此实施产品修复，也没有第四次组件试跑或新整轮 CI。

API139、MCP139、原 ARM 迟响应仍分别未闭。前两次 ARM 到期、零最终回执和未知请求数保持，不能由本次进展倒填。首次原生六个 HTTP 成功但上下文未进入请求、后续六份完整阶段和独有行锁校准，只证明各自样本与采集方法，不推旧 CI 有锁。

## CI567 与本轮交付的区别

[CI567／run38893305755](https://github.com/xurunxin/WorkMesh/actions/runs/38893305755) 仍绑定 `e2763da4dfdf25f7fc5c28c34a9619d4788f4541`。本轮直接读取仍为 in_progress，准确时间与全部 job 在[小测索引](../../reviews/ta01-product/resumption-api-auth-pg-arm-preexpanded.json)的 ci567Snapshot 中。没有手动 dispatch、rerun 或 cancel。

| 画像 | AMD64 已核原件 | ARM64 最新工具状态 |
| --- | --- | --- |
| 个人 | job116950873995，success，2,147.47 s／重启 135.46 s | job116950873965，in_progress |
| 团队 | job116950873839，success，2,483.54 s／重启 159.34 s | job116950873874，in_progress |
| 企业 | job116950873944，success，1,791.37 s／重启 115.45 s | job116950874189，in_progress |

三 AMD 的 22 发行输入、六脚本、不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU0，以及重启后 API／MCP／原工件／新 outbox 四证明已逐份核验。生产者 artifact12042658945，manifest `75aaf2410024455f35c06274cc63f9b818795c8e2a830b28161079e4eaf1f28e`。仅证明 e276 的这些组合，不关闭旧 139，也不代历史不同发行程序升级。

本轮只改内部测量助手和证据文档，继续用 `[skip ci]` 保留有证据价值的 CI567。未改工作流或门禁，本资料 head 没有成功 Required，不能作为可合入候选。[GitHub 的跳过说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)不提供检查豁免。若以后有准确产品修复，仍须绑定新候选完成原真实验收及最新 Required。

## 固定输入、实际代码与边界

[测量索引](../../reviews/ta01-product/resumption-api-auth-pg-arm-preexpanded.json)及[原件](../../reviews/ta01-product/resumption-api-auth-pg-arm-preexpanded.zip)保存实际使用的工具、全部安全阶段、串口、截止原件、公开输入摘要与资源账本。

沿用 CI566@`541f6ba64841915801a1ccb123f9adb7f61ebe17` 的独立 API／PG／Redis ARM 角色。候选 artifact12032934001，manifest SHA `391bd59c041d4a7d87a15573d2f03ff07edfddcf6b1233b6f092b75639fd29b4`。已核原 ZIP／21 分块／OCI 闭包的旧提取记录保留；本次复核三份 gzip 和解码后的全部原始 tar 摘要，再展开。相关产品源码至本轮起点无变化。

Node 22.19.0，SHA `da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7`；API server.js 为 72,215 bytes，SHA `b511c3ce89dc404b00ece5642829290c1ff74ad54a97417974e5f986836e5ea4`。实际单对助手 SHA 为 `79dfd8f7828a8fbedfc6384249dc467fa0b46b86c6cc77f7227fe75b362b2e4a`，旧工具版本不倒填。

QEMU 包精确 `1:8.2.2+ds-0ubuntu1.18`；二进制 SHA `b511b60cc31479b71dfdd589e6c981ae37b20ef0e75adc5a57bb0d6737e9b30c`。固定 ARM guest SHA `1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55`，原固件／ROM 摘要匹配，仍为 TCG／4 vCPU／4 GiB。宿主 x86_64，没有原生 ARM 对照，不宣称 CI 宿主二进制、调度或内存环境相同。

控制容器内公开输入预展开耗时 16.21 s。现有只读 cidata 盘承载展开后的可信代码，保 nodev／nosuid 并允许执行这些候选文件；tmp／data 使用原 guest 私有磁盘的独有目录，proc／null 使用原 guest 挂载能力。未新增虚拟设备、宿主挂载、Docker socket、公开端口或权限。公开运行文件字节保持，ISO9660 布局与生产 ext4／镜像执行环境不等价，不能把这一过程作为性能提升证明。

这是独立 API，**不是个人 Lite 完整镜像**。跳过 entrypoint，导入时 NODE_ENV=test 仅用于禁止自动 listen，构造 app 前恢复 production。计划经原安装／配对取得 work:read，再用原身份／授权路径做 Fastify inject。未测 MCP／TLS／代理／Worker／S3 或竞争负载。原件中的 exactMcpRole=true 是沿用的 ARM 启动开关名，实际输入不是 MCP 角色，也没有 MCP 调用。

PG 仍用本组件既有 20 连接／64 MB，开启活动、规划和 I/O 观测；个人 Lite 为 32 MB／track_activities off。单对模式不选行锁或额外撤销读取；目标最多一次资格 GET、一次工作项 GET，首败不重试，GET30 s／Node600 s／VM1,200 s 保持。目标取得和配对完成均未收到回执，不能写成真实身份单对已测。

## 实时保存的阶段

| 时钟与阶段 | 累计时间或独立区间 |
| --- | --- |
| guest：身份已核 | 0.014 s |
| guest：只读公开输入挂载、默认路由移除 | 9.760 s |
| guest：角色挂载及关键文件 SHA 已核 | 26.178 s |
| guest：独有 PG／Redis 就绪 | 129.700 s |
| Node：测量模块启动 | 0.005 s |
| Node：产品导入开始 | 2.626 s |
| Node：产品导入结束 | 62.917 s；导入区间 60.291 s |
| Node：迁移准备开始 | 84.287 s |

各累计时间只在自己的单调钟内解释，不把 guest uptime、Node 起点与宿主 elapsed 相减。8 条回执已即时写入宿主 progress.jsonl，Node 事件序号 0–3 连续；串口投影一致。它们不是统一关联的请求阶段，因为尚无目标请求回执。

最后标记 `migrations-started` 位于 `monitor.connect()` 之前，随后才调用 `applyMigrations()`。没有连接完成或迁移完成记录，因此该边界不能进一步区分监测连接与迁移执行，更不能推某条 SQL、锁或 CPU 是根因。没有可用的目标查询／授权／生成／调度数据。

**本次最早能证明的失败是宿主原 1,200 秒截止。** QEMU 返回 0，但 stderr 记录宿主 signal15 且 deadlineReached=true；不是正常 guest 关机。Node／PG／Redis 最终退出与目标请求数未知，不补记 0、139 或业务断言失败。

## 假设、缺口与下一项动作

| 可证伪的假设 | 本轮判断 | 需要的最小证据 |
| --- | --- | --- |
| ARM 目标请求主要等待连接或行锁 | 未知；原生行锁对照不能外推 | 原目标 correlation／backend／SQL 区间与等待样本 |
| 资格生成／序列化解释原 21.62 s | 未知；60.29 s 导入是请求前成本 | 同一请求最后 SQL 回调、onSend 和 CPU；不能从旧纯函数基线扣减 |
| 调度或观测开销解释迟响应 | 未知；本次没有请求 CPU／wall | 同源路径与有界调度／观测对照；PG 执行含等待，不作 CPU |
| 预展开足以在原窗取得完整单对回执 | 本次未成立；不等于固定环境下永不可能 | 本次已得准备阶段，目标回执仍缺，不以更多整轮试跑补证 |

当前授权下，下一项是保留 CI567，待其 ARM 原件可得后读取准确 result／serial／journal，与本次边界分别核对。未追加第四次 ARM 微测，未猜测修复产品。

如果仍要同环境单对测量，可另行裁定一次 **VM 总窗 1,800 s**，比原上限增加 600 s；Node600 s、GET30 s、4 CPU／4 GiB及正式产品期限保持。**这会增加组件预算，仅为有依据的选项，未获批、未执行，也不保证获得样本。** 当前继续执行原 1,200 秒限制。不能以增窗取得的样本补原验收成功。

## 检查、收尾与历史

本轮适用检查及准确结果在[核验记录](../../reviews/ta01-product/resumption-api-auth-pg-arm-preexpanded-checks.json)。没有本机重跑五项根门禁；局部语法、文档和 CI 策略检查不能代 Required 或真实产品验收。中文继续使用固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及 manual-structure／typography，autocorrect 缺失，手检，不安装全局工具。

唯一新控制容器 `b8a52313137e9708918ed3390e60281eb9aa0187715e884095c82d8e201573bf` 已核 owner／完整 ID／4 CPU／4 GiB及无挂载／设备／公开端口。确认无活动 QEMU／Node／PG／Redis 后停止并移除，实核不存在。PID1 最终 137、无 OOM，与未知的 guest Node 退出和旧 139 分开。四个共享镜像引用 ID 保持；本轮未新建诊断镜像标签或角色容器。

控制容器中的重复公开展开树、seed 和私有 VM 磁盘随该容器收尾；只归档安全回执、串口、工具与摘要。原公共 gzip 单份缓存、旧树／候选、未知卷、受拒目录和其他项目保持，无 prune／reset／clean，不宣称物理净释放。此次新增组件开销单列，不称总预算不变。

[4d549 中的完整前轮报告](https://github.com/xurunxin/WorkMesh/blob/4d549c41c8126226dc78f254a9c565ad3c0d919a/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留原生／行锁及前两次 ARM 原件关系；[e276 的历史报告](https://github.com/xurunxin/WorkMesh/blob/e2763da4dfdf25f7fc5c28c34a9619d4788f4541/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留此前完整诊断。CI566@541／Required116933988732 失败：AMD 团队 initialize 重置／MCP139、ARM 个人 30,609 ms 失败及资格 21,622.81 ms／工作项 10,019.08 ms 投影、另两 ARM 9,000 秒缺回执分别保留。晚 200 不补成功。

旧普通562／显式563失败、564取消缺件、565三AMD通过／三ARM失败均不改写。PR227仅为恢复来源。Saved plan 字段未同步的23:41记录例外继续，不倒填授权。本轮无 schema／迁移／REST／MCP 合同／事件／安装行为变化；接入命令与配置示例无变化，只同步当前状态。

PG／Redis／S3、Runner外置、纯后端和既有 WORM／保留／恢复保证保持。Redis-free／filesystem待裁定，ADR0071／0072仍Proposed。正式 guest4 vCPU／4 GiB／150分钟、job210分钟、业务30秒、首次Client90秒、健康180秒、安装1,800秒和原oneshot不改。全部原真实验收、仅P0/P1正式产品审及最新Required齐前不得合入，不报Done或对外发布。
