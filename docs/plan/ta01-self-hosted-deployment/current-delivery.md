# TA01 当前交付与诊断报告

## 最新关口：源码核对后尚无安全修复依据

本轮输入 head `2312282fce857a1b7b90a9c30ef6c1c92d6fdb2f`，重新读取 PR228 仍 draft、未合入；CI567@e276 为 completed／failure。三 AMD 通过，企业 ARM 在升级后 commit16 的30秒读取失败，个人／团队 ARM 总期限缺最终回执。旧 API139、MCP139 独立未闭。当前资料 head 没有成功 Required，不送正式审、不合入、不发布。

已核六份相关源码从541至231无差异。`initialize` 不走资格读取；普通 `get_work_item` 先实时资格再业务 API。最慢来源快照 SQL、资格 handler 尾段分别有成本，但未证明是原 CI 根因；SQL 文本宽不能证明全部分支都执行，两次严格校验也不证明其中一次可删。没有省略快照、缓存资格、修改运行时／镜像／资源／期限或实施猜测性产品修复。

[定向修复关口](repair-decision-gate.md)列出四项可证伪解释、具体证据缺口、候选修复的等价与并发验收，以及待裁定的一次企业 ARM 原路径取证方案。该方案尚未执行；本轮零新 VM、零业务请求、零容器创建，无 dispatch／rerun／cancel。1,800秒一次例外已经用完，不续跑第五轮。真正待裁定点是是否批准这一次新的原组合取证；不批准则保持关口，不改变产品范围或保证。

本轮适用检查已实际通过：锁定宿主 Node22.19.0／pnpm9.15.4 下 `pnpm check:integration-docs`（4份技能、100链接、35 REST、11 MCP，静态范围）及 `pnpm ci:validate`（24测试、280证据入口／61归档成员，errors为空）。`git diff --check` 通过，六文件 blob 与541以来无差异核对完成。autocorrect仍未找到，按固定技能及references手检，不安装全局工具。没有本机重跑 lint／typecheck／test／integration／conformance 五根门禁；本轮纯资料检查不替代它们或正式验收，旧Required仍失败。没有新增或修改schema、迁移、API、MCP合同及事件语义，接入示例无需改写。

以下各节保留2312282的测量交付记录，其中“本轮”指该次已完成测量。新轮只有源码／原件核对及关口文档，新增判断仅来源执行者；准确资料交付 head 见 PR ref，不能冒充受测产品 head。

## 当前结论与单次批准

基础交付仍未完成，PR228 保持 draft，未进入正式 P0/P1 产品审或合入。本轮起始 head 为 `9bf8d3a2dd12d5a8eb06001413d42b74d5131d4a`，交付 head 以 PR 真实 ref 为准。新增事实仅来源执行者；产品候选、资料提交与微测工具分开绑定。

用户于 **2026-10-16 21:48** 对 Chief 具体方案回答“单次延长诊断窗（推荐）”。本轮已执行这一次 ARM 组件例外：VM 总窗最多 **1,800 s**，较原限制增加 600 s；固定 guest／Node／QEMU、4 vCPU／4 GiB和设备配置保持。Node600 s、产品请求30 s，以及正式安装／整体验收全部原期限不变。批准已同步[执行计划](implementation-plan.md)，Saved plan记录例外继续，不增平台同步前置。

**本组件样本完成单对目标 GET。** VM 实际 1,392.55 s，QEMU／Node／PG／Redis 均退出0，无宿主TERM、VM或Node截止。保存28条进度回执、156条连续Node事件及1份最终报告。目标GET恰为2次；此前8个供应请求包含3个GET和5个POST，另行计数。没有重试目标业务、缓存资格或替换授权，没有第五轮。

这只证明本样本，不证明个人Lite同镜像、完整矩阵或原根因修复。API139、MCP139及原ARM迟响应分别未闭。普通CI567现已终态failure／Required失败；本资料head没有成功Required。没有据微测实施产品修复或进入正式成果审。

## 原命令、输入与执行边界

[测量索引](../../reviews/ta01-product/resumption-api-auth-pg-arm-1800-once.json)和[原件](../../reviews/ta01-product/resumption-api-auth-pg-arm-1800-once.zip)保留实际工具、公开输入摘要、统一关联、SQL／PG统计、全部安全阶段、串口与资源账本。

执行者原命令为 `python .tmp/ta01-resumption/api-auth-pg-arm-1800/start.py`。其在独有控制容器执行 `python3 /opt/arm-once-1800/run-component-tcg.py --api-auth-pg-role --arm64`，QEMU wait严格为1,800秒，到期即TERM并保已有阶段；外层1,850秒仅覆盖退出与证据取回。guest执行 `/usr/local/bin/node /tmp/measurement.mjs /app --single-pair`，Node600秒和每个目标GET30秒保持，响应wall超30秒仍失败。原件是执行命令与源码快照，不是用户安装示例。

沿用CI566@`541f6ba64841915801a1ccb123f9adb7f61ebe17` 独立API／PG／Redis ARM角色。原候选artifact12032934001，manifest `391bd59c041d4a7d87a15573d2f03ff07edfddcf6b1233b6f092b75639fd29b4`。原ZIP／21分块／OCI闭包来源保留；本次重新核三份gzip及全部解码tar摘要，控制容器预展开12.89秒。没有重新下载巨量候选。

Node22.19.0，SHA `da2abd2c48f19561e35478d51583b068ab410f888a09f363bd131ab611392cb7`；API server.js为72,215 bytes／`b511c3ce89dc404b00ece5642829290c1ff74ad54a97417974e5f986836e5ea4`。实际测量助手SHA `df8ee36d0900d90bd8ef61b93e69c04290cfcf0eb6060f772f2c4077ff0efb76`，旧三次版本不倒填。

QEMU包精确 `1:8.2.2+ds-0ubuntu1.18`，二进制SHA `b511b60cc31479b71dfdd589e6c981ae37b20ef0e75adc5a57bb0d6737e9b30c`。ARM guest SHA `1d6bffe64b848468ac97f821d369a4846d983de1800ccf6b5ec8853e85cefc55`，kernel6.8.0-142-generic、原固件／ROM摘要匹配。仍为TCG／4 vCPU／4 GiB，root盘及既有只读cidata盘、网络与固件设备参数保持。宿主x86_64，无原生ARM对照、宿主安装、新权限或公开端口。

代码来自现有只读seed盘，tmp／data／dev/shm绑定原guest私有磁盘目录，proc／null挂载沿前轮方式；它与生产ext4／容器tmpfs布局不等价。PG16.9／Redis7.4.5，PG20连接／64MB并额外开启观测，不等个人Lite32MB／track_activities off。独立API跳过entrypoint，导入时NODE_ENV=test仅禁止自动listen，构造app前恢复production。真实配对后通过原路由Fastify inject，走原实时身份／事务／授权／PG／Redis；未测网络MCP／TLS／代理／Worker／S3或完整竞争负载，不能称个人Lite同镜像复现。

测量助手补齐监测连接完成和请求连接取得／事务分界。guest用无缓冲管道增量分帧，校准连续与分段JSON在EOF前保存。该修正及管道校准只证明采集路径，不能倒推旧缺件原因为缓冲。

## 阶段与统一关联结果

| 准备阶段 | 累计时间或独立区间 |
| --- | --- |
| guest身份核验 | guest入口后0.015 s |
| 输入挂载、默认路由移除 | guest入口后9.549 s |
| 角色关键文件核验 | guest入口后24.025 s |
| 独有PG／Redis就绪 | guest入口后117.287 s |
| 产品模块导入 | Node内65.013 s区间 |
| 监测连接完成 | Node累计89.821 s；从连接前标记约1.415 s |
| 空库迁移完成 | Node累计277.364 s；连接完成后约187.543 s |
| Node子过程 | guest父进程测得323.576 s |

各值只在自己的单调钟内解释，不把guest uptime、Node起点与宿主elapsed相减。准备成本不用于解释原CI业务响应，也不从旧21.62秒扣减这些数字。

经原安装／配对／兑换形成真实隔离work:read身份。完整Node报告、连续事件序号0–155及两条request-started对应，确认目标恰为下列一对；未选行锁或额外撤销读取。全流只记录模板SHA、数值和摘要，不记录SQL参数、凭据或响应正文。

| 本次目标GET | 资格 | 工作项 |
| --- | --- | --- |
| correlation SHA前缀 | e2067038a43a | 4f1c08e331db |
| 实际状态／响应字节 | 200／308,929 | 200／838 |
| 请求wall | 12,183.81 ms | 3,034.26 ms |
| 身份COMMIT累计 | 7,453.73 ms | 957.27 ms |
| 授权完成累计 | 7,800.37 ms | 1,396.15 ms |
| SQL条数 | 45 | 17 |
| 连接取得最大wall | 24.95 ms | 4.97 ms |
| 最后handler SQL回调至onSend | 4,033.25 ms | 41.39 ms |
| 等待采样 | 27次 | 11次 |

累计阶段不是独立函数耗时。资格尾段含验证、资格生成、序列化和公共onSend，不能全写为manifest纯计算。资格请求process CPU为13.13秒、wall为12.18秒；前者含同进程观测与多核工作，可能大于wall，不能算CPU占比或归到单个函数。[Node22.19.0说明](https://nodejs.org/download/release/v22.19.0/docs/api/process.html#processcpuusagepreviousvalue)

两组采样均未见Lock，看到active及ClientRead；不能排除采样间隙等待，也不能把active／空等待当CPU耗尽证明。PG状态与等待列独立，统计本身有开销。[PG16说明](https://www.postgresql.org/docs/16/monitoring-stats.html)

资格身份阶段最慢客户端SQL为2,245.87 ms，模板SHA `410bd0b8398dc57e5e1db8e8f58892fceb0782fba85bd6aad8371797c15d66b3`，另一次同模板558.34 ms。源码归于 `packages/db/src/events.ts:appendEvent` 的事务内notification_sources快照。PG归一化模板SHA不同，未把整库最高规划值强配到单次客户端查询；客户端wall含编解码／调度，PG执行含等待，均不当纯CPU。原件另列11／12个精确单模板单调用匹配，统计与客户端值不混加。

该来源快照是现行实现的一部分，不能为提速跳过。ADR0076记述相关C1行为，但文件头仍Proposed，未写成Accepted；0071／0072也保持Proposed。下一步只能在保同事务事件／outbox及来源revision语义的前提下评估查询／计划或生成成本。

## 假设判断与剩余缺口

| 假设 | 本轮依据与判断 |
| --- | --- |
| 本样本主要耗于秒级连接取得排队 | 不支持；最大24.95／4.97 ms，不能据此排除原CI连接耗尽 |
| 本样本存在行锁等待主因 | 未观测到证据；27／11次采样未见Lock，不排除间隙等待；原生行锁阳性对照只校准方法 |
| 首资格实时身份初始化和handler尾段都有成本 | 本样本支持：45SQL／COMMIT7.45 s及尾段4.03 s；未独拆纯生成与序列化 |
| 查询、CPU、TCG或调度已解释原CI失败 | 未证明；角色／布局／观测／竞争负载不同，原CI无相同请求内部关联；API139／MCP139分别未闭 |

本轮没有准确产品修复依据，未改产品、运行时、CI、授权、资格缓存或任何正式期限。单次例外已使用，**不自动追加第五轮**。下一项最小动作是对已定位appendEvent模板及资格handler核调用／计划与纯计算边界，保事务快照和实时授权；原CI仍缺同一失败请求的内部关联与调度证据。不能靠省略SQL或新整轮试跑补根因。

## CI567准确终态

[普通CI567／run38893305755](https://github.com/xurunxin/WorkMesh/actions/runs/38893305755)绑定 `e2763da4dfdf25f7fc5c28c34a9619d4788f4541`，现为completed／failure，**Required CI job117011885049 failure**。没有dispatch／rerun／cancel。显式563／run38831565958仍为旧失败来源，无新显式运行。

| 画像 | AMD64 | ARM64 |
| --- | --- | --- |
| 个人 | job116950873995 success；2,147.47 s／重启135.46 s | job116950873965 failure；9,000.76 s、无最终回执，最后序号23 restore-empty开始（[原件](../../reviews/ta01-product/ci567-arm64-personal-first-failure.json)） |
| 团队 | job116950873839 success；2,483.54 s／重启159.34 s | job116950873874 failure；9,000.94 s、无最终回执，最后序号21 recover-old开始（[原件](../../reviews/ta01-product/ci567-arm64-team-first-failure.json)） |
| 企业 | job116950873944 success；1,791.37 s／重启115.45 s | job116950874189 failure；升级后正常commit序号16、tools/call在30,443 ms超时（[原件](../../reviews/ta01-product/ci567-arm64-enterprise-first-failure.json)） |

六组均按准确source绑定，三ARM各核11个server-install成员、22发行输入和六脚本，源码前后相同。ARM生产者artifact12043116531、manifest `12eb5978a939da8d643caf70bc14e8b13326cdec5f3cf82f0c3b2f0ec212fa1f`。三AMD的完整重启与四证明保留，仅证明这些准确组合；本轮没有新增完整支持通过。

企业ARM的API窗口资格16,639.13 ms／工作项8,430.75 ms均completed200，代理较晚37,130 ms完成但下游失败；两API投影不是统一端到端分解，不能相加／相减推MCP、CPU或SQL成本。客户端仍失败。pending至final273.88秒单独记录，后置PG4／100快照与空事件不推原等待或未崩溃。个人／团队无最终回执，不把最后动作名当内部阶段原因，也不补恢复或资源收尾成功。

本次继续采用资料`[skip ci]`，未改工作流且不取消已有运行。本资料head无成功Required，不作为可合入候选；准确产品修正后仍需新候选原验收与最新必需检查。

## 原件、检查与保护

前三次原1,200秒incomplete历史完整保留：[前两次](../../reviews/ta01-product/resumption-api-auth-pg-path-comparison.json)、[第三次预展开](../../reviews/ta01-product/resumption-api-auth-pg-arm-preexpanded.json)。三次目标实际请求数仍未知，QEMU0伴宿主TERM不算正常关机；本次完整报告不倒填它们。

本轮核验见[检查记录](../../reviews/ta01-product/resumption-api-auth-pg-arm-1800-checks.json)。只运行适用语法、归档、CI策略和接入文档检查，没有本机重跑五项根门禁，不以局部检查代真实验收／Required。中文按固定zh-tech-writing `ffda9353768dece8aabd26ccb3a4978025e9437c`及references手检，autocorrect缺失，不安装全局工具。

唯一新容器 `c9a2f5d336e057bbf12e0d42c906777325f38665683abc2277f22fed34686e46` 按owner／完整ID／4CPU4GiB／无宿主挂载、设备、公开端口核验，确认无相关活动进程后停止移除并核不存在。控制PID1最终137、无OOM，与guest Node／PG／Redis及QEMU0分开。四共享镜像引用保持；没有新角色容器或诊断标签。重复公开展开树、seed及私有磁盘随独有容器收尾，保原单份公开gzip缓存，不归档密钥、私有服务日志或磁盘。旧树、旧候选、未知卷、受拒目录及其他项目保持，无prune／reset／clean，不宣称物理净释放。

[9bf8完整前轮报告](https://github.com/xurunxin/WorkMesh/blob/9bf8d3a2dd12d5a8eb06001413d42b74d5131d4a/docs/plan/ta01-self-hosted-deployment/current-delivery.md)保全部早期来源。旧CI566@541、562／563失败、564取消缺件和565三AMD通过／三ARM失败不改写，晚200不补成功。PR227仅为恢复来源，Saved plan记录例外继续。

本轮无schema／迁移／REST／MCP合同／事件／安装行为变化，接入命令和配置示例无需改写，只同步状态。PG／Redis／S3、外置Runner、纯后端及既有WORM／保留／恢复保证保持，Redis-free／filesystem仍待裁定。正式guest4CPU4GiB／150分钟、job210分钟、业务30秒、首次Client90秒、健康180秒、安装1,800秒和原oneshot保持。全部原真实验收、仅P0/P1正式产品审及最新Required齐前不得合入，不报Done或对外发布。
