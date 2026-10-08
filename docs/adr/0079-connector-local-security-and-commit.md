# 连接器本地安全、完整验证与可恢复提交

Status

Accepted（B1/B2 已审计划与实施授权范围；平台验证仍以实际结果为准）

Context

ADR 0043 的稳定身份重放、ADR 0046 的原始 Skill 完整性与当前凭据证明必须同时满足。服务端已有加密认证重放，本任务仅补客户端纵向路径。用户已选择系统秘密存储、本地无秘密预期清单和连接器自有配置。本批使用 Todos＋仓库记录，代替真实 WorkMesh 双轨记录。

Decision

连接器以 Koffi `3.3.2` 调用 POSIX `flock`、Windows `LockFileEx`，固定锁文件不删除，锁覆盖恢复、pending 建立、网络验证和提交全过程。系统在进程死亡后释放锁；句柄不继承。拒绝符号链接、重解析点、不安全权限和多硬链接。Windows 创建目录及文件时提供当前 SID 专用安全描述符，owner 为当前用户、DACL 禁用继承且只有该 SID 的 FullControl ACE；使用实际安全描述符读回核对，不用 Node mode 冒充 ACL。POSIX 使用并验证当前 uid、目录 `0700` 与文件 `0600`。

pending 在首次网络发送前写入受保护临时文件、同步、同目录原子替换。内容仅为随机 key、包含完整配对码的精确请求字符串和冻结的端点/客户端上下文；不保存响应或安装令牌。损坏或异清单 pending 明确拒绝，绝不静默换 key。放弃 pending 先恢复提交事务，再删除请求身份，旧配对码不可因此重用。

共享 Zod 契约验证 discovery、兑换和实时身份。只访问清单批准的端点，拒绝重定向；令牌仅发送至批准 MCP URL。原始 Skill 字节严格验证 UTF-8/LF、SHA-256 与随连接器携带的可信 Ed25519 公钥。MCP SDK `1.29.0` 完成 initialize 和两个引导工具；对照预期清单、兑换结果、manifest 与 context，要求精确能力集合与当前 active 凭据。

`@napi-rs/keyring` 固定 `2.1.0`，使用系统后端。Linux 显式传入 `{ linux: { store: 'secret-service' } }`，拒绝其默认 keyutils 回退。任何后端异常均变成无秘密的错误码。产品无文件/内存后备 store；确定性单元和 API 集成夹具使用显式注入的测试内存 store，不作为 OS 后端验收。

提交前保存受保护 journal，包含旧配置原文、新配置及其摘要、独有新秘密引用和 Skill 是否已存在。旧配置先按严格无秘密 schema 校验，旧引用不覆盖、不删除。新增秘密并读回核对后写入 Skill，再原子替换配置；POSIX 同步目录，Windows 使用同步文件与 `MoveFileExW(REPLACE_EXISTING|WRITE_THROUGH)`。配置替换为提交点。恢复看到新配置摘要一致时确认新秘密/Skill 后收尾；否则要求仍与旧配置一致，补偿新增秘密和新 Skill。补偿删除失败保留 journal，禁止后续新提交。提交后相同配对码仅通过摘要识别，重新验证当前身份再幂等返回，不保留原码。

CLI 从隐藏输入或扫码设备原始文本读取配对码；不接受 URL fragment 或命令行秘密参数。`run` 读取系统秘密后注入 `WORKMESH_INSTALLATION_TOKEN`，处理退出码和终止信号，对子进程输出中意外出现的完整凭据形态做跨块隐藏。

Alternatives

新建服务端重放表、允许新 key 重领、缩短配对码、落普通文件、Linux 自动 keyutils 回退、校验前写配置均拒绝。PID 文件锁在崩溃与 PID 重用下不可靠，采用 OS 句柄锁。先写文件再修 ACL 存在并发观察窗口，采用创建时安全描述符。

Consequences

完整请求身份可在客户端重启后恢复，协议验证一步不减。系统秘密存储不可用时明确失败；部署仍需提供对应 OS 后端。平台矩阵为 Required CI 的组成部分，失败、取消或意外跳过不能放行。新原生依赖属于客户端，服务端运行时不改变。

Migration

零数据库迁移，不改变请求 DTO、端点、事件或凭据生命周期。`apps/connector` 为新包，无已有正式配置迁移。发布、无源码安装、网页清单生成及 B3 错误元数据不在本任务范围。

Spec changes

修正 `AGENT_PROTOCOL.md` 与 `OPENAPI.yaml` 的重放窗口和客户端提交顺序；冻结规格/计划历史保留在 `docs/reviews/b1-b2/`，当前规格单独存入 `current-spec.md`。ADR 0075 整体的其他任务仍未因本实现全部完成。
