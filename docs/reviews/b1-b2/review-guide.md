# B1/B2 方案审查交接

本次交付是编码前的文档前置，不是连接器实现。用户已确认实施计划及三项选择；本轮最新明确指示要求先提交可读全文、来源哈希与测试映射，再停在 review 供独立方案审查。独审结论和 Chief 放行尚未取得。当前 Todos 工具回读的 phase 仍为 building，本交接不冒称已通过工具改变该状态。

## 审查入口与来源

- [完整计划](../../plan/connector-recovery.md)：与平台完整注入正文同内容的可预览副本。
- [来源快照](source-snapshot.json)：保存平台完整注入的原始计划正文和截断的 Todos 回读，保持当前 `doc:m7WeSHWZt1Bv3FZwYlnlv`，版本为 `null`，没有创建新的计划 ID。
- [来源与文件哈希](plan-source.json)：分别记录原始正文、Markdown 文件、当前分支基点、最新主线及冻结输入的 SHA-256。Markdown 仅清理原正文五个空白行中的空格并加文件末尾 LF；原始空格完整保留在 JSON 字符串中，两份字节哈希不能混用。
- [任务与测试映射](test-coverage.json)：完整保留本卡十项原测试、源 DoD、九类适用性和历史 B1/B2/B4 条款，给出拟实现文件与独立验证责任。全部功能结果仍是未运行。
- [当前卡与依赖回读](todo-inputs.json)：保存各次工具实际返回的文本及 updatedAt；不是事务快照。卡片 5、3、18 的截断状态按实际记录，不能把工具截断的 Saved plan 当完整工具读回。

本计划正文直接来自本会话平台提供的完整 `<plan>` 注入，不来自摘要拼接。Todos 回读可见的 Saved plan 前缀与原始正文逐字符一致；工具未返回的尾部只依据完整注入源。当前 ID 由用户最新指示明确提供，不推断版本、创建时间或另一个 doc 引用。

## 方案安全与恢复边界

| 边界 | 计划执行时必须保持的行为 | 拟验证位置 |
| --- | --- | --- |
| Windows 秘密存储 | Windows Credential Manager，新增独有引用；不可用、锁定、读回不一致均失败，不回退普通文件或内存 store | `apps/connector/integration/native-storage.test.ts` |
| macOS 秘密存储 | macOS Keychain，同样采用独有引用和明确失败；重启后仍能读到持久条目 | 同上 |
| Linux 秘密存储 | 固定 Secret Service，禁止自动回退 keyutils、仅内存或明文文件；缺少服务时不记为平台验收通过 | 同上 |
| 系统锁 | POSIX flock / Windows LockFileEx；固定锁文件不删除，锁覆盖稳定请求身份建立、恢复、网络验证、提交及 completion 清理，子进程不继承句柄 | `apps/connector/src/connect.test.ts` 与平台测试 |
| 崩溃接手 | 等待者取得 OS 锁后重新读 pending 和提交记录，沿用原 key、精确 body、origin、user-agent；损坏 pending 不生成新 key | 同上及既有 Stage 5 集成测试 |
| 已提交同次配对 | 完成记录只保留高熵配对码摘要等非秘密元数据；同码、同清单识别已提交结果，读取对应秘密并重新验证当前身份，不能当新 claim 再次兑换 | 同上 |
| 跨用户权限 | POSIX 目录 0700 / 敏感文件 0600；Windows 当前用户 SID 所有者、无继承、仅该 SID 允许权限。临时文件也先保护再写敏感字节，验证实际描述符及普通不同账号读取被拒绝 | 平台测试；不以 mode=0600 代替 Windows ACL |
| 可信预期 | 管理员确认的本地无秘密清单绑定部署、Connection、Agent、Team、principal、client、profile、Skill pin 和能力集合；不把兑换响应作为独立预期来源 | `apps/connector/src/connect.test.ts` |
| Skill 与凭据 | 真实下载字节为规范 UTF-8/LF；原字节 SHA-256 与 Ed25519 签名通过，信任公钥与仓库一致。令牌先核指纹；initialize → verify_connection → get_workmesh_context 逐项验证 authenticated_credential/current credential，拒绝 overlap、过期与撤销 | 同上与 Stage 5 集成测试 |
| 提交点 | 全部验证成功才记录提交阶段、写新增秘密并读回、暂存 Skill、原子替换只含引用的正式配置；配置替换为提交点 | `apps/connector/src/connect.test.ts` |
| 补偿 | 提交记录在秘密写入前持久化；提交点前失败保留旧配置与引用，仅删除本次新增秘密；提交点后崩溃根据新配置摘要收尾。删除失败保留记录并阻止新提交；不删除他人已有条目 | 同上及平台测试 |
| 秘密与输出 | 配对码只持久化在受保护 pending；安装令牌只持久化在系统秘密存储。正式配置、提交记录、Skill、stdout/stderr 和测试工件不含明文秘密；启动入口仅向客户端子进程环境注入令牌 | 同上 |

实际普通跨用户访问拒绝与具有系统管理权限的读取不是同一威胁边界；这里验收前者，不声称抵御系统管理员。旧配置只有符合无秘密引用契约才可作为提交记录的备份；异常或内容与新旧摘要均不一致时停止恢复并保留证据，不猜测删除归属。

服务端加密重放可能返回已撤销令牌的旧响应；恢复后必须再做实时身份验证。客户端与服务端授权不构成跨系统事务，不声称重放重新检查撤权，也不改变服务端的窗口、擦除、限流或凭据生命周期。

文件表中 `tsconfig.json`、`tsconfig.build.json`、`vitest.platform.config.ts` 都归新 `apps/connector` workspace。系统秘密存储的 OS 功能验证与无源码发行设备验收分别记录；后者仍归任务 20，不把 workspace 命令当成已发布安装命令。

## 原测试、DoD 与门禁

`test-coverage.json` 中的 `frozenSourceFeatures` 原样保留任务 5、6、20 的来源对象；`legacySourceTasks` 原样保留历史 B1/B2/B4 条款、处置与去向。旧的可独立先发、无秘密 pending 和验证前提交等已撤换条款仅用于溯源，不重新生效。

任务 5 的十项原测试全部进入 `originalTestMappings`，七类适用断言与两类不适用判断全部进入 `categoryMappings`。任务 6 保持吸收关闭；任务 20 的版本化分发、安装和 B4 文档要求保留到原任务，未完成的设备验收不冒称成功。本卡仍依赖 1、2、18、3，阻塞 7 与后续 20。

本批继续使用 Todos 编排＋仓库规格和证据，替代真实 WorkMesh Project/WorkItem 双轨记录。没有创建或同步真实 WorkMesh 记录。用户已确认 Windows/macOS/Linux 系统秘密存储、本地预期清单和连接器自有配置，不重新询问这些选择。当前阶段只提交上述审查材料；产品修改、原生依赖安装、规范修订、完整产品测试和发布均未开始。

## 本轮验证与后续审查

在仓库根目录运行 `node docs/reviews/b1-b2/verify-plan.mjs`，校验来源正文与展示副本的关系、Saved plan 可见前缀、ID 与 null 版本、冻结原测试/DoD/历史条款保全、任务映射、文件哈希和文档限定范围。提交后加 `--committed` 检查实际 Git blob 字节。这里只验证交接材料完整性，不代表功能测试、独立审查或 Chief 确认。

审查者从本分支的精确提交读取完整计划和来源，复核上表与全部原测试映射并记录发现。取得独立方案审查和 Chief 放行后，再开始完整计划中的产品编码；此前的直接实施确认保持有效。
