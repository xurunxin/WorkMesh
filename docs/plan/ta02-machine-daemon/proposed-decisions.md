# 待裁定决策与合同差异

## 状态与依据

Status：Proposed。本页是方案中的决策草案，不是 Accepted ADR，不授权实施、设备权限、新凭据或发布。建议以实际裁定拆成编号 ADR；编号在实施基线重新确认后分配。本轮不修改 `docs/adr/`。

Context：现行主线已有业务授权、Agent 并发和精确 Runner Attempt。缺少机器控制面、物理容量及长驻实例。下列建议依据原 TA02 目标、ADR0003/0008/0013/0035/0042/0043/0046/0068/0079、现有等待续 Turn 和 #20 交付，具体路径见[来源表](sources.md)。所有推荐均为本次设计判断，尚未由用户选定。

## D1 机器认证与资源归属

Decision 待选：

| 选项 | 具体行为 | 代价和边界 |
| --- | --- | --- |
| A，建议 | 一机一 Team；管理员固定 Agent 安装绑定；既有 Connection 仅做引导证明；另发仅限机器控制面的实例凭据 | 新增凭据签发、系统秘密引用、轮换／撤销和审计责任，必须另批；不授业务写权限 |
| B | 首期每个 Machine 仅绑定一个既有 Agent 安装；报告和领取使用准确安装身份，不新增机器秘密 | Machine 生命周期依赖该 Agent Connection；多 Agent 共机需显式后续扩展，不能冒称原多 Agent 目标已全验收 |

不采用共享 Runner service token 作为全部机器唯一认证。当前 `/workbench/runner/*` 同时有服务令牌及安装／Session 校验；新增机器边界不能降低这些校验。跨 Team 池、硬件指纹认证和系统级服务账号均另立范围，不默认启用。

Alternatives：自动认领主机名、以在线代凭据、一个 Agent 令牌授权全机均违反身份和作用域边界。

Consequences：A 支持机器和 Agent 独立撤销，但新增安全面；B 增量较小，须分期标明未交付的多 Agent 责任。

Migration：机器关系从新注册开始，无可信旧证据不回填。旧 Connection 和 Session 不改变身份，不把历史 heartbeat 变成机器在线。若选 A，新增秘密只能落既有系统后端，不落普通配置或日志。

Spec changes：未来先修订协议、OpenAPI、Zod、route-policy 与资源作用域，再实现 domain/db、REST/SDK/MCP/CLI 的同一身份投影。需要相应 Proposed ADR 获准；本页没有改实际合同。

## D2 等待与物理 slot

现行 ADR0046 已明确：所有非终态 execution Session 都占 Agent 容量。以下选项只讨论机器物理 slot。

| 选项 | 具体行为 | 与现行保证关系 |
| --- | --- | --- |
| A，建议 | 公开结算等待、在途已核清、进程退出后释放物理 slot；续 Turn 重新排队、重新领取和新 Attempt | 保持 Agent 容量与原 wait authority/trigger/fence；等待续接可能因机器满载延后 |
| B | 等待期间保留物理预留，但不保留旧模型进程或续旧 lease | 保持现行等待结算和 Agent 计数；物理利用率较低，明确区分预留和运行 |

将等待／paused／stale Session 从 Agent 计数移除，属于修改 ADR0046 的第三种扩大方案，本卡不推荐，也不能由选 A 隐含通过。只有正式修订该不变量并覆盖全部 admission 入口后才可讨论。

迁移不推测旧等待的机器归属。新增 slot 仅绑定已证实例和执行事实。恢复路径沿 `workbench_execution_waits`；不能让旧 Runner 未 opt-in 时领取 continuation。

## D3 固定机器、公平性和超时

| 选项 | 固定目标不可用时 | 适用影响 |
| --- | --- | --- |
| A，建议 | 持久排队并展示原因；设置另批的有限等待上限，过期显式失败 | 适合暂时离线；占 Agent 容量，不能承诺无限队列 |
| B | admission 时立即明确失败，不建立机器等待 | 调用方显式重新提交；不能用新 key 偷重试未知结果 |

两者均禁止静默迁到另一台。自动机器模式可重新选择合格机器，但已运行且副作用未知的 Attempt 不能自动重派。定时 occurrence 的跳过、失败和补跑由 TA14 决策，本卡只提供事实，不能复制 Todos 的自动跳周期策略。

首期建议可运行任务按入队序号和 ID 排序；固定目标阻塞不扩散到无关机器。需裁定队列上限、排队截止、各 Agent 权重和管理员优先级是否进入首期。未裁定前，不承诺跨 Team 全局公平、SLA 或无条件无饥饿。

## D4 离线回收与恢复

| 选项 | 离线占用 | 可承诺范围 |
| --- | --- | --- |
| A，建议 | 先 fence 写权限，slot 隔离；准确实例证明进程停止或管理员核账后才复用 | 保守保持物理容量；网络分区会降低可用性 |
| B | 租期到期便回收逻辑 slot；客户端本地到期自停 | 只能保证服务端 admission 数，断联或挂起的旧进程仍可能占物理资源；需明确减弱保证并批准 |

不把 OS 单实例锁或客户端自停当作分布式绝对执行证明。对外不可逆副作用沿现行提交后执行、幂等和结果核账；未知不自动重发。D4 不更改 Session stale 状态机，也不允许 heartbeat 复活终态。

重启默认创建新实例代次，不接续旧模型进程。可恢复的仅是有持久准确来源和触发的已结算等待，以及可证明未启动的派发。离线阈值、心跳周期、隔离最长时间和人工恢复动作需要结合真实设备条件裁定。

## D5 升级信任与回退

| 选项 | 工件来源 | 具体责任 |
| --- | --- | --- |
| A，建议首期复用 | 受审仓库工件与固定可信摘要；延续 #20 的归档、助手、路径、版本和账本校验 | 明确不是通用发行签名。网络任意下载、自更新和新签名体系不启用 |
| B | 独立发布信任根签名版本清单，绑定平台、归档、助手、程序、源码和最低协议版本 | 新密钥托管、轮换／撤销、防回滚策略、离线验证和发行权限都需另批；不得复用 Skill 密钥 |

原规格的“签名／校验衔接 #20”必须据实落实。A 复用当前可信来源和校验；若用户要求发行签名作为首期硬保证，则必须选 B 并完成真实验收，不能用 A 关闭签名责任。

两种方案均先 drain，再校验和切换，失败保留旧程序与配置。健康提交之前持久保留回退意图；撤回候选后才启动兼容旧版。新版本带不可逆本地或服务端迁移时，不承诺二进制回退等于数据回退。

## D6 平台与环境

| 选项 | 首期 daemon 产品目标 | 保留责任 |
| --- | --- | --- |
| A，建议 | Linux amd64、Windows x64；用户级运行；精确 OS 版本和 supervisor 模式另定 | Windows 后台无多余控制台、两种 OS 停止／升级都真实验收；#20 原平台回归保持 |
| B | Linux amd64 先交付；Windows x64 列为后续明确里程碑 | 原 Windows DoD 未完成，TA02 不能宣称整卡完成；需要用户明确批准分期 |

Linux 现有连接器产品验收为 Ubuntu 24.04 LTS，Windows 连接器安全回归不能证明 daemon 后台模式。macOS daemon 尚无批准目标，#20 的 macOS 安全回归保持。Linux arm64 既有发行能力不删除，本轮和拟首期新增 daemon 验收不新增 ARM 执行。

可用设备、原生／VM 方式、系统用户、Secret Service/Windows Credential Manager 可用性、镜像、独有数据库和资源预算均未获本卡批准。本轮不探测或借用 #33 的服务。选平台不等于授权设备注册、新秘密、付费模型、生产连接或对外发布。

## 共同合同草案

以下名称仅帮助冻结未来实现清单，均为“待创建”，不能照着请求。最终 operationId、路由、scope、feature 和协议版本须在实施批准前确认。

| 合同组 | 建议操作／数据 | 安全和兼容要求 |
| --- | --- | --- |
| 管理与读取 | `ListMachines`、`GetMachine`、`CreateMachine`、`UpdateMachinePolicy`、`DisableMachine` | Human 管理；列表／详情同一安全投影；mutation 带 Idempotency-Key，revisioned 资源带 If-Match |
| 实例控制面 | `OpenRunnerInstance`、`ReportRunnerInstance`、`CloseRunnerInstance` | D1 的准确机器身份、epoch/sequence、有限报告；不接受任意 Agent 或 Team 选择 |
| 容量与领取 | `RequestMachineAdmission`、`ClaimMachineDispatch`、`AcknowledgeMachineDispatch`、`ReleaseMachineSlot` | 全路径检查原 Session authority；唯一 dispatch、slot 和 Attempt；旧实例与旧 fence 拒绝 |
| 升级 | `RequestMachineDrain`、`RequestMachineUpgrade`、`GetMachineUpgradeStatus` | Human 意图、准确受审工件、兼容矩阵；没有 shell 或任意路径命令 |
| 查询适配 | SDK 和 MCP `list_machines/get_machine` 候选，CLI `status` 候选 | MCP 默认只读；管理写工具是否暴露另批。返回 `asOf`、安全原因、实际运行和安装版本 |
| 事件 | `machine.registered`、`machine.policy_changed`、`machine.instance_opened`、`machine.availability_changed`、`machine.dispatch_claimed`、`machine.slot_released`、`machine.upgrade_requested`、`machine.upgrade_completed`、`machine.upgrade_failed` 候选 | 过去式、独立事件版本、授权 audience、状态＋event＋outbox 同事务；无秘密或原始报告 |

稳态 heartbeat 建议按 ADR0035 更新有界投影及固定幂等窗口，不逐次写活动／event／outbox；状态变化只发一次。机器 heartbeat 属新增对象，须在获准 ADR 中明确适用范围、保留策略和事件语义，不偷偷扩大现行例外。

未来编号迁移须从真实最新 main 分配，更新 `SCHEMA.sql`、Drizzle、migration manifest 和恢复清单。现有 `0017` 不是可覆盖模板；不提前占用 `0018`。新增功能默认关闭，既有 Runner 路径不自动改绑机器；开启后全部新机器执行走相同 gate，不能用 legacy 分支绕过。

错误继续采用 `error.code/message/details/correlationId`。建议新增安全原因用于容量满、机器未知／禁用、版本不兼容、实例过期和 drain 阻塞；最终 code 必须在合同阶段冻结，并核 SDK/MCP/CLI 的实际消费和恢复提示，不能只改服务端字段。
