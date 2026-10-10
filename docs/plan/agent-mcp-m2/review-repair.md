# 原独审 blocking 的规划修订对照

旧审查准确 head：`5356b0619bffe3130a377f68e38a2a89931962a1`。原件在 [original-review](input/original-review.md)，可见平台返回在 input/revision-conversation-readback.json；不是本Agent重新作的独审。以下是作者修订对应，不代表 reviewer 已关闭 blocking；提交后停 confirm 供 _oY 复审。

| 原 blocking | 原事实与修订 | 受控入口与未来断言 |
| --- | --- | --- |
| 全额reservation阻断及虚构恢复 | 旧candidate唯一全额方案导致父100＋旧child60预留永远不能review，Human调整父预算无API且数学上也不能恢复。用户q-ka2GipEunxQuHuFYGap2C明确批准可选budget；显式40沿inheritChildBudget进入Session预算／reservation，省略仍全额，不自动释放旧预留、不自动取余额 | ADR0082、security-contract、DTO/OpenAPI、operation-decisions；有限100→60→完成旧60保留→40→review双证据→父完成；省略/41/超父cap/负数/非有限/多维漏减拒，双请求40及mixed竞争、回滚/重放精确核Σ与一份40 |
| 上限配置入口不存在 | 现planStepInputSchema／父创建DTO均无maxChildSessions，publishPlan INSERT不写该列，DB默认8。取消可配置入口承诺；正常HTTP/MCP/Pi默认8并核第九次拒；低限额／跨版本step边界用登记的测试专用特权DB夹具 | verification/lifecycle/acceptance；默认8正例／边界，parent1/step8或parent8/step1特权fixture明确SQL/身份/原值。不新增客户端limit字段／迁移 |
| typed创建响应丢绑定 | 普通agentSessionResponseSchema没有五字段，budgetSchema还会剥原record维度。创建专用childAgentSessionResponseSchema补五字段、override budget/inherited_budget为record并passthrough；review wrapper保session/lease，lease复用已passthrough的现有refine schema | dto-proposal/OpenAPI/operation矩阵；REST→SDK typed与旧泛型调用→MCP structuredContent.data→Pi实收逐字段及DB一致，原额外字段不丢；不能拿通用get扩大父权限 |

现行产品文件本轮不改，上述DTO/端点/参数均是确认后实现的草案。执行预算指child自身Session budget及consumer实收值；现有预算利用率是投影，不冒新增模型hard cap／计费机制。parent、step总量／活跃／required gate、真实三方capability、reviewer无plan:write和本人双证据、父live最小读、Human-only/UI/F/TA边界均保持原冻结要求。

旧52份candidate全部Git blob和commit对象存于history/reviewed-candidate.zip，索引逐member绑定；旧5356与M1/source原件仍可达。保存当前完整spec、平台注入doc:prvLepVgLTOEbRNt56WSU正文、author副本、旧到新diff和本轮原工具返回。独立implementation平台原件未取得，不伪造；仓库implementation仅当前savedplan的byte-equal副本。

本轮实际静态核验仅来源字节、计划同步、合同文本／表映射、path/link、diff空白和现行CI分类，结果由static-checks.json记录。产品HTTP/MCP/Pi、迁移回归、Required CI与本修订独审尚未运行，不预标通过。
