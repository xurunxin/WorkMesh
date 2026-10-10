# 四十项操作的实际交付

逐操作原始数据见 [JSON](product-operation-matrix.json)，命令/退出码见 [检查索引](product-check-index.json)。新操作正反例、依赖回归与Human保留各按实际入口标注。

| 操作 | 实际正例 | 实际拒例／边界 | 客户端 |
| --- | --- | --- | --- |
| listRepositories | 三客户端实际列表含授权repo，原分页信封不变 | 最终SQL授权/分页审计保28谓词、UNION/OR/删除等负例 | Native/MCP/Pi实际操作 |
| getRepositoryContext | 三客户端模型/工具实收准确base SHA、paths和guidance | 最新read权限撤销；父Session-only context不复制至reviewer | Native/MCP/Pi实际操作 |
| requestProviderAction | branch/commit/openPR逐action结果；fake全链及本机provider HTTP每写窗口 | branch/path/expected head、openPR独立capability、旧claim无checkpoint拒绝外发 | Native/MCP/Pi实际操作 |
| publishDeliveryArtifact | 当前head test_report及本人code_review Artifact | file不充code_review；敏感字段及跨目标引用拒绝、事务回滚 | Native/MCP/Pi实际操作 |
| requestArtifactUpload | RustFS真实签名PUT required headers与UTF-8字节，Pi仅状态无签名资料 | 没有store配置明确拒绝；错origin/Bearer/重定向/超限、checksum/header不匹配拒绝 | Native/MCP/Pi实际操作 |
| getArtifactUploadStatus | 三客户端pending→verified/canceled、实际checksum/artifactId | 当前身份/Session/目标授权重验；过期/未verified状态不能下载 | Native/MCP/Pi实际操作 |
| finalizeArtifactUpload | 真实store对象由upload Worker验证并生成file Artifact | 重复finalize同证据；到期提交后稳定错误、state/event/outbox回滚 | Native/MCP/Pi实际操作 |
| cancelArtifactUpload | 三客户端取消并读回canceled；原合同无If-Match | 非合法状态/撤权拒绝；不制造revision要求 | Native/MCP/Pi实际操作 |
| listWorkItemArtifacts | 三客户端保留数组及checksum/source_tool/null字段，具名schema修复 | 授权过滤在最终查询；不同资源不披露 | Native/MCP/Pi实际操作 |
| downloadVerifiedArtifact | 真实store下载字节/base64/size/checksum逐值一致，Pi不接收URL | 未verified拒绝；配置origin固定、无WorkMesh Bearer、拒redirect、大小与hash不匹配拒绝 | Native/MCP/Pi实际操作 |
| publishStructuredReview | 三客户端独立reviewer、JSONB evidence逐值等DB | 自审/旧head/file/非本人证据拒绝；structured review不能豁免Room消息 | Native/MCP/Pi实际操作 |
| requestPullRequestMerge | current-head checks/review/精确Human approval消费后fake merge | Blocking/High、checks、旧head/过期approval；最新context branch/base锁后收窄零写HTTP | Native/MCP/Pi实际操作 |
| retryPullRequestCheck | Human批准准确check/head后fake重试，原failed check不伪改为success | Gitea不支持；context收窄和approval/head不匹配拒绝；GitHub丢checkpoint跨默认租期不增加rerequest | Native/MCP/Pi实际操作 |
| getProjectDelivery | 精确pullRequestId返回一PR/current head/checks/review/findings/批准 | 授权过滤先于取数；父范围/context失效拒绝；保原默认信封 | Native/MCP/Pi实际操作 |
| createProjectUpdateDraft | 三客户端draft引用当前delivery证据 | Agent直接publish仍Human-only；跨目标证据拒绝 | Native/MCP/Pi实际操作 |
| suggestWorkItemCompletion | 三客户端产生建议，merge后Issue仍未completed | 裁决与workflow转移仍Human；非当前目标evidence拒绝 | Native/MCP/Pi实际操作 |
| getProjectHealthHistory | 草稿与Human精确批准发布后history两事实，三客户端实收 | 保分页信封；实时scope/Team读取谓词由分页SQL门禁验证，未单列三客户端跨项目history负例 | Native/MCP/Pi实际操作 |
| createProjectHealthUpdate | 草稿允许；精确Human批准仅一次消费后发布 | 无approval及批准后summary改动拒绝且批准不消费；旧revision/事务失败依原套件 | Native/MCP/Pi实际操作 |
| createReviewDelegation | 显式repositoryIds三方repo:read、本人双证据、受控交付；初次创建及锁内replay共用校验 | 父/definition/grant/context/child/provider撤权原key拒绝；合法重放零重复child/reservation/Lease/交付；省略维持M2三项 | Native/MCP/Pi实际操作 |
| getProviderAction | 六kind五status真实GET；三客户端read/branch/path收窄恢复；C显式目标桥；Human终态正对照/E终态拒绝 | 其他Actor/仓库范围/当前context拒绝；秘密payload/raw错误不投影；GET前后events/outbox/receipt/token/activity不增；同Actor另Session未单列该精确action夹具 | Native/MCP/Pi实际操作；Runner固定本人E，C bridge仅Native/MCP |
| connectRepository | Human setup/pin及既有发布/裁决回归；Agent manifest隐藏和缓存调用拒绝 | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | Human REST；Agent端不适用（合同保留，隐藏并拒绝） |
| pinRepositoryContext | Human setup/pin及既有发布/裁决回归；Agent manifest隐藏和缓存调用拒绝 | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | Human REST；Agent端不适用（合同保留，隐藏并拒绝） |
| publishProjectUpdate | Human setup/pin及既有发布/裁决回归；Agent manifest隐藏和缓存调用拒绝 | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | Human REST；Agent端不适用（合同保留，隐藏并拒绝） |
| decideCompletionSuggestion | Human setup/pin及既有发布/裁决回归；Agent manifest隐藏和缓存调用拒绝 | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | Human REST；Agent端不适用（合同保留，隐藏并拒绝） |
| listArtifacts | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| publishArtifact | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| createChildAgentSession | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| listAgentSessionChildren | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| postWorkRoomMessage | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| getAgentSession | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| getAgentSessionContext | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| getAgentPlan | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| publishAgentPlan | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| acquireLease | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| renewLease | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| releaseLease | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| requestApproval | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| getApproval | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| completeAgentSession | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
| getAgentSessionExecutionResult | 现有M0/M1/M2真实HTTP/MCP/Pi回归及M3共享lifecycle | 原身份/状态/capability/scope/lease/revision/idempotency及撤权负例保持 | 共享SDK准备/生命周期及原批次真实客户端回归 |
