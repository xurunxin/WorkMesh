# 企业微信出站提醒与登录深链实现方案

## 范围与现有链路

本文件是后续产品实现的具体方案，本轮只归档。没有安装依赖、迁移、API 或事件修改。实际源码输入是 main 5b9c76b5f79917697906520edcd6947bfbfa925f；逐文件工作树与 Git blob 字节见 source-metadata.json。

目标仅企业微信消息推送 Webhook 的低敏提醒。C1 已有本人 target CRUD、pgcrypto 秘密存储、指纹、幂等和 If-Match；管理入口是 apps/web/app/settings/notification-channel-settings.tsx，路由是 apps/api/src/notification-channels.ts。管理员不代管，不将群成员当领域收件人。

packages/db/src/channel-notifications.ts 的 admitChannelEvent 复用已提交 source event 的内部来源快照，唯一 intent/target 逻辑 delivery 与逐事件 checkpoint。createOutboxWorker.deliver 负责已提交事件的扇出，查询不会产生投递。旧事件没有通知来源时不补发。

createAutomationWorker.claimNotifications / deliverNotification 逐条领取，缺 adapter 不 claim，单条失去 claim 不妨碍其他通知及 Loop。prepareChannelSend 先取 workspace FOR KEY SHARE，再按 lockAgentAuthorityPlan 全局顺序获取完整授权锁，重读来源、Team、Human、membership、Approval 授权、目标及偏好，持锁直到发送 checkpoint 提交。租期以 clock_timestamp() 复核。C2 不添加第二套权限策略，不以 Attention 查询可见性扩张受众。

收件人为 Inbox 精确 Human recipient、其他来源既有 responsible Human、Project 明确 lead；无人指派不外发。禁用、撤销、改配置及撤权先提交时抑制；checkpoint 已提交后的撤权不能召回已经准许的在途请求。

## 协议、错误与部署条件

选择普通 markdown，协议为 POST https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=KEY。请求 JSON 仅有 msgtype 和 markdown.content；使用固定中文提醒“WorkMesh 有待处理事项”“请登录 WorkMesh 查看并处理。”及一个网页链接。不加入标题、正文、姓名、人员标识、群 @、决策选项、原 provider key、effectKey 或 sourceRevision。深链的来源 ID 仅用于网页定位，不授予权限。

官方 91770.body.txt 的“markdown类型”确认 content 为 UTF-8、最多 4096 字节，“消息发送频率限制”确认每个消息推送最多 20 条/分钟。按 Buffer.byteLength(content, 'utf8') 校验内容，不能把 JSON 包装字节或 UTF-16 字符数当官方限制。最终 JSON 一次编码，content-length 使用实际 JSON UTF-8 字节数；不截断 URL，超限在调用网络前判定明确未发送。选择普通 markdown，不使用具有客户端条件的 markdown_v2、template_card、媒体上传或入站回调。

校验 raw URL 与 canonical 格式一致：HTTPS、准确主机、默认端口、准确路径、一个非空 key；key 编码必须等于 encodeURIComponent 解码后值。拒绝重复参数、额外参数、用户凭据、fragment、其他端口、路径及主机别名。C1 保存仍没有探测；格式不符合 provider 的旧目标在发送时明确失败，不能走通用 webhook。如此同一个实际 key 的有效 URL 只有一个编码，C1 的 HMAC 指纹可合并重复 target 配置；不能用秘密作 Redis key。复用 resolveWebhookTarget 的公共地址检查，关闭 private allowlist，固定解析地址、TLS servername，拒绝重定向。

以下是映射规则，均为未来实现与 fake 测试目标：

| 实际响应或阶段 | ChannelSendResult | 恢复 |
| --- | --- | --- |
| HTTP 成功且有界 JSON 中 errcode 是整数 0 | delivered | 按 C1 fence ACK；不伪造提供方消息 ID |
| 明确 JSON 拒绝，含 45009 | failed | 逐目标退避；频控拒绝不立即重发 |
| 93000、93001、93004、93006、93008、93017、93019 及其他明确非零 errcode | failed | 保留安全机器码，沿用 C1 八次预算到 dead；不自动撤销 Human 配置 |
| URL、载荷、公共 DNS 校验失败，确认尚未启动请求 | failed | 零外发；正常预算及死信 |
| 请求启动后超时、断连、响应超限、JSON 畸形、缺 errcode、非整数 errcode、不确定 HTTP 失败 | unknown | C1 uncertain，不自动重送，交本人显式对账 |

官方 90313.body.txt 是错误码出处，不把通用 API 错误表理解为群推送保证返回每个代码。45009 表示接口调用限额；93000 表示无效/已移除，93001 为群禁止，93004 为停用，93006/93008 为群配置问题，93017/93019 为请求/机器人配置问题。只保留白名单机器码，不记录 errmsg、URL、key、网络异常原文或提供方原始响应。

网络与响应解析纳入现有 AbortSignal 五秒上限及 claim 剩余租期，最多读取 64 KiB 响应；abort 后停止读取和 socket，不仅 Promise.race 返回。提供方没有公开发送幂等/查询回执契约，不声称 external exactly-once；不把 WorkMesh effectKey header 当提供方去重能力。发送成功但 ACK 未提交的重启恢复沿用 uncertain；本人用当前 revision、幂等键决定 delivered/retry/dead。retry 复用原 delivery 和 effectKey，明确可能产生重复。

部署必须开启 WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS，具备 C1 要求的 Redis、数据库及可解密目标秘密的 WORKMESH_MASTER_KEY。秘密仅通过个人配置请求或团队 Secrets 注入，不索取聊天凭据。WEB_ORIGIN 必须是操作员确认的可访问 HTTPS 网页 origin，不含凭据、子路径、query 或 fragment；测试用本地 fake origin。Worker 需能公共 DNS 解析并通过 TLS 连接官方主机，收件人客户端需能访问网页并按既有方式登录；没有 OAuth、企业身份绑定或账号自动创建。

操作员须确认目标企业/群允许此消息推送、提供有效 key 并避免与其他发送器共用频控预算。官方正文证明可向群组推送及凭据取得入口，但未提供本部署的企业策略、群成员名单或浏览器 Cookie 验收结果；这些条件未实测，不假填已通过。只发通用低敏内容，群成员并不获得 WorkMesh 身份。保存配置没有发送测试按钮；真实外发及真实客户端兼容验收另需明确授权。

## 后续实际变更文件

| 文件 | 必须完成的变更 |
| --- | --- |
| apps/worker/src/wecom-notifications.ts（新） | 实现 createWecomNotificationAdapter、URL/载荷/响应边界及安全错误映射；外部网络可注入 fake transport |
| apps/worker/src/index.ts | feature 开启且 Redis profile 可用时注册 wecom adapter；关闭或未配置不 claim |
| apps/worker/src/automation.ts | 在 C1 claim/checkpoint 前接入频控准入，保持逐条领取；传 AbortSignal 并映射安全结果，保留 unknown 语义 |
| packages/db/src/channel-notifications.ts | 扩展既有 claim 的候选定位与 fence 校验，提供未 claim delivery 的延期操作；增加安全错误码透传，不新建表或队列 |
| apps/worker/src/agent-webhook.ts | 在固定 DNS transport 上提供受字节上限约束的正文读取；默认调用者仍可只取得 HTTP 状态 |
| apps/worker/src/wecom-notifications.test.ts（新）及 agent-webhook.test.ts | fake 协议/UTF-8 边界、错误/Abort、DNS、秘密及既有 transport 回归 |
| apps/worker/integration/stage4-automation.integration.test.ts | 在真实 C1 事务、outbox、fence、授权锁和恢复路径挂接 fake WeCom |
| apps/web/app/lib/canonical-route.ts、use-authenticated-actor.ts、apps/web/app/login/page.tsx | 安全 returnTo 共用函数、401 携带当前路径、登录后规范化安全返回并重新授权 |
| apps/web/app/lib/canonical-route.test.ts 及 apps/web/e2e/wecom-notifications.spec.ts（新） | 编码与同源校验，登录/转发/失权/焦点和网页故障回退 |
| apps/api/src/notification-channels.ts | 只同步既有 config 查询的 configured_providers 能力信息，不改 target CRUD、DTO 或保存无探测语义 |
| docs/production-deployment.md | 将上节的条件、配置、未发送/unknown 对账和不适用说明纳入正式部署文档 |

这些文件本轮均不修改。无新 target API、decision endpoint、领域事件或数据库 migration；沿用 notification.delivery.* 事实。配置能力查询当前返回空 configured_providers，不能把它冒称已注册 adapter 或已验证凭据；后续只需同步既有查询的 provider 能力信息，不改变 target CRUD 或传输 DTO。

频控采用当前部署的 Redis Lua 和 Redis TIME，每 endpoint HMAC 指纹最多占用 20 份额度，另持有串行发送 token。查询 due 候选的非秘密指纹后，原子预留额度和 token，再对该精确候选调用扩展的 claimChannelNotifications；额度不会在预留后第 60 秒自动出窗。无额度或 Redis 不可用时，延期原未 claim delivery 的 available_at，不改 attempt_count、retry_budget_start、claim_fence，不创建新任务。其他目标仍可推进，避免一个群堵住 tick。

额度至少保留至实际网络完成或安全终止后 60 秒，串行 token 与额度分别释放。许可颁发时以 Redis TIME 固定发送截止上界 D，D 不晚于预留后 60 秒；claim、授权锁等待、checkpoint、网络与响应读取均受该上界约束，实际网络预算仍取五秒、claim 剩余租期和 D 剩余时间中的最小值。checkpoint 前与提交后启动网络前均重新核验 token、D 和实际租期；等待超界就停止，不持过期许可外发，重新准入时重新鉴权。失去候选或确认未发送也须安全终止，不提前腾出额度。

Lua 将每份额度的最早回收时刻设为 D+60 秒；收到可信完成/安全终止回执时使用 max(D, 实际完成或安全终止时间)+60 秒，绝不使用预留时间+60 秒。崩溃、回执丢失或结果未知时按 D+60 秒保守保留；进程失去许可不得恢复旧调用，未知结果仍留 C1 uncertain 对账。网络 Abort 必须关闭 socket、停止读取，不能只结束等待 Promise。第 0 秒预留、第 4 秒发送的额度在第 60 秒仍占用，其他 Worker 此时不能取得第 21 份额度。

Worker 重启复用 Redis 中尚未到期的额度和截止记录；Redis 状态丢失时所有 Worker 停止准入，由同一 Redis 冷却标记协调至少 120 秒（最大剩余截止 60 秒加尾部 60 秒），期间拒绝旧 token，不能各自重置额度或以 60 秒冷却提前恢复。不在 checkpoint 后排队或静默 retry。Redis 仅约束出口频控，不成为授权或 delivery 状态的真相。锁等待跨窗口、进程崩溃、状态丢失与多 Worker 对应的未来用例见 test-coverage.json，全部未实施/未运行。

## 登录返回、授权与焦点

来源定位使用 C1 的 /?view=inbox&attentionSelected=v1:SOURCE_TYPE:SOURCE_ID 路由词汇；由 canonicalObjectHref 验证兼容性，不解析通知正文来制造关系。adapter 仅以 WEB_ORIGIN 生成绝对 HTTPS 深链，不能拿 target 地址作返回 origin。

returnTo 共用解析器接受单个 / 开头的相对路径或与 window.location.origin 完全一致的 HTTP(S) 绝对 URL，输出仅 pathname+search+hash。URLSearchParams 只执行一次查询解码；拒绝外域、//、反斜杠、控制字符、URL 凭据、畸形百分号/UTF-8 编码及 /login、/install 循环。检查原始值与解析后的路径，编码形式的危险路径也拒绝；不再次解码嵌套 returnTo，不信任 Referer，不将任意字符串交给 location.assign。无效/空值回 /，登录提交端重复校验。

useAuthenticatedActor 在 401 后清理认证及缓存，再将当前安全路径编码成 /login?returnTo=...；登录成功保存新 CSRF，只按规范化内部路径返回。返回后重新 GET auth/me、当前 Team 和 Attention 详情；每个 API 按新 Human 鉴权。授权尚未完成不展示旧缓存，不把 owner、提供方身份、群成员或被转发卡片当权限。转发者无权时沿用 NOT_FOUND/不可见状态，不泄露标题、正文、人员或存在性。

网页参数继续由既有导航管理；Back/Forward 恢复当前选中项，关闭详情恢复收件箱列表焦点，首次从登录重开则在授权数据完成后聚焦详情标题。401 后不恢复旧 Human 的焦点标识或业务缓存，无权状态聚焦提示。深链打开和登录自身不调用 decision/approval mutation，也不产生相应领域事件/outbox。正常网页显式决策仍由原 governed command 授权。

## 验证及停止条件

test-coverage.json 为六原测试、九类及 DoD 的实际测试文件/命名场景映射；未实现、未运行保持明确标识。只出站的签名、绑定/解绑和回调时窗不适用，job replay、并发、重启恢复仍适用。

后续按当前 package.json 顺序运行 pnpm lint、pnpm typecheck、pnpm test、pnpm test:integration、pnpm test:e2e，使用独有 test 数据库、Redis、对象存储及完整 CI 夹具，不真实发送。Playwright 经 pnpm exec 启动，先 --list 确认执行数量。保留首败、实际数量、跳过和退出码。产品源码方案独审、blocking/high 闭合并由 Chief 明确放行后才实施；本次文档计划审查没有替代产品独审或最终验收。

未来定向命令（本轮未运行）：

```text
pnpm --filter @workmesh/worker exec vitest run src/wecom-notifications.test.ts src/agent-webhook.test.ts
pnpm --filter @workmesh/worker exec vitest run --config ../../vitest.integration.config.ts integration/stage4-automation.integration.test.ts --maxWorkers=1
pnpm --filter @workmesh/web exec playwright test --config ../../playwright.config.ts e2e/wecom-notifications.spec.ts --list
pnpm --filter @workmesh/web exec playwright test --config ../../playwright.config.ts e2e/wecom-notifications.spec.ts
```
