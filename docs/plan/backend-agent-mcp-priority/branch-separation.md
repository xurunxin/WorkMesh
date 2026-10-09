# 旧卡后端独立交付切片与保全方案

这份方案消费当前未合成果，不摘取代码、不改旧卡、不给视觉接受。用户已裁定后端独立交付；下面的切片是建议由原todo形成完整纠正规格后执行。所有路径完整head blob、大小/hash与来源提交见[sources.md](sources.md)。按功能hunk拆分；目录分类只是辅助，不能整目录覆盖main。

## #5：连接器仍是完整安全纵向交付

来源：`5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19`，共同祖先 `18252ba8761aa810c3fd12d31ecae83e8b24d985`，比当前main旧。主要实现历史：`903573a8`可恢复激活，`375990f1`安全祖先/PTY，`4495dbcd` ANSI/stdout/stderr，`1a88137d`跨ANSI边界脱敏，`c1c7bca6`整合C3影响；每个完整SHA见来源表。后续文档提交不能代表新的运行源码已测。

本卡没有A2/C2那种视觉主交付，后端优先不允许将“拿到安装Token”单独提前发版。敏感pending、原生权限、系统秘密存储、Skill身份验证、原子配置提交与PTY启动是同一安全闭环。保留系统秘密存储/本地预期清单/连接器自有配置三个既定选择，不再提问。

建议保留的完整交付输入：

| 文件/集合 | 拆分处理与依赖 |
| --- | --- |
| `apps/connector/src/cli.ts`、`connect.ts`、`pending.ts`、`protocol.ts`、`config.ts`、`commit.ts`、`secret-store.ts`、`platform-security.ts`、`path-policy.ts`、`client-process.ts`、`output-redaction.ts`、`errors.ts` | 保留为同一纵向产品；pending在网络发送前持久同key/body/origin/user-agent；原生ACL及锁、验证后写秘密/正式配置、失败补偿。不是API新增auth表 |
| `apps/connector/assets/workmesh-public-key.pem`、`examples/expectation.json`、`README.md`、包配置/tsconfig | 非秘密受控清单与公钥随产品；正式配置只存秘密引用；公共签名Skill bytes不原位改变 |
| `apps/connector/src/*.test.ts`、`integration/cli.test.ts`、`integration/native-storage.test.ts`、`test-support/**`、`vitest.platform.config.ts` | 原生OS/重启/跨用户/进程竞争/CLI/PTY验证不可用mock替代；保持可读正对照避免祖先权限造成假阳性 |
| `apps/api/integration/stage5-connector.integration.test.ts`、`apps/api/package.json` | 保留服务端既有重放窗口/撤权/overlap与客户端校验责任；与原stage5 connection集成同时跑，不新增服务端表或生命周期 |
| `.github/workflows/ci.yml`、`scripts/ci-policy.mjs`、`ci-policy.test.mjs`、`ci-test-inputs.mjs`、`validate-ci.mjs`、`connector-secret-probe.mts`、`test-connector-linux.sh`、`test-connector-windows.ps1`、`turbo.json`、`pnpm-lock.yaml` | 只移植连接器/三OS明确新增hunk，保持当前#52/R1白空检查与Required CI；禁止拿旧CI或提前合并触发来绕OS门禁 |
| `AGENT_PROTOCOL.md`、`OPENAPI.yaml`、分支ADR0079及连接器完整计划/审查材料 | 同步连接器客户端责任、系统秘密存储、回收与scope；没有新DTO/endpoint/event/schema，原生命周期未改。ADR0079未在当前main，不假称main已接受 |
| `apps/web/app/attention-center.tsx`及`attention-center-approval.test.tsx` | 是全仓单元发现的卸载定时器修复；与C2同文件冲突。原todo明确它是必要回归修复还是另行保留，不作为视觉接受，也不静默丢弃 |

本轮没有查GitHub PR实时状态或运行三OS；原卡Spec与分支报告明示Windows双用户fixture、macOS及完整OS/PR Required CI仍缺。后续#5先正常整合实际main，再逐hunk保留原native安全实现及旧失败，完成原门禁；不能将Linux结果借给Windows/macOS。#7错误分类与#20版本化分发仍各自原卡，仓库pnpm运行不等于无源码安装或已发布。

## #9：A2拆成仓库后端安全合同与延后UI

来源：当前head `6f059e3642291f9ab622db37e9de167d070574f2`；冻结已审 `741623eca9d26439e575d6119f7ed97d37df1fde`；产品受测 `380aad996489dbdabddd212be8f45edbcdda7209`。后两者及冻结→当前的增量均为docs材料，不能据此把未来抽取候选或main组合称为旧受测产品。最后web恢复产品修复在380…；后端主实现/授权修正来自 `22a27a9f`、`3a30e309`，Lite proxy来自 `bb86b1fe`；完整逐路径来源在sources。

### 建议后端切片

| 精确文件/hunk | 后端收益、合同变化、依赖 |
| --- | --- |
| `apps/api/src/delivery/repository-configuration.ts`（完整新增文件）及 `delivery/routes.ts`相关hunk | Human可按 `teamId/availableOnly`分页看实际可配置仓库，返回 `can_configure_context`；Agent携这些Human过滤器拒绝，并沿既有context scope列表。provider connection幂等payload中的秘密用字段/用途分离HMAC，不把两个秘密都替成相同REDACTED身份 |
| `apps/worker/src/provider-actions.ts`中 `authorizeRepositoryContextInTransaction`、调用点与结果提交hunk | 外部context读取前及完成落库时重验准确action/session/item/project/Team/connection/原requester身份。workspace前置锁和全局授权锁序、锁后重读、失败事件仅原requester audience，防跨Team泄露；I/O期间不持数据库锁 |
| `packages/db/src/agent-lock-order-manifest.ts` | 新授权锁路径与语句登记必须随worker一起重生成/核验；文件其他行号变化不作为新领域功能，不整文件覆盖过期main |
| `packages/contracts/src/repository-configuration-contracts.ts`、其test、`index.ts`导出、`pagination-contract.test.ts` | strict repository/config/context/provider connection DTO；context增加 `provider_action_id`（历史无法归因null），action响应表示持久化解析动作，不直接代表context已生效；分页不能丢scope |
| `OPENAPI.yaml`对应repository list/filter/response/context/action/幂等说明hunk | 现有路由的新增query与明确response schema；`POST repositories/{id}/context`仍只排provider action，无If-Match，不伪加即时同步配置语义 |
| `apps/api/integration/stage3-delivery.integration.test.ts`、`stage4-operations.integration.test.ts`中的相关新增用例 | HMAC同key异秘密拒绝、分页、撤权/Team变化/锁等待、Worker外读后最终写拒绝/不可见事件；保留与C1/Agent权限的既有正负对照 |

依赖当前main的A1、C1、分页与route-policy授权事实，无新增migration/event type；事件audience变化是授权语义，必须和worker+集成测试同切片。该切片改善H仓库配置安全与异步可追溯性，不自动让Agent拥有H connect/pin权限。

### UI与部署消费者处理

延后UI的精确集合为 `apps/web/features/projects/project-repository-configuration{.tsx,.module.css,.test.tsx,-races.test.tsx}`、`features/workbench/configuration-readiness{.tsx,.module.css,.test.tsx}`、`features/workbench/conversation-workbench{.tsx,.module.css,.test.tsx}`、`app/workbench/page{.tsx,.test.tsx}`、`app/page.tsx`、`app/lib/configuration-readiness-navigation{.ts,.test.ts}`、`app/lib/i18n{.tsx,.test.ts}`、`scripts/check-i18n.mjs`及相应Playwright fixture/spec/config。完整路径来源表逐项列出。这些不是后端切片的视觉验收；原卡保留未知项提示、固定三个起点、配置入口、Back/Forward、焦点、窄屏和视觉待接受要求。

异步提交确认UI已修复同body保key/改体新key、等待与action记录分离、超时允许编辑、旧焦点/实时/手动/轮询读取统一取消和代际门禁、实际忽略abort的迟到成功/失败测试。后端切片不能把这些修复丢掉，也不能声称没有UI就已解决全部用户配置闭环。保留原UI成果在原todo可追溯受控源，后续重设计消费其行为合同。

`infra/docker/lite.Dockerfile`的build阶段 `NEXT_API_UPSTREAM=http://api:3001`、`docker-compose.lite.yml`对应注释/运行契约和 `deploy/lite/README.md`可作为**独立部署兼容切片**保留，它依赖Next在build时固化rewrites。它既有网页消费者，不能称为纯API功能；不要求移入A2新UI，需用当前main兼容Web运行证明。`scripts/verify-a2-lite.mjs`、`playwright.a2-lite.config.ts`、root Playwright变更/fixture原有测试范围与新切片不同，须按实际消费者重绑，不能只复用A2横幅消失通过证据。

建议旧卡由原owner先写“后端交付子范围”的完整纠正规格、目标main增量、测试绑定和剩余UI列表，然后在原卡受控分支完成独审/Required CI及后端合入审查；整卡的原UI DoD是否正式缩减应由Chief据本方案与用户范围裁定记录，不能由本卡自动关闭A2。方案确认并不代表当前候选已完成检查。

## #16：C2拆成低敏出站链与登录/焦点UI

来源：`5c870d9fe3c30736b8ce87292e1d0bf35838ae83`。主要实现 `61736fa2`，当前head自身还包含quota丢桶恢复修复和集成测试，不是只含整合main。必须比较head对first parent，而非用 `git log --no-merges`遗漏这两段。保留源plan `docs/plan/c2-wecom/{implementation-plan.md,product-design.md,test-coverage.json}`、原失败/复审材料及不可逆效果unknown含义。

| 后端精确文件 | 独立切片内容与检查责任 |
| --- | --- |
| `apps/worker/src/wecom-notifications.ts`、其单元test | 固定低敏Markdown＋canonical HTTPS深链、严端点/DNS/TLS/重定向/响应边界、明确失败和unknown分类；Redis TIME额度/串行token分离、epoch和冷却。**5c870d…新增sentinel在冷却返回前恢复**，不能漏摘 |
| `apps/worker/src/automation.ts`、`index.ts` | 注册adapter/admission与独有Redis连接，逐条候选/claim、许可截止与锁等待后检查、commit发送checkpoint后外发、unknown不盲重试、fenced ACK、关闭连接。feature默认关闭不变 |
| `packages/db/src/channel-notifications.ts` | C1原intent/attempt/fence/授权锁复用；新增candidate/defer、claim精确候选、checkpoint前remainingMs检查、安全errorCode。既有current state/event/outbox一致性和workspace锁序不改 |
| `apps/worker/src/agent-webhook.ts`、其test | 通用webhook传输增加可选readBody和bounded body/abort/error处理；既有Agent webhook消费者只status语义保持。此共享传输文件必须在两类消费者回归 |
| `apps/api/src/notification-channels.ts`、`server.ts` | 仅投影configured provider配置；Human target CRUD/对账沿C1，不新增Agent代管。configured不是实时可达ready，Redis失败不能假已发送 |
| `apps/api/integration/wecom-notifications.integration.test.ts`、`notification-channels.integration.test.ts` | 真实独有Redis测试跨窗口/锁等待、多Worker、quota丢桶重试不延冷却/两目标边界恢复、旧token失效、TTL模拟；授权撤权/Stop/checkpoint/unknown复用C1；不得mock Lua代替真实Redis |
| `apps/worker/package.json`、`pnpm-lock.yaml`、`.env.example`、`.env.lite.example`、三个 `docker-compose*.yml` | Worker传WEB_ORIGIN和notification feature配置（默认false），package/锁文件增量按当前main重建，不覆盖别分支包变更；无迁移、新route/event type |

保留但延后UI：`apps/web/app/login/page.tsx`、`app/lib/use-authenticated-actor{.ts,.test.ts}`、`app/lib/canonical-route{.ts,.test.ts}`、`app/attention-center.tsx`、`e2e/wecom-notifications.spec.ts`、`e2e/attention-center.spec.ts`。登录安全returnTo、401缓存隔离、授权后详情、焦点/Back/Forward和转发后拒绝仍属原C2后半闭环；不把站外提醒成功当Human已完成决策。

后端切片可通过fake provider证明低敏payload、正确目标、重试预算、准入及fencing；canonical URL保留原合同。当前main网页对未登录用户的返回能力仍需**兼容检查**：验证生成链接被main识别、当前Human重新鉴权；若登录后定位丢失，报告此限制并保留UI待办，不宣称完整通知用户闭环。不得发送真实企业微信消息补证据，不引入回调/账户桥接/决策卡片。

## 跨分支冲突与整合责任

| 交叉位置 | 实际风险与具体处置建议 |
| --- | --- |
| `apps/web/app/attention-center.tsx`：#5卸载定时器与#16登录后焦点 | 两套行为hunk独立核，不把一个覆盖另一个。#16UI延后时#5最小回归修复仍可保留，但须main现有审批测试验证；原视觉仍未接受 |
| `OPENAPI.yaml`/`AGENT_PROTOCOL.md`：#5连接器说明与#9仓库合同 | 按route/DTO/协议段落合并；保持main当前签名Skill、C3和A1/C1语义。route-policy衍生字段不是手写第二权限注册 |
| `docker-compose.lite.yml`：#9build proxy契约与#16notification flags/WEB_ORIGIN | hunk位置不同但部署组合共享consumer；同时保留并验证web/API private proxy、Worker深链origin和默认关闭；现有profiles/密钥契约不能覆盖 |
| `pnpm-lock.yaml`、workspace/turbo/CI：#5新包、#16Worker依赖 | 锁文件从目标main与实际package变更生成，严格scope校验；Required CI三OS/affected消费者保持。没有借别人CI放行新组合 |
| Worker授权锁：#9 provider actions、#16 C1 send；未来M3查询 | 必须统一workspace→全局authority/resource锁序，锁后真实租期与事实重读。新只读action查询不做领取/续租，不介入发送checkpoint |
| 分页/DTO、strict消费者、SDK与MCP新参数 | A2 additive fields对strict旧Zod响应可能不是透明；逐个已有consumer检查。Agent Human-filter拒绝为有意边界，工具不传H过滤器；历史provider_action_id null保留 |

## 每个后端抽取候选的必要检查与证据

1. 原todo先比较当时**实读最新main**与上述精确head，按功能hunk生成候选diff；记录旧受测源、候选源和差异。历史PR/审查/原失败保留，只对新candidate说新检查。
2. 对应合同/DTO、SDK/已有Web、worker与DB consumers的lint/typecheck/unit；按当前ci-policy影响运行API/worker/db/recovery/E2E/smoke及Required CI。实际产品变更不能套本轮纯文档豁免，必需检查失败不得宣布后端完成。
3. #9真实独有PostgreSQL/fake provider完成异步前后撤权、跨Team定向拒绝、锁等待、分页/HMAC/幂等；#16真实独有Redis＋fake HTTPS provider完成准入/unknown/撤权/fence/重放/恢复，#5完成目标三OS原生矩阵。失败原件保全并记录重跑源，不改超时/skip掩盖。
4. Web兼容测试针对main旧消费者与冻结UI受控源的合同交互，不做新的视觉接受；Lite proxy和安全深链确有Web依赖，不能因为后端优先删除其验证。
5. 保全文档、日志原字节ZIP及指纹、之前拒绝和清理回执缺口，沿已有text=auto/空白门禁；只清确认归属本任务资源，无global prune/dirty force。当前分支与恢复目录保留至原门禁满足。

以上是未来检查清单，本轮没有执行产品测试，也没有把三个旧卡改成done。后端子范围与剩余UIDoD分别写回原todo后才派其执行，本卡不克隆旧工作。
