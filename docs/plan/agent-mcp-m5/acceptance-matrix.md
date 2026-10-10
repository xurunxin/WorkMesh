# 冻结九类逐行运行计划

每行消费 [冻结原文](frozen-m5.md) 的原要求。O为实际OpenCode，P为真实Pi子进程，R为SDK/MCP协议对照；H为Human准备，DB注入与provider夹具单列。当前所有行状态都是未运行，不能因来源静态核验勾选。

| 原验收类／案例 | 实际运行输入与故障边界 | 判定与必存证据 | 消费者／适用理由 |
| --- | --- | --- | --- |
| 正常 F1 | O-N／P-N／O-G／P-G新Connection完整链；N4交接后B承接本人新Plan、批准/等待、证据和完成；独立N-parent父active requiredchild链 | B新Session终态与A sourceDelegation=completed、原A实际state分别可Human读取；N-parent子前父拒、子后父完成；四链模型实收/领域event/outbox关联，无Git无repo未满足 | O/P/R分层，主链任一步失败整链failed；A/B按run来源/承接角色，不把handoff父失权当requiredchild父可完成 |
| 越权／撤权 F2 | 两Human/Team/Agent正对照后跨域读写；live撤权与rotation overlap/confirm；Handoff旧A E四REST拒例；两个不同Session各自E写对方Plan | 拒绝的实际code/HTTP/correlationId及零相应业务事实；不以身份拒绝冒revision冲突。Pi准入后独立membership撤销，真实拒绝后恢复同membership才让模型实收；Handoff completedDel绝不恢复 | O/P模型实收与R旧A四拒例、来源进程取消分别计；不借第三principal或Human cookie，不用源Pi取消冒它已收到完整model error |
| 非法状态 F3 | queued ordinary read、paused/failed/canceled/stopping／terminal普通写；feature disabled、错误profile、provider不支持；H retry | 与当前合同同结构错误，受保护401/403不refresh重发；get info与当前允许核心入口恢复，禁域不假tool支持；retry新Session，旧facts不覆盖 | O/P/R；feature mismatch具体入口对应operation-matrix，Human retry单列；没有真实provider只证明fake／adapter限制 |
| 幂等 F4 | 未来修复后三项白名单Pi单toolCall，代理在commit后毁首响应，Runner原HTTP最多两次；同key/body/revision/E；API重启保持原Runner/Attempt/DB/port预算。O另跑MCP实际重启原key重连；两次丢响应、重发前Stop/revoke、首次完整拒绝、第二次拒绝、newintent新key | 业务receipt/effect、state/event/outbox只一组；started/最终Activity各一次、GET无新Activity；模型实收第二原回执。第二失败保首次cause/unreconciled，不自动complete；记录真实两个请求、proxy首commit与各PID/退出/runtime/恢复，零第三发、不refresh | 当前未实现/未运行；Pi真正第二HTTP不能由proxy或R或新toolCall代发。普通工具、outersettle、terminal只读确认各自统计，unknown/provider intent不进白名单 |
| 旧revision F5 | 独立B/S executor owner，O静态MCP E与P E分别由B同installation合法取得；Pi claim/credential/start完成后唯一Attempt running，两模型读同Session revision/Plan；O先/P先两轮屏障；共享Document双方正写 | 真正stale If-Match得revision冲突，Plan不覆盖且stableID保留；失败方新intent合并。原service/fence只用于Pi控制，普通Plan无新跨客户端fence。新Attempt只在原durable settle后；伴随Activity来源单列 | O/P真实实收，跨Session拒绝归F2。Issue双C仅R、Pi E角色拒绝；reviewer/Handoff来源不作共同Plan writer；原E和principal不输出 |
| 事务失败 F6 | Handoff原failureInjection:afterSession；专用DB Plan/Room/settle event/outbox点raise；completion真实4xx；settle commit失响应 | sourceDel completed变更同回滚恢复active，child/delegation/Lease/delivery无残留；其余业务/receipt/event/outbox回滚。明确4xx仅Turn公开warning、不complete Session；settle原恢复独立，普通重放不因完整5xx重发 | O/P/R和DB注入分别计；只读GET无写事务rollback义务，业务零写/现行audit另计；故障注入清理真实回执 |
| 重放 F7 | 同webhook deliveryId/HMAC原bytes重复投递、outbox重复claim/tick、Inbox claim/ack与Room reply重放；断cursor、CURSOR_EXPIRED后resync；新Worker同pendingwait | scope/audience不扩大；领域receipt、message、event、消费统计不重复；cursor恢复全部授权facts且不重复effect；双Worker唯一续Turn、旧Attempt无继续writer | O/P消费真实事件和Inbox，R跑transport协议；timestamp replay窗口与签名校验、旧新cursor别名分列；不使用内存计数替代DB |
| 并发 F8 | 两Connection并发同Issue claim；同Actor不同Session并发body/identity；OpenCode与Pi读／写；requiredreview启动重放与父完成；Stop/revoke与Worker许可两种提交顺序 | 恰一admission，target E／Token／bridge不串；reviewer证据不混producer；锁观察pg_locks/pg_blocking_pids与真实提交顺序。Stop先commit零HTTP；许可先commit记录当前在途，后续写再拒 | O/P/R；并发probe需真实事务屏障，有可读正对照，delay只能辅助等待不能证明锁顺序；Attempt旧fence零写 |
| 重启／恢复／Stop F9 | API/MCP/Worker/Runner各真实PID退出重启；F4 Pi API重启位于首次commit和再准入之间且仍同Attempt/toolCall/预算；O MCP重启仍原key；Runner重启新Attempt只读原facts；cursor/Lease/unknown/checkpoint/Stop | 同DB/port持久事实、原请求指纹及PID/ready实证；超预算失败真实记录。原E StopACK/finally，不refresh；unknown零新provider写只Human对账；checkpoint本地finish。新Attempt不自动重发旧intent，H retry新Session | Pi直连API不能借MCP重启冒受测；旧fence控制拒例与普通E授权分列；protocol app重建不代实际PID重启；owner清理/residualrisk/G1D0C3边界保留 |

## 子用例最小集合与不适用

每种失败至少一允许正对照和一拒绝反例；F2／F4／F5／F6／F8／F9均同时有外部OpenCode模型实收、Pi模型实收和协议对照，不能把只在R发生的错误记到O。O不具WorkMesh Turn/Attempt，Pi的settle／continuation专属断言对O不适用；O需验证direct complete原action确认及重新启动run后当前状态。返回签名资料的raw MCP上传／下载不向O模型调用，单列传输限制；P受控传输＋R客户端私有传输对照不冒O支持。

本批未纳入生产灾备、retention upgrade、所有OS原生安装、无源码发行、真实厂商账号、企业内网Git或受限出网实机；各自原门禁保持，非本批成功项。适用全仓checks的环境skip真实报告，不能把这些不适用理由变成全仓必需checks的豁免。
