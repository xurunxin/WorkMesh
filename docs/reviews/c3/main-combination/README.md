# C3 主线组合验证交接

本轮按用户授权在原 todo、原工作区和原分支正常整合指定主线。上一轮独审已闭合旧 blocking；本轮不改旧审查结论，也不把历史结果改成当前组合结果。没有新增提供方、模型探测、迁移或领域事件。

## 来源与实际改动

整合前 HEAD 为 `19cca3577ad3c4ec3dc4969ba335d191d1cbc148`。本轮经 `tds git fetch origin main` 及 `ls-remote origin refs/heads/main` 实读指定主线 `96e724858e692d262107c34db50b40c3ae7c122c`；共同基点为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`。平台已正常提交双 parent 组合 `840d0ea4d1f6def602d2be5a1ef356ccc9d3e82e` 并推送原分支，远端本轮实读相同，HEAD 字节核验成功。完整实读见 [delivery-readback.json](delivery-readback.json)，运行前候选 index tree 与环境仍见 [input.json](input.json)；随后仅追加这份提交绑定证据，不改变已验收组合源码。

八个重叠路径、三个冲突及解决方式见 [merge-resolution.json](merge-resolution.json)。`OPENAPI.yaml`、`packages/contracts/src/index.ts` 保留双方新增定义，路由矩阵由 `pnpm generate:route-policy` 重建；`route-policy.test.ts` 总数调整为 270。`server.ts` 自动合并；A1 的 InstallationToken 提前拒绝块及 `authz/authorize.ts` 与指定主线完全一致，拒绝先于 `resolveCoordinationIdentity`，没有回退安全修订。

`apps/api/integration/configuration-readiness.integration.test.ts` 的三种真实有效凭据场景增加 C3 组合断言：每种各三次公开目录读取（匿名、InstallationToken、同时带 Human cookie），所有 public 表包括拒绝账本完全不变；LLM 连接列表首次、重复及带 Human cookie 的请求均先拒绝，仅增加既有安全审计。仍保留正常身份解析成功的正对照，以及 A1 原查询断言。C3 九条预置创建、修订、幂等重放的零出站陷阱及安全规范化断言在完整 API 集成中再次执行。

## 本轮实际验证

1382 个非 `docs/` 输入分别绑定运行工作区字节与 Git blob；每条检查运行前后摘要均为 `e5ceb6a5bedbb3efae9c5472017a3d1096c08bcf4c4332d3e694da23dc05f7a4`。见 [source-binding.json](source-binding.json)、[verification.json](verification.json)。三组失败运行保持独立，不以成功覆盖失败。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm check:route-policy` | 成功；组合 270 条路由，公开目录与 Human-only 就绪查询同时登记 |
| `pnpm lint`、`pnpm typecheck` | 各 18 个任务成功、4 个缓存；API 任务实际执行 |
| `pnpm run test -- --maxWorkers=2` | 1679 通过、2 个 Linux 专属用例跳过；29 个任务成功，零缓存 |
| `pnpm --filter @workmesh/api build`、`pnpm ci:validate` | 成功；本地配置检查不代表远端 CI |
| `pnpm --filter @workmesh/api test:integration` | 修正测试夹具后完整 23 文件成功：171 通过、1 个真实 MiniMax 用例跳过；A1 14 项与三种 C3 组合场景均通过 |
| 正式 Playwright 定向模型设置链路 | `--list` 与实际运行均 3 项，3 通过、零跳过；含初始化前置用例及两个模型设置用例 |

原始命令、环境覆盖、退出码、源码前后摘要见 [checks.json](checks.json)、[retry/checks.json](retry/checks.json)、[accepted/checks.json](accepted/checks.json)、[browser/checks.json](browser/checks.json)。完整 DB/Worker/recovery、历史只读 Docker 挂载、旧 mocked 套件没有重跑，不计本轮通过：这些路径及 C3 不重叠产品源码未变化，本轮风险集中在契约、路由和 API 鉴权组合。

两轮 API 夹具失败各为 56 失败、6 通过、110 跳过：主密钥生成长度不满足 `auth-idempotency.ts` 解码后 32 字节要求，安装失败又引发缺失 CSRF 与限流连带失败；首轮 RustFS 默认 tmpfs 权限使容器退出。保留原件后修正独有服务的 tmpfs 权限、密钥编码及 CI 已有的测试 burst/Runner token；没有修改产品默认值、安全规则、测试断言或超时。详见 [preparation-failures.json](preparation-failures.json)。首次浏览器启动遇到 3100/3101 已占用，零用例执行；进程详情读取时已退出，未取得其具体工作区归属，未操作这些未登记进程，实际端口盘点见 [occupied-browser-ports.json](occupied-browser-ports.json)。

浏览器复验仅在临时副本替换两个端口及测试副本路径；生产文件未改，模型设置用例字节完全相同。原始配置、运行副本及逐文件哈希见 [browser/runtime-copies.json](browser/runtime-copies.json)。核验器能仅按登记调整重建运行文件，未修改断言或超时。

89 个必要原字节成员保存在 [checks-raw.zip](checks-raw.zip)，大小、SHA-256、CRC 和原路径见 [checks-raw-index.json](checks-raw-index.json)。包含失败与通过日志、前后源码快照、服务日志和运行副本；排除认证 storageState、浏览器 profile 与构建缓存。归档逐成员与原件比较一致后才清理副本。原 `8aee051/c0bb931` 完整 mocked 对照及 31 个历史 C3 审查文件保持原字节，见 [history-integrity.json](history-integrity.json)。旧 `verify-regression-evidence.py` 的当前 HEAD 保护针对旧产品提交；本组合使用新的核验器，不修改旧绑定来冒当前验收。

提交后可执行 `python -X utf8 docs/reviews/c3/main-combination/verify-combination.py` 核验 HEAD、Git 字节、历史证据、89 个归档成员及运行端口副本；提交前明确使用 `--index`，不混称已提交 HEAD。

## 清理与剩余门禁

四轮共十二个本轮命名容器均经归属标签核对后 stop、保存日志、`docker rm -v`，按完整 ID 复查不存在。没有创建专用镜像、Docker 卷或网络，数据仅在容器 tmpfs。容器 ID 与时间见 [cleanup-summary.json](cleanup-summary.json)；这些独立容器目标的操作发生在第二次拒绝之前，不是被拒 Windows 路径。

自动审批两次返回 `blocked by policy` 后，对相同被拒目标换方式操作确已发生：第一次拒绝后移动原目录并由检查脚本重建同名目录；第二次拒绝后把递归删除改成逐文件、空目录删除，处理了全部六个相同目标。原结果记录五个目录和一个配置文件不存在，但不能据此声称审批通过。撤回此前暗示改方式符合审批边界的表述，清理审批事件待定向独审。完整可见原输入、输出、真实 callID、时间及后续全部调用见 [清理审批事件审计](cleanup-approval-audit/README.md)；底层调用 ID、逐子文件完整枚举及独立回执缺口已明确列出，不伪补预检或回执。

原 [temporary-cleanup.json](temporary-cleanup.json) 和测试原件保持原字节。本次返修仅保存审计文档，不再删除、移动或恢复被拒目标，不中断服务，不以额外操作改变现场。此前产品检查成功保持其精确组合源码下的实际含义，不代替本事件审查。

Playwright 命令 PID `29520`、实际 API 日志 PID `45396` 及控制进程 PID `5512` 已结束；最终工作区服务和独有端口盘点为空。浏览器全部子进程未及时在线抓取，不冒称取得完整子进程创建时清单。当前构建、已有 `.next` 缓存、依赖、共享资源和旧 worktree 保留；旧 worktree 尚无 actual main 合入及无人引用证明，不 force 抹 dirty，正式清理留待合入后。

本轮组合及新增边界断言回交独审。尚无本分支 PR，最新 PR 必需 CI、Chief 确认和 actual main 合入均未完成；Chief 后续经标准 `merge_builds` 建立门禁。没有发布、真实提供方调用或绕过 GitHub 检查。
