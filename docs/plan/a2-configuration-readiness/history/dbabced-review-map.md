# A2 实施与验收映射

本文件与 `../a2-configuration-readiness.md` 组成完整可审方案。所有产品用例均待实现、未运行；测试名是执行者必须创建或扩展的真实用例名，不能用本文件存在、历史 CI 或接口已存在替代结果。

## 当前范围与来源

当前授权来自平台完整规格、原问题卡三答及 Chief 本会话追加指令。旧 `execution-inputs.json`、原 sourceSha256 与历史规格只证明历史输入。本轮当前规格见 `current-spec.md`，原始读回见 `platform-readback.json`；精确平台 ID、当前更新时间、UTF-8 哈希、工作树与 Git blob 字节策略见 `source.json`。

当前 worktree 含 A1 合同与修复，基点为 `96e724858e692d262107c34db50b40c3ae7c122c`。纠正后的 remote 读取为平台 git `ls-remote origin refs/heads/main`，返回同一 SHA；随后明确 `fetch origin refs/heads/main`，并以该 SHA 做 `show`，确认 A1 合同存在。本次时点的 cache HEAD、FETCH_HEAD、工作树 HEAD 与 remote URL 也核对一致。精确工具参数、原始结果和前后 UTC 观察时间见 `main-ref-verification.json`。先前多调用间的共享 FETCH_HEAD 读回不能被当成远端 main，原分叉推断已撤回；错误观察原样另存 `historical-git-observation.json`，其未独立记录的时间字段为 null，不编造远端曾回滚或移动。此纠正不新增开工门禁，本轮不做代码合并。实施与交付前仍以准确 remote ref 固定新 main SHA，检查实际增量并按既有授权整合，不由 stale refs 推测 PR 状态。

## 已选实现细节

### 查询、顺序与状态

- 使用 A1 现有 `configurationReadinessQuerySchema` 与 `configurationReadinessResponseSchema`；响应以 `unknown` 进入 Zod，不用前端自行计算“是否配置”。
- `workKind` 仅来自 URL，必须恰有一个合法值。空值、重复、大小写变体和未知值均为上下文错误，不发投影 GET；提示与正常链接不形成分步向导。普通链接明确到 `/workbench?workKind=repository` 与 `/workbench?workKind=non_repository`，保留已经合法的 Team 参数。
- 以授权查询为边界：已有选中对话的 Team/Project/WorkItem 优先，不从会话猜工作类型；显式资源 URL 与当前对话不匹配时显示上下文错误，不扩大为 Team 全局检查。空白工作台使用合法 URL 上下文和当前授权 Team；没有 Team 时显示普通无上下文状态。
- URL 的 `teamId`、`projectId`、`workItemId` 采用 UUID 校验；显式缺失资源不回退到别的资源。切换 Team 清除旧 Project/WorkItem 与选中对话，URL 是返回时的上下文依据。请求 key 包括 workspace/Human/Team/workKind/Project/WorkItem；每次切换同步屏蔽旧 key 数据，AbortController 加 generation 双重防护。
- 展示 DAG：`provider_connection -> repository -> repository_context`，`project/work_item -> repository_context`；`llm_connection -> enabled_model`；`agent_definition -> agent_team_access`。以边数最长路径计算深度，repository=2、model=1、agent=1；降序且同深度 model 在 agent 前，不给行显示“第几步”，不锁住后项。
- unmet 必须同时满足 `applicability=applicable`、`state=blocked`、`reasonCode=unmet`。三项 ready 或仓库 not_applicable 时横幅不渲染，即使 Runner 恒 unknown；Runner 在清单外用说明性状态文案，不显示离线、未安装或运行许可。
- 查询开始与刷新时旧操作不可点击；失败时显示独立重试状态，不合成 blocked/ready。401 交回现有认证刷新流程；403/404 丢弃旧作用域行并禁止自动换 Team。焦点回归、pageshow、visible、SSE event/resync 以及手动刷新都重新读取；只处理当前作用域事件并合并同一轮刷新，取消监听和计时器。

### 起始提示与点击行为

三个中文固定字符串为：

1. 介绍一下 WorkMesh 的主要功能和使用方式。
2. 帮我梳理项目目标，整理待办和下一步。
3. 帮我把一个任务整理成清晰的目标、计划和验收条件。

英文字符串分别为 `Introduce WorkMesh's main features and how to use them.`、`Help me clarify project goals, organize the work, and identify the next steps.`、`Help me turn a task into clear goals, a plan, and acceptance criteria.`；放在同一类型化 i18n 字典，语言切换不重写已有草稿。

仅在无对话或选中对话无消息时展示提示；有消息或归档对话不出现新增操作。可编辑对话中点击将固定字符串追加到草稿，已有内容后先插入一个换行，保留已有内容和草稿身份并聚焦编辑器。没有对话时点击仅展开现有创建表单，保存单条临时 pendingStarter；再次点击替换尚未提交的 pendingStarter，关闭表单或切换上下文丢弃它。用户明确创建成功后再填草稿，不自动调用 create、send、delegate、activate 或 Session 命令。缺少 Session、模型或授权时发送仍由原有条件和服务端命令拒绝；提示不会改变这些条件。

### 深链、上下文及焦点

- 模型：`/settings/agent-workbench`；Agent：`/agents`。仅依当前 unmet 生成额外配置主动作，既有管理导航照常存在。
- 项目仓库：`/?view=projects&teamId=T&project=P#project-repository-configuration`，用 `projectWorkspaceHref` 生成并添加合法 Team 参数和固定锚点，不用现有 `canonicalObjectHref` 中旧的 `view=project` 别名。
- 工作项仓库：同一 Projects 页面使用 `repositoryWorkItem=I`；有真实 Project 时一起保留 `project=P`，无 Project 时不生成假 Project。读取真实工作项，核对它的 Team/Project；上下文提交只携带 workItemId，不同时携带 projectId。
- 无指定资源的 Team 仓库缺口到 `/?view=projects&teamId=T#project-repository-configuration`。有项目则通过现有选择进入；没有项目则复用现有 ProjectEditor，由 Human 显式创建，不自动创建。配置卡说明需要一个目标；仅该仓库 check unmet 才能新增针对空状态的主动作。普通空列表不能因“没有项目”被重新判为 unmet。
- 使用 Next Link 和 URL 解析器；配置区锚点标题有 `tabIndex=-1`，到达后聚焦。出发时保留原 history.state 的 Next 字段，合并记录本次焦点 key 和 conversationId；不写 seen/readiness/localStorage，不接收动态 returnUrl。返回时恢复仍可见的选中对话并重读权限，不恢复隐藏对象；焦点等新投影返回后恢复到原行，同一行已消失则到清单标题，无横幅则到会话区标题。
- 新配置区位于既有 Projects 页面，不恢复已被 ADR 删除的 Project Settings surface；目标对象各自授权，来源链接不授予读取或写入权限。保持 URL 无关筛选参数及浏览器历史语义。

### 仓库配置、权限和写入

复用 `registerDeliveryRoutes` 的已存在 POST、`mutate` 幂等账本、provider actions 与 `createProviderActionWorker`，不新增领域实体。补共享响应 DTO 及仓库读取的 `can_configure_context`，读取加载函数放在 `apps/api/src/delivery/repository-configuration.ts`。字段只是当前读取时的 UI 提示，采用当前 Actor/workspace/Team membership 的既有 admin/maintainer 规则，Agent 响应固定 false；命令和 Worker 仍各自复核。加载函数只返回无秘密字段，旧 Agent 可见性分支保持。

权限与表单：

| 角色 | 新区行为 |
| --- | --- |
| workspace admin | 创建 GitHub/Gitea provider connection，注册当前 Team 仓库，配置上下文 |
| 当前 Team admin/maintainer | 读取可见仓库，配置已存在仓库上下文；不能注册 provider/仓库 |
| 普通 Human member | 只读；无写入按钮；缺口显示同一 unmet，不泄露他人个人配置 |
| Agent/Service | 不能使用 Human 页面；新增读提示不授予写权限 |

没有可见仓库且当前用户不可注册时显示联系管理员说明，不显示虚假的可操作主按钮。仓库列表分页加载，显示当前 Team 且 active 的条目；不能以第一页没找到就宣称资源不存在。读取/权限变更时清除旧表单操作；403/404 后更新角色/作用域，不自动重放旧提交。

Provider 连接表单使用原 `providerConnectionInputSchema`：GitHub 输入 external account、display name、installation ID、app ID、private key、webhook secret；Gitea 输入 external account、display name、HTTPS base URL、access token、webhook secret。读取现有 featureRegistryResponseSchema，Gitea 未启用不显示创建动作；生产表单不提供 fake provider 选项。已存在 connectionId 可直接用于注册。凭证字段为秘密输入，不写 sessionStorage、draft、URL、活动或测试日志；apiMutation 仅存哈希请求身份和 key。失败或结束清除秘密字段，重输相同秘密的同正文重试保持 key，编辑正文建立新 key。

注册使用原 `repositoryInputSchema`：connectionId、teamId、externalId、fullName、defaultBranch、可选 HTTPS cloneUrl、requiredChecks。真实 targetTeam 由已加载授权对象确定，不能用隐藏字段跨 Team。单独注册成功只表示 repository.connected，不代表上下文就绪，不自动串发 pin。

上下文使用原 `repositoryContextInputSchema`：Project/WorkItem 恰有一个目标；baseBranch 和 baseSha 必填，branchPattern 默认 `workmesh/{workItemKey}-{slug}`，allowedPaths 必须显式输入，permissions 默认仅 read，额外权限由 Human 勾选；不从模型描述或 prompt 推导权限。不自动从 branch 推 SHA，不新增分支查询/克隆/运行入口。

写入顺序为用户一次明确 submit → apiMutation → 数据库事务提交并产生原事件/outbox → Worker 外部解析 → 原 `repository.context.pinned` 事实。前端按已接受 providerActionId 等待，只在事件 ID 关联或新读取的精确目标上下文匹配后显示“已配置”；核对 repositoryId、目标 ID、baseBranch/baseSha、branchPattern、allowedPaths、permissions 和时间/原基线，不以 POST 200 或任意旧 context 当成功。每两秒重读 context，最多一分钟，之后显示仍未确认而不宣称失败或自动重提；手动刷新继续读取。事件重复、乱序和重连只触发读，不二次写。

同一表单 in-flight 禁止重复 submit；操作 key 按 Actor/workspace/Team/目标/仓库/命令区分；网络丢响应、408/425/429/5xx 保留同一 key。修改内容产生新身份，不能把一次注册连带视为一次 pin。提交前重读上下文，发现基线已变则要求加载并检查，保留非秘密草稿；这是前端防误操作，不冒数据库 CAS。不同操作者合法并发仍按已有追加事实语义，列表以服务器时间及稳定 ID 显示最新上下文，不能将 own action 已完成冒称当前配置永远属于自己。

这些创建/追加 POST 没有 If-Match 参数，不新增虚构 revision；现有 ProjectEditor 编辑等 revisioned mutation 保留自己的 If-Match 和错误处理。既有 Worker 在外部请求前重读授权，失权无新上下文；事件/动作失败不被变成前端已完成。所有配置动作均不创建 Agent Session、委派、激活或发送消息。

## 原六项测试逐项映射

统一新增文件 `apps/web/e2e/configuration-readiness.spec.ts`，沿用下表原用例名；每项结果未运行。

| 原项 | 必须出现的用例名 | 场景与断言 |
| --- | --- | --- |
| todo-9-T1 | #9 原验收1：列表顺序 = 依赖深度 | 仓库上下文→模型→Agent 顺序、计数；非仓库去掉仓库；任意深链均可点击，倒序解决也减少行 |
| todo-9-T2 | #9 原验收2：点击深链后返回会重算 | 每个 canonical 目标可配置；注册不提前 ready，Worker pin 后 Back GET；撤销/disabled 后返回重新出现对应行；原行消失时焦点回退 |
| todo-9-T3 | #9 原验收3：全部满足时横幅不渲染 | 三项可观察 check ready，Runner unknown，横幅为零；无 Session 不能被渲染为 Agent 配置故障或运行许可 |
| todo-9-T4 | #9 原验收4：非 unmet 的空状态不长横幅 | 空消息/空项目/空 Session、不适用仓库、unknown、GET 错误各自不新增配置主动作；只对真正 blocked 的相关区域给动作 |
| todo-9-T5 | #9 原验收5：路由回退 / 键盘 / 窄屏 / i18n 回归 | Back/Forward/深链/焦点，键盘 Tab/Enter，无鼠标操作；390×844 下所有行与表单可达；中英文计数和三个 prompt、light/dark；无 workKind/非法/重复参数不查询 |
| todo-9-T6 | #9 原验收6：e2e：装完 Lite → 看到缺配置 → 逐项补齐 → 横幅消失 | 实际 Lite 镜像安装目标没有源码和 pnpm，不只启动开发服务器；真实 UI 注册模型、配置模型、注册 Agent/Team 访问、注册仓库和 pin，Worker 完成后全部可观察缺口消失；没有任何自动激活 |

原 DoD “未满足项列表可用 + 全部交互断言通过 + 既有 IA 与导航无回归”仍由全部六项及下面九类实际结果、原导航/无障碍回归共同证明。新增范围不删除或迁出 Lite 原验收。新增用例统一保持中文名称。

## 九类适用性

| 类别 | 适用性 | 文件与用例名 | 精确断言 |
| --- | --- | --- | --- |
| happy path | 适用 | configuration-readiness.spec.ts：R1-9-1 缺口列表顺序、对应空状态动作、unknown提示与固定i18n文案正确 | 深度、计数、三态与适用性；三个 prompt 只写草稿；仓库 UI 真正闭合缺口 |
| unauthorized actor | 适用 | configuration-readiness.spec.ts：R1-9-2 当前用户不可见配置不渲染为可操作项；失权重读清除旧行；stage3-delivery.integration.test.ts：A2 仓库操作提示与实时撤权一致 | personal 模型/跨 Team/跨 workspace 不泄露；不同角色按钮及 can_configure_context；POST 与 Worker 撤权、Installation Token GET 保持原拒绝审计 |
| invalid state transition | 适用既有命令状态 | stage3-delivery.integration.test.ts：A2 失效连接及未完成解析不能成为已配置；configuration-readiness.spec.ts：A2 待处理解析不提前清除缺口 | inactive provider/repository 拒绝；pending/retry 不冒 ready；Worker 撤权拒绝；不新增状态机 |
| duplicate idempotency key | 适用 | configuration-readiness.spec.ts：A2 响应丢失后重试保持配置请求身份；stage3-delivery.integration.test.ts：A2 配置注册与解析幂等重放 | 同正文 key 相同、单仓库/单 action/单 receipt/事件；不同正文不同身份；同 key 异文拒绝；两种命令身份不混用 |
| stale revision | 不适用新增命令 | 无新增 revision 用例；沿用 project-editor.spec.ts 原编辑回归 | 新增 POST 创建/追加，没有 If-Match，不伪造 stale revision；另以并发用例验证上下文基线变化与用户确认 |
| transaction failure | 适用 | stage3-delivery.integration.test.ts：A2 配置事务失败无部分状态事件或outbox | 本任务独有失败触发器在事务中断后逐表核对 repository/provider_action/receipt/event/outbox 原内容；既有独立安全拒绝审计单列 |
| webhook/job replay | 适用 job，webhook 无新消费者 | stage3-delivery.integration.test.ts：A2 仓库解析重放仅产生一份上下文；configuration-readiness.spec.ts：A2 重复事件只重读不重提配置 | Worker 重复 tick/同已完成 action 不重复 facts；SSE 同 cursor 重放/resync 不发 POST，清单不重复 |
| concurrent request | 适用 | configuration-readiness.spec.ts：R1-9-8 A2自身异步Team切换不落旧投影，canonical返回/焦点/窄屏列表独立可达，不等待D4；stage3-delivery.integration.test.ts：A2 并发配置保持追加事实与最新读取 | 两 Team/两个会话/不同工作类型请求乱序；旧响应不落地；双击防重；不同 Human 合法并发 facts，旧基线需重新检查 |
| server restart/outbox recovery | 适用新增异步配置命令 | stage3-delivery.integration.test.ts：A2 已提交仓库解析在服务重启后恢复；configuration-readiness.spec.ts：A2 刷新恢复以当前查询为准 | 提交后关闭并重建 API/Worker，保留 PostgreSQL 待处理 action/outbox；完成精确一次；浏览器 reload 不自动重提写命令，按当前授权 GET |

补充前端组件用例文件是对应源码的 `.test.tsx` 和导航的 `.test.ts`；DTO 契约用例为 `packages/contracts/src/repository-configuration-contracts.test.ts`。重点验证延迟结果不能改焦点/路由或草稿，不写镜像实现的冗余测试。

## Lite 实际环境与缺口

- `node scripts/verify-a2-lite.mjs` 生成任务独有资源账本，使用 Docker Linux 容器环境。工作站构建 `infra/docker/lite.Dockerfile`，记录 Git SHA、镜像 ID、四角色 probe，save/load 后仅复制 compose、env 文件及镜像归档到独有安装目录；目标服务不挂载源码，不依赖 pnpm。配置使用本任务随机不同的测试秘密，日志不输出 env 原件。
- 新 `apps/web/playwright.a2-lite.config.ts` 只测试本 feature 的 Lite 链路，不采用现有 global-setup 的 reset-test 或 API/Web dev webServer；用实际部署 Web origin 完成 bootstrap，产生日志与本任务隔离 cookie 状态。主验收文件通过项目名称选择 Lite fixture，保持 T6 独立可辨。
- 外部确定性服务使用 Fake Agent，以及测试专用 HTTPS Gitea API 夹具。仓库读取接口与 `GiteaProvider.resolveRepositoryGuidance` 匹配，由实际镜像 Worker 访问，不用宿主机直接 INSERT repository_contexts 或替代镜像 Worker。证书覆盖测试主机名，仅通过该 Worker 的 NODE_EXTRA_CA_CERTS 增加本轮 CA 信任；不关闭 TLS。测试 compose override 显式启用 Gitea，仅作用此测试实例；正式 feature 默认保持。
- 模型填写仅测试配置需要的无秘密假 endpoint/token，不发模型调用；Agent 不要求执行 Session，Runner 保持 unknown。此测试证明实际安装后的配置与 UI/命令/Worker 路径，不证明真实厂商联通、执行能力、实际低功耗设备容量或 TA01/TA19 全部署验收。
- 本轮静态发现现有 Lite compose 给 RustFS 传 MINIO_ROOT_USER/MINIO_ROOT_PASSWORD，未配置其原生 RUSTFS_ACCESS_KEY/RUSTFS_SECRET_KEY；当前环境没有本任务新镜像或实际安装证明。严格按现有安装合同尝试，首败保全并标记具体缺口，不在 A2 顺手修改部署合同，不将覆盖测试的 override 偷换为原始安装成功。实际 T6 未通过时保持该原项及相关 DoD 未验收；A2 的已验证 UI 子面如实单列，不宣称完整任务已完成，也不把 TA 任务变成新依赖。

## 视觉、整合、执行与收尾

本卡新 CSS 只消费现有语义 token；#21 修改根 token、现有工作台 module 与项目布局属于共享消费范围，实施与交付前重新读取实际 main，正常整合后定向复验，不提前清理或替换根 token。#13 接收 A2 产物完成 A2+D4 组合，A2 自己的竞态/窄屏/导航不能迁出到它。

复用 D0 原始工作台和项目图、比较器参数及环境，固定 Chromium 部分栅格、软件渲染/sRGB、亮色 localStorage 后断言 data-wm-theme、UTC、DPR 1、两个既有视口；额外覆盖暗色。旧 D0 重放与新增设计实际对比区分记录：新提示/清单/配置卡属于有意设计差异，不能更新旧图或放宽阈值掩盖；保存 expected/actual/diff 和实际视觉评审结论。

测试独有 DB 名须含 test，RUN_INTEGRATION=1，具有完整随机 bootstrap、SESSION_SECRET、MASTER_KEY、Redis/S3 环境；专用 run directory 绝对路径。先定向测试再根级适用必需检查。Integration、E2E、mocked 截图和完整 Next build 顺序执行，保留首败，不加超时伪修复。所有实际数量、退出码、skip/未验收和环境限制分别登记，未运行用例绝不预填通过。

每次先登记容器/镜像/卷/网络/进程/临时目录的精确归属；证据含脱敏必要日志和首败，按原始字节登记 SHA-256，Git blob 另核验。结束和失败路径使用 finally 有归属地清理并记录逐 ID/path 依据、活动引用、退出码和结果；共享资源、当前 worktree 和需要恢复的未提交成果保留。Windows 用原生 PowerShell，递归前核绝对路径和 reparse point，避免跨 shell 拼接删除；旧 worktree 仅在 actual main/保全/无活动引用满足后正式移除，不 force。

规划文档先提交，平台保存计划后补 currentID/null version 绑定，另一执行者独审。blocking/high 闭合与 Chief confirm 前没有产品编码。实施验收需当次完整检查、独审、latest Required CI、actual main 落地证据；平台/GitHub 的当前 PR 状态应实读，不由 stale remote refs 推断。
