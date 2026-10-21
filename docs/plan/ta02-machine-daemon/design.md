# 机器、实例与持久容量设计

## 基线与增量

本页全部新增模型、字段、错误码和操作均为 Proposed。它们没有进入实际 API、MCP、Schema 或配置。依据是[来源表](sources.md)中的不可变主线和实际路径。

| 目标 | main 中已有能力 | 尚缺能力与本卡增量 |
| --- | --- | --- |
| 身份与授权 | Agent Actor、Team grant、Delegation、Session、Connection 及凭据撤销／轮换 | 持久 Machine、每次启动的 Runner instance，以及管理员确认的实例与 Agent 安装绑定 |
| 能力报告 | ADR0042 的服务端能力投影、配置 readiness、连接器实时身份核对 | 主机 OS/arch、daemon/CLI/协议版本、运行时安装／登录／模型观测及有效期 |
| 容量 | `agentExecutionCapacityStates`、锁 Agent 后的 `assertAgentExecutionCapacityAfterLock` | 跨 Agent 的机器物理 slot、固定机器约束、持久排队与领取 fencing |
| 执行归属 | `workbench_runner_attempts`、current Attempt、start/settle 和精确 Session 来源 | 把准确 Attempt 绑定到机器实例、slot 及单调代次，不重建第二套 Session |
| 离线与恢复 | Session heartbeat、stale、lease、Stop、等待续 Turn、outbox | 空闲机器在线事实、乱序报告拒绝、旧实例隔离及重启核账 |
| 本地生命周期 | 连接器 OS 文件锁、私有路径、系统秘密、日志脱敏 | daemon 长持单实例锁、前后台互斥、drain、停止和有界崩溃重启 |
| 安装与升级 | #20 Linux SEA、可信来源摘要、原子 current、回退、保配置与秘密 | 升级 drain 协调、运行版本证明、健康提交与实例重建；发行签名是待裁定新增项 |

上述组件有既有验收来源，但“机器＋daemon＋slot”组合从未验收。`apps/api/src/configuration-readiness.ts` 对 Runner 返回 `unknown/not_observable`，不能用活跃 Session heartbeat 填成空闲机器在线。

## 身份和授权

### 对象关系

| 对象 | 建议责任 | 不能推导的事实 |
| --- | --- | --- |
| Machine | Team 下稳定资源 ID、管理员策略、容量及固定目标 | 主机名、MAC、硬件指纹或在线状态均不能作为凭据 |
| Runner instance | Machine 一次 daemon 启动的独有 ID、服务端递增 epoch、租期和运行版本 | 旧 PID、相同 boot ID、恢复了本地文件均不能恢复服务器所有权 |
| Agent definition | 既有非 Human Actor、批准能力与全局并发上限 | 不等于进程，也不独占一台机器 |
| Agent installation／Connection | 既有精确 Agent／principal／Team、凭据状态及安全连接生命周期 | 一个安装凭据不能代表该机器上的其他 Agent |
| Session／Turn／Attempt | 原业务授权和执行事实；一次 Attempt 绑定一个有效 slot | 机器所有权、服务令牌和 slot 均不能代替 Session 写权限 |

建议首期一台 Machine 只归一个 Team。同一机器可承载多个明确绑定的 Agent 安装，一个 Agent 可以在多台机器运行。调度前同时核机器策略、实例有效性、安装绑定和原领域授权；各 Agent 子进程只收到自己的秘密引用所取凭据。

管理员创建机器及安装绑定时，必须确认 Team 和允许的 Agent 集合。禁止 daemon 自报硬件后自动注册为可信资源，禁止复制连接配置来认领另一机器。克隆或丢失本地身份时停止并请求管理员重新确认，不静默生成替代身份。

机器认证有两个具体选项，见 [D1](proposed-decisions.md)。建议复用现有 Connection 完成精确引导证明，再引入独立、仅限机器控制面的实例凭据。该凭据是未来新安全范围，须单独批准；本轮不生成。不能把现有共享 `WORKMESH_RUNNER_SERVICE_TOKEN` 当作唯一机器身份。

机器报告与领取只用受限机器身份。执行写入继续用准确 Session Bearer，Coordination 继续用 `X-WorkMesh-Installation-Token`；原 token exchange/refresh 的 Installation Bearer 规则保持。机器被禁用不会隐式撤销所有 Agent Connection；撤销 Connection 也不能靠机器 heartbeat 恢复。

### 管理和查询范围

建议机器管理沿 Workspace Admin／既有 Team 管理资格检查，并对每次请求核实时 membership。Agent 只可读当前 Team 中明确允许观察的机器安全投影。Agent 默认不能改容量、启用机器、执行升级或发起 shell。

列表、详情、事件、错误和幂等回执都核当前读取资格。跨 Team 返回不泄露机器名、安装 ID、队列、版本或持有者。MCP 只是既有 application/domain 命令的适配层；发现可调用性按实际 route-policy 派生，不能在 MCP 内另设权限。

## 观测与状态

### 报告格式和真相源

机器报告建议包含 `machineId`、`instanceId`、`epoch`、单调 `reportSequence`、报告摘要和版本化 schema。服务端给出 `receivedAt`、`observedAt`、`expiresAt` 及 `asOf`；客户端时间仅作为可选诊断，不参与服务端租期判断。

报告以白名单包含 OS、arch、CLI/daemon build/source、Agent Protocol、runtime ID/version 和探测结果。登录用 `available/unavailable/unknown`，模型清单带来源、观测时间和有限有效期。探测超时、无权读取和版本不支持均保留 `unknown` 及安全原因码，不能把未知写成 false 或成功。

模型列表与登录观测只说明本机探测结果。模型运行的功能需要报告能力、服务端实现、feature、Agent 批准能力、Team grant、Delegation 和 Session 当前条件同时满足。模型在列表内不承诺账号额度或请求可达。

不采集账号邮箱、凭据、原始 CLI 输出、环境变量、完整用户目录或模型私有配置。命令来自固定适配器白名单，有总时限、输出上限、取消和脱敏；默认仅本地探测。真实外部登录、网络模型探测及付费请求需具体批准，首期不引入任意命令探测入口。外部运行时适配由 TA04 承担。

### 独立状态轴

| 状态轴 | 取值建议 | 谁能改变 |
| --- | --- | --- |
| 管理策略 | `enabled/disabled` | 授权管理员，须 revision 和幂等 key |
| 接收策略 | `accepting/draining/stopped` | 管理命令及准确本机停止／升级流程 |
| 连接新鲜度 | `online/offline/unknown` | 服务端对当前实例报告和截止时间的投影 |
| 能力／兼容 | 每项 `available/unavailable/unknown` | 当前实例的有界观测与服务器版本校验 |
| 物理容量 | 上限、有效占用、空闲／未知、队列原因 | PostgreSQL 的 slot 和 admission 事实 |

从未有效报告、模式不识别或无法证实当前实例时为 `unknown`。当前报告未过期可为 `online`，过期为 `offline`。在线不代表允许新任务；`disabled`、`draining`、版本不兼容或关键能力未知均禁止新 admission。

管理员禁用和 runtime 禁用独立持久化。再次探测成功、重新登录、进程重启、升级回退和更高版本报告都不能覆盖。禁用阻止新任务；是否中止运行任务由显式 Stop／撤销决定，不通过改在线字段偷偷实现。

心跳间隔、失效阈值、保留期和 drain 截止尚未裁定。未来应给配置范围及上限，核部署负载后批准。Todos 的 10 分钟和 24 小时规则是参考产品行为，不是 WorkMesh 保证。

## 持久 admission 和 slot

### 两层容量

Agent 层沿 ADR0046：仅 execution Session 计数，全部非终态占用，包括 `queued`、等待、`paused`、`stopping` 和 `stale`；只有 `completed/failed/canceled` 释放。Coordination 不计数。机器层建议计准备或实际运行的物理执行资源，两者分别展示，不能使用 `min()` 或一个总计数混成相同语义。

机器排队发生在原 Agent admission 之后，不额外制造未计数 Session。现有入口在 Agent 满容量时保持其拒绝、延期或重试行为。机器 queue 等待不绕过 Agent 上限，也不把不存在的可用实例分配给任务。

等待批准是否释放物理 slot 见 [D2](proposed-decisions.md)。推荐仅在已公开结算等待、全部在途已核清且原物理执行退出后释放。续 Turn 必须重新取得机器 slot 和新 Attempt。不能仅看到 Session 等待状态便释放实际仍运行的进程。

### 数据和事务建议

未来新增关系表承担机器、实例、安装绑定、观测、admission 与 slot。Machine 和实例使用带 workspace/Team 的复合引用。slot 使用机器内固定 ordinal，活跃占用对 `(machineId, ordinal)` 唯一；同一 Session/Turn 的有效 admission 与准确 Attempt 绑定唯一。减少容量时不删除占用，先停止新领取，待安全排空后生效。

队列保存 Session/Turn、固定机器约束、runtime 要求、入队序号、状态、稳定 dispatch ID 和 revision。slot 保存当前实例 epoch、租期、单调 dispatch generation 及准确执行标识。观测字段可用有界 JSON；授权关系、状态、索引和占用不能塞入不可查询 JSON。

建议复用原锁序中的 authority→资源→Conversation/Turn/Attempt，再统一追加 machine→instance→slot→admission，并在同类机器中按 ID 排序。任何回收、禁用、领取和完成流程均不得反向持锁。仅管理机器的事务可只锁机器；需要联动业务事实时先释放并重进标准事务，重验快照。实施前须核现有 `lockAgentAuthorityPlan`、execution-origin、wait 和锁序清单，冻结唯一可执行顺序并用真实 PG 并发验证，不能以本页文字代已证无死锁。

领取事务重核实时授权、固定目标、策略 revision、报告 freshness、版本、Agent 容量规则和空 slot；再写占用、admission、原 Attempt 绑定、domain event 与 outbox。未知或过期报告失败关闭。事务不得发网络、运行客户端或探测系统秘密。

commit 后才投递。outbox 至少一次，daemon 按 dispatch ID＋instance epoch＋generation 持久去重。提交后丢响应、双 worker、投递重放和 daemon 重启都只对应一个执行事实。daemon 在本地先记录接收，再向服务端确认准确领取；成功确认和实时权限检查之前不启动子进程。服务端不通过“已投递”宣称进程启动或工作完成。

### 固定机器与公平性

固定机器不可用时不自动迁移。建议选择持久排队，返回 `machine_offline`、`disabled`、`draining`、`capacity_full`、`incompatible` 或 `capability_unknown` 等安全原因，以及 `asOf` 和准确目标。等待上限及显式失败选项见 [D3](proposed-decisions.md)。改目标必须有授权命令、revision 和新意图，保留旧派发事实。

自动选择仅在当前 Team 和批准池内筛选，不可跨 Team 借容量。建议首期在可满足条件的候选中按入队序号、ID 确定顺序，不允许新到任务跳过更早且当时可运行的任务。不可运行的固定目标不阻塞其他机器；若需租户权重或优先级，应另裁定，不能声称全局无饥饿。条件持续满足、slot 最终释放的夹具应证明有界进展。

## 乱序、离线和重启

当前实例报告只有 epoch 相同且 sequence 增大才更新投影。同一 sequence/body 重放幂等返回当前安全投影；同序异体冲突；更旧序号不延长租期，也不回退能力和版本。服务端以接收时间和数据库当前时间判过期。客户端墙钟快慢、暂停后补发和本地时间回拨不能复活旧实例。

同机双 daemon 先由 OS 长持锁串行，再由服务端当前实例唯一性收敛。新实例取得更高 epoch 后，旧实例不能 heartbeat、续 slot、start 或 settle。Attempt 原 fence 继续校验，机器 epoch/dispatch generation 增加一层归属校验，不能取代原 fence 或 Session Stop 检查。

离线不是进程已停。推荐将 slot 标成隔离中的未知占用，停止向同一物理资源重派。TTL 过期先切断旧写权限；重联由当前实例核对本地执行清单和服务端准确 Attempt，再关闭或交管理员处理。无法确认旧进程停止时，不能仅回收租期便承诺实际运行数不超额。若要用到期即复用容量，必须选择 [D4](proposed-decisions.md) 的更弱物理保证并单独裁定。

新 daemon 默认不接续旧模型进程。重启后先取当前策略、凭据状态、实例代次和本地 journal；明确处理未发送、已提交未确认、正在运行和外部结果未知。只有准确已结算等待可走原 continuation。stale/终态不被 heartbeat 复活，未核清副作用不得自动重跑或标为成功。

服务器或 worker 重启后按数据库 current instance、slot、admission 和 outbox 恢复，不能靠 Redis 重建授权。重建投影不改历史事实；Stop／撤权优先于迟到 start/settle。机器移除保留审计和执行引用，吊销机器控制面凭据；不删除业务工件、Connection 或系统秘密。

## 守护进程和安全升级

### 本地生命周期

建议独立用户级 daemon，复用连接器的私有路径和 OS 锁实现，不将不可信代码放入 API/worker。长持实例锁与短期连接器提交锁分开，冻结锁顺序；PID 文件仅诊断，停止时核 PID、创建身份及持有者证明，防 PID 重用误杀。

foreground 与 background 共用一个实例锁。已有前台进程时，后台 start/restart 明确拒绝，不代管 systemd、容器或其他 supervisor。start 不自动注册、不提权；后台启动响应只报告确认过的实例状态，不把 spawn 成功当 online。

stop 先持久停止接收，再 drain。正常完成、显式 Stop、退出中和未知在途分别记录；有界退出到期后，只处理准确本任务子进程树并保留未知结果，不能写成功。Linux 信号和 Windows 进程控制分别验证；Windows 后台不出现多余控制台，ConPTY 前台能力保持独立。

崩溃监督采用有界退避和失败预算，超限停机并展示安全原因；不循环配对、换 key 或静默修权限。日志在写盘前按连接器既有跨块、ANSI 和原始字节规则脱敏，并限制条目、轮转和总大小。不记录秘密、完整环境、原始探测输出或模型思维链。诊断只存机器状态、版本、时间和安全错误码。

### 升级流程

升级建议由明确管理员意图触发；daemon 不接受任意 URL、命令、shell 或自动 latest。流程为：记录升级意图和目标来源→关闭 admission→确认所有占用已安全排空→停止准确旧实例→离线验证候选→复用 #20 私有暂存和原子 current→启动新实例→核运行版本、协议和本地健康→提交成功后按原管理员策略恢复接收。

drain 超时默认停止升级并保留旧版；不能强杀任务再冒称无损升级。已在途外部效果未知时阻断成功提交，按原精确请求身份核账。版本健康只证明程序与协议可启动，不证明所有业务完成。服务端禁用或本地原本 stopped 时，新版健康后仍保持禁止接收。

#20 当前验证清单、归档、助手和可信来源摘要，并验证独立 Skill 的 Ed25519 签名。它没有通用发行签名基础设施。D5 明确两种选项；不得将 Skill 公钥挪作任意程序签名根，或把随包 SHA256SUMS 当发布者证明。

回退只允许可信账本内、与当前数据／协议兼容的旧版。先持久撤回候选并使候选健康证明失效，再启动旧实例；旧实例获得新 epoch，不能复活旧 fence。安装回退不回滚 PostgreSQL、不撤销业务事实、不延长 pending 重放窗口，也不恢复已撤销凭据。

若旧版不支持新增本地 journal 或服务端协议，则保持 stopped，展示明确兼容错误，不尝试降级改写。卸载沿 #20 保留配置和系统秘密；远端撤销与清秘密另行授权。升级不会授予 shell、远程终端、自动 sudo、系统服务安装或生产访问。
