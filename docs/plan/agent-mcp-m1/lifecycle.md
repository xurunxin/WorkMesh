# 精确 E Runner 生命周期、Stop与失响应

以下流程拟新增在 `execution-lifecycle.ts`，由 `run-session.ts` 调用；当前源码仍未实现。复用 `ensureExecuting/runPi/executeTurn`、RunnerApi、`createWorkMeshTools/makeTool` 与ADR0068，保持一个api对象一个准确Session，不让模型选择其他Session或获取安装/Runner Service Token。

## 正常执行

受控安装刷新/交换 → queued能力握手 → 稳定ACK → 读取Session revision → 普通合法planning/executing转换 → context/current Plan/版本/Approval/Recovery → 整Plan发布 → 取得自己的Lease → heartbeat/renew → 精确hash批准请求/等待Human或现行策略 → 受保护动作/证据 → 普通release → 模型completionIntent → answer、Turn settle与Session completion同事务。

ensureExecuting当前直接ACK→executing的工作台行为保留；新状态工具仅允许普通执行态目标planning/executing/awaiting_input/awaiting_approval/blocked，前提是现行状态图允许，不代替Human信号。发布Plan与state工具都不写前置Activity，也不补成功Activity改变紧接操作revision；领域事件作为事实。所有普通工具还检查生命周期closed flag，不能只在起初读取一次eligible。

## Stop 的确定时序

1. 保留受控api自身的E Token/expiry、installation confirmation槽和准确attempt身份。普通预到期刷新只在未关闭的执行生命周期进行；protected 401/403拒绝不刷新。新增 `requestWithCurrentSessionToken` 供生命周期直接发送当前E Bearer，绝不调用#refresh。Token不暴露给模型。
2. 从既有attempt status、诊断heartbeat或原请求的SESSION_STOPPED识别停止可能性。任何网络失败、shutdown、timeout或撤权先关闭普通tool admission及steering队列并abort模型，但不自动把所有失败叫Stop。使用原E诊断heartbeat核准确Session和当前state/revision；只有stopping才执行stopAck。paused、撤权、完成、失败、canceled或无法确定均不提交stopAck。
3. 设置closed后禁止新模型prompt/tool；清空未送steering，取消timer、等待已在途模型prompt/工具/轮询settle或记录未知。迟到poll/steering成功和失败均检查同一代际/closed flag，不得重新prompt或解除停止。对abort调用使用有界等待；等待超时不声称模型已退出，不确认cleanup完成，将未知在途作为residualRisks。
4. 待模型静止并dispose后finally恢复本attempt环境、停止己有定时器、清理己有scratch/监听/进程。范围先按本轮资源账本核实际绝对路径、link和活动引用。记录已清项、失败项和未知在途；不得为了写摘要再调用普通appendActivity/makeTool；不得使用已abort的模型signal，独立cleanup AbortController统一30秒预算、单请求最多10秒。
5. 原E诊断heartbeat获取准确stopping revision，服务器仍live校验身份/grant/delegation。生成经过stopAcknowledgementInputSchema和assertSafeText/assertSanitized校验的cleanupSummary/residualRisks；不包含Token、Prompt、完整路径秘密或隐藏思维。以exact session/attempt/stopAck身份固定key/body/If-Match提交stopAck。
6. Stop服务器已释放Lease。finally不走普通release、不运行模型工具、不修改工作项状态；成功专用stopAck使stopping→canceled并插入唯一kind=stop_ack Activity、event/outbox。状态未stopping、Human immediate cancel、撤权或Token已过期拒绝，保留未确认清理报告供Human，不签新Token。

## 丢响应、revision和重启

| 观察 | 确定处理 | 禁止推断 |
| --- | --- | --- |
| stopAck HTTP响应收到 | 按响应保存原revision/summary，结束生命周期 | 不追加终态普通Activity |
| stopAck已发送但超时/断网 | 用准确安装身份GET原session/action/key；confirmed才判原动作成功 | unavailable/404/超时不等于从未提交 |
| 原key重放先被canceled门禁拒绝 | 保留原拒绝及correlationId，用只读确认恢复 | 不放宽terminal、不换Token重放 |
| 初次明确REVISION_CONFLICT且没有任何未决发送 | 原请求确定未提交；再诊断读取stopping revision，使用对应新逻辑key和If-Match尝试一次 | 不把旧传输丢响混成明确409；改If-Match不复用旧hash/key |
| 已有未决发送后的任何冲突/缺回执 | 只读确认或交Human，退出有界恢复 | 不换key盲重做 |
| complete直接HTTP/MCP提交失响应 | 原key终态拒绝后安装/Human确认 | 不从completed当前状态猜该key |
| Pi原子settle失响应 | 原外层稳定key/body按ADR0068既有settle回执重放 | 不捏造内部completion key独立receipt |
| Pi completion明确被拒 | 原事务回滚，保原Turn-only fallback和可见warning；Stop后warning可能拒绝需记录 | 不以Turn保存冒Session完成 |
| API/MCP/Runner重启 | 从持久Session/Lease/Approval/cursor和准确结果引用重读；模型新Attempt仍由既有fence/admission决定 | 进程exit0不证明完成；不恢复旧模型执行 |

finally是进程内有界清理，不承诺SIGKILL/主机掉电时执行。内存completion/cleanup材料崩溃前未提交的情况明确缺口，使用既有stale attempt recovery/合法Human处理，不新增持久重试队列或普通终态写权限。只有读取到stopAck原事实才称已确认；服务器处于canceled但来源可能Human cancel不能冒stopAck。

并发Stop和complete由既有Session/authority锁与提交次序裁定：Stop先提交则普通complete/写拒；complete先提交则结果保持completed、不得追加stopAck。API/Worker/Runner恢复及撤权先提交的拒绝均需真实测试；外发checkpoint竞争由M3承接，本批未测。
