# 实施合同问题与修正证据

原审查全文保存在 [implementation-contract-review-original.md](implementation-contract-review-original.md)。这份实施内合同审查不代表平台成果独审，也不代表完整产品验收。最新用户要求继续同分支产品实现，修完问题、完整检查后交平台另一 Agent 成果独审。

## 实际来源和首败

恢复时工作树干净，精确源码 HEAD 为 `f0fcf961672541c234a7d1ce6194ea1d2b4f01ea`；其父主线整合提交为 `f4463da42e8c`。远端 `refs/heads/main` 本轮实读仍为 `69085317c88d84b702af727dc0ac7152589626d8`。原审查是在实施过程内只读追踪 schema、生成器、API 状态门禁和 SDK 凭据选择，不是运行产品测试。原报告的行号对应过程中所读文本，未保存该中间工作树精确 hash，故不伪填原报告受测 head；恢复时已提交的部分 variant/team scope 修正与原报告问题分别记录。原失败与旧受控方案都保持可达，未重写。

前轮首个 contracts typecheck 因 identityVariants.credentialMode 同时存在字符串与数组失败；规范化后 contracts 与 MCP typecheck 退出 0。原命令输出仅在工具会话内可见，没有当时原始文件，不能补造原始 stdout/runtime。当前轮所有新检查保存实际命令、进程退出码、运行时间、Git blob 与工作树输入，产品结果另列。

## 四项 High 与另外两项问题

| 问题、发现方法 | 已知拒绝/合法正例 | 修正与产品验证落点 |
| --- | --- | --- |
| 生成器丢失 proposed.variant；adapter 固定查 null；SDK reviewer 分支未选择。对照审定 variant、生成 TS 和实际 lookup。 | open_pull_request 缺 repo:open_pr 必须在发现层 blocked；reviewer complete/fail 缺 artifact:write 同样 blocked；完整联合能力保留目标前提。 | 生成 binding.variant，操作基础行纳入当前 role 的联合能力，SDK 与 adapter 选择真实变体；contracts 与 SDK 反例测试。 |
| typeRequired 未入 predicates。对照九项 Team planning 写的已审 scope 与生成规则。 | C/coordinator/team scope 正例；相同能力但非 team scope 必须 blocked，E 不能由 work:write 获协调 CRUD。 | 生成显式 delegationScopeType 谓词；九项逐操作测试及 MCP E 广告反例。 |
| C stale ACK 被先读拒 stale 的 manifest 阻断。交叉读取 commands.refreshAgentToken 与 authorize.sessionActiveForOperation。 | stale refresh→ACK 是既有合法 SDK 恢复；受保护 401/403 不刷新、不重发。 | 显式 ACK/Stop ACK/diagnostic heartbeat 保留既有 refresh 路径；普通目标 bridge 仍查 qualified，不放宽 manifest；SDK 实际顺序/计数验证。 |
| C room 多变体首匹配压掉省略目标的当前路径。按真实可选 sessionId 输入与 SDK refresh 分支追踪。 | C 未传 sessionId 保持当前身份路径；其 Team scope不等于 work-item/project owner，实际读取不归属 Room须拒绝，不能为构造正例放宽领域权限；提供目标仅在安装 bridge 与目标 E 资格存在时走另一分支。 | 分别投影 identityVariants，调用按输入分支选；contracts/MCP 省略目标正例、显式目标无 bridge 反例。 |
| deploymentSupported 永等 registered。对照实际协调开关、只读模式及安装 bridge。 | callback 存在但部署未配置 bridge 的目标变体 deploymentSupported=false；当前变体可独立支持。 | registered 与部署支持分离；相同注册表不同部署参数测试。 |
| 两层 manifest actorId 与精确目标 actor 未核。交叉核 identity DTO 与局部 Token client。 | 同 actor、准确 E session 正例；agent.actorId 与 discovery.identity.actorId 不一致，或目标 actor 与当前 C actor 不符，立即拒绝，零领域命令。 | SDK strict 解析与 source/target actor/session/kind 核对，不写共享 token；SDK 错绑反例与并发目标隔离测试。 |

具体新运行证据由后续实际回执补充，未运行项不标通过。既有 stale 恢复只维持原 SDK/REST 门禁，不新增 MCP 清理入口；M1–M5 仍按已审范围承接。

## 本轮实际反例与纠正

`discovery-tests-first` 保留原递归错误、旧fixture缺qualified及flow YAML漏operation首败；SDK qualified前置请求明确skipTokenRefresh修正递归，schema全集用真实YAML解析。`discovery-tests-second` 保留条件replyKind尚未知却将普通executor误套reviewer限制的反例；未知when谓词现在记录待核条件，第三轮102项定向测试通过。

真实 conformance 原退出按 `real-conformance-first` 至后续独立名称保全，不覆盖：首轮Agent默认并发容量导致后续claim失败，夹具经管理员既有PATCH仅提高测试Agent容量，不改能力/角色；新Session alias真实字段与冻结binding的id对齐，异Session在adapter拒绝。第二轮Pi实收/事实已经通过，同时暴露Room exact owner范围、revision嵌套字段及fixture误用Stop/revoke路由。Room拒绝沿原领域合同保留，revision按原error.currentRevision核验，控制动作使用现行signals/DELETE，DELETE无body不发送JSON Content-Type。第三轮说明Stop后C刷新依法拒绝；使用现有有效E Token的专用ACK及signal返回revision，M0不新增清理bridge。状态夹具补齐terminal ended_at约束及SQL enum显式转换。所有原首败日志和源码工作字节输入ZIP保持原件。

CI semantic反例发现初次文本插入误命中changes.outputs的同名片段，真实MCP步骤落在DB job；`ci-policy-product-2`及`ci-validation-product`失败原件保留。接线现按实际api-integration job修正；14项policy测试及ci:validate已通过，不以根集成脚本代替Required job执行。


真实Pi错误恢复新增反例 `real-conformance-error-recovery`：模型实际只收到Resource not found，而非NOT_FOUND/details/correlationId；RunnerApiError字段虽然完整，Pi框架仅消费异常message。工具边界现在把原REST error完整写入抛出message并保留cause，仍为错误，不伪装成功结果。`real-conformance-error-recovery-2` 九项通过，捕获四轮模型请求、三项实际tool invocation、错误码/trace、随后合法getWorkItem、settled Turn及一条Document事实；Runner最终51项通过。GET沿原合同不增加领域活动，Document写活动仍实际存在。同body另一新key新增另一条事实也实际验证。

全量unit首败 `product-unit-tests` 暴露旧OpenAPI消费者直接读取AgentCapabilityManifest.properties；为增强响应抽出helper后破坏该路径。现恢复旧schema整块原结构，仅新增qualified的组合schema；`product-unit-tests-2` 全量通过。源码原件与首败均保留，不以事后成功抹去原运行输入。
