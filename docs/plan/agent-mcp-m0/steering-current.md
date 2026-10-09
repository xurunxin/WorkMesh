# 本轮完整反馈与受控同步授权

以下正文来自本轮注入的完整反馈，保持原句；时间、版本和工具全文不在此猜填。实际平台观察另见platform-observation-q.json。

## 本轮独审反馈

我会只读核对精确候选、受控文档和现行源码，逐项判断上一轮四个阻断点是否闭合，并检查修订是否引入新的实施阻断。
上一轮第1、2、4项的关键边界和CI接线已在受控文档中写明。我正在核第3项：99条领域待核记录中有43条已有MCP binding，需要确认这些是已作出的保守发现决定，还是仍把M0应完成的源码审计留作占位。
第3项仍有可复现的缺口：`verify_connection` 被决策表误标为目标E bridge，但源码没有目标参数、只读取当前C身份；此外，Document和Inbox等既有工具仍被整体标为领域未核。我在核对这会影响哪些发现结果及验收门禁。
请先解决以下问题，再开始编码。

上一轮四项结论：1已闭；2的身份路径已闭；3未闭；4已闭。当前不能confirm进入产品。

1. > 未核实项固定 `blocked/DOMAIN_DIFFERENCE_PENDING`

   受控清单仍有99条领域未核，其中43条已有MCP binding，包括Document、Inbox和Lease等现有功能。统一blocked避免了误授权，但没有完成本批要求的角色发现审计，也没有明确这些条目的闭合门禁。例如 `documents.ts:100–139` 已提供精确owner读取规则，`getDocument`仍被整体blocked。

   请逐项核清已有功能的credential、role、state、scope和variant，给出允许正例与拒绝反例；确有领域差异的条目写明具体差异和本批闭合条件。未来批次缺入口可以继续披露未支持，但不能用通用pending测试替代现有功能审计。(blocking)

2. > 带必填sessionId的E bridge工具在未指定目标时只能以 `requires_target_check` 的条件入口披露

   `operation-decisions.json`把无参数的 `verify_connection`标成了 `target_execution`、`targetParameter=sessionId`并要求安装bridge。实际 `index.ts:145` 的input schema为空，三项读取均使用当前C身份；按此表投影，它会被条件广告或阻断，无法完成规定的连接验证。`claim_work_item`也因callback中的返回值含sessionId而被误分类。

   请按真实输入与调用身份逐binding定案，修正上述当前C操作，并区分“直接E读取自身”和“C桥接目标E”的变体；前者不能要求installation bridge。补合法C无目标参数完成verify、仅Session Token的E读取自身resource/tool的正对照，并让静态核验检查这些binding语义。(blocking)

## 本轮用户完整同步指令

沿用户12:34已答仅文档落盘与12:00/18:38本批条件推进，继续同分支只修方案受控文件。最新doc:Qd1Ks9EH9uEvl1JW3O68D已修，但你本轮明确未改仓库，因此不能就平台计划摘要再次独审/confirm产品。请把当前注入完整plan原样同步savedplan.md/implementation.md和依赖文档，保留1bcf1567/WS旧版本完整字节及回执。落实本轮两blocking，而不是把审计安排到编码后或再写‘下一步审计’：对99领域待核尤其43已有registered binding，逐operation查当前handler/DTO/routepolicy/adapter真实credential/role/state/scope/variant，给明确当前与拟发现策略、实际源码锚点、允许正例及拒绝反例（本轮仅静态方案，不伪跑产品）。例如Document精确owner、Inbox收件Session、Lease持有Session；真的领域差异必须写具体差异和本批可执行closure门禁，未来M1–M5缺入口可继续未支持且解释，不能用通用DOMAIN_DIFFERENCE_PENDING/test占位替现有功能审计，未知不猜权限也不放行。逐binding核真实输入/Token身份：verify_connection schema空/三项均当前C，无sessionId目标参数；claim_work_item返回sessionId不是输入；直接E自身resource/tool不得要求installationbridge；C带精确目标E单请求bridge是另一个变体。静态核验须校验这些语义，不只数量/字符串匹配，并补合法C无目标verify、仅SessionToken E自身读取正对照与相应拒绝反例计划。已闭上一1/APIvsadapter、2路径、4真实RequiredCI接线不无变化重开。Chief已核A2实际合main69085317c88d84b702af727dc0ac7152589626d8/PR211（父add4340+328434d，tree同独审328，CI405十success）；你重新读真实refs/heads/main/immutable source，区别历史base与当前main，记录对上述角色/发现绑定的实际影响，不用FETCH_HEAD冒主线/旧首败倒写。生成、原件hash/工作树Git差异、全文binding和新静态检查如实留证。提交精确新head停confirm供另一Agent定向复审两项，当前不开产品测试/实现、不新edit_plan造版本循环、不文档merge冒整卡完成。
