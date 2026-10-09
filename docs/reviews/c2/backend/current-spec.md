> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 启动方案，后端独立交付（推荐）
> 收窄本轮验收范围（推荐）

## 当前范围与授权
用户2026-10-09 12:00正式将本卡本轮验收收窄至企业微信低敏出站后端；后端新候选独审/适用检查/最新PR RequiredCI及actualmain齐后可合入并完成本卡，UI成果/失败/未验收完整保全并延后至重设计，不表示旧视觉通过。此完整规格取代此前登录/焦点新增UI、视觉接受及整原UI闭环作为本轮DoD的条款；历史方案/旧正文保留历史含义，不继续阻止已缩范围的后端收尾。

继续原todo、主力gpt-6.1-sol/high与原构建分支tds/conv-01a11b85-41f9-74f5-b456-7083d4d83e5e，不run_builds换上下文或克隆原工作。另一Agent必要独审，blocking/high闭、必需checks、最新CI通过后Chief沿本批18:38委托合入；新增功能/权限/外发布仍另批，记录沿Todos＋仓库。

## 来源与当前分离依据
已合#53/PR209/mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d的docs/plan/backend-agent-mcp-priority/branch-separation.md完整#16节及batches/sources/coverage/review是已审分离方案。开工读真正refs/heads/main准确SHA并immutable差异，不把FETCH_HEAD当main，不带未合其他任务分支绕门禁。

原完整规格由Chief本message原样交付保全；早期权威快照在docs/plan/activation-task-specs/16.md和docs/reviews/r1/execution-inputs.json/test-coverage/index，原实施方案在docs/plan/c2-wecom/{implementation-plan.md,product-design.md,test-coverage.json}（原178ac8cb…计划源以受控source表核完整SHA）。当前原成果5c870d9fe3c30736b8ce87292e1d0bf35838ae83、产品61736fa…，本head自身merge增量含quota丢桶sentinel修复与集成测试，不能只看log --no-merges而漏掉，也不能把旧复审通过冒新候选已过。先完整保全旧head/文件/原频控与配额失败/traceZIP/复审/视觉材料；保持Git历史可达，不force-push丢成果。

## 本轮后端产品切片（沿已审方案按功能hunk）
1. wecom-notifications.ts与单测：单一群机器人Webhook低敏Markdown提醒、canonical HTTPS目标链接，端点/DNS/TLS/重定向/响应字节/timeout严边界，准确失败与unknown。实际Redis TIME、额度与串行token分离、epoch、完成/安全终止后至少60秒保留；未知/崩溃按发送截止上界D+60保守保留。5c870d新增sentinel必须在冷却返回前恢复，重复丢桶重试不延长冷却、正常恢复边界及双目标共额保留。
2. automation.ts/index.ts：注册adapter/admission、独有Redis连接、逐条candidate/claim、许可截止和锁等待后复查、先commit发送checkpoint再I/O、unknown不盲重试、fenced ACK、连接关闭。feature保持默认关闭，configured不是实时ready，Redis故障不能假发送成功。
3. channel-notifications.ts：复用C1原intent/attempt/fence及授权线性化锁，新增candidate/defer/准确claim/checkpoint前remainingMs检查/安全errorCode；保留workspace→既有authority/resource锁序和锁后重读、state/event/outbox事务，外发不可回滚事实如实记录。
4. agent-webhook.ts和tests共享传输：可选readBody/bounded response/abort错误处理，同验既有Agent webhook只status消费者，不因企业微信语义破坏旧HTTP64KiB/timeout契约。
5. notification-channels.ts/server.ts只投影configured provider；Human target管理/授权/secret refs/对账复用C1，不重复CRUD/队列，不新增Agent代管权。
6. wecom-notifications.integration.test.ts及notification-channels集成：独有真实Redis跨窗口、锁等待/多Worker、quota丢桶重复尝试/两目标边界、旧token不释新许可、TTL/未知截止；撤权/停用/离队/Stop/发送checkpoint/fence/unknown/C1恢复，零渠道决策写/零决策outbox。不能mock Lua替代真实Redis。
7. Worker package.json/锁文件、env样例/三个compose中的WEB_ORIGIN与notification flag：按准确main重生所需锁增量，默认false保留；与A2 Lite build proxy如实际已合并按hunk组合，不覆盖未合他人包配置。无新增migration/route/event type；必要新领域事实或协议分歧先具体说明再裁定。

企业微信官方协议完整出处、读取日期、真实端点/载荷上限/频控/错误/部署前提继续消费已封存来源；如实际资料变化须核明新旧，不把R1早期访问缺口冒已核实。单一协议已有审定，本轮不新增钉钉/飞书/SMTP/小程序/双向命令/入站回调/身份桥接/账户绑定/决策按钮。提供方消息身份不代WorkMesh登录Human授权。

## 原测试与UI延后去向
原六条仍逐项记录：
- 出站协议/载荷上限/错误映射/频控/timeout/恢复：保留本轮完整后端验收。
- canonical深链：保留生成URL合同及main现有页面消费者识别/当前Human重新鉴权兼容检查；新登录returnTo、返回/焦点UI行为延后，不计通过。
- 目标撤权/停用/离队零外发：保留后端；转发URL仍仅当前Human权内读取，以现有main拒绝边界验证，不依赖未来UI提升权限。
- 渠道零决策事实/事件/outbox：保留，提醒不是审批或用户完成决策。
- 渠道故障非正确性关键路径、C1管理复用/无重复CRUD：保留后端及当前main已有数据/接口可读正对照；新增网页视觉呈现延后。
- 仅出站所以入站签名/绑定/回调时窗明确不适用；不伪造不存在系统的通过。

延后UI精确集合来自branch-separation.md：apps/web/app/login/page.tsx、use-authenticated-actor、canonical-route、attention-center及wecom/attention-center Playwright新增部分。登录安全returnTo、401缓存隔离、授权后详情、焦点/BackForward/转发拒绝相关原实现和原失败保全，后续设计消费其安全行为合同；不以整head合入替后端分离，也不删原代码或假旧视觉已接受。当前main登录后定位若丢失须明确报告消费者限制、标UI待办，不称完整通知用户闭环；后端candidate仍需证明生成URL可被main识别、无越权，不擅修复新UI范围。

## 当前DoD及实施顺序
原requires#2/#18/#3/#15均已落地冻结；C3现有目录/A1身份拒/C1授权锁和unknown/逐条claim保持，无#21/TA视觉前置。完整验收：单一低敏出站链、C1复用/真实Redis安全频控/fence与撤权、准确失败/unknown、默认关闭配置、现行webhook共享消费者和URL兼容、不引入渠道决策、协议出处及配置文档可审。原UI验收正式延后，不把后端完成冒整个旧体验已验。

先提交新当前spec、精确hunk/保全索引和原六测试及九类适用性去向，同步16.md/index/矩阵/ADR0076当前范围；已审分离路线内普通候选拆分可按授权实施，回review交另一Agent定向核源代码拆分/精确quota源/共享传输/URL兼容/实际检查。须新受测源码前后指纹、实际命令退出/runtime/skip/首败、Git blob/ZIPCRC及运行字节映射、服务准备恢复清理实证。适用必需本机检查/latestPR RequiredCI通过，actualdone/gitmain后才最终收尾，不将原5c复审/旧产品checks借给拆分新组合。

所有发送测试仅fake provider/独有Redis与模拟服务；不得真实向企业微信或他人发消息。密钥只用现有安全引用，不请求聊天粘贴；真实发送/凭据新授权/仓库外发布仍单独裁定。长成果完整中文受控文件，回复只摘要/精确head/路径/未齐门禁。

## 用户收尾清理
登记己有容器/专用镜像/卷网络/临时服务进程和精确路径，先脱敏保全证据/未提交恢复成果再仅清本任务闲置资源，不globalprune/共享缓存/他人服务。Windows递归先核绝对workspace目标、链接、活动引用/逐path保全来源；保存原操作退出/真实结果/保留原因，未知不伪补。不force；自动审批拒立即停目标，不拆分/换工具/属性ACL/移动/父删绕，G1D0C3拒目标继续保护。worktree actualmain/成果齐/无引用才可清，当前及恢复目录保护。
