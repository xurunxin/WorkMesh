> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00明确批准#53已审实施路线，主力开发gpt-6.1-sol/high执行，独立审查Agent同模型/high复核，沿既有依赖/检查和blocking/high闭后条件合入。此卡是已确认路线的一个完整批次。M3及核心前置已由Chief独立核actualmain/PR/Done齐全。完整M5规划候选ddddcfca8d7ef387df58be993c88ffe7d62391dd已于2026-10-11 00:24经另一Agent复审确认B1/B2/B3均解决、可按方案实施，生产者无文件修改。Chief按既有委托confirm，由主力high进入实施及联合验收；确认只启动工作，不表示产品验证或本卡验收完成。

受控来源：已完成#53/PR209，mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d，docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md中本批完整节，README/coverage-matrix/operation-index/branch-separation/sources/review。全部原测试/DoD与适用理由均须消费精确Git全文，不从工具截断前缀伪造全文或hash，不将UI后续、F/TA新域混入此卡。角色/状态/feature/资源/批准前提严格按CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA和现行ADR；不能补工具时授Agent Human角色或注入Human cookie。

## 本卡范围与前置
批次：M5；requires/启动条件：M3 [#57](todo:g0q8D1msrOVY2kg-cSdkj) 及其核心前置实际合入。
前置来源（Chief 2026-10-10 22:52独立平台只读Git/PR/todo观察，非用户原话）：#57 done/PR215 merged；refs/heads/main=87f88b89297c5c1e346f7ef99118c410f4b4a905，parents ef4cb5e1458d911d98433c443dba46e6c224caa0 与 d27cb9be3a19befeae431df08276c9ca94d7dbed，tree a8590e0818418e23fc299056ff3d479c65915c78 与已审候选相同。正式成果三blocking及构建配置增量独审均无blocking/high，最新CI419/run38059540722十job含Required全success。M0/M1/M2前置已逐批合入；M3受控来源docs/plan/agent-mcp-m3的product-report/review-fixes-report/product-pr-ci-report/product-ci418-report及原矩阵/源码证据。417首败/418提交ZIP与419 Actions原件分列，旧数量/环境skip/unknown及未测真实provider限制保留；M5新组合不借旧checks通过。
实施依据为精确ddddcfca8d7ef387df58be993c88ffe7d62391dd的docs/plan/agent-mcp-m5/README及完整spec/frozen177–201/savedplan/implementation、安全合同/ADR提案、environment/两路径/九类/操作与消费者和支持矩阵/verification/review-response及准确源码来源。已结束规划回合只写工件、不实现产品的历史约束不适用于确认后的本轮；按已审方案实现最小消费者修复与联合验证，不再withPlan或重复同一写文件许可。真正缺设备/客户端/凭据先核本机现状并形成具体原问题卡，不索取聊天秘密，不新增安装/登录/外部授权/公共发行。开工重新读真实main/newdiff（Chief本wake仍87f88b89297c5c1e346f7ef99118c410f4b4a905），SHA只作来源不冒未来实时ref。原平台全文读回/注入副本/修订edit与独立doc未得的来源限制，原32a47文件/首败及修订65文件字节原件保持，不伪补历史。
完整来源为M5节（冻结输入177–201）。用同一已验收后端，选一个实际可用外部MCP客户端及内置Pi Runner，完整规划/接单/执行/协作/批准/Git证据/Stop恢复/完成链，至少无Git核心及有Gitfake交付两路径、两Human/两Agent交接和撤权。实际客户端/OS/版本/部署记录；协议fixture不冒厂商客户端认证，个人Lite/团队/企业支持度逐一列真实结果，不给未测画像勾选。

首轮按已确认既有领域与可用环境落实，缺真实客户端/凭据先看机器环境并形成具体缺口，不能聊天索取秘密或将fixture记真实。不借M5发布公共签名Skill/新外部服务，原#5三OS和#20无源码发行门禁保留，Runner内嵌pin与不可变公共release分别处理。旧9/16后端只在纳入演示时需其新已验收candidate；不等待延后新UI。适用API/MCP/Worker/Runner重启/失响应/幂等/revision/撤权/并发/rollback及Stop清理实证，领域完成不靠模型口头宣称。

## 已独审三项修订
来源为2026-10-10 23:49方案独审与主力受控修订，经2026-10-11 00:24_oY复审闭合，非用户新增权限裁定：Handoff后旧A来源Delegation已completed，余工由B新Session承接，旧A准确E拒绝单列；保live父读取required child及完成用未Handoff另链。共同Plan冲突使用同owner/Session的两个合法准确E消费者，Pi唯一Attempt控制fence/start时序与两轮屏障，跨Session拒绝另验。Pi普通工具现缺同请求自动重试，按ADR0084提案实施三个内部白名单操作createDocument/publishAgentPlan/postWorkRoomMessage最多一次受限传输重放，同序列body/key/E/headers/If-Match、共同30秒期限及取消/Attempt/lifecycle预算；不refresh身份、不重入Activity，明确HTTP拒绝/JSON/DNS/TLS/provider意图/签名传输/控制/settle/Stopfinally排除，二次失败保首不确定cause。真实Runner单toolCall发第二原HTTP与业务单事实实证，代理重放/新toolCall不能替代。OpenCode私有配置/data/state/standalone无用户服务配置/登录/插件/更新/未批外网的启动门禁必须实际证明；不通过停外部子流程原卡报告。外部MCP上传下载签名资料不向模型暴露，按已审方案禁对应两tools并诚实标传输限制，Pi受控传输结果不借外部全覆盖。

## 统一执行及验收要求
开工读真正refs/heads/main精确SHA、前置落地证据和新差异，按上述完整已独审方案实施与联合验收；必要范围外新只读投影仍先ADR/合同复核，不假端点已存在。普通已授权实现选择由Chief依委托推进，真正扩大范围/权限/外发布另问。冻结已审#53历史，不修改其原报告冒新通过。
产品交付须REST/Zod合同/SDK/policyfeature/MCP/derivedmanifest/Runner/conformance同一操作一致；对应完整节九类用例及不适用理由、新受测源码前后指纹/精确命令退出runtime/数量skip/首败/准备恢复清理实证落盘。Git对象与运行字节区分，缺旧原件真实标出，旧head检查不能代新组合。适用必需本机checks、独立成果审查、最新PR RequiredCI与actualdone/main均齐才验收；只报告实际运行支持/不支持/未测，不以工具或API数量冒全功能。
本批仅Todos＋仓库记录，不伪真实WorkMesh远端记录。旧#9/#16按用户同日裁定只交后端并保全UI，仍由原todo承接；#5三OS/版本分发门禁不缩减；未将这些纳入测试场景时不能强加为所有M批次前置，若纳入须消费其实际新已验收源。F0–F6/TA新增域、真实外发/发布、团队权限及凭据连接不自动获批，不在聊天索取秘密。
收尾先登记独有测试容器/镜像/卷网络/进程/路径，脱敏保全必要证据后仅清本人闲置资源，不globalprune/共享store/他人服务。Windows递归前核绝对workspace目标/link/活动引用/逐path保全依据，保留原操作退出/实际结果；自动审批拒停目标，不Force/改ACL属性/换工具/拆分/移动或父删绕，G1D0C3已拒目标保护。已合worktree须actualmain/保全齐/无引用才清，当前恢复目录保留。回复仅摘要/head/受控路径，未来测试不标已过。
