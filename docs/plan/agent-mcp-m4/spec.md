> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00明确批准#53已审实施路线，主力开发gpt-6.1-sol/high执行，独立审查Agent同模型/high复核，沿既有依赖/检查和blocking/high闭后条件合入。此卡是已确认路线的一个完整批次。前置已由Chief独立核实，按既有委托准备派主力high先withPlan；本次规格更新本身不代表已启动或已验收。

受控来源：已完成#53/PR209，mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d，docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md中本批完整节，README/coverage-matrix/operation-index/branch-separation/sources/review。全部原测试/DoD与适用理由均须消费精确Git全文，不从工具截断前缀伪造全文或hash，不将UI后续、F/TA新域混入此卡。角色/状态/feature/资源/批准前提严格按CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA和现行ADR；不能补工具时授Agent Human角色或注入Human cookie。

## 本卡范围与前置
批次：M4；requires/启动条件：M0 [#54](todo:pMO6s_SmEL_d81kjKm6S1) 及本批实际所用核心恢复工具落地；按用户选择在 M5 [#58](todo:OHtiaCWGLuE1ZKuaYcslS) 后安排（是优先顺序，不反过来阻塞核心M3/M5）。
完整来源为M4节（冻结输入151–175）。只覆盖已存在并按实际部署启用的Planning/Template/Automation/Agent Loops/Costs/A2A及当前允许runLoopNow/recordUsage/health/completion有限写，typed SDK/MCP/必要Runner；owner/private saved view/Template/预算/scope与feature再验，不变Human管理。默认feature关闭仍明确错误，不擅切生产配置、虚报未选域通过或混入TA新机器/日历/CLI计费/出站MCP。A2A独立protocol cursor/受控adapter，tool有界或明确不支持无限流。

包含既有getInitiativeRollup后端授权投影修复：与listInitiatives同live Session/Delegation/Team grant/project-workitem scope，保留Human读、200可见项目上限/COSTS/currency/unknown语义，不授membership或管理权。合法非空授权项目聚合非零正例、同Initiative其他scope排除、先list后撤权必须拒（非空值掩拒），Human回归；先后端安全合同/测试再SDK/MCP/Runner。未修/禁用/未选必须披露而非全面可用。

## 统一执行及验收要求
开工读真正refs/heads/main精确SHA、前置落地证据和新差异，先withPlan具体安全合同/消费者兼容/实际运行与测试方案（完整中文受控文件）供另一Agent独审；必需新增最小只读投影要先ADR/合同复核，不假端点已存在。普通已授权实现选择由Chief依委托推进，真正扩大范围/权限/外发布另问。冻结已审#53历史，不修改其原报告冒新通过。
产品交付须REST/Zod合同/SDK/policyfeature/MCP/derivedmanifest/Runner/conformance同一操作一致；对应完整节九类用例及不适用理由、新受测源码前后指纹/精确命令退出runtime/数量skip/首败/准备恢复清理实证落盘。Git对象与运行字节区分，缺旧原件真实标出，旧head检查不能代新组合。适用必需本机checks、独立成果审查、最新PR RequiredCI与actualdone/main均齐才验收；只报告实际运行支持/不支持/未测，不以工具或API数量冒全功能。
本批仅Todos＋仓库记录，不伪真实WorkMesh远端记录。旧#9/#16按用户同日裁定只交后端并保全UI，仍由原todo承接；#5三OS/版本分发门禁不缩减；未将这些纳入测试场景时不能强加为所有M批次前置，若纳入须消费其实际新已验收源。F0–F6/TA新增域、真实外发/发布、团队权限及凭据连接不自动获批，不在聊天索取秘密。
收尾先登记独有测试容器/镜像/卷网络/进程/路径，脱敏保全必要证据后仅清本人闲置资源，不globalprune/共享store/他人服务。Windows递归前核绝对workspace目标/link/活动引用/逐path保全依据，保留原操作退出/实际结果；自动审批拒停目标，不Force/改ACL属性/换工具/拆分/移动或父删绕，G1D0C3已拒目标保护。已合worktree须actualmain/保全齐/无引用才清，当前恢复目录保留。回复仅摘要/head/受控路径，未来测试不标已过。

## 2026-10-11 05:57前置落地与规划交接
来源为Chief本次平台只读todo/PR/Git与此前05:55准确候选CI观察，非用户新增指令：M5 #58 done、PR218 merged，独立refs/heads/main=c2b3d363c037157df13beb82799d99d07a9b7db8；该不可变merge commit的parents为996c940eb6c725fdfe408976ff9570997d1d5bdb及4f435c8268500b8b0a7966362bcb156801a484bc，包含已合M0–M3及两轮清理规则。M5正式独审两blocking闭合，最终候选CI426/run38088466714十job含Required CI全success；当前main中原M4完整节151–175已读。本次先规划，不直接实施。
消费当前主线docs/plan/agent-mcp-m5/product-current-report.md、product-current-matrix.md、product-pr-ci-report.md及ADR0084/0085，沿用真实资格与消费者兼容合同，不借旧checks验新组合。M5实测仅Windows、loopback受控模型与fake provider；原四链入口exit1与证据续接exit0、集成分段和环境skip如实保留，不改写原整命令成功或其他OS/发行/真实provider支持。
完整中文方案及源规格快照/来源元数据提交docs/plan/agent-mcp-m4/，逐域记录现行部署feature、准确既有权限、拟补操作、必要安全合同/ADR、消费者兼容、实际运行准备与九类场景；不把后续计划标已运行。方案落confirm后由另一Agent正式独审，再依已批准路线推进。
开工消费已合docs/reviews/cleanup/2026-10-11-worktrees下报告与规则，先盘点本卡资源/磁盘，尽量复用可核来源、避免重复归档构建原件；记录逻辑大小、按文件身份去重长度与物理释放不同口径。仅回收已授权且保全/无活动及恢复引用的安全目标。M5当前恢复目录及旧清理树9个只读对象尚未解除保护；G1D0C3原审批拒目标及父目录继续保护，不因Done自动删除、不新增属性例外或后台删除。真正缺客户端/授权或范围分叉给具体问题，普通已授权实现不重复请求许可。

## 2026-10-11 10:19部署选择与规划工件接续
用户在本卡原问题卡明确选择：“独立测试部署，覆盖六域（推荐）”。仅在本卡独立本机测试部署启用Planning、Template、Automation、Agent Loops、Costs、A2A，用于现行Agent权限内读取与有限写验收；保留默认关闭负例，生产配置保持原状。Initiative rollup仍纳入。本卡不再以“未选择启用领域”为待裁定缺口。
本轮仍是规划，不实现产品、不启动测试部署、不声称测试通过；按前文要求允许并要求提交完整中文规划与来源文件。平台plan doc:bLr0qXDovFqe7sMQaMluT是主力10:23产出；远端构建分支当次仍等于main c2b3d363c037157df13beb82799d99d07a9b7db8，没有已提交方案文件，需在本分支提交docs/plan/agent-mcp-m4/中文完整方案、原规格快照/来源元数据、冻结M4全文及相关安全合同/ADR提案和部署/九类/操作消费者/准备恢复清理矩阵，再回confirm交另一Agent独审；不把聊天摘要当完整受控文件。
主力10:23只读调查报告另发现单次Automation run、Usage summary、A2A events同Initiative rollup依赖Human membership投影。这是生产者源码观察，不是用户另授范围/权限；方案逐项记录准确源码、现行允许Agent读的policy/scope依据、最小投影或不支持边界供独审。保持Human管理/private owner/Template准确pin/成本currency与unknown/A2A独立cursor边界；若需真正新增读范围或权限，则先形成具体裁定问题，不自行授权。Runner分页完整保留与recordUsage避免额外要求work:write亦需列明现行合同、最小设计及负例，不预记已修。
