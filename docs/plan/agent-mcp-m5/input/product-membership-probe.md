# 本卡 membership 撤销探针

这是实际失败探针的复现说明，不是旧完整源码原件。第一次与第二次命令分别为 `joint-real-revocation`、`joint-real-revocation-observed`，退出均非零；精确运行字节指纹、命令和 runtime 在 `../product-checks.json`，原运行日志及模型捕获由 `../product-evidence-index.json` 定位。未逐版保全该中间测试完整源码，不以本说明补造当时源码全文。

1. 独有测试数据库上创建实际 Pi Connection，其 principal 为原 Human H1；经已授权 REST 创建 WorkItem、SDK C 领取／ACK／准确 E 执行准备。
2. 用原 Human 管理身份配置本机受控模型、conversation 与 queued Turn；随后仅对原 H1 做特权夹具准备：`UPDATE actors SET workspace_role='member' WHERE id=$1`；`UPDATE memberships SET role='member' WHERE team_id=$1 AND actor_id=$2`。Pi 子进程继续使用原 installation／Session，正常 refresh、claim、credential、start。
3. 控制模型只发一个 `workmesh_create_document`，owner 为原 WorkItem。代理将该请求转发一次，后端实际200／事务提交后执行 `DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2`，记录 revoked，再销毁第一次响应；代理没有重发。
4. 观察真实 Runner 后续 status GET 和第二次业务 HTTP。原探针要求收到明确拒绝后，才恢复相同 membership 以便模型收错误；实际没有出现拒绝，恢复钩子未触发，模型收到原成功回执。最终清理夹具才恢复原 membership/role，未以恢复制造探针通过。
5. 实际 `pi-member-revoke-observation.json` 中 revoked=true／restored=false；两个业务请求 method/path/bodyHash/key/EHash 相同，第一次 responseLost=true，第二次 false，均200；模型实际收到成功 Document。失败断言保留，不能按本次支持矩阵勾“membership 撤权拒绝”。

后续独立 Human REST `POST /api/v1/delegations/:id/revoke` 用例确实收到原 E401、零第二业务发送和持久 token.revoked_at；它证明另一个正式撤权入口，不覆盖此诊断。
