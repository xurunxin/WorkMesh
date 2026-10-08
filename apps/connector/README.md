# 可恢复连接器

本包实现 B1/B2 的完整连接与本地恢复。仓库命令供源码环境验证；版本化分发、无源码设备安装和网页预期清单生成由后续任务负责。

## 两步连接

1. 管理员确认 Connection、Team、principal、客户端 profile、能力和 Skill，提供无秘密的 JSON 预期清单及完整配对码。清单字段见 [样例](examples/expectation.json)，必须替换样例身份和地址，不能拿 discovery 返回值自行批准身份。
2. 在仓库执行 `pnpm --filter @workmesh/connector connect --expect /path/to/expectation.json`。按隐藏提示输入完整配对码，或让扫码设备向标准输入提供原始文本。命令自动完成 discovery、指纹、Skill 原始字节/LF/哈希/签名、MCP initialize、verify_connection 和 get_workmesh_context，再保存秘密引用并输出可粘贴的客户端配置。

将输出片段放入对应客户端配置，然后使用 `pnpm --filter @workmesh/connector exec tsx src/cli.ts run -- /path/to/client <args>` 启动。已构建时也可执行 `pnpm --filter @workmesh/connector start run -- /path/to/client <args>`。启动入口从系统秘密存储读取令牌，只注入子进程 `WORKMESH_INSTALLATION_TOKEN`。配对码不放在命令参数、URL、环境变量或普通文件中；扫码输入同样保留完整 256 位随机 bearer。

在交互终端启动时，连接器通过 POSIX PTY／Windows ConPTY 保留客户端 stdin/stdout/stderr 的 TTY 属性、终端尺寸变化和原始输入，支持交互客户端。Ctrl-C 交给终端前台客户端；外部 SIGTERM 在 POSIX 转发给客户端，在 Windows 结束 ConPTY 会话。终端合并输出统一脱敏。重定向输入或输出时使用管道模式，分别脱敏 stdout/stderr，转发 SIGINT/SIGTERM。安全提示立即显示，仅可能尚未完成的凭据前缀暂存；不再固定扣留尾部文本。

## 恢复与存储

断网、丢响应或中断后，使用原清单和原配对码重跑相同命令。受保护 pending 复用原 key、精确 body、origin 和 user-agent。成功重跑通过摘要识别已提交操作，并重新验证当前身份。服务端历史重放不重新验证撤权；连接器仍在当前 MCP 身份检查中拒绝撤销、过期和旧 overlap 凭据。

窗口外、密文擦除、异清单或损坏 pending 都明确失败，不能给旧配对码换 key。确需放弃时运行 `pnpm --filter @workmesh/connector exec tsx src/cli.ts abandon-pending`，完成提交补偿后清理 pending，再由管理员签发新配对码。

Windows 使用 Credential Manager，macOS 使用 Keychain，Linux 强制 Secret Service。后端锁定或不可用时失败，不回退文件或内存。POSIX 目录/文件分别验证 `0700`/`0600`；Windows 创建时设置当前用户专用、禁继承 DACL，再读取实际 owner/DACL 验证。

默认配置目录是 Windows `%APPDATA%/WorkMesh/connector`、macOS `~/Library/Application Support/WorkMesh/connector`、Linux `$XDG_CONFIG_HOME/workmesh/connector`（未设置时 `~/.config/workmesh/connector`）。可用非秘密的 `WORKMESH_CONNECTOR_DIRECTORY` 显式选择专用目录；同样执行所有权限检查，不接受链接、重解析点或多硬链接。

从文件系统根到配置目录逐级验证可信所有者和替换权限，缺失层级在创建时即受保护。POSIX 仅信任当前 uid/root，拒绝其他用户可写的非 sticky 祖先；sticky 目录下每个子目录也必须有可信 owner。macOS 另检查扩展 ACL 的修改授权。Windows 仅信任当前 SID、SYSTEM、Administrators 和 TrustedInstaller，拒绝其他 SID 对祖先的 DELETE、DELETE_CHILD、改 DACL/owner 等权限；无法解释的 ACL 保守失败，不修改现有祖先权限。系统管理员/root 属于系统秘密存储的既有信任边界。

正式 `config.json` 只含秘密引用及已验证的公开事实。完整配对码仅存于受保护 pending；安装令牌唯一持久化落点为系统秘密存储。提交 journal 使用独有新引用，配置替换前失败补偿新增秘密、保留旧配置原字节；替换后崩溃按新配置摘要收尾。旧引用不覆盖、不删除。补偿失败保留 journal 并阻止新提交，需先恢复系统后端。

MCP 和 Skill 可以位于清单明确批准的不同 HTTPS origin。兑换与 discovery 固定绑定部署 origin；拒绝重定向，安装令牌只发送到清单批准的 MCP URL。Loopback HTTP 仅用于本地部署/测试。

## 验证入口与边界

`pnpm --filter @workmesh/connector test` 验证并发、强制终止、协议拒绝与补偿；`test:platform` 实测原生后端、权限、跨用户拒绝及实际 CLI。平台夹具缺失会失败，不将跳过冒充通过。Linux CI 使用独有 Secret Service 并验证 daemon 重启持久性；Windows CI 创建临时第二用户，收尾删除用户和临时目录。测试资源创建与清理写入无秘密日志。

源码中的测试内存 store 只用于确定性故障注入，不是产品后备存储。平台矩阵、成果独审、最新 Required CI 和实际 main 落地仍是验收门禁；本地通过不代表已发布或已合入。
