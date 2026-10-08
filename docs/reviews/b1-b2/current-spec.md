# [B1/B2] 可恢复连接器：稳定请求身份与完整协议验证（零迁移）

来源卡：[#5](todo:ti53hOGbvnBNrvjXXveGO)；来源 updatedAt：2026-10-07T15:23:22.528Z；原文 UTF-8 SHA-256：`84a93568e1b56cb16a6a2c3957b004188558d01266fc96396eec1d609afafebd`。完整原文与读取来源见 execution-inputs.json，非事务快照。

withPlan: true；owner：B1/B2 执行者；源状态：todo；同步：待Chief读回核验。

本批仅用 Todos 编排与仓库保存规格及证据，替代真实WorkMesh双轨记录；其余领域/安全/测试规则不变。当前G1已done，最新主线含最终证据；每次开工仍核验最新main与输入差异。R1完成独审、必需检查及合入后才由Chief放行受影响实现，不能以本文件存在当成功。

## 冻结接口与阶段

同一纵向交付吸收 #6：敏感 pending 完整保留 wmp_ 配对码，发送前独占建立身份，POSIX0600/Windows 当前用户 ACL 实测。全部 discovery、指纹、Skill 原始字节/哈希/签名及 initialize→verify_connection→get_workmesh_context 身份、能力、authenticated_credential/current-credential 验证通过后才秘密存储和正式配置原子替换；失败保留旧配置并补偿新增秘密。重放不承诺重新验证撤权。

## 定向验收责任

断网/丢响应/发送前后崩溃与两进程竞争均同 key/body/context；同 key 异体拒绝；陌生 claimant 无令牌；窗口外/密文擦除拒绝；服务端/客户端重启同响应；错误 Team/principal/profile/Skill/能力/过期/撤权/overlap 零正式写入；提交阶段崩溃和秘密写入/rename 失败补偿；stdout/stderr/config 无明文令牌，pending 允许配对码但 ACL 正确。

测试目标：`apps/connector/src/connect.test.ts`（待创建）。九类适用性、全部原测试/DoD去向见 test-coverage.json；未运行不填通过。

## 完整任务正文

## 来源与目标
来源：原 #5 B1、#6 B2 及 #19 F01 的已批准修订。用户批准合并为一个可执行连接器纵向任务，内部保留持久化与协议校验检查点；旧的 B1 可独立单发、pending 不含秘密、两项校验后先写正式配置等互相冲突条款已撤换。
服务端已有加密重放/擦除与稳定身份匹配；事实位置来源原 P1，实施以审核冻结后的 P1 表为准。不新增服务端重放表或第二套 pairing 密文表。

## 交付物与提交顺序
1. 首次网络发送前，在配置目录原子持久化随机 Idempotency-Key、包含完整配对码的精确请求 body、origin、user-agent；并发启动取得同一 pending 身份，后续运行原样重放。
2. pending 是敏感材料，不含安装令牌，不入库、不进日志/工件。POSIX 0600；Windows 明确定义并验证当前用户专用 ACL，不能只用 mode=0600 自称安全。先临时文件再原子替换，崩溃不留半记录。
3. 收到安装令牌后先验证指纹；在内存中完成 discovery、Skill 原始字节/LF/哈希/签名，以及 initialize→verify_connection→get_workmesh_context，精确校验 Team、principal、profile、Skill、capabilities、authenticated_credential，拒绝误用旧 overlap 凭据。
4. 全部验证通过才写客户端秘密存储；正式配置仅保存秘密引用。定义秘密存储与配置原子替换的失败补偿，任何失败保留原配置与原引用。
5. 一个可执行命令承担原七步中全部校验，用户流程收敛为两步；输出可粘贴的无秘密客户端配置。配对码使用直接输入/扫码，不用 URL fragment，不削弱 bearer 熵。

## 边界
服务端不加列、不改凭据生命周期/重放窗口，换新 key 仍被拒；不改限流架构。stdout/stderr/普通配置/工件不含明文安装令牌，秘密存储是令牌唯一持久化落点；配对码只在受保护 pending 中。无源码 Lite 设备的版本化分发与安装由 [#20](todo:JfGwKk3prfIie6X2u2J51) 负责，本条不假称仓库 pnpm 命令等同发布。
既有重放命中可返回旧密文令牌且不重新检查撤销；验收是当前身份验证拒绝已撤销/过期凭据并绝不写新配置，不要求服务端重放凭空改变行为。

## 合并后的完整测试清单
- [ ] 发送前崩溃、发送后崩溃及服务端/客户端重启后，同 pending 身份在有效窗口可拿到同一凭据。
- [ ] 同 key 改 body 冲突；新 key 仍按既有规则拒绝；另一 claimant 仅持原配对码与公开 connection id 不得取令牌。
- [ ] 窗口外/过期密文擦除后拒绝；并发启动只产生同一 pending 身份；崩溃不留半份记录。
- [ ] 既有 stage5-agent-connections.integration.test.ts 的重放同体断言不回归。
- [ ] 黄金路径完整端到端，两步流程可用且协议校验一步不减。
- [ ] 指纹不符、签名错、Skill 字节篡改、错误 Team/principal/profile/capabilities/authenticated_credential、误用 overlap 凭据均拒绝且不写配置。
- [ ] 已撤销/过期凭据的当前身份验证拒绝，绝不写入新配置。
- [ ] 配置替换中途被杀或秘密存储/配置写入失败，既有配置及秘密引用完好。
- [ ] 明文令牌仅落秘密存储；配对码仅落受保护 pending；stdout/stderr/普通配置/工件无秘密；POSIX 权限和 Windows 实际 ACL 验证。
- [ ] 同配对码再次运行复用 pending，合法重放幂等；直接输入/扫码不削弱熵。

## DoD 与依赖
上述断言全绿、零 schema 变更、pnpm lint/typecheck/test/test:integration/test:e2e 全绿，ADR 0043/0046 实质要求未削弱；规范、测试映射与证据提交仓库。原 B1/B2 的可执行收益在同一命令中验收。
依赖：P0、G1、P1、R1；blocks #7 B3，进而 [#20](todo:JfGwKk3prfIie6X2u2J51)。

## 执行依赖与放行

requires：#1、#2、#18、#3；最终验收 additionally requires：无。

本todo原问题已有用户13:34–13:36明确答复，详见末尾同步；依赖及审查门禁保持。

DoD：上面完整源DoD与定向断言全部满足，适用必需检查成功，证据落盘、独立复核及Chief确认；不得以接口存在或历史CI冒称新组合已验收。阶段owner由Chief派发前落实到实际执行者，角色不冒称已任命某agent。

## 总管同步与当前门禁（2026-10-08，Asia/Shanghai）

来源：已独审并合入的 PR203，main `9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`，第二 parent 为审核 head `550dead055689154359a3406dfce4f0c91c1dad3`，两者 tree 一致；该 head CI383 十项检查全部成功。G1/P1/D0/R1 已完成，本卡仍按上文 requires、阶段验收及授权边界执行。正文中的源状态、待同步说明是文件生成时的历史元数据，不代表当前门禁仍关闭。
本卡完整规格来自 `docs/plan/activation-task-specs/05.md`；完整原文快照为 `docs/reviews/r1/execution-inputs.json`，逐类测试/原测试与 DoD 去向为 `docs/reviews/r1/test-coverage.json`，阶段和依赖映射为 `docs/plan/activation-task-specs/index.json`。总管同步前复读本卡全文与源哈希一致；仓库索引的 syncStatus 保留生成时状态，不声称已写回仓库或真实 WorkMesh。新增范围、真实方案分歧、权限或仓库外发布仍须另批。

## 用户原问题答复同步（2026-10-08 13:39，Asia/Shanghai）

来源：本todo原问题卡13:36用户答复：「系统秘密存储（推荐）」「本地预期清单（推荐）」「连接器自有配置（推荐）」。按原卡选项说明采用Windows Credential Manager/macOS Keychain/Linux Secret Service，缺后端须失败、不回退明文或仅内存store；无秘密的本地预期清单用于校验Team/principal/capabilities/profile/Skill；正式配置由连接器自有且只存秘密引用，启动注入和无秘密客户端片段。全部协议/身份验证仍在秘密及原子正式写入之前，崩溃补偿与旧配置保留测试不削弱。系统秘密存储的目标平台实际验证与无源码分发责任按#20已定设备矩阵执行，未定矩阵不冒完成。

本卡源SHA/PR203同步状态保留历史，不冒当前全文哈希或仓库已同步。当前main包含D1a actual1078bbc，开工再复读最新main影响，正常整合已落地增量。独审前须提供完整中文计划文件和当前savedplan来源/精确正文hash供另一agent读取，仅平台doc链接不能代可审全文；允许仅计划文档前置提交，产品编码仍须规划独审及Chief确认。实施前同步受影响ADR/仓库spec、保留历史源与完整验收，未提供的平台版本字段如实null不猜、不为自引用重复存新计划。

## 独立方案审查闭合与实施放行（2026-10-08 16:39）

来源：本todo平台独立审查16:38明确「本轮计划文档可以合入；取得Chief放行后，可按既有用户实施确认继续实现」，16:39生产者未改文件。审查对象为 `b80593e9918ac7ce05465fd0ac640c809753ac5a` 中完整 `docs/plan/connector-recovery.md` 和 `docs/reviews/b1-b2/` 来源/测试映射。用户13:46已直接确认实施；Chief按本批持续推进委托放行同todo继续产品开发，不再次确认三个已答选择，不提前合入仅文档或把整项置done。原规范/十项原测试、适用必需检查、成果独审、最新RequiredCI及实际主线落地后置门禁保持；当前文档检查不冒功能验收。开工核实最新main正常整合；新增TA路线图不扩张本卡范围。

## 用户执行收尾清理要求（2026-10-08）

用户原话：「让各个任务注意执行完成后做好清理工作，如测试过程中产生的docker容器和镜像，合并后的worktree，减少不必要的垃圾文件残留」。

每轮先登记本任务创建的容器、专用镜像、测试卷/网络、服务进程和临时路径，测试结束或失败退出也进行有归属的清理，并恢复临时环境配置。只清本任务可确认不再使用的资源；共享基础镜像、其他构建服务、持久业务数据不得全局prune。清理前保存必要脱敏日志、失败现场和验收证据；已提交证据不作垃圾删除，未提交恢复工作也须先保全。

合并后的旧worktree仅在实际main落地、所有待保留成果已提交/取回且没有活动构建引用后移除；当前构建目录不提前删除。核实worktree绝对路径、仓库归属、dirty状态和引用，先用git worktree正式管理命令，禁止force清理未知未提交文件或混用shell批量删路径。Windows递归操作先确认绝对目标处于指定工作目录内。

交付须报告已清理资源ID/路径、实际操作及结果、保留项与原因；尚不具备合并后清理条件时明确待办，不冒清理完成。清理不代替测试/独审/CI或合入证明。
