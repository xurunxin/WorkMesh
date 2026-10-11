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

CLI 从隐藏输入或扫码设备原始文本读取配对码；不接受 URL fragment 或命令行秘密参数。`run` 读取系统秘密后注入 `WORKMESH_INSTALLATION_TOKEN`，处理退出码和终止信号，对子进程输出中意外出现的完整凭据形态做跨块隐藏。独审修订：只保留可能尚未完成的凭据后缀，确定安全的提示立即输出。交互模式新增客户端依赖 `node-pty` 固定 `1.1.0`，提供 POSIX PTY/Windows ConPTY、尺寸变化、原始输入和 Ctrl-C，终端合并输出仍经过同一脱敏器；重定向模式保留分别脱敏的管道。Windows 使用包内 ConPTY DLL，退出后排空 CLI 输出并退出本进程以回收剩余原生输入句柄，不再次终止已退出的 PID。

独审修订：路径校验覆盖根目录及所有祖先，不仅验证叶目录。POSIX 可信 owner 为当前 uid/root；其他用户可写的祖先须有 sticky，且每一级子目录 owner 也须可信。macOS 额外拒绝扩展 ACL 的修改型 allow。Windows 可信 owner/授权主体为当前 SID、SYSTEM、Administrators、TrustedInstaller；对其他主体授予 DELETE、DELETE_CHILD、修改 DACL/owner、GENERIC_ALL/WRITE 均拒绝，继承专用 ACE 不授予当前祖先权限，未知条件/object ACE 保守拒绝。拒绝不安全现存路径，不替用户修改祖先权限；逐层创建缺失目录时设置保护。第二用户测试同时证明安全路径不可重命名、不安全路径确实可替换且连接器拒绝进入；保留可读取正对照。

Windows 在 owner/ACL 核验前从根到叶打开 `READ_CONTROL|READ_ATTRIBUTES` 目录句柄，仅共享读取，持有到锁覆盖的完整操作结束后逆序关闭。这也阻止已核验空祖先被写成重解析点，或祖先在创建下一级期间被删除/重命名；其他用户仅有 ADD_FILE/ADD_SUBDIRECTORY 时不能删除已有受保护子项。所有异常也释放本次句柄，不修改祖先 ACL。

第二轮独审修订：脱敏器增量解析 CSI、OSC/DCS 等 ANSI 控制序列与 C1 形式；控制序列不打断可见凭据匹配，控制载荷也单独脱敏。只扣留潜在凭据后缀与尚未完成的控制序列，完整安全提示即时输出；超长、过深或退出时未完成的控制序列保守隐藏。只有 stdin/stdout/stderr 三者均为 TTY 才启用 PTY；仅 stderr 重定向也采用分流管道，保持错误输出归属与退出码。平台 CLI 测试实际验证系统秘密注入、跨 chunk ANSI 脱敏与 `2>errors.log` 等价入口。

第三轮独审修订：ANSI 可见字符匹配前后都增加独立的原始字节凭据检查，原始 `wmi_`/`wmp_` 前缀不能被控制结束字节分类吞掉。控制结束字节 `w` 也参与后续候选匹配，覆盖异常前导串再叠加色彩序列的情况。安全提示继续即时输出，管道/PTY/实际系统存储入口同时断言原始输出及显示规范化结果，stderr 重定向文件也检查原始日志。祖先权限与三流 TTY 模式选择不变。

Alternatives

新建服务端重放表、允许新 key 重领、缩短配对码、落普通文件、Linux 自动 keyutils 回退、校验前写配置均拒绝。PID 文件锁在崩溃与 PID 重用下不可靠，采用 OS 句柄锁。先写文件再修 ACL 存在并发观察窗口，采用创建时安全描述符。

Consequences

完整请求身份可在客户端重启后恢复，协议验证一步不减。系统秘密存储不可用时明确失败；部署仍需提供对应 OS 后端。平台矩阵为 Required CI 的组成部分，失败、取消或意外跳过不能放行。新原生依赖属于客户端，服务端运行时不改变。

Migration

零数据库迁移，不改变请求 DTO、端点、事件或凭据生命周期。`apps/connector` 为新包，无已有正式配置迁移。发布、无源码安装、网页清单生成及 B3 错误元数据不在本任务范围。

Spec changes

修正 `AGENT_PROTOCOL.md` 与 `OPENAPI.yaml` 的重放窗口和客户端提交顺序；冻结规格/计划历史保留在 `docs/reviews/b1-b2/`，当前规格单独存入 `current-spec.md`。ADR 0075 整体的其他任务仍未因本实现全部完成。

独审修订依据为本轮三项 implementation blocking；完整历史规划不重写。新增原生客户端依赖的 API 与平台边界参照 [node-pty 官方仓库](https://github.com/microsoft/node-pty)，Windows 权限语义参照 [Microsoft 文件安全文档](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights)。三系统实际验证、Required CI、成果复审和 actual main 门禁继续保留。
