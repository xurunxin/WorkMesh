> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00明确批准#53已审实施路线，主力开发gpt-6.1-sol/high执行，独立审查Agent同模型/high复核，沿既有依赖/检查和blocking/high闭后条件合入。此卡是已确认路线的一个完整批次。M1前置已由Chief独立核实际main齐全，现按既有委托由主力开发high先withPlan规划；方案须另一Agent独审通过后由Chief confirm，启动不表示M2实现或验收已完成。

受控来源：已完成#53/PR209，mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d，docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md中本批完整节，README/coverage-matrix/operation-index/branch-separation/sources/review。全部原测试/DoD与适用理由均须消费精确Git全文，不从工具截断前缀伪造全文或hash，不将UI后续、F/TA新域混入此卡。角色/状态/feature/资源/批准前提严格按CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA和现行ADR；不能补工具时授Agent Human角色或注入Human cookie。

## 本卡范围与前置
批次：M2；requires/启动条件：M1 [#55](todo:WZQPIqZlFUUCVJ0-706Wn) 实际合入。
前置来源（Chief 2026-10-10 02:43独立平台只读Git/PR/todo观察，非用户原话）：#55 done、PR213 merged；refs/heads/main=cfce77546b64c2a8d7d12949261c38e2f666d5ae，parents e49eda142d61bdd248ddc42ec16f5563abd4bbc6 与 3ff46eb20616dc5488ba46b77b27e1fb2d783a93，tree ae2505b7740961f0e4c9f6c680ff90280b697af0 与已审产品394401后的纯五份证据增量候选及PR合成同。独立成果审查三blocking全闭/无新增blocking-high；最新CI411/run37973142192十job含Required全success。开工重读真实main与新差异，正常消费M0/M1已落合同与产品，不重开已闭M1或用其旧checks替M2新组合。
M1受控输入见docs/plan/agent-mcp-m1/的product-report、product-review-repair-report、product-queued-author-repair-report、product-ci410-report及原证据；CI411原件仍在对应Actions，CI410提交ZIP不可冒为411同一运行。承接原动作来源/安装或C精确只读确认、等待结算与唯一合法续Turn、公平扫描、失效trigger及失权queued正式结算、Stop/pause/撤权优先，保原未测/skip/历史首败。M2规划交付按本卡已有安全合同与测试要求组织至docs/plan/agent-mcp-m2/，提交完整中文方案、当前spec/冻结M2节与相关源码来源全文快照和精确Git绑定、消费者兼容/操作矩阵/九类DoD及实际运行计划；只把本轮真实规划核验记作已做，末尾准确head与文件入口停confirm供独审。
完整来源为M2节（冻结输入73–123），包括规划完整分页、文档history/diff/restore/export/Guidance读、里程碑层级relation、允许Decision提案/读、评论只读、Room/Inbox/Handoff合法动作。不得把现Human-only评论写、finalize/accept/Guidance发布改为Agent权；导入逐实体恢复不冒整项目原子。

明确承接ADR0017现有两种子任务创建/受控交付/ACK/完成：稳定Plan/version/step、父与子精确身份、真实三方能力交集；普通child有限能力、reviewer无plan:write且不能自动发布Plan。reviewer必须本人Room review_result＋本人code_review Artifact，structured review和noArtifactReason均不豁免；required child未completed每类状态阻父且给准确IDs。补有界父读子状态只读投影，先安全合同/ADR审查，父live授权/绑定复核，允许子终态确认但父终态/撤权拒绝，不泄子token/prompt或扩大通用get权限。review路径与普通child父/step限额、预算reservation的已审实现差异按既有ADR核齐并验真实并发/回滚/重放，必要合同变化先冻结审查，不归F新自主委派或凭标题说已完成。

## 原问题卡已裁定与规划修订
用户2026-10-10 03:18在原卡q-cKVakWbsPo380TgcEY7Ng选择「提交规划工件（推荐）」：本卡落盘受控M2方案、来源快照和Proposed ADR，提交停confirm、不实现产品；该授权继续适用于本卡后续同范围规划修订，不因附加“Do not modify any files yet”重复请求同一许可。
用户2026-10-10 09:17在原卡q-ka2GipEunxQuHuFYGap2C选择「允许显式缩减预算（推荐）」：批准新增可选ReviewDelegationInput.budget，冻结REST/Zod/SDK/MCP/Runner一致合同；省略仍继承全额，显式缩减后按实际预算执行和预留，不自动释放既有reservation，必须验证有限预算普通child→reviewer完整链。取消旧候选全额reservation唯一方案及不存在的Human修订父预算恢复承诺；预算受原父cap限制，不扩Agent权限。本项是用户明确合同裁定；具体验证夹具和实现字段仍须来源及另一Agent独审。
5356b0619bffe3130a377f68e38a2a89931962a1方案独审三blocking由原todo承接：除上述预算修订，按真实现有合同区分数据库默认父/step上限8的正常用例与特权夹具构造，不虚构现DTO已有maxChildSessions或擅扩可配置输入；冻结保留现创建响应parent_session_id、plan_step_version_id、required_for_parent、inherited_budget、max_child_sessions的完整响应schema，SDK/MCP实收字段不得被普通agentSessionResponseSchema丢弃。以上后两项来源为03:49独立审查发现及生产者03:51核实，不称用户新裁定。
平台修订计划doc:prvLepVgLTOEbRNt56WSU尚未同步Git候选；须由原作者保存其全文/取得方式并同步安全合同/ADR/DTO/operation矩阵/兼容/验证/绑定索引及来源副本，保留5356旧候选、原规划首败、原审查和原计划历史，不把旧静态通过冒新方案已审。准确新head和文件入口停confirm，经另一Agent复审blocking/high闭后Chiefconfirm才实现。

## 统一执行及验收要求
开工读真正refs/heads/main精确SHA、前置落地证据和新差异，先withPlan具体安全合同/消费者兼容/实际运行与测试方案（完整中文受控文件）供另一Agent独审；必需新增最小只读投影要先ADR/合同复核，不假端点已存在。普通已授权实现选择由Chief依委托推进，真正扩大范围/权限/外发布另问。冻结已审#53历史，不修改其原报告冒新通过。
产品交付须REST/Zod合同/SDK/policyfeature/MCP/derivedmanifest/Runner/conformance同一操作一致；对应完整节九类用例及不适用理由、新受测源码前后指纹/精确命令退出runtime/数量skip/首败/准备恢复清理实证落盘。Git对象与运行字节区分，缺旧原件真实标出，旧head检查不能代新组合。适用必需本机checks、独立成果审查、最新PR RequiredCI与actualdone/main均齐才验收；只报告实际运行支持/不支持/未测，不以工具或API数量冒全功能。
本批仅Todos＋仓库记录，不伪真实WorkMesh远端记录。旧#9/#16按用户同日裁定只交后端并保全UI；来源为Chief已核原todo完成/主线包含，不重开UI；#5三OS/版本分发门禁不缩减；未将这些纳入测试场景时不能强加为所有M批次前置，若纳入须消费其实际新已验收源。F0–F6/TA新增域、真实外发/发布、团队权限及凭据连接不自动获批，不在聊天索取秘密。
收尾先登记独有测试容器/镜像/卷网络/进程/路径，脱敏保全必要证据后仅清本人闲置资源，不globalprune/共享store/他人服务。Windows递归前核绝对workspace目标/link/活动引用/逐path保全依据，保留原操作退出/实际结果；自动审批拒停目标，不Force/改ACL属性/换工具/拆分/移动或父删绕，G1D0C3已拒目标保护。已合worktree须actualmain/保全齐/无引用才清，当前恢复目录保留。回复仅摘要/head/受控路径，未来测试不标已过。
