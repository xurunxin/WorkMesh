# 独立部署准备与资源保全

本轮仅只读观察，未启动部署、安装依赖、调用产品接口或清理任何资源。[现场观察](input/environment-observation.json) 保存实际命令/退出/runtime、容器 ID/state、六域 Env 白名单及卷级空间；[工作区盘点](input/workspace-inventory.json) 不跟 reparse/junction，分列普通文件逻辑长度和 Windows device/inode 身份去重长度。两者均为活动机器采样，不是全机一致快照，也不是物理释放。

## 当前资源与保护

本卡 runtime 容器/镜像/卷/网络/进程尚为零；当前只有本卡规划目录与 ADR 提案。已有 `workmesh-api-1` 停止且六 feature=false，不改变它的配置或状态。M5 停止容器、存储、数据库/桶及当前恢复目录继续保护，不能从 Done 推删除或重用许可。其他容器由现场表只读列出，不停止或修改；无本卡资源的 cleanup 结果是“未执行”，不是释放了空间。

已合清理来源为 `docs/reviews/cleanup/2026-10-11-worktrees/` 的 mechanism、cleanup-rules、三报告、protected-paths 与 followup readonly-boundary/blocked-cleanup-old；完整 blob 指纹见 source-manifest。持续机制是只读工具＋规则，没有 daemon。旧清理树9个只读对象与 G1/D0/C3拒绝目标及父目录继续保护，旧node_modules/.turbo/typecache/RAW/trace恢复输入不动。

当前工作区无 node_modules；不为本轮规划安装。源码、锁及 M5 已有 runtime/evidence 优先用不可变 Git/blob 或已合 ZIP member索引引用；不重复归档构建原件。不修改immutable hardlink成员，未来输出使用新的独有名字。逻辑长度、按身份去重的逻辑长度、卷可用空间、可归因物理释放分别记录，未测物理释放为null。

## 实现后的固定准备方案

正式独审并确认后，执行者在本会话工作区建立独有部署资源账本，以当前会话ID及actual候选短head生成 `m4-<标识>` 前缀，先登记绝对目录、compose project/name、镜像来源/digest、卷/network ID与label、DB/桶、预计端口、进程owner和恢复引用，才创建。服务/模型绑定127.0.0.1，端口由系统分配并回写实际地址；不占他人listener、不重用M5卷/服务。复用锁定的依赖/本机native OpenCode及Pi，不新增安装OpenCode/登录/外部账号。

用 `docker-compose.lite.yml`/既有镜像来源准备独有 PostgreSQL、Redis和测试对象存储容器，API/Worker/MCP/Runner以当前源码独有进程运行。服务配置只在本卡私有运行目录、临时进程env中持有，不写仓库或聊天；账本记录变量名及脱敏endpoint，不记录密码/token/cookie/masterkey。受控模型公用fixture材料沿源码，不引入真实模型/provider连接。Human准备通过自己独有部署的bootstrap/登录和既有Human REST配置，Human cookie不进入Agent、MCP或Runner。

API及消费者使用一致六域全开：`WORKMESH_BETA_PLANNING`、`WORKMESH_BETA_TEMPLATES`、`WORKMESH_EXPERIMENTAL_AUTOMATION`、`WORKMESH_EXPERIMENTAL_AGENT_LOOPS`、`WORKMESH_BETA_COSTS`、`WORKMESH_EXPERIMENTAL_A2A`=true。C夹具沿 `createMcpCoverageFixture` 明确额外 `WORKMESH_BETA_COORDINATION_MCP=true`，这是已合核心资格前提，不是新增领域。其余experimental如external-webhooks/outbound等保持false；通知/effect使用现行fake adapter不真实外发。逐域disabled组在新的API实例注入一项false，其余配置相同，证明结构化 `FEATURE_DISABLED`，默认全关闭组也实际调用拒例。

空数据库名固定有 `test` 边界，`RUN_INTEGRATION=1` 及 `DATABASE_URL` 只指本卡库，先运行既有 `require-integration-env` 保护，再 migrate/seed。root integration的test:reset会删库内容，仅对该独有空库使用。真实Journey固定两个Team、多Human、合法和跨scope project/item E、当前C、Loop origin E与target E分离、A2A task自身E；先Human正对照与fixturepolicy准入后才运行模型脚本。Loop生成target Session无项目归属照现行源码，项目Rollup/Health正例由另一project/item E承担。

native OpenCode定位实际native executable，记录hash/version/help；私有XDG/APPDATA/config及禁compatibility导入，禁外部modelsfetch，保持用户配置/daemon不动。沿M5已有driver使用ownedstdin、UTF-8 Buffer.concat、模型完整原HTTP实收及退出/listener证据；Pi走真实runner不是仅mock注册。未具资格/客户端/凭据时明确失败或缺口，真实Secrets缺失只通过团队密钥授权渠道解决，不聊天索密。

## 运行、恢复及收尾

每次运行账本先保存源码/输入前fingerprint与状态，后保退出/runtime/stdout/stderr/数量skip/首败/DB事实、进程/PID/listener/容器实际状态与后fingerprint。按阶段分开Human准备、协议夹具、真实消费者模型实收、fake provider与特权DB故障；不同输入或失败不合并回执。恢复时用同准确Session/token/occurrence/checkpoint及持久事实，不生成新key盲重放unknown，也不清原失败恢复输入。

收尾先脱敏保全必要证据与内容可达来源、记录owner已退出和listener关闭；只删除本卡已授权、闲置、无活动及恢复引用的精确目标。不做global prune、不清共享store/image或其他任务。Windows递归前核resolved绝对workspace目标、link本体/目标、逐path保全及活动/恢复引用；失败/自动审批拒绝停止原目标，保原输入输出及实际exit，不Force/改ACL属性/换工具/拆分/move或父删绕。已合worktree只有actualmain/保全齐/无引用才成为候选，当前恢复目录保留。准备清理预检和必要保全先提交，再执行逐目标；physicalNetReleased不可证明则null。
