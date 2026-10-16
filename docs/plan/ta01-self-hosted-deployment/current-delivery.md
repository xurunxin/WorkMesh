# TA01 当前交付与诊断报告

## 当前结论

基础交付尚未完成，PR228 保持 draft，未进入正式 P0/P1 产品审或合入。本轮起始 head 为 `e2763da4dfdf25f7fc5c28c34a9619d4788f4541`，tree 为 `51b58c10c4c0a13a89884f0f7551b9d482b9c44b`。资料提交与受测产品分开，交付 head 以 PR 的真实 ref 为准。新增事实均来源执行者。

本轮完成真实隔离身份的原生 API／PG 测量，并用独有凭据行锁校准等待采集。两次 ARM 组件 guest 均达原 1,200 s 截止、无最终回执，实际业务请求数未知。没有据此实施产品修复；API139、MCP139 和原 ARM 迟响应仍未闭合。产品、原 guest 诊断、CI、运行时、支持矩阵和原业务期限均未改动，没有手动 dispatch、rerun 或 cancel。

## CI567：准确候选与在途结果

[CI567／run38893305755](https://github.com/xurunxin/WorkMesh/actions/runs/38893305755) 绑定 e276。2026-10-16 12:43:17 UTC 直接读取的工作流仍为 in_progress；三组 AMD 原件已核，三组 ARM 仍在运行。Required 尚无齐备的成功结论。同期 PR228 仍 draft／未合入，真实 refs/heads/main 为 `c3dd64b30e1739204ce8b8f708d5ef17b4ea3de8`，不是缓存引用。

| 画像 | AMD64 实际结果 | ARM64 工具快照 |
| --- | --- | --- |
| 个人 | job116950873995，success；2,147.47 s，重启 135.46 s（[原件](../../reviews/ta01-product/ci567-amd64-personal-full-guest-pass.json)） | job116950873965，in_progress |
| 团队 | job116950873839，success；2,483.54 s，重启 159.34 s（[原件](../../reviews/ta01-product/ci567-amd64-team-full-guest-pass.json)） | job116950873874，in_progress |
| 企业 | job116950873944，success；1,791.37 s，重启 115.45 s（[原件](../../reviews/ta01-product/ci567-amd64-enterprise-full-guest-pass.json)） | job116950874189，in_progress |

三份 AMD 原件各核 11 成员、22 个发行输入和六脚本，源码前后相同且与准确 Git 字节一致。生产者 artifact12042658945，manifest SHA 为 `75aaf2410024455f35c06274cc63f9b818795c8e2a830b28161079e4eaf1f28e`。各组均核不同 boot_id、两次 kernel、QMP RESET／SHUTDOWN、QEMU 退出 0 及重启后 API／MCP／原工件／新 outbox 四证明。仅证明 e276 的准确组合，同程序升级夹具不代历史不同发行程序升级，也不关闭旧自然 139。

为保留仍有证据价值的 CI567，本资料提交采用 `[skip ci]`，不追加无产品修正依据的整轮运行。未改工作流配置，也未免除门禁。[GitHub 说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)明确跳过的提交不能取得相应检查成功结论；本资料 head 不能作为可合入候选。准确修复后的新候选仍须原真实验收及最新 Required。

## 本轮实际路径与来源

[测量索引](../../reviews/ta01-product/resumption-api-auth-pg-path-comparison.json)及[原件](../../reviews/ta01-product/resumption-api-auth-pg-path-comparison.zip)保留实际工具版本、输出、SQL 模板摘要、阶段、失败、资源账本及 Git 来源。

从 CI566 准确候选提取独立 API、PostgreSQL 和 Redis 角色，核原 ZIP、manifest、全部应用分块及所选 OCI 闭包。AMD 候选 artifact12033760634，manifest `1e8cb5c8e3eacc3e1de2be0f4bffbbf17e02beffa0b72cd0abe260f4c246c8c5`；ARM 为 artifact12032934001，manifest `391bd59c041d4a7d87a15573d2f03ff07edfddcf6b1233b6f092b75639fd29b4`。受测源码均为 541，相关产品输入至 e276 无差异，不声称两个候选的二进制相同。

两 API 角色的 server.js 均为 72,215 bytes／`b511c3ce89dc404b00ece5642829290c1ff74ad54a97417974e5f986836e5ea4`。Node 22.19.0 的 AMD SHA 为 `638c77326270093b1251a5e72b4335c94c74856a210460341c73d6f3da647328`，ARM 为 `da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7`。构建 config ID、归档摘要和本地实际 ID 分开登记。

原生过程分别在新数据库经原安装、配对及兑换取得请求 work:read 的测试凭据，随后调用原路由、身份解析、授权和真实 PG／Redis。前置操作不计目标 GET 时间；每次过程最后撤销连接，后续资格读取均 401。未缓存实时资格或替换授权结果。

这里只测独立 API 角色，不是个人 Lite 完整镜像。跳过 entrypoint；导入 server.js 时暂用 NODE_ENV=test 禁止自动 listen，构造 app 前恢复 production。使用 Fastify inject，无 MCP／TLS／代理／Worker／S3 和完整竞争负载。PG 启动参数为 `max_connections=20`／`shared_buffers=64MB`，额外开启活动、规划和 I/O 观测；个人 Lite 原为 32 MB 及 track_activities off。因此不是个人 ARM 原 21.62 秒的同镜像复现。

## 原生请求的阶段记录

首次原生过程六次读取均 200、撤销后 401，但调用方 ALS 没有进入 Fastify 请求，SQL 和阶段为空。保留该结果，只算 HTTP 局部证据，不把空记录当零成本。测量助手改为按独有 correlation 在 onRequest 的 done 内绑定上下文，并断言 COMMIT、授权和 SQL 记录非空；产品代码不变。

新数据库中的六次复核均 200，Node 退出 0，PG／Redis 正常退出 0。三次原生过程总 wall 分别 23.23、24.54 和 22.56 秒，均受唯一控制容器 4 CPU／4 GiB 上限约束，未独占物理宿主。

| 上下文修正后的样本 | 请求 wall | 身份 COMMIT 累计 | 授权后累计 | 最后 handler SQL 回调至 onSend |
| --- | --- | --- | --- | --- |
| 资格，第 1 次 | 183.49 ms | 83.07 ms | 89.57 ms | 88.97 ms |
| 工作项，第 1 次 | 36.31 ms | 10.04 ms | 16.99 ms | 0.62 ms |
| 资格，第 2 次 | 71.47 ms | 9.10 ms | 14.49 ms | 52.99 ms |
| 工作项，第 2 次 | 38.10 ms | 14.23 ms | 20.61 ms | 0.27 ms |
| 资格，第 3 次 | 53.30 ms | 10.87 ms | 16.71 ms | 32.75 ms |
| 工作项，第 3 次 | 25.20 ms | 8.73 ms | 14.51 ms | 0.23 ms |

累计值均从同一请求起点计时，不是各函数独立耗时。首次资格有 45 条 SQL，包含建立 Coordination Session 的事务事实；后续资格 14 条，工作项各 17 条。每条记录模板 SHA、backend PID 及客户端调用区间，不含参数。连接取得最大 0.36 ms，排除本批秒级连接取得排队。资格响应实收 308,929 bytes，仅属于新夹具，旧 CI566 响应大小仍未知。

尾段包含验证、资格生成、序列化和原公共 onSend，不等于单个纯函数。process.cpuUsage 含当前 Node 的 V8 多线程和监测工作，不作 wall 比例。SQL 客户端 wall 含编解码和回调调度；PG 统计为隔离整库聚合，可能有嵌套／后台工作，不能相减推 CPU。原生无竞争样本短于 250 ms 采样间隔，零等待样本表示未观测，不证明无锁。

## 独有行锁阳性对照

第三个新建原生数据库先完成一对正常读取，再由独有事务锁住测试凭据行，PG pg_sleep(1) 后 ROLLBACK。没有修改权限或数据，也不对生产身份施加锁。

受控资格读取为 1,056.97 ms，连接取得最大 0.0565 ms。原身份解析的凭据 SELECT 客户端耗时 1,001.75 ms，backend PID3956；SQL 模板 SHA `e96db07cb6576b844ccaa80f99939e12991f1810e3ca37c4b749e77e4c66e9f8` 精确匹配 PG 统计，执行 999.84 ms、规划 0.20 ms、calls1。独有阻塞事务 PID3957，实测持锁 1,001.86 ms。

四次采样均见 active／Lock／transactionid、max_blockers1。请求仍 200，实时事务保留；撤销后 401。原件 controlled-lock-proof.json 可逐项核对。这证明本次采集能区分连接取得和凭据行锁等待，也证明 PG 执行时间可以包含等待，不能当纯 CPU 时间。**不证明原 CI 发生同类等待。**

## ARM 组件仍缺请求样本

先核精确 QEMU 8.2.2+ds-0ubuntu1.18、固定 ARM guest `1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55`、原固件／ROM 及 4 vCPU／4 GiB，再启动。宿主为 x86_64／Linuxkit7.0.14，没有原生 ARM 对照或新宿主安装、设备、权限、公开端口。

首次宿主 elapsed1,200.69 s，deadlineReached=true，无回执，实际内部阶段和请求数未知。一次只读供应文件位置快照为空，不据此推输入已完成或 API 未执行。

第二次由同一既有只读 cidata 盘供应相同公开角色输入，不增设备；恢复导出根目录 /dev/shm 的私有 1777 权限，并用已在原生验证的上下文绑定。仍达到原 1,200 秒截止，含停止收尾 total1,207.30 s，无请求回执。以下只属同一 guest 单调钟：

| 阶段 | 从测量入口开始的累计时间 |
| --- | --- |
| guest 身份已核 | 0.01 s |
| 输入 SHA 已核、默认路由已移除 | 24.71 s |
| 三角色展开、挂载及 Node SHA 已核 | 171.43 s |
| 独有 PG／Redis 已就绪 | 263.19 s |

输入已核到角色就绪相隔 146.72 s，含展开、挂载和校验；服务准备 91.75 s。它们不是 API 查询时间，不能拿 guest uptime 与宿主 elapsed 相减。Node 调用段无完成回执，实际请求数、SQL／等待／计算均未知，不补零或通过。

两次 qemuExitCode 均 0，但均有宿主 signal15 终止原件及 deadlineReached=true，是原期限失败，不是正常 guest 关机。首次供料方式、第二次目录修正及上下文版本分别保存，未预写任何一项为首次根因。没有追加第三次 ARM 试跑或整轮 CI。

## 假设状态与下一项动作

| 具体假设 | 本轮能判定的内容 | 仍缺证据 |
| --- | --- | --- |
| 本批原生迟响应主要是连接取得耗尽 | 六组完整记录最大 0.36 ms，排除本批秒级取得排队；受控锁等待时取得仍约 0.06 ms | 原 CI 失败窗口的取得、backend／query 关联，不用较晚 3／100 或 4／20 快照补证 |
| 行锁可在实时身份事务内造成迟响应 | 独有事务对照已对应原 SELECT、PG 统计和四份 Lock 采样，方法有效 | 原 CI 是否真有阻塞者未知，原生零等待样本不算排除 |
| 资格处理或 PG／调度解释 ARM21.62 秒 | 原生已拆出事务、授权及 handler 尾段；PG 执行时间不等于 CPU | ARM 两次无请求样本，不能从旧纯函数 5.29／1.89／1.13 秒或新原生值扣减旧 21.62 秒 |
| 同一原因解释 API139、MCP139 和读取超时 | 没有这种证据；initialize 不读资格，短时原生过程不代长时间故障复现 | 旧 API139 无 core，MCP 有界帧仍未给坏指针来源，各自未闭 |

下一项最小验证应先解决已量到的组件准备成本：在独有控制容器预展开已核公开角色输入，复用既有只读 seed 盘，在原 4 vCPU／4 GiB、VM 1,200 s／Node 600 s／读取 30 s 内只取一对真实 GET，并及时保存请求阶段。此方案尚未执行，不能写为 ARM 已测。不换运行时、缓存资格、跳鉴权或延长期限；取得实际慢语句或计算段后，再选准确产品修复。若需改变原环境／资源或保证，先给具体依据及选项。

## 原件、检查与资源

实际工具分版本保存：首次版、上下文修正版、行锁对照版分别绑定输入 SHA，后续代码不倒填旧过程。首次 PowerShell 解析错误及缺文件预检发生于 Node／VM 启动前，另列工具首败；一次 GitHub 快照读取失败未保存底层 stderr，原因未知，后续独立快照另记真实时间。

本轮运行测量助手、语法、CI 策略和文档适用检查，实际结果见[核验索引](../../reviews/ta01-product/resumption-api-auth-pg-path-checks.json)。没有本机重跑五项根门禁，局部检查不代 Required／原验收成功。中文按固定 zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c` 及适用 references 手检，未全局安装工具。

唯一控制容器 `c16ddb510a49e23aa0a6de8959d619d70b3e4e7d240d44546e094adb6a73217e` 按 owner、完整 ID、4 CPU／4 GiB、无宿主挂载／设备／端口核验；无活动 QEMU／Node／PG／Redis 后停止移除。PID1 最终 137、无 OOM，与三次原生 Node 退出 0 及旧 139 分开。六个只导出、不启动的角色容器和六个新诊断镜像标签均已收尾，四个已知共享镜像引用 ID 保持。

两次 ARM VM 和三次原生过程属于新增组件开销，不宣称合计预算不变。到期 guest 内部 PG 最后状态未知，不称优雅关机。仅归档安全回执、serial、工具及摘要，不归档测试密钥、私有服务日志或磁盘。重复的新候选 ZIP／导出 tar 经路径、SHA 及无消费者核准后定向移除；保必要单一公开角色输入。旧树、旧候选、共享 store、未知匿名卷和受拒目录保持，无 prune／reset／clean，不宣称物理净释放。

## 历史失败与交付边界

[e276 中的上一版完整报告](https://github.com/xurunxin/WorkMesh/blob/e2763da4dfdf25f7fc5c28c34a9619d4788f4541/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保留全部旧诊断。CI566@541 及 Required116933988732 失败：AMD 个人／企业通过，团队 initialize2,766 ms 重置及 MCP 容器 139；ARM 个人 get_work_item30,609 ms 失败，API 窗口资格 21,622.81 ms／工作项 10,019.08 ms。团队／企业 ARM 达原 9,000 秒，action22 upgrade 未完成、receipts 为空。晚 200 不补客户端成功，不合并这些首败。

旧普通 CI562 及显式 CI563 均失败；显式 run38831565958@9c8 仍为旧来源。CI564 取消缺件、CI565 三 AMD 通过／三 ARM 失败均按准确来源保留。PR227 只为恢复来源，不合旧 PR。Saved plan 字段未同步的 23:41 记录例外继续，批准不倒填。

本轮无 schema、迁移、REST／MCP 合同、事件、安装行为或配置示例变化；同步[安装状态](../../integration/server-installation.md)和[验收矩阵](acceptance-matrix.md)，其他接入命令不需改写。PG／Redis／S3、外置 Runner、纯后端和 WORM／保留／恢复保证不变。Redis-free／filesystem 仍待裁定，ADR0071／0072 仍 Proposed。

正式 guest 4 vCPU／4 GiB／150 分钟、job 210 分钟，业务 30 秒、首次 Client 90 秒、健康 180 秒、安装 1,800 秒及原 oneshot 保持。历史不同发行程序升级、裸 Compose 迁入、Runner／连接器联合验收及原 DoD 无新增完成依据。全部原真实验收、仅 P0/P1 正式产品审和最新 Required 齐备前不得合入，不报 Done 或对外发布。
