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
