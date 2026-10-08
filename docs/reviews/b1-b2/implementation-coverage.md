# B1/B2 当前实现验收映射

本文件追加实际实现去向；不修改历史 `test-coverage.json` 的冻结原测试、九类适用性、DoD 或“未运行”状态。原审查对象为 `b80593e9918ac7ce05465fd0ac640c809753ac5a`；当前产品结果看 `evidence/` 的源绑定、检查退出码和原日志索引。Windows 跨用户权限和 macOS 实际后端尚未通过，不将整项标为完成。

## 十项原测试

| 原测试 | 当前断言位置与实际覆盖 | 结果边界 |
| --- | --- | --- |
| T1 发送前/后崩溃及双方重启恢复 | `connect.test.ts` 的八阶段 SIGKILL 重启；`stage5-connector.integration.test.ts` 的丢响应后 API/MCP 重启，精确比较 key/body/origin/user-agent 与响应正文 | 单元与真实 HTTP 集成已通过；秘密原生跨进程/daemon 重启另有 Linux 实测 |
| T2 同 key 异体、新 key、陌生 claimant | 新 API 集成断言异体 409 `IDEMPOTENCY_KEY_REUSED`，另一 key 持原配对码/公开身份仍无令牌 | 沿用既有服务端身份匹配，不新增重放表 |
| T3 窗口/密文擦除、竞争、半记录 | 新 API 集成实际到期并运行 `cleanupAuthIdempotency` 擦除密文，再拒绝；单元真实两进程竞争与各阶段强杀 | 持有原请求身份，不给旧码换 key |
| T4 原 Stage 5 重放不回归 | 原 `stage5-agent-connections.integration.test.ts` 原样保留，定向运行 30 项；新独立文件 6 项 | 定向 36 项通过；全 API 集成也包含两文件 |
| T5 完整黄金路径、两步流程 | 真实 API/MCP/Skill HTTP 集成；`integration/cli.test.ts` 的实际子进程 connect、initialize→verify→context 顺序、系统秘密存储、配置输出与 run 注入 | Windows/Linux CLI 实测通过；源码命令不冒发布 |
| T6 指纹/签名/字节/身份/profile/caps/current 拒绝 | 单元 17 类故障逐项拒绝，并比较旧配置原字节和旧秘密引用；签名故障修改兑换 metadata，确保进入真实签名验证；可信公钥字节一致断言 | 包含 manifest/context 能力与 Team、authenticated fingerprint、旧 overlap |
| T7 撤销/过期当前验证拒绝 | 新 API 集成三种状态：撤销、overlap deadline 已过、仍在 overlap 但非当前；历史重放可返旧令牌，MCP 当前身份拒绝并零正式写入 | 不改 active 长效凭据生命周期；execution 安装投影不是协调身份权威 |
| T8 提交崩溃/存储/rename 补偿 | journal、secret、readback、Skill、config、pending_removed 六提交阶段强杀；put/readback/rename/delete 失败；新增引用冲突不能删除既有秘密 | 配置替换为提交点；替换前保留旧配置，替换后完成收尾；删除失败保留 journal |
| T9 秘密落点与平台权限 | pending 只含完整码；配置/输出均不含令牌；跨 chunk 隐藏；原生权限读回、不安全 ACL/0600 拒绝、跨用户实际读取、系统后端跨进程、Linux daemon 重启与不可用拒绝 | Linux 完整通过；Windows 当前用户 ACL/原生存储/CLI 通过，跨用户缺夹具失败；macOS 未运行 |
| T10 同码重跑、幂等、直接输入/扫码 | 单元和实际 CLI 从 stdin 提供完整码，同码复用完成记录、不新增秘密；再次验证当前身份，profile 错误拒绝并保持配置 | 配对码不经 URL fragment/命令行参数；输入保留完整长度 |

## 九类适用性与 DoD

| 类别 | 去向 |
| --- | --- |
| happy path | 真实纵向 HTTP、实际 CLI 和系统秘密存储 |
| unauthorized actor | 陌生 claimant、新 key；错误 Team/principal/current credential；撤权 |
| invalid state transition | consumed/expired/erased pairing、过期/撤销/overlap 拒绝提交 |
| duplicate idempotency key | 精确同体重放、异体冲突、pending 不静默重建 |
| stale revision | 不适用：连接器不新增 revision mutation；沿用 R1 冻结适用性，不自造前置权限 |
| transaction failure | 真实兑换事务触发器回滚；客户端秘密/配置补偿与恢复 |
| webhook/job replay | 不适用：不新增 webhook 或交付 job；既有密文擦除 worker 的重复调用另实测 |
| concurrent request | 真实两进程独占身份、一次兑换与唯一配置引用 |
| server restart/outbox recovery | API/MCP 真实重启同响应；客户端八阶段强杀；不新增 outbox 语义 |

数据库/Schema/服务端凭据生命周期零变更；只修正规范说明、增加客户端包、测试依赖与 Required CI 平台矩阵。必需 `lint/typecheck/test/test:integration/test:e2e` 的实际结果和跳过项分别记录，不用历史 CI 或历史 plan 检查替代当前源验收。

新增受影响 ADR 为 `0079`；ADR 0043/0046 的稳定请求身份、可信原字节验证与当前凭据证明均保留。ADR 0075 的 B3/分发等后续范围未冒完成。全部 OS 实测、独立成果复核、最新 Required CI、Chief 确认及 actual main 仍为开放门禁。
