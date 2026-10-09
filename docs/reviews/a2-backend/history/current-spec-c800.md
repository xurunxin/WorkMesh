# [A2-后端] 仓库配置授权、稳定请求身份与异步结果追溯

> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 启动方案，后端独立交付（推荐）
> 收窄本轮验收范围（推荐）

## 当前范围与用户裁定
2026-10-09 12:00用户正式将本卡本轮验收收窄到后端：后端新候选独审、适用检查、最新PR RequiredCI及实际main通过后可合入完成本卡；原UI成果、失败和未验收完整保留，留待后续重设计，不表示旧视觉接受。此完整当前规格替代此前把未满足列表/固定提示/新配置页面/焦点/视觉作为整卡DoD的执行要求。旧全文是历史来源，不继续作为本轮UI实现门禁；已定工作类型仅URL显式、三个固定提示和仓库配置入口的裁定保留后续设计参考，不重问、不假新UI已验收。

同todo同主力开发high、同构建分支tds/conv-01a11b27-cfac-7ea4-a461-8eef51b750fe承接，不run_builds换上下文或克隆旧代码。依据用户本批18:38委托，计划/产品必要独审、blocking/high闭及必需检查通过后按条件合入；F/TA新域、权限及仓库外发布仍另批。本批记录沿Todos＋仓库；已合历史P1/D0/G1/R1/A1/C1/C3/#52/#53不重开。

## 受控来源与分离方案
#53已审且实际合入main c768e1e3db297d8b91b53dd68b60e723a8a40e7d/PR209，docs/plan/backend-agent-mcp-priority/branch-separation.md的#9完整节及sources/coverage/batches/review是后端分离依据。开工重新读取refs/heads/main准确SHA及immutable对象，不用FETCH_HEAD冒main。原成果精确6f059e3642291f9ab622db37e9de167d070574f2（仅视觉交付材料增量），审核产品/技术741623eca9d26439e575d6119f7ed97d37df1fde，实际受测产品380aad996489dbdabddd212be8f45edbcdda7209；旧三技术blocking已闭属于旧组合，不代此新后端候选已通过。

原完整规格/原六测试/DoD在旧卡正文（Chief此次message原样交付）、docs/plan/activation-task-specs/09.md、docs/reviews/r1/execution-inputs.json、test-coverage.json及原A2计划/实现/失败/视觉文件。保留原引用/哈希历史含义，不把生成时metadata冒当前阶段。TA本地总计划及包未在main可读，如实留缺口，不以无源码TA引用阻塞本卡或扩大范围。

## 后端实现切片（来自已审#53，按功能hunk而非目录覆盖）
- API repository-configuration.ts及delivery/routes.ts相关段：Human按teamId/availableOnly分页取得可配置仓库与can_configure_context；Agent不允许Human专属过滤器，保持原context scope查询。provider connection请求身份按字段/用途分离HMAC，不能把两个不同秘密替相同REDACTED而吞异体冲突；不新增Agent的Human connect/pin资格。
- Worker provider-actions.ts的精确异步context授权：外读前及完成落库时重新验证action/session/item/project/Team/connection和原requester，workspace→既有全局authority/resource锁顺序、锁后重读，I/O不持数据库锁；最终拒绝仅原requester受众，拒绝事件不能跨Team泄露。随切片刷新agent-lock-order-manifest.ts，不能覆盖并发主线语句。
- repository-configuration-contracts.ts、测试、contracts index导出、pagination测试及OPENAPI对应hunk：strict DTO/精确分页scope，context的provider_action_id（历史无法归因null），提交返回持久化action并不等于context即时生效。POST context仍现行异步语义，无If-Match，不伪同步配置成功。
- stage3-delivery/stage4-operations对应集成：同key异秘密冲突、正常分页与Agent/H区别、撤权/Team改变/锁等待、Worker外读后最终写拒绝和不可见事件；保留已有正对照，不松断言或只跑新增正例。
现有route-policy、A1三态（non_repository not_applicable/null、Runner恒unknown）、C1事实/授权不改。无新migration/event type；如果实际发现必须新持久化事实或领域权限变化，先具体方案再裁定。

## UI保全、消费者兼容与原验收去向
不得以整个旧head合入替分离，也不得将UI文件删成证据丢失。先提交旧完整规格/全部UI文件及实际来源commit、原三技术修复与测试/首败、D0五历史差异/双采集缺口/当前视觉材料的可复核保全索引，确认旧Git对象仍可取，最终候选相对main只留后端/必要独立部署兼容及规格证据增量。保留旧分支历史，不force-push抹除成果。

延后集合按branch-separation.md精确路径：projects/project-repository-configuration、workbench/configuration-readiness及conversation-workbench、workbench/page及app/page、configuration-readiness-navigation、i18n/check-i18n、相关Playwright/UI配置。原六测试去向：列表依赖顺序、深链返回重算、全部满足隐藏、non-unmet无横幅、Back/Forward键盘窄屏i18n均是后续UI，不计本轮已过；Lite安装→新横幅消失的整条原UI闭环也延后。原UI已实现的同body保key/改体新key、等待/action分离、超时可改、读取消/代际门禁与迟到响应反例不能丢，后续重设计消费其行为合同。原视觉未接受如实记录，不反复发旧视觉问卡。

NEXT_API_UPSTREAM在Lite build固化rewrites的修复可作为已审独立部署兼容切片纳入，不能移入A2新UI。是否需要携带按当前消费者实际影响落实并明确写入交付范围；如携带，必须以main现有Web/新后端的真实构建与无源码安装验证代理/API可用、配置实际落库查询等适用路径，不能复用旧新横幅测试冒新候选通过。现有Web被新增strict DTO/分页返回影响则兼容检查必需，最小兼容调整需具体说明并独审；遇实质新UI需求先报范围，不擅恢复整UI。

## 当前DoD与依赖
requires原#1/#2/#18/#3/#8已完成；目标main中现有相关合同为输入，无#21/#13/TA人工硬链。交付为已审分离方案覆盖的仓库配置后端安全与异步可追溯性、API/contract/policy一致、Worker拒绝受众和锁序正确、旧现有消费者与必要Lite部署兼容可用；不宣称整个原UI配置体验已完成。旧UIDoD正式延后，不影响本轮backend done，但其原件与失败不能标通过或丢弃。

先同步仓库09.md/index/test-coverage及受影响ADR和新的完整spec/source/hunk清单，原失败不倒改；必要定向方案审查后形成候选。允许在已审精确分离路线内直接实施普通拆分，成果回review由另一Agent核实际只后端差异、保全/映射、新源码检查。产品适用必需本机checks、最新RequiredCI均通过，actualdone/gitmain后才完成；不能凭旧741或视觉材料6f通过跳过新组合。新增内容保持中文，代码/标识路径原文。

## 证据与收尾
完整来源/新受测源码前后绑定、实际命令exit/runtime/skip/首败、Git对象与运行字节差异、服务配置准备恢复清理按相称范围落盘，回复仅摘要/head/路径/缺口。成功或失败先保全脱敏证据及恢复成果，再仅清己有闲置Docker容器/镜像/卷网络/临时服务目录，不globalprune或清共享store。Windows递归先核精确绝对path/link/活动引用，不force；自动审批拒停目标原報，不换工具/拆分/改ACL属性/父删绕。G1/D0/C3已拒目标继续保护。合入后worktree须actualmain+成果齐+无活动引用才清，当前或恢复目录不提前删除。
