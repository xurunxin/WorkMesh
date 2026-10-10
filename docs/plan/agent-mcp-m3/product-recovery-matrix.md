# 十八行provider/kind恢复实证

完整字段及原合同见 [JSON](product-recovery-matrix.json)。所有旧unknown原件保留，未用后续绿色改写历史失败。

| provider | kind | 初次实际支持 | 恢复实际验证 |
| --- | --- | --- | --- |
| fake | create_branch | fake三客户端真实链 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| github | create_branch | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| gitea | create_branch | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| fake | create_commit | fake三客户端真实链 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| github | create_commit | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| gitea | create_commit | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| fake | open_pull_request | fake三客户端真实链 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| github | open_pull_request | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| gitea | open_pull_request | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| fake | merge_pull_request | fake三客户端真实链 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| github | merge_pull_request | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| gitea | merge_pull_request | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| fake | retry_ci_check | fake三客户端真实链 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| github | retry_ci_check | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 五写kind旧领取无checkpoint停发，provider resolve计数0；合法checkpoint各kind只本地finish，HTTP/resolve计数0 |
| gitea | retry_ci_check | 不支持：adapter真实拒绝且HTTP0 | 没有合法Gitea CI checkpoint；夹具伪造结果验证dead/unknown，旧无checkpoint停发。正常成功恢复不适用，来源parseProviderActionCheckpoint显式禁止。 |
| fake | resolve_repository_context | fake三客户端真实链 | 各provider标签Worker纯GET重领使用注入Fake reader，attempt1→2；合法checkpoint本地finish；第八次claim无checkpoint崩溃跨真实60秒重启后dead/RETRY_EXHAUSTED且provider0，查询停止scheduled；真实GitHub/Gitea adapter纯GET由本机TLS夹具单列。不是账号集成。 |
| github | resolve_repository_context | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 各provider标签Worker纯GET重领使用注入Fake reader，attempt1→2；合法checkpoint本地finish；第八次claim无checkpoint崩溃跨真实60秒重启后dead/RETRY_EXHAUSTED且provider0，查询停止scheduled；真实GitHub/Gitea adapter纯GET由本机TLS夹具单列。不是账号集成。 |
| gitea | resolve_repository_context | 本机TLS HTTP adapter正例及每个写窗口拒例；真实账号未测 | 各provider标签Worker纯GET重领使用注入Fake reader，attempt1→2；合法checkpoint本地finish；第八次claim无checkpoint崩溃跨真实60秒重启后dead/RETRY_EXHAUSTED且provider0，查询停止scheduled；真实GitHub/Gitea adapter纯GET由本机TLS夹具单列。不是账号集成。 |
