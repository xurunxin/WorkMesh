# 精确 provider action 查询与显式 reviewer 仓库读范围

## Status

Proposed。受控方案已独审并经Chief确认进入实现；产品与实际检查见M3 product-report，待正式成果独审。此状态不表示验收、Required CI或合入。

## Context

现有异步Git动作在API事务持久化、Worker外发，缺精确action只读结果入口；context任意变化不能证明原action。M2 reviewer仅具work:read/work:write/artifact:write，仓库与绑定仓库证据还要求repo:read。用户已在原问题卡裁定显式repositoryIds，不能默认继承repo写或Human权。

完整受控来源与限制见[M3来源](../plan/agent-mcp-m3/sources.md)。upload cancel无If-Match、health Agent publish准确Human approval、五类action status及context绑定差异均为现源码观察；零迁移与下列安全细化为待审规划决定，不称用户新裁定。

## Decision

新增 GET /api/v1/provider-actions/{id} 白名单只读投影，operationId=getProviderAction。准确本人E或限定原Human/principal，最终SQL原子重验身份、Delegation、Team、资源、provider feature；隐藏target统一NOT_FOUND。返回原target、安全结果引用、原status及派生committed/checkpointed/unknown，不返payload、provider raw error、签名资料或claimed_by，不领取/续action或盲重发unknown。普通终态E不放宽，M1原动作来源确认和Pi settle保持。

ReviewDelegationInput新增可选repositoryIds，显式非空唯一UUID且三方repo:read/父仓库范围共同允许才授repo:read并缩减scope；省略完整保持M2。共享WorkItem/Project context须父子选同原件，父Session-only不复制，现子project_id空用live WorkItem所属Project派生匹配。后续read/review写重验父子绑定与当前scope/context，不比父当前范围更广。reviewer无仓库写/plan:write，只发本人review_result、当前head code_review及structured review，完成后父确认required child completed。

普通Git当前未锁authority，新增完整authority-first发送事务，将expected-head/批准/review/check、最终clock_timestamp租期与worker/attempt/status绑定放入同tx，provider各仓库写HTTP通过beforeMutation逐次提交授权后才发。无checkpoint且有领取历史的五类写action按provider/kind保守停发dead/unknown，不能靠CAS、adapter去重或merged观察合成安全重发；合法checkpoint仅本地完成，context纯GET有界重试，attempt不退减，零新durable sending状态。显式reviewer创建及旧回执用beforeReserve/authorizeReplay同一锁内校验，省略保持M2。细节见[恢复矩阵](../plan/agent-mcp-m3/worker-recovery.md)、[发送前事务](../plan/agent-mcp-m3/worker-authority.md)、[replay合同](../plan/agent-mcp-m3/review-replay.md)、[安全合同](../plan/agent-mcp-m3/security-contract.md)、[范围兼容](../plan/agent-mcp-m3/scope-compatibility.md)、[DTO](../plan/agent-mcp-m3/dto-proposal.ts)、[OpenAPI提案](../plan/agent-mcp-m3/openapi-proposal.yaml)。

既有SDK/MCP/Runner/manifest/政策同operation；Human批准与项目update发布、completion裁决保留。health Agent准确批准发布沿原合同。上传file不作code_review权，签名传输在受控adapter，Pi不把短期凭据送模型。

## Alternatives

专用审查投影候选已由用户选择显式repoIds路线排除；不采用context猜成功、raw action返回、终态E放行或默认扩大reviewer权限。

## Consequences

增加准确异步恢复与最小review读授权；父Session-only context明确拒绝并由Human用既有pin建共享context。provider效果未知窗口不能推断未提交；fake可证明去重不推真实provider exactly-once。仓库查询与current-head审查必须实证完整，而非工具数量或摘要。

## Migration

零数据库迁移、零新领域event；复用provider_actions/result、artifact_links、PR/check/review/approval及JSON capability_scope的既有repositoryIds。现已应用migration/baseline不改；不新增发送状态或事实字段。产品合同与源码已依已审方案实现；attempt_count既有上限8保持单调饱和，CAS额外绑定数据库毫秒精度claimed_at防同worker/attempt到顶ABA。这是源码发现的兼容实现，不称用户新增裁定。

## Spec changes

对应更新OPENAPI/Zod/route policy、SDK/MCP/发现增量/Runner和协议；ReviewDelegationInput.repositoryIds为用户唯一新增授权裁定。产品变更与九类验证须经独审及Chief confirm，成果再经独审/最新Required CI/actual Done/main。

产品补齐：merge／CI每次beforeMutation在准确锁定PR的同一prepareMutation事务内重验最新context的head_branch／base_branch。受控存储传输复用Node原生HTTP／HTTPS，避免Pi全局dispatcher与内置fetch的content-length兼容失败，不增加依赖或外发目标，保签名headers、证书验证、取消与无重定向。

成果独审修复：逐次发送重读已锁仓库的当前默认分支；principal 的活跃 Human＋workspace admin／准确 Team membership 复用现行授权规则，覆盖发送、action 查询与显式 reviewer 创建／重放／父授权读取。context 第八次领取崩溃后无 checkpoint 的过期重领进入既有 dead 状态，返回稳定 `PROVIDER_ACTION_RETRY_EXHAUSTED`，零 provider 调用且不再提示 scheduled；合法 checkpoint 优先本地完成。耗尽标记只来自本次 claim 的旧 attempt 值，不新增持久化字段、迁移或事件。这些是原安全合同的实现修复，不称用户新增授权裁定；原方案历史全文不改。
