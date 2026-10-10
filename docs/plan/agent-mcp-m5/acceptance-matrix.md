# 冻结九类逐行运行计划

每行消费 [冻结原文](frozen-m5.md) 的原要求。O为实际OpenCode，P为真实Pi子进程，R为SDK/MCP协议对照；H为Human准备，DB注入与provider夹具单列。当前所有行状态都是未运行，不能因来源静态核验勾选。

| 原验收类／案例 | 实际运行输入与故障边界 | 判定与必存证据 | 消费者／适用理由 |
| --- | --- | --- | --- |
| 正常 F1 | O-N／P-N／O-G／P-G各自新Connection、Plan、协作、批准、结果；两Human／两Agent完整交接；无Git与fakeGit同源码后端 | 模型实际拿到全部关键ID/revision/result；H读相同资源；Plan/Room/Artifact/reviewer/approval/action/Session与event/outbox完整关联；无Git不出现仓库未满足；主链任一失败整链failed | O/P/R；真实OS/客户端/部署记录，不将R认证厂商；对应N1–N7、G1–G7 |
| 越权／撤权 F2 | H1/H2、Team1/Team2、AgentA/B可读正对照后跨域读／写；先list再撤grant/delegation/principal membership；轮换overlap旧新fingerprint，再rotate-confirm与Connection revoke | 同resource正例和拒例、精确HTTP状态/code/correlationId、DB无新增业务事实；原key重放也重验；H1原principal不变。Pi准入后撤membership，拒绝响应后恢复以取得真实模型错误；恢复后的合法请求不能被前例伪吞 | O/P/R，H管理动作仅H；静态E不提供C轮换工具。两Token各自原Connection，不混身份；correlationId不要猜 |
| 非法状态 F3 | queued ordinary read、paused/failed/canceled/stopping／terminal普通写；feature disabled、错误profile、provider不支持；H retry | 与当前合同同结构错误，受保护401/403不refresh重发；get info与当前允许核心入口恢复，禁域不假tool支持；retry新Session，旧facts不覆盖 | O/P/R；feature mismatch具体入口对应operation-matrix，Human retry单列；没有真实provider只证明fake／adapter限制 |
| 幂等 F4 | 请求已commit、代理销毁响应；原key/body本机先持久，再MCP/API重启重连；重复Plan/Room/intent；同key异体与新logical intent | 原receipt effectId相同且DB state/event/outbox仅一组；变体冲突，新intent新key产生独立事实；key/body持久文件无秘密。完成原动作来源确认不能借另一Connection；Pi同toolCall HTTP retry使用原派生key，重启新Attempt读原facts不盲重发，outersettle沿原key恢复 | O/P/R；原回执独立手工重放只算R，不冒P可指定任意key；上游原HTTP结果、代理销毁时刻、DBcommit、实际模型实收与恢复均证 |
| 旧revision F5 | O与P获同Plan／Document基revision并发写；先提交一者后另一旧If-Match，再读最新明确合并新intent。Issue由两个合法C在协议对照竞争，P固定E同写先拒角色 | 合法Plan／Document写得到REVISION_CONFLICT及可得currentRevision，两模型实际收到；旧请求零覆盖，合并保存两方内容／history。Issue的P角色拒绝与C旧revision冲突分列，不能以授权错误冒revision冲突或授Pi C角色 | O/P/R；原“两个客户端Issue修改”在现行E/C分工不具双方正写前提，P正写不适用但拒绝实跑；两C revision证明仅归R。Plan绑定stable step，reviewer不能用作writer |
| 事务失败 F6 | Handoff原`failureInjection:afterSession`；独有测试DB临时trigger在Plan/Room/settle的event/outbox落库点raise；completion缺证据真实4xx；settle commit后失响应 | Handoff无child/delegation/leasetransfer/delivery残留；原业务state/event/outbox/receipt全回滚。ADR0068模型回答/Turn/Attempt/completion同回滚；4xx仅Turn settle公开warning、Session仍执行；失响应只原key恢复，不套4xxfallback | O/P/R，Pi atomic settle专门实证；只读GET无新写command回滚义务，需业务零写断言。DB故障只在guarded test库，注入清理回执 |
| 重放 F7 | 同webhook deliveryId/HMAC原bytes重复投递、outbox重复claim/tick、Inbox claim/ack与Room reply重放；断cursor、CURSOR_EXPIRED后resync；新Worker同pendingwait | scope/audience不扩大；领域receipt、message、event、消费统计不重复；cursor恢复全部授权facts且不重复effect；双Worker唯一续Turn、旧Attempt无继续writer | O/P消费真实事件和Inbox，R跑transport协议；timestamp replay窗口与签名校验、旧新cursor别名分列；不使用内存计数替代DB |
| 并发 F8 | 两Connection并发同Issue claim；同Actor不同Session并发body/identity；OpenCode与Pi读／写；requiredreview启动重放与父完成；Stop/revoke与Worker许可两种提交顺序 | 恰一admission，target E／Token／bridge不串；reviewer证据不混producer；锁观察pg_locks/pg_blocking_pids与真实提交顺序。Stop先commit零HTTP；许可先commit记录当前在途，后续写再拒 | O/P/R；并发probe需真实事务屏障，有可读正对照，delay只能辅助等待不能证明锁顺序；Attempt旧fence零写 |
| 重启／恢复／Stop F9 | API/MCP/Worker/Runner进程逐个退出并用同DB/端口/配置重启；保存原cursor/key/revision；Lease丢失/实际DB过期；provider写成功后无checkpoint响应丢失；checkpoint有/无两支；Stop准确原E/finally | 各服务PID/退出/重启ready、DB durable事实一致；旧Lease写拒；unknown零新provider调用只H对账，合法checkpoint本地完成；原E Stop_ACK含cleanup/residualRisks、禁止Stop后refresh；H retry新Session；残留不谎称清净 | O/P真实进程与R隔离协议；Pi模型停止＋attempt/fence/wait证明，API app重建只作辅助，不替实际子进程重启；清理遵resources owner |

## 子用例最小集合与不适用

每种失败至少一允许正对照和一拒绝反例；F2／F4／F5／F6／F8／F9均同时有外部OpenCode模型实收、Pi模型实收和协议对照，不能把只在R发生的错误记到O。O不具WorkMesh Turn/Attempt，Pi的settle／continuation专属断言对O不适用；O需验证direct complete原action确认及重新启动run后当前状态。返回签名资料的raw MCP上传／下载不向O模型调用，单列传输限制；P受控传输＋R客户端私有传输对照不冒O支持。

本批未纳入生产灾备、retention upgrade、所有OS原生安装、无源码发行、真实厂商账号、企业内网Git或受限出网实机；各自原门禁保持，非本批成功项。适用全仓checks的环境skip真实报告，不能把这些不适用理由变成全仓必需checks的豁免。
