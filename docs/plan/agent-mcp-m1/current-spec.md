> webui部分后续考虑彻底重新设计，接下来的任务优先完成后端功能逻辑开发，以及面向agent的mcp工具补齐，要让agent能无障碍使用系统全面的功能
> 分批补齐既有功能（推荐）

用户2026-10-09 12:00明确批准#53已审实施路线，主力开发gpt-6.1-sol/high执行，独立审查Agent同模型/high复核，沿既有依赖/检查和blocking/high闭后条件合入。此卡是已确认路线的一个完整批次。M0前置已完成并由Chief核实际主线，现按既有委托启动withPlan规划，由主力开发high执行；本轮规划阶段只写必要受控方案文件，不直接实施产品，另一Agent独审闭合后Chief按条件confirm进入实现。启动不表示本卡已验收。

受控来源：已完成#53/PR209，mainc768e1e3db297d8b91b53dd68b60e723a8a40e7d，docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md中本批完整节，README/coverage-matrix/operation-index/branch-separation/sources/review。全部原测试/DoD与适用理由均须消费精确Git全文，不从工具截断前缀伪造全文或hash，不将UI后续、F/TA新域混入此卡。角色/状态/feature/资源/批准前提严格按CONTEXT/AGENT_PROTOCOL/OPENAPI/SCHEMA和现行ADR；不能补工具时授Agent Human角色或注入Human cookie。

## 本卡范围与前置
批次：M1；requires/启动条件：[#54](todo:pMO6s_SmEL_d81kjKm6S1) M0实际合入。
前置实际证明（Chief独立refs/heads/main与不可变Git对象）：#54done/PR212合入e49eda142d61bdd248ddc42ec16f5563abd4bbc6，parents69085317c88d84b702af727dc0ac7152589626d8与独审883d279d3b5978680672a6c1d7364d421d0afd10，treea1c61dbea与审核候选同；CI408/run37915376122十job含Required全success。开工重新读当前真实main，正常在本卡新分支消费M0已落产品，不重开M0或把构建branch/FETCH_HEAD当主线。M0实际来源包括docs/plan/agent-mcp-m0/已审合同与operation决策、product-report、product-recovery-report、product-ci407-report及product-evidence：身份与发现层分工/直接E与C目标单请求桥/ACK和诊断恢复兼容/安装用途凭据、真实api-integration conformance接线和Pi实收tools及Turn事实作为已落输入；原M0无法停止后为C刷新目标Token的已明示限制与M1新增生命周期需求分别梳理，不将现行恢复路径回归或在终态恢复普通写入。M0历史ZIP两声明容器缺原件等缺口保持历史，不能拿M0旧检查代新受测组合。

方案交付到docs/plan/agent-mcp-m1/，须有完整当前spec及来源快照/精确main和全文绑定、savedplan/implementation、安全合同和兼容策略、逐操作SDK/MCP/Runner/policy及角色状态scope参数输出映射、真实测试九类DoD/闭合矩阵、失响应与finally的时序/失败残留说明。只将本轮真实静态核验计作规划结果；平台计划注入与工具截断/version null区别诚实保存。规划末尾提交准确head和文件入口停confirm，不能仅聊天摘要交独审，也不内部‘独审’代平台另一Agent。
完整来源为batches-and-acceptance.md的M1节（39–71行为该冻结输入的定位，不以行号代正文）。补Session/Plan/context/版本、Approval、Lease heartbeat/renew/release、Recovery和专用stopAck的具名SDK/MCP及精确E Runner生命周期。受控finally在停止后可提交cleanupSummary/residualRisks，不能走会先写Activity/已abort signal的普通makeTool，不让模型继续执行，不拿普通release替Stop协议。保留Human pause/resume/stop/retry/force release/批准决定。

用户12:00已选「精确归属只读确认（推荐）」，取消M1节另一有限终态重放作为待选方案：新增最小只读确认合同须live C/安装身份（或原Human合法读取）重新验证principal/Connection/Team grant/delegation及精确session/action归属，仅返回准确状态/revision/原结果引用/清理概要；不签token/续Session/写receipt/event/outbox、不放宽普通终态E门禁。DTO/path/operationId先具体合同/ADR独审再实施，不虚构现有端点。已提交complete/stopAck失响应、原E重放被终态拒、有效归属确认成功、其他Connection/Session/撤权/scope错误拒绝/no新执行事实均须验证。此裁定不重问。

## 统一执行及验收要求
开工读真正refs/heads/main精确SHA、前置落地证据和新差异，先withPlan具体安全合同/消费者兼容/实际运行与测试方案（完整中文受控文件）供另一Agent独审；必需新增最小只读投影要先ADR/合同复核，不假端点已存在。普通已授权实现选择由Chief依委托推进，真正扩大范围/权限/外发布另问。冻结已审#53历史，不修改其原报告冒新通过。
产品交付须REST/Zod合同/SDK/policyfeature/MCP/derivedmanifest/Runner/conformance同一操作一致；对应完整节九类用例及不适用理由、新受测源码前后指纹/精确命令退出runtime/数量skip/首败/准备恢复清理实证落盘。Git对象与运行字节区分，缺旧原件真实标出，旧head检查不能代新组合。适用必需本机checks、独立成果审查、最新PR RequiredCI与actualdone/main均齐才验收；只报告实际运行支持/不支持/未测，不以工具或API数量冒全功能。
本批仅Todos＋仓库记录，不伪真实WorkMesh远端记录。#9/#16按用户同日裁定只交后端并保全UI，已由原todo实际合入完成，当前main已包含；#5三OS/版本分发门禁不缩减；未将这些纳入测试场景时不能强加为所有M批次前置，若纳入须消费其实际新已验收源。F0–F6/TA新增域、真实外发/发布、团队权限及凭据连接不自动获批，不在聊天索取秘密。
收尾先登记独有测试容器/镜像/卷网络/进程/路径，脱敏保全必要证据后仅清本人闲置资源，不globalprune/共享store/他人服务。Windows递归前核绝对workspace目标/link/活动引用/逐path保全依据，保留原操作退出/实际结果；自动审批拒停目标，不Force/改ACL属性/换工具/拆分/移动或父删绕，G1D0C3已拒目标保护。已合worktree须actualmain/保全齐/无引用才清，当前恢复目录保留。回复仅摘要/head/受控路径，未来测试不标已过。
