## M3：现有 Git、异步动作与证据交付闭环

**范围**：补仓库/交付查询、upload状态/cancel/download/列表、completion suggestion/health授权子集及Runner工具。增加**最小exact provider action只读查询合同**：建议 `GET /api/v1/provider-actions/{id}`及typed返回（提案路径，当前不存在），绑定requester/精确Session/资源范围、feature与安全字段，不返回secret payload/provider原始错误；不领取或修改action。completed返回准确目标与result引用，pending/claimed提供下一查询条件，failed/dead提供safe error/recovery，NOT_FOUND不泄露跨Team。

该查询需先OpenAPI/Zod/route binding、授权/SDK再MCP/manifest/Runner/conformance；不能用context任意变化当精确action成功。A2的 `provider_action_id` 可为resolve context提供来源佐证，但历史null及通用commit/openPR/merge结果仍需独立终态查询。查询不自动重试外部unknown，不改变旧action事实。

**文件**：`apps/api/src/delivery/routes.ts`（可拆专门read模块）、contracts/SDK/MCP/Runner、`apps/worker/src/provider-actions.ts`用已有查询facts，artifact storage/upload worker和git provider能力矩阵作为消费者；fake Agent与fake Git provider。有持久化必要才新增迁移，本方案推荐复用现有action projection零迁移；若改事件/持久化语义补ADR。

**真实客户端链**：H已连接Git/pin context→E发现并读仓库准确base SHA/path scope→acquire Lease→branch→查询exact action→commit(expected head)→查询→openPR→读delivery/current head/checks→上传/发布证据→父E按M2稳定Plan调用create_review_delegation→受控交付独立reviewer并ACK/进入合法执行态（不发布Plan）→reviewer读取授权材料、本人发布Room review_result和绑定当前PR/head/provenance的code_review delivery Artifact→本人publish_structured_review→读当前revision并complete reviewer→父确认required reviewer已completed→E请求精确merge/CI重试批准→H批准→Worker重验后执行→E查询终态→父结果摘要与complete。structured review不替代reviewer完成所需Room消息；必须在reviewer仍有有效执行授权时发布，不能先complete再尝试普通写。merge不自动deploy、不自动Issue done；file upload不能充code_review授权。

**测试落点**：扩展stage3 delivery、provider action/worker、artifact upload与MCP/SDK/Runner单元；`packages/conformance/src/delivery-recovery.conformance.test.ts` 待创建。先fake端到端；真实Git provider/文件存储支持度按部署可用条件另实证，不发布外部内容补验收。

| 验收类 | 具体场景及判定 |
| --- | --- |
| 正常 | 从准确base/path到PR/current-head证据/review/批准/终态；exact action返回原target/result；upload headers实际可用；无Artifact store场景明确unsupported/限制 |
| 越权/撤权 | E越路径/仓库/Team查询action拒绝；repo:write_branch有而repo:open_pr无仍拒openPR；外部读取后撤权禁止最终context写；独立reviewer不审自己产生的变更 |
| 非法状态 | stale expectedHead、未通过check/有BlockingHigh review、无有效merge approval、不支持provider操作拒绝；file artifact不能structured review；只有structured review缺Room消息仍不能complete reviewer，required reviewer未completed仍阻父；sending unknown不自动重发 |
| 幂等 | provider intents/上传finalize/review/merge重复同key只一action/事实；丢response读原action再恢复；不同body拒绝；外部不支持exactly-once时如实unknown |
| 旧revision | upload cancel等按现行合同校验；head变化不消费旧review/批准；context异步POST无If-Match，不伪造revision要求；查询不需要If-Match写锁 |
| 事务失败 | intent提交失败零provider I/O，state/event/outbox全回滚；结果checkpoint与权限拒绝回滚/定向事件；query不写业务事实 |
| 重放 | 重复provider webhook、outbox/job、worker reclaim/fenced ACK不双提交；PR head更新使旧批准失效；上传到期/重复finalize保持同证据身份 |
| 并发 | 两commit expected head、review与head换代、批准与撤权/Stop、Worker claim fencing、锁等待超过真实租期；观察实际锁等待，不拿注入delay代证明 |
| 重启/恢复/Stop | 外发前checkpoint commit次序正确；Stop/撤权先commit则零外发，checkpoint先commit后的在途调用不能召回要记录；worker崩溃/未知结果只读对账，exact-action terminal恢复不猜context变化 |

**任务DoD**：至少fake provider完整交付链Native HTTP/MCP/Pi一致，所有异步命令可准确确认；每个真实provider“支持/不支持/未测”有实际依据。#9切片新组合证据单独绑定，不借其旧UI验收。
