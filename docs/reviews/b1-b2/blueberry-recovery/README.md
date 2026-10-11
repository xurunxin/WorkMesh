# Blueberry 换机恢复与接续报告

本报告接续用户 2026-10-11 18:37 恢复授权及 19:05 长路径修复反馈。原方案、三项已确认选择和实施授权保持；本轮使用 Todos＋仓库记录，不创建真实 WorkMesh 双轨记录。历史检查、失败、跳过和审查报告不改写。

## 工作区准备诊断

- 用户报告在 Blueberry 执行 `git config --global core.longpaths true` 后读回 `true`。本构建再次实际核验：`C:/Program Files/Git/cmd/git.exe`，版本 `2.52.0.windows.1`，有效配置来自 `C:/Users/xurx/.gitconfig`，值为 `true`。
- 本地守护日志在 **11:13:01.076 UTC（19:13:01.076 上海时间）** 明确记录 `Worktree ready`，随后模型执行器进入本目录，初始 `git status --short` 为空。原 18:50/18:56 的失败均发生在模型启动前，不能列为产品验证失败。
- 历史平台聊天的两次退出码均为 128。平台 `conversation` 原样返回的历史正文仍被截断，分别标省 94187/85515 字符；本机 daemon 未记录这两次失败的完整错误正文。`available-conversation.txt` 是接口**可得的截断结果**，`workspace-daemon.log` 是本地可得的准备日志。没有完整原始尾部，也没有倒填首个失败文件路径；18:56 的 `Filename too long` 来自用户提供的明确反馈。
- 本轮首个实际可读错误是平台只读 Git 工具的 `git reset failed (exit 128): fatal: Unable to create 'I:/tds_workspace/workspaces/DzkLDn6UW-IbfoTJzN9Ro/repo/.git/index.lock': File exists.`。主仓库锁为零字节，最后修改时间 10:41:15 UTC。它与当前 linked worktree 的 index 分开，未删除、未改主仓库配置。采样时曾存在其他 Git 进程，之后一次查询为空；单次进程查询不证明锁可安全删除。
- 可操作处置：长路径修复后的同一工作区已准备成功，无须重复创建构建或副本。若需恢复平台只读 Git 接口，应由平台维护方核主仓库锁的所有者与活动消费者后处理该准确锁；本 agent 不修改共享只读 cache。
- `environment.json` 记录真实卷可用量、登记、有效配置、权限和准确来源。C/I/X 均有可用空间；没有将逻辑长度或可用量差冒作物理释放。没有扩大清理范围。

## 成果恢复与主线整合

先用现有 `gh` 的已登录状态只读查询两个准确远端 ref，再在当前工作树执行不使用凭据助手的匿名 fetch：

```powershell
git -c credential.helper= -c credential.interactive=false fetch --no-tags origin main tds/conv-01a11ac2-a0a9-7ef6-bd48-3bb37c21a301
git merge --no-commit --no-ff 5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19
```

实际远端与取得的对象一致：main 为 `20fb7358f6c6818a452e78c1fd3da096cdc31286`；历史产品 head 为 `5a11c2a2e4da0d00f79e40d59a280bc3eb7a0d19`；共同祖先为 `18252ba8761aa810c3fd12d31ecae83e8b24d985`。不将共享 FETCH_HEAD 当 main，不从 main 重写连接器，不另建/切换分支。交付分支为 `tds/conv-01a12a8e-cadc-7c05-a07a-1d6a77c8f64c`。

正常合并只有两个内容冲突：`.gitattributes` 同时保留主线清理归档原始字节规则与连接器 LF 规则；`scripts/ci-policy.test.mjs` 同时保留主线独立 YAML 自举测试与连接器矩阵拒绝失败/跳过测试。已审连接器源码未重新编码。协议/API 注释及 CI、锁、测试接线正常合并；Schema、迁移、API/MCP/contracts 产品源码相对准确 main 没有本轮新增差异。`source.json` 保存运行前工作树原字节 SHA-256 与 index Git blob，包含最新主线消费者。

## 验证与门禁

实际新机结果、每 OS 命令、精确 CI head/PR/运行链接及清理回执将在同目录增量记录。旧原件留在 `docs/reviews/b1-b2/`，不能冒本轮新组合通过。

新机当前 PATH 为 Node 25.4.0、pnpm 11.25.0，与仓库 Node 22.19.0/pnpm 9.15.4 不一致，因此不能直接用 PATH 的 pnpm 安装锁。当地共享 npm cache 为 `X:/packages/npm`；已通过 npm exec 取得 pnpm 9.15.4，复用其共享 cache 中的入口。任务依赖采用共享 CAS、任务独立 virtual store 和 copy 导入，不复用可写 node_modules；新 runtime、依赖和测试资源须登记归属后定向收尾。

当前 Windows 进程未提权，不能本机创建第二用户；不能以历史三项通过代替两项实际跨用户测试。macOS 不在此 Windows 主机，必须由真实 macOS runner 执行 Keychain 与平台测试。三 OS 原生矩阵、当前最终 head 的 Required CI、正式成果独审/Chief 确认及真实 main 落地全部保持；没有提前 Done、合入或推进 #7/#20。

## 清理

当前工作树受保护；未删除主仓库、共享 store、用户配置、业务数据或任何历史拒目标。未创建容器、镜像、卷或网络。诊断采样首次逐文件启动 Git 耗时过长，已按准确进程身份停止该采样，改为一次读取 index；后续采样成功，未修改产品。资源收尾以新增运行账本和准确路径为准，保留失败证据后才清理本任务可确认无消费者的临时资源。

当前报告仅证明准备恢复与成果取回，不声明产品完成，不声明历史失败日志已完整取得，也不声明三 OS/最终 CI 已成功。

## 首轮 PR 原生 CI 实际失败与修正

已推送恢复合并 `718350f83d4a74edca33051e939204e90bf89e4c`（parents 为 main20fb7358 与旧产品5a11），建立 [PR221](https://github.com/xurunxin/WorkMesh/pull/221)，触发 [CI435](https://github.com/xurunxin/WorkMesh/actions/runs/38135325940)。首次创建 PR 请求发生 TLS bad record MAC；只读确认无现有 PR 后重试创建成功，没有重复卡或工作树。

CI435 的 Linux 原生平台及单元已成功，macOS 已实际执行，Windows 尚卡在 checkout。三份完整失败 job 日志通过现有 gh 只读 API 取得，保存于本目录 `ci435-*-first-failure.log`；它们属于 **CI435**，不冒原 18:50/18:56 平台准备日志。

- Windows runner 的准确首败为 `docs/reviews/a2-backend/runs/a2-backend-491ca462/playwright/root-mixed/output/human-reflow-project-rail-and-shell-reflow-at-1440x1000-authenticated/attachments/project-rail-1440x1000-screenshot-cf8819a7e9dd171df25684d0d3da1ce55860688a.png: Filename too long`。新增检出前的 Windows 专用长路径设置与读回；仅作用一次性 CI runner，不改变 Blueberry 或共享主仓库配置。
- macOS 5 项中 Keychain 跨进程存储项通过，其余 4 项在祖先 ACL 获取时报 `CONNECTOR_UNSAFE_ACL`。Apple 的 [acl_file.c](https://github.com/apple-oss-distributions/Libc/blob/main/posix1e/acl_file.c) 和 [filesec.c](https://github.com/apple-oss-distributions/Libc/blob/main/gen/filesec.c) 表明：现存对象没有扩展 ACL 时，FILESEC_ACL 属性查询返回 ENOENT，acl_get_file 返回 NULL。修正仅接受 NULL/ENOENT 且重新 lstat 证明 dev/inode/owner/mode/ctime 未变的目录；其他读取失败仍拒绝。有 ACL 的修改型 allow 检查保持，并新增 macOS 实际无 ACL 正例、delete_child ACL 拒例及移除 ACL 后恢复正例。不以放开祖先权限解决。
- 灾难恢复镜像构建在 node-pty 安装时失败：`Could not find any Python installation to use`。六个全 workspace 安装的 production/Lite **build stage** 补 python3/make/g++，工具不进入原独立 runtime stage。四个开发镜像同样安装了含 API 的 workspace，API 的测试依赖新增连接器后须补其 manifest 与 native 编译工具。没有新增生产服务或发布动作。

本机 Node 22.19.0 ZIP 已按同版本官方下载清单验证 SHA-256；pnpm9 实测共享 store 为 `X:/packages/pnpm/v3`，新机冷缓存首次离线安装失败 `ERR_PNPM_NO_OFFLINE_TARBALL`，原日志保留。随后冻结锁、copy 导入、独立 `.tmp/workmesh-virtual-store` 的连接器依赖安装成功。后续检查与资源账本另列，未用未提权机器冒第二用户通过。

## 第二轮问题、日志归档与本机定向结果

CI435 Source gates 在连接器 ANSI 大矩阵单个同步测试上触发原有 5000ms 超时；完整失败日志保留。将同一矩阵拆成 2 种凭据 × 7 种控制串的独立测试，并单列控制载荷验证；所有插入位置、chunk 边界和原断言完整保留，不改产品、不扩大超时。连接器单元总数由 43 增至 57，独立客户端输出套件 19 项通过。

[CI436](https://github.com/xurunxin/WorkMesh/actions/runs/38135777835) 针对 `27b87b1d97707c41f136d86b588d756321267b53` 在 Select required jobs 的 `git diff --check` 失败：新取得的原始日志含尾随空白。测试/安全断言没有被执行或跳过冒通过。改用本目录独立 ZIP＋内容寻址索引，逐字节读回验证后才移除已保全日志文件，源码格式门禁保持原规则；CI 首败、后续本机日志与早期包含文本换行转换的保存版本全保留。`ci-job-log-sources.json` 另绑定通过 GitHub job logs API 重新取得的**原始 stdout 字节**，不将早期文本转换副本冒原字节。复核入口：`node docs/reviews/b1-b2/blueberry-recovery/archive-logs.mjs`；索引 logicalPath 保留旧日志路径。

本机首轮 `local-checks.json`：lint/typecheck/build 成功，单元 8 通过/35 失败，平台 1 通过/4 失败。首轮期间同时修订 CI/macOS 文件，结果报告中的 changedAfter 如实记录；不能当最终源码稳定运行。默认 APPDATA 的新目录被 Codex MSIX 重定向到 `C:/Users/xurx/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Roaming`，而 realpath(APPDATA) 仍为原父目录。实际 AppData ACL 包含非本人 App 容器 SID 的修改权限，产品拒绝符合要求；测试 cleanup 的预先边界也拒绝该创建后的新物理路径。原 ACL 保存在 `blueberry-appdata-acl.json`，没有更改用户配置、ACL、属性或信任白名单。准确 39 项目录及两个诊断探针另存 `first-run-cleanup.json`，校验绝对路径、原账本和无 reparse 后定向移除，未删父目录。

第二轮 `local-02/` 对全部运行文件重新捕获原字节摘要，源码前后差异为空。由连接器实际 prepareDirectory 新建当前用户专用 `C:/Users/xurx/workmesh-b1-b2-blueberry-01a12a8e`，只向检查子进程注入 APPDATA，不改全局环境。本轮 lint/typecheck/build 成功、57 单元全通过；平台实际 Credential Manager、ACL 与 CLI 三项通过，缺第二用户两项仍失败。未提权、未获取账户密码、未模拟其他用户。`run-source.json` 顶部 head/mergeHead 是初始采样的历史字段，运行文件 rawSha256 是第二轮重新采样，local-checks 的零变化按这些 rawSha256 比较；不将顶部历史字段冒新提交身份，最终提交与 CI 绑定另补。
