# [C3] 国内模型预置目录：只读、带出处、不声称兼容性

来源卡：[#17](todo:4DlyrPrDMMtK5JTmFm1t_)；来源 updatedAt：2026-10-07T15:23:33.106Z；原文 UTF-8 SHA-256：`081d5a79d98e12a7f3e1a7dc36ae8c2d8a9ab5e0b93b4f8d344d3083640efe3d`。完整原文与读取来源见 execution-inputs.json，非事务快照。

withPlan: true；owner：C3 执行者；源状态：todo；同步：待Chief读回核验。

本批仅用 Todos 编排与仓库保存规格及证据，替代真实WorkMesh双轨记录；其余领域/安全/测试规则不变。当前G1已done，最新主线含最终证据；每次开工仍核验最新main与输入差异。R1完成独审、必需检查及合入后才由Chief放行受影响实现，不能以本文件存在当成功。

## 冻结接口与阶段

只读部署文件目录：provider/region/apiType/baseUrl/modelId/官方URL/核对日期/确认方式；部署整体替换/覆盖/禁用有确定优先级：部署指定完整目录替换内置，禁用优先，不在请求内合并写回。选中仅填可编辑配置，保存零出站，不提供CRUD、不建preset表、不声称兼容性。

## 定向验收责任

目录版本与每条来源必填；替换/禁用规则；选中不自动保存；normalizeLlmBaseUrl安全验证仍执行；保存零外部请求；每个提供方资料官方复核，不探测付费服务。

测试目标：`apps/web/app/lib/model-presets.test.ts`（待创建）。九类适用性、全部原测试/DoD去向见 test-coverage.json；未运行不填通过。

## 完整任务正文

## 目标
自托管最常见的失败不是缺模型，而是**base URL 贴错**——提供方的端点有地区与部署条件，文档路径易混淆；可达性和协议兼容性须另行验证。预置目录让常见场景不用手敲。

## 背景与证据（已核实，file:line）
- base URL 规范化能力已存在（`normalizeLlmBaseUrl`），做协议/凭据/私有主机名单/路径规范化
- **但保存连接不出站请求**：既有文档明确 API 不向配置目标发网络请求，保存 ≠ 探测通过
- 因此预置**不得**声称任何兼容性；每条要带来源 URL、核对日期、确认方式（机器确认 or 人工确认）
- 真实探测（如需要）是独立任务：受控 runner/worker、事务之外、绑定精确连接与模型 revision、走既有出站策略、定义超时/费用上限/秘密脱敏/三态结果

## 交付物
版本化**只读**的预置目录：国内提供方（MiniMax / DashScope / 智谱 / Moonshot·Kimi / DeepSeek / 火山 / SiliconFlow / 百度千帆）+ OpenAI 全球条目（带地区条件，不承诺网络可达）。选中预置只**填充可编辑配置**。

## 约束
- 无 API CRUD、不建表、不在请求内修改；加载/覆盖/禁用规则按部署文档化
- 部署可整体替换目录文件（自托管方常有自己的网关）
- **不声称兼容性**，因为当前栈不验证
- 不把探测塞进配置写入（本机 DeepSeek 4 个模型 1M 上下文的可用性是**探测任务**的结论，不是预置的结论）
- S1 为可选流程资产，不作为本任务实现门禁。

## 测试清单（逐条需填测试文件与用例名后方可开工）
- [ ] 目录版本可读；选中预置只填充配置
- [ ] 目录替换 / 覆盖 / 禁用规则有测试
- [ ] **保存连接不产生任何出站请求**（断言零外部调用）
- [ ] 每条预置带来源 URL 与核对日期，缺一即失败

## DoD
目录可用 + 上述断言全绿 + 文档明确「预置不验证凭据」。

## 执行依赖与放行

requires：#2、#18、#3；最终验收 additionally requires：无。

本todo原问题已有用户13:34–13:36明确答复，详见末尾同步；依赖及审查门禁保持。

DoD：上面完整源DoD与定向断言全部满足，适用必需检查成功，证据落盘、独立复核及Chief确认；不得以接口存在或历史CI冒称新组合已验收。阶段owner由Chief派发前落实到实际执行者，角色不冒称已任命某agent。

## 总管同步与当前门禁（2026-10-08，Asia/Shanghai）

来源：已独审并合入的 PR203，main `9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`，第二 parent 为审核 head `550dead055689154359a3406dfce4f0c91c1dad3`，两者 tree 一致；该 head CI383 十项检查全部成功。G1/P1/D0/R1 已完成，本卡仍按上文 requires、阶段验收及授权边界执行。正文中的源状态、待同步说明是文件生成时的历史元数据，不代表当前门禁仍关闭。
本卡完整规格来自 `docs/plan/activation-task-specs/17.md`；完整原文快照为 `docs/reviews/r1/execution-inputs.json`，逐类测试/原测试与 DoD 去向为 `docs/reviews/r1/test-coverage.json`，阶段和依赖映射为 `docs/plan/activation-task-specs/index.json`。总管同步前复读本卡全文与源哈希一致；仓库索引的 syncStatus 保留生成时状态，不声称已写回仓库或真实 WorkMesh。新增范围、真实方案分歧、权限或仓库外发布仍须另批。

## 用户原问题答复同步（2026-10-08 13:39，Asia/Shanghai）

来源：本todo原问题卡13:34用户答复：「增加 OpenAI（推荐）」。首批全球项为OpenAI，国内仍为MiniMax/DashScope/智谱/Moonshot·Kimi/DeepSeek/火山/SiliconFlow/百度千帆；不是批准其他全球provider或自动真实探测。每条apiType限现有受支持类型，官方出处/地区条件/日期/确认方式完整；不能从列入目录推出网络可达或协议兼容。

本卡源SHA/PR203同步状态保留历史，不冒当前全文哈希或仓库已同步。当前main包含D1a actual1078bbc，开工再复读最新main影响，正常整合已落地增量。独审前须提供完整中文计划文件和当前savedplan来源/精确正文hash供另一agent读取，仅平台doc链接不能代可审全文；允许仅计划文档前置提交，产品编码仍须规划独审及Chief确认。实施前同步受影响ADR/仓库spec、保留历史源与完整验收，未提供的平台版本字段如实null不猜、不为自引用重复存新计划。
