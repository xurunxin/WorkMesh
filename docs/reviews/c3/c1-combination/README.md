# C3 整合 C1 主线的组合交接

本轮在原 todo、原工作区和原会话分支正常整合 C1 已落地主线。输入 HEAD 为 `7a86ecc46e8fb79f8cf177749f9fef21bd410d0b`；本轮 `tds git ls-remote origin refs/heads/main` 实读 `5b9c76b5f79917697906520edcd6947bfbfa925f`，fetch 后同工具读回一致。整合固定完整主线 SHA，没有把本工作树的 `FETCH_HEAD` 当 main。主线 parents 为 `96e724858e692d262107c34db50b40c3ae7c122c` 和 `81090ec01bcbc84edbe101418d833840999a5326`，tree 与后者一致。完整来源和重叠路径见 [input.json](input.json)。最终提交绑定由平台提交后实读，不猜未知提交；候选 index tree 见 [runtime-input.json](runtime-input.json)。

## 实际整合与边界

四个真实冲突的原字节保存在 [merge-conflicts.zip](merge-conflicts.zip) 和 [索引](merge-conflicts-index.json)，解决见 [merge-resolution.json](merge-resolution.json)：保留 C3 公开只读 GET 与全部七个 C1 Human-only 路由，重生成矩阵为 277 条；路由数量断言使用实际总数，功能开关夹具保留动态注册表数量和 C1 默认关闭断言。没有删断言、提高 timeout 或放宽安全策略。

`server.ts` 自动合并后，C1 注册与 C3 目录同时存在。C1 核心投递/锁/fence/静音/逐条 claim、迁移和个人设置十二个文件与指定 main 的 Git blob 一致；A1 授权文件及身份解析前拒绝段也一致，拒绝仍先于 `resolveCoordinationIdentity`。C3 七个产品和验收路径与输入审核 HEAD 字节一致。逐项证明见 [boundary-integrity.json](boundary-integrity.json)，不以字节相同替代行为验证。

唯一新增行为验收在 `apps/api/integration/configuration-readiness.integration.test.ts`：三种真实有效 Installation Token（首次、已有、过期会话）下，各七个 C1 路由重复请求并混带 Human cookie，共 63 个 C1 提前拒绝；原 A1/C3 18 次拒绝、C3 九次公开读取以及三个正常身份正对照继续执行。逐表内容/数量比较包含新 C1 表；公开读取不写任何表，Human-only 拒绝只增加既有独立拒绝审计，没有身份副作用或 C3 越权。

## 实际检查与来源绑定

15 条原检查的命令、环境覆盖、启动/结束、退出码和源码前后摘要见 [checks.json](checks.json)。完整原件与进程启动记录见 [checks-raw.zip](checks-raw.zip) 和 [索引](checks-raw-index.json)。1391 个受测源码的摘要均为 `74eb55f0e00c87ad8013e76cb234b58eb3c7e6f906642d2bf92705218294bf54`，每条检查前后相同；[source-binding.json](source-binding.json) 分别登记运行工作区与 Git blob 字节，不混称 Windows CRLF 与 LF。运行环境为 Windows、Node `v24.20.0`、pnpm `9.15.4`，独有 PostgreSQL/Redis/RustFS，秘密仅随机生成并注入子进程，不落盘。

| 实际命令或范围 | 实际结果 |
| --- | --- |
| `pnpm check:route-policy` | 成功，277 条路由 |
| `pnpm lint`、`pnpm typecheck` | 各 18 个任务成功，零缓存 |
| `pnpm run test -- --maxWorkers=2` | 1680 通过、2 个 Linux 专属入口跳过；29 个任务成功，零缓存 |
| API build、`pnpm ci:validate` | 成功；本地配置检查不冒远端 RequiredCI |
| 完整 API 集成 | 24 文件，180 通过、1 个真实 MiniMax 用例跳过；C1+A1+C3 权限/公开读/九条预置保存零出站均执行 |
| Worker `stage4-automation.integration.test.ts` | 49 通过、零跳过；包含实际双事务锁等待、撤权零外发、旧 fence、静音、25 条慢 fake 逐条 claim 与 Loop |
| DB `migration-baseline.integration.test.ts` | 22 通过、零跳过；C1 迁移的干净安装、升级、事务失败和重放 |
| 正式 Playwright 定向组合 | `--list` 为 4 项，实际 4 通过、零跳过；初始化前置、C3 两项、C1 一项 |

集成顺序执行、每阶段重置独有测试库；结束集成后才运行 E2E。Playwright 副本仅调整两个端口及测试副本路径；C1/C3 用例原字节不变，断言和 timeout 不变。[runtime-copies.json](runtime-copies.json) 登记源与运行副本，核验器可重建全部运行字节。没有真实提供方/企业微信请求或发布，`RUN_WORKBENCH_LIVE=0` 的跳过不计通过。完整根 integration、其他未受影响 Worker/DB/recovery 和正式全套 E2E 本轮没有重跑、不计本轮通过，范围依据见 [verification-scope.json](verification-scope.json)；最新 PR CI 仍须正常执行。

56 个必要原字节成员逐项对原件核对后归档；认证状态、profile、trace/video、reporter 构建资产和缓存不提交。92 份历史 C3 对照与审批审计原件保持工作区字节及原 Git blob，见 [historical-evidence.json](historical-evidence.json)。旧 `8aee051/c0bb931` 的 47 项对照没有重跑或改为当前组合；原审计 153 成员、违规事实、逐子路径/回执缺口均保留原义。新成功不追认历史清理。

检查结束后，因临时配置清理被拒，只给根 `.gitignore` 增加本轮配置的精确路径，防止平台全量提交时收录运行副本；没有改该被拒文件、目录或共享 Git 配置。这一后续元数据差异单独见 [post-validation-metadata.json](post-validation-metadata.json)，原 15 条检查始终绑定受测摘要，不冒作最终忽略规则已参加旧运行。已实测 `git check-ignore -v`，并在该元数据调整后运行本地 CI 结构检查成功。所有产品运行源码未发生后续变化。

## 资源清理、拒绝与保留

完整归属、镜像、创建时间、挂载和服务日志见 [resources.json](resources.json)，收尾见 [cleanup-summary.json](cleanup-summary.json)。三个本轮独有容器均先 stop、保全脱敏日志，再按 ID `docker rm -v`；各 stop/remove 退出码为 `0`，按完整 ID 复查不存在：

- PostgreSQL：`b89007a51c5c769d4572a87af53e9d438492f0e1c0895d69d70c843fd55e8a86`
- Redis：`778044b1b870773f579631576393bdc8a549c590205ad30d9f43d9d718e70a01`
- RustFS：`37fe472ff9eadf1cef2eaa208c9eb750e4f4da0eb12aec82aa40cdcb5ed77c84`

没有创建专用镜像、Docker 卷或网络，没有 global prune；共享资源和业务数据未操作。控制进程 `42204` 与独有端口收尾盘点为空，见 [post-run-processes.json](post-run-processes.json)。没有实时抓到 E2E 全部子 PID，不冒完整清单。环境只对子进程生效；当前构建、已有 `.next` 和旧恢复/worktree 保留，尚不具备实际 main 合入且无人引用的清理证明。

两个**全新、不同的独立目标**各正常尝试一次清理，均在 `CreateProcess` 前被自动审批拒绝，理由仅 `blocked by policy`。两个目标全部保留，不改工具/命令、拆分、删除、移动或恢复；输入中的预检也未执行，不冒预检或清理完成：

| 保留目标完整路径 | 原 callID 与输入/返回 UTC 时间 | 原件 |
| --- | --- | --- |
| `C:\Users\xurx\.tds\workspaces\01a11890-f4de-7106-b64d-e1b2c0d4608e\.tmp\c3-c1-combination-01a11890` | `call_f46dfcf7b46c4c748f3d33522a375848`；`2026-10-08T12:58:54.641Z` / `12:58:54.731Z` | [拒绝绑定](cleanup-audit/refusal.json)、[完整输入](cleanup-audit/refusal-input.txt)、[完整可见输出](cleanup-audit/refusal-output.json) |
| `C:\Users\xurx\.tds\workspaces\01a11890-f4de-7106-b64d-e1b2c0d4608e\playwright.c3-c1-combination.config.ts` | `call_b992d8193b7041fc94906f0879543102`；`2026-10-08T13:00:42.404Z` / `13:00:42.500Z` | [拒绝绑定](cleanup-audit/config-refusal.json)、[完整输入](cleanup-audit/config-refusal-input.txt)、[完整可见输出](cleanup-audit/config-refusal-output.json) |

拒绝进程没有启动，退出码为 `null`；底层独立 callID 未暴露，记录真实外层 callID。原返回自身有运行时截断，未取得审批器内部更详细文本，不能补猜理由。第二个配置文件不是第一个目录子项，没有把同目标改方式操作写成独立目标。原历史六个被拒目标本轮也没有任何删除/移动/恢复。清理未全部完成，保留项交 Chief 处理审批门禁，不继续重试。

## 复核与后续门禁

提交前运行 `python -X utf8 docs/reviews/c3/c1-combination/verify-evidence.py --index`；平台提交后改为不带 `--index` 绑定实际 HEAD。它核验受测及后续 Git 元数据差异、92 份旧原件、56 个归档成员与运行副本；字节核验不等于独审或审批合规。

当前组合、四处冲突解决、新增边界断言及两次拒绝保留记录回交定向独审。C1 的 PR206/CI391 不替代 C3 最新 PR RequiredCI。当前 PR 门禁、Chief 确认和实际 main 合入均未完成，不以此前独审通过或本地成功声称已合入。
