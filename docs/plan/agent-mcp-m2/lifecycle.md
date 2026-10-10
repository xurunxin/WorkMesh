# 普通 child 与 reviewer 的真实调用方案

## 父 Session 与受控子启动

Human 通过现有授权 REST 预备两名目标 Agent／Team grant／真实 installation delivery；其cookie仅在Human夹具，绝不注入Agent／模型。父E按M1 ACK→planning→publishPlan，读取准确current planVersionId、stable step和revision。父/step max_child_sessions为DB默认8，现有创建/Plan DTO无该配置字段，低边界仅特权DB测试夹具；exclusive Lease在review前释放或明确验证冲突。父通过自身MCP/Pi创建工具，不能传其他parent ID。

createChild返回的queued child／createReview的session＋review_shared Lease只是已创建。两响应由新child schema保全五个创建绑定字段、budget/inherited_budget数字record及原额外字段，MCP/SDK/Pi实收同值。有限父100先普通child显式60；child完成后仍预留60，再createReviewDelegation budget:{maxInputTokens:40}。review省略参数仍全额100并拒，不能自动取余额；其他维度仍按原继承，按需全部明确缩减。实际启动必须观察准确目标provisionNewSessionDelivery→commit outbox→fake webhook/adapter→目标自身exchange→ACK→executing，installation/principal/Team匹配。MCP逐请求显式准确自身Token，父不获子Token。

Pi 子执行采用已存在 workbench fixture 的 Human 建立 authorized Conversation／Turn、真实 claim→credential→start→运行子 Runner；公开 child创建本身不会自动创建 Pi Turn，不能把此夹具步骤或新 F admission假装成既有自动功能。模型只得到 Session允许工具，credential保 adapter内存。原 M1等待／121秒案例沿完整回归，不将父等待长占 Attempt。

## 普通 child

普通 executor/researcher child仅 work:read/work:write，读取自身 Session/context/Issue／Inbox允许材料，按合法执行态工作；不能自动 publishPlan／Artifact。无 Artifact 权限时 complete用真实 summary、checks 和明确 noArtifactReason；不声称 Artifact已发表，也不要求 review_result。通用 role=reviewer不自动获得专用review的artifact或Lease，作为兼容限制／拒例报告。

## 专用 reviewer

reviewer握手／ACK后进入合法executing，不发布实施Plan。本人读取Session/context确认有效budget40而非父100；DB budget/inherited_budget及reservation allocation/reserved亦40，不在SDK/MCP/Runner重填parent预算。本人解析Room（自身／准确WorkItem），本人post_work_room_message(intent=review_result,sessionId=reviewer.id)，本人publish_artifact(type=code_review,sessionId=reviewer.id)。模型实收工具及原结果，作者/Session由API重验；读最新revision再M1 completion intent／atomic settle完成。受控假模型实际usage报告保存，不把未测计费/hard cap能力当已验。

只 structured review、不发消息；只消息；只Artifact；父／其他 child代发；只有noArtifactReason，分别断言 REVIEW_COMPLETION_EVIDENCE_REQUIRED或前置身份拒绝。M3 PR/head provenance与structured review能力不在M2新增工具范围；本批通过已有 REST负例验证其不替代双证据，不宣称PR交付全链已验。不得自审PR producer。

## 父完成与状态投影

父本人从 listAgentSessionChildren分页／childSessionId过滤确认 child准确绑定和 state=completed。父当前 Plan已换版本时仍能看到原 child，以免漏 required。再读父最新 revision→complete；不能以公开模型回答／子终态失败替代完成。

required 子的 queued、acknowledged、planning、executing、awaiting_input、awaiting_approval、blocked、paused、stopping、stale、failed、canceled逐状态全部阻父，COMPLETION_PLAN_INCOMPLETE.details.blockerSessionIds集合准确；completed才解除，非required不因该gate阻父。不得修改required、换step/agent/key绕 gate。父旧 revision与子完成竞态按事务提交顺序验证，不静默重写Plan。

## 丢响应、Stop 与恢复

直接 complete/stopAck丢响应沿M1准确来源的C／安装确认；父子投影只证明当前子状态，不证明任意原operationKey成功。Pi内部completion没有独立receipt，只可重放原settle key/body。父terminal／撤权不可再读投影；子terminal不会恢复自己的普通Bearer权限。

API／MCP／Worker重启后重新登录／连接，用持久页 cursor／事实确认不盲重发创建。重复outbox只能同一个子／交付授权。Stop／撤权在提交前获得锁则零新子／证据；提交后外部在途仅按原受控机制报告。父Stop不添加隐式子级联，子重新检查自身当前授权；子finally用原E独立stopAck，保cleanupSummary／residualRisks，沿M1闭门。
