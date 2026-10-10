# 原九类验收的实际承接

原文、适用理由及补充场景限制完整保存在 [JSON](product-acceptance-matrix.json)。

| 类别 | 实际观察 | 明确不适用边界 |
| --- | --- | --- |
| S1 正常 | 三链、真实store、六kind五status；M2有限预算100/60/40作为兼容回归；M3显式repo reviewer单独受控交付 | 完整三客户端链和真实store；缺store显式unsupported |
| S2 越权/撤权 | 初次三方读权缺任一及replay六撤权；当前context read/branch/path；context解析十类撤权；self-review与跨scope拒绝 | 准确身份/资源/三方scope，撤权负例不可免 |
| S3 非法状态 | 旧head/checks/Blocking/High/approval；file不可review；Room/本人code_review各不可豁免，required child所有非completed阻父 | 现状态/独立review双证据/unknown；不放宽Human |
| S4 幂等 | 重复意图/上传/structured review/merge/子创建；合法review原key并发零重复事实、撤权后重放拒绝；unknown零新外发 | 下游写动作适用；GET无幂等写账本不适用 |
| S5 旧revision | 旧head review/approval；stale Plan stableStep；health旧revision；cancel/context POST/GET当前无If-Match | head与revisioned写适用；GET/context POST/upload cancel无If-Match不适用 |
| S6 事务失败 | context及敏感artifact state/event/outbox全回滚；child各插入阶段/预算/Lease/交付故障；Worker terminal/checkpoint失败回滚；查询零业务写 | intent/evidence/review/upload/approval state-event-outbox回滚适用；纯GET command回滚不适用，审计例外分列 |
| S7 重放 | 真实raw GitHub bytes与delivery重放；provider/check/review单调投影；上传到期/重复finalize；未知重领零写 | 原job/webhook/checkpoint重放适用；GET无新job不适用 |
| S8 并发 | 真实PG锁等待两提交序、merge/CI pin收窄branch/base、当前默认分支五kind及principal成员撤销先提交零写、commit首写后context/default/membership换代拒后续写；完整authority锁等待跨60秒；sameworker attempt8 claimed_at防ABA；双C bridge | PG真实锁/租期/双worker与head竞争必须实证 |
| S9 重启/恢复/Stop | 18行恢复；GitHub成功后checkpoint前崩溃，真实60秒重领；合法checkpoint只本地finish；API/MCP重启、Pi Stop/等待恢复及M1原来源结果确认 | 外发前授权提交/结果checkpoint先后、未知/Stop/M1专用确认必须实证 |
