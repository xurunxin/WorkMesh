> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00明确批准#53已审实施路线，主力开发gpt-6.1-sol/high执行，独立审查Agent同模型/high复核，沿既有依赖/检查和blocking/high闭后条件合入。此卡是已确认路线的一个完整批次。M2前置已由Chief独立核实际main/PR/Done齐全，现按用户既有委托派主力high先withPlan规划，另一Agent独审闭blocking/high后由Chief confirm；启动规划不代表实现或验收。

受控来源：已完成#53/PR209，mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d，docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md中本批完整节，README/coverage-matrix/operation-index/branch-separation/sources/review。全部原测试/DoD与适用理由均须消费精确Git全文，不从工具截断前缀伪造全文或hash，不将UI后续、F/TA新域混入此卡。角色/状态/feature/资源/批准前提严格按CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA和现行ADR；不能补工具时授Agent Human角色或注入Human cookie。

## 本卡范围与前置
批次：M3；requires/启动条件：M2 [#56](todo:AY-kl26cRVICuFRT6uzSe) 实际合入。
前置来源（Chief 2026-10-10 14:07独立平台只读Git/PR/todo观察，非用户原话）：#56 done、PR214 merged；refs/heads/main=ef4cb5e1458d911d98433c443dba46e6c224caa0，parents cfce77546b64c2a8d7d12949261c38e2f666d5ae 与 fb770b62a926e7c27049c2795eafa6da4e0cb085，tree 4c135529d53dd0cfa321ed3ff858b5f554c31fd8 与最新已审候选完全相同。正式成果及两验证增量独审均无blocking/high，最新CI415/run38028457556十job含Required全部success。M2受控产品/修复/CI413首败/CI414原件见docs/plan/agent-mcp-m2/；CI415原件在对应Actions，不冒CI414 ZIP。承接M0/M1/M2已落合同与真实限制，不以旧checks代M3新组合。
规划工件在本次授权规划内落盘提交至docs/plan/agent-mcp-m3/，含完整中文方案/准确spec/冻结M3全文及来源、Proposed安全合同/ADR、消费者兼容/操作矩阵/九类验证计划，停confirm供独审，不先实现产品。规划写文件是既有推进所需工件，可直接执行；真正合同分叉或权限/外发扩张沿原问题卡另问。开工重新核真实main及差异，当前snapshot只作来源，不冒后续实时ref。
完整来源为M3节（冻结输入125–149）。补repository/delivery/upload状态与列表/cancel/download/completion suggestion/health允许子集、SDK/MCP/Runner。先设计最小精确provider action只读查询合同（GET /api/v1/provider-actions/{id}仅原方案候选，当前不是已实现endpoint），精确requester/session/Team/resource/feature重新授权，安全结果引用/状态/恢复信息，不返secret payload/provider raw错误，不领取/续action或盲重发unknown。

全链准确base/path/Lease→branch/commit/openPR及action确认→current-head证据→M2独立reviewer受控交付，本人Room消息+code_review delivery Artifact+structured review在有效E授权下发布，reviewer完成后父确认→精确head/checks审批→Worker重验发送→准确终态查询。M1只读结果确认沿已定路线；审批仍Human，merge不deploy/不自动Issue done。fake provider先全链，真实provider支持/不支持/未測诚实标；消费#9新candidate需其实际新验证，不借旧UI tests，file upload不代code_review授权。

## 原问题卡已裁定
用户2026-10-10 15:58在原卡q-zoO3M6sporQm1UHRMlj2K选择「显式限定仓库读授权（推荐）」：审查委派新增可选repositoryIds；明确指定时，仅在父Delegation、目标Agent、Team grant三方均具repo:read且仓库属于父范围时授予该读能力；省略保持M2原三项能力。reviewer仍无仓库写权、无plan:write，审批仍Human；不采用另一候选专用审查投影方案。本项是用户明确合同裁定，需REST/Zod/SDK/MCP/manifest/Runner一致、兼容/撤权/跨scope及真实链验证，并供另一Agent独立方案审查。

## 统一执行及验收要求
开工读真正refs/heads/main精确SHA、前置落地证据和新差异，先withPlan具体安全合同/消费者兼容/实际运行与测试方案（完整中文受控文件）供另一Agent独审；必需新增最小只读投影要先ADR/合同复核，不假端点已存在。普通已授权实现选择由Chief依委托推进，真正扩大范围/权限/外发布另问。冻结已审#53历史，不修改其原报告冒新通过。
产品交付须REST/Zod合同/SDK/policyfeature/MCP/derivedmanifest/Runner/conformance同一操作一致；对应完整节九类用例及不适用理由、新受测源码前后指纹/精确命令退出runtime/数量skip/首败/准备恢复清理实证落盘。Git对象与运行字节区分，缺旧原件真实标出，旧head检查不能代新组合。适用必需本机checks、独立成果审查、最新PR RequiredCI与actualdone/main均齐才验收；只报告实际运行支持/不支持/未测，不以工具或API数量冒全功能。
本批仅Todos＋仓库记录，不伪真实WorkMesh远端记录。旧#9/#16按用户同日裁定只交后端并保全UI，仍由原todo承接；#5三OS/版本分发门禁不缩减；未将这些纳入测试场景时不能强加为所有M批次前置，若纳入须消费其实际新已验收源。F0–F6/TA新增域、真实外发/发布、团队权限及凭据连接不自动获批，不在聊天索取秘密。
收尾先登记独有测试容器/镜像/卷网络/进程/路径，脱敏保全必要证据后仅清本人闲置资源，不globalprune/共享store/他人服务。Windows递归前核绝对workspace目标/link/活动引用/逐path保全依据，保留原操作退出/实际结果；自动审批拒停目标，不Force/改ACL属性/换工具/拆分/移动或父删绕，G1D0C3已拒目标保护。已合worktree须actualmain/保全齐/无引用才清，当前恢复目录保留。回复仅摘要/head/受控路径，未来测试不标已过。

## 本轮规划反馈与执行边界

已读你16:03回合：用户在原问题卡选显式限定仓库读授权，现同步完整spec避免后续重读遗漏。请继续同卡规划修订，完成并提交docs/plan/agent-mcp-m3/完整中文受控方案、当前准确spec、原平台计划doc:fpst3y-xxH7WIBMjBXejk可取得全文与来源限制、冻结M3节全文/精确Git源绑定、Proposed ADR/最小exact action安全合同、repositoryIds三方repo:read交集/省略保持M2/范围兼容/撤权与current-head review闭环、操作矩阵与九类具体验证/适用及不适用理由。此次规划落盘写文件在派工spec中已明确授权，可直接执行；末尾追加的只读/不改文件约束不能覆盖用户委托下Chief明确规划工件要求，不重新询问同一许可。不要实现产品代码；先保存完整计划与原始来源，无法取得平台doc全文则如实标缺口，不拿摘要冒完整源。你发现upload cancel无If-Match、health Agent有准确Human approval、零迁移复用action等都标现源码来源及待独审，不称用户新裁定。末报准确candidatehead、受控入口、实际静态核验exit/来源/首败，停confirm供_oY正式独立方案审查；不把未来产品测试标已过。沿现有spec保持真实外发/权限之外新扩张另问、旧unknown与拒目标保护。
