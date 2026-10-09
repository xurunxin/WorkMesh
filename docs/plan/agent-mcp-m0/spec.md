> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00批准按#53已审方案分批实施，由主力开发gpt-6.1-sol/high执行、独立审查Agent同模型/high复核，适用检查和blocking/high闭合后条件合入。此卡是完整首批M0，依赖#53实际合入；不启动F/TA新域，不改Web UI，不重问已定后端独立方向或Human/C/E分工。

权威来源：#53已独审并合main c768e1e3db297d8b91b53dd68b60e723a8a40e7d（PR209，tree同审核f5a665407），docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md的完整M0节（下面逐字引入Chief实际Git读取），以及README/coverage-matrix/operation-index/branch-separation/review/sources。277是该输入操作数量，不是新main永久硬编码的功能完成指标；开工核真正refs/heads/main及差异，按实际全集保留无漏项核验。

## M0：工具发现、资格披露与操作恢复契约

**问题与结果**：现有manifest支持度、工具注册、领域角色规则及Runner子集不完全一致。目标是新连接能理解“能发现什么、谁能做、还差什么、怎样恢复”，不用先在网页试错或给Agent注入Human cookie。

**范围**：审计全部operation-index并为每条记录“Agent可适配 / Human保留 / adapter内部 / 部署可选 / 领域差异待核”；校正Human-only已注册工具、E Session下Team协调CRUD广告、provider kind能力表达、resource型读取与tool型读取、只读模式和Coordination模式。保留旧tool/resource名字的可审兼容策略，不能无公告删schema导致旧客户端损坏；推荐Human-only工具不在Agent可调用清单出现，同时为已有客户端返回明确角色拒绝。复合import列组成命令；保持错误结构、pagination和稳定key/body规则，changed body与逻辑新调用的操作身份区别明确。

**具体文件与合同**：`packages/contracts/src/route-policy.ts`、`index.ts` manifest/errorReactions、`apps/api/src/client-profile.ts`、`apps/mcp/src/{index.ts,http.ts,coordination-product.ts}`、`packages/agent-sdk/src/index.ts`、`apps/agent-runner/src/workmesh-tools.ts`、OpenAPI/Agent Protocol/client guide。不默认改变领域批准或授予E协调角色；只读披露如需增加字段先走合同评审。改变协议发现语义的部分按ADR0012/0042/0067补决策，不把本方案标Accepted。

**真实客户端链**：管理员既有预授权→客户端安全配对（若包含#5则须其原门禁）→MCP initialize→tools/list/resources/list→verify/context/manifest→使用准确Team/Project/Session ID→故意调用一项无资格动作→读取可理解的错误并继续允许的读操作。Pi在自己的E Session启动，核模型实际收到的tools，而非只看REST manifest。

**测试落点**：扩展 `apps/mcp/src/index.test.ts/http.test.ts`、`packages/contracts/src/route-policy.test.ts/client-profile-contract.test.ts`、SDK test、Runner `permission-matrix.test.ts/workmesh-tools.test.ts`；真实跨客户端集成 `packages/conformance/src/mcp-coverage.conformance.test.ts` 待创建。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | C只读/读写与E分别initialize/发现；每个可选工具有准确参数/返回引用，资源客户端和只消费工具客户端均能读取前提；Pi仅呈现其确有adapter的工具 |
| 越权/撤权 | 发现后撤Team grant/Delegation/Connection，调用拒绝不自动刷新绕过；H-only工具不能成功；E不能因有work:write创建跨Team Project；跨Team NOT_FOUND不泄露存在性 |
| 非法状态 | queued、paused、stopping、terminal manifest披露与实际调用一致；feature enabled不覆盖状态，错profile/credential mode失败关闭 |
| 幂等 | 对已有代表写工具丢响应重放同key/body只一条事实；异体冲突；工具重新发现或重连保留逻辑身份；同body的另一新动作不误回旧动作 |
| 旧revision | 错If-Match返回结构化冲突及可读取currentRevision；不得先盲重写再返回成功 |
| 事务失败 | M0纯发现没有新领域写事务，因此新command事务回滚不适用；对有代表性的下游写注入失败验证适配不吞原错误。GET身份解析需区别允许的Coordination派生与Human-only早拒绝，拒绝账本仍按ADR0028 |
| 重放 | MCP initialize/工具重连不复制领域事实；SDK响应重试完整错误/trace保留；resource获取无receipt/outbox。M0无新job，job效果去重沿M1–M4验 |
| 并发 | 两客户端以同Connection分别调用，exact Session bridge不串身份；发现后并发撤权/改feature仍服务端拒绝；相同key/body并发不重复写 |
| 重启/恢复/Stop | API/MCP重启后重新发现并从durable cursor恢复；Stop后普通工具失败，专用清理入口保持可走；本批不证明外部CLI或机器恢复能力 |

**任务DoD**：277条现有operation的角色/发现决策无漏项；每个误广告项有服务端与适配一致的证据。工具数量只是静态覆盖数据，不能作为功能验收通过率。

## 当前执行顺序与边界
withPlan=true先提交具体实现方案/当前角色发现兼容策略/准确operation决策清单、来源/全文spec绑定与适用测试映射至docs/plan/agent-mcp-m0/；计划由另一Agent独审后Chief按本批委托confirm进入产品。现行ADR/CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA/route-policy是依据；明确注册、可发现、部署supported、具名SDK/Runner实际实现、当前eligible与目标权限的区别。不自己授予E协调管理/H动作、注入Human cookie或静默移除旧客户端schema。

M1的Stop专用清理/Lease补齐与终态查询、M2子Session/reviewer、M3精确action查询、M4rollup后端缺口和M5完整客户端验收沿#53分别承接。M0发现层要准确披露现阶段支持/未支持和前提；本批不抢实现M1–M4，不把尚缺入口或后续产品用例强行标过，也不以未完成未来批次制造M0范围外阻断。需要新增发现字段或错误/角色schema则先合同与ADR独审，不改变领域写授权。后续用户已选终态精确归属C/install只读确认，不走有限重放，不重新询问。

旧#9/#16后端正由原todo收窄并按分离方案继续，不是M0开工硬前置；可能共享OPENAPI/contracts/锁及包配置，登记差异，正常整合实际落地主线后必要组合验证，不混入未合旧分支绕门禁。已完成历史证据与#53方案保持原语义。

## 实际验收与收尾
沿上面M0完整九类适用性和DoD，产品候选需要具体验证，错误与权限/撤权/角色发现证据及资源客户端/仅tool客户端/Pi实际工具清单，不把static工具数冒端到端。具体外部客户端版本及连接条件从可用环境落实，缺凭据不向聊天索取；真实外发/外部连接授权另批。完成必需本机检查、独审、最新PR RequiredCI，实际done/main证明后才验收；先前文档docs分类与旧head CI不能代替此卡产品检查。

长方案和操作决策/来源/测试DoD须以完整中文受控文件交付，聊天仅摘要/精确head/文件路径。执行前后受测源码、真实Gitblob与运行换行映射、准确命令退出/runtime/skip/首败、服务准备恢复清理实证相称记录，不伪填缺历史原件。本任务测试容器/镜像/卷网络/临时文件精确登记，保全必要脱敏证据后仅清己有闲置资源，不globalprune；Windows递归先核绝对path/link/活动引用。G1/D0/C3已拒目标禁重试/Force/改工具/父删绕；任何新自动审批拒停原报。合入后worktree须actualmain/保全齐/无活动引用才清，当前和恢复目录保留。
