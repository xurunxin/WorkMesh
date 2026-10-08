# A1 恢复与验收交接

本目录属于 `tds/conv-01a11ac2-7634-752e-8d81-764c9776f801`。恢复来源是用户明确命名的旧工作区
`C:\Users\xurx\.tds\workspaces\01a1187a-f0f2-7dd4-b77e-b9540ad44d9e`，只读原件，未覆盖或删除该目录。

## 计划、授权与历史

完整中文计划在 [a1-configuration-readiness.md](../../plan/a1-configuration-readiness.md)。
其五份归档来自提交 `98175411cb0b1f3d52c661d71e3e75c489a05e6b`，经原工作区
`901e040a2cd4be83f9b9801bc3087ac150d1cde1` 正常快进整合到当前会话分支；该基点只比
`1078bbcd527550bfabee73093b7ffd0032d3fd24` 多五份计划归档，保留提交历史。

正文 UTF-8/LF Git blob 为 7427 字节，SHA-256 为
`b8f45274b46301a0a2efbd5a7a27ada848e2a1025dd7e698b902db9ddfda0267`。
历史平台 currentID 为 `39ypDb7ncugLDlTiQKVhp`，未提供的 version 保持 `null`；
[source.json](../../plan/a1-configuration-readiness/source.json) 如实保留当时的注入来源、工具截断
及门禁状态，没有另存平台版本或修改已确认计划。那些字段表示历史规划回合，不能当本轮实时状态。
本轮用户明确同步原 15:46 直接确认有效并要求恢复实施，授权依此继续；没有宣称规划独审已经发生。
最终独审须同时核对完整方案、实际契约与证据，Chief 最终确认仍为交付门禁。

开工通过平台 git 工具 fetch/read main，实际值仍为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`。
前置 #1/#2/#18/#3 实读为 done。D1a 增量已在实施基点，无需重做主题改动。
本批按已批准例外使用 Todos＋仓库保存规格和证据，没有创建真实 WorkMesh Project、WorkItem 或 Session。
[current-platform-readback.json](./current-platform-readback.json) 保存本轮完整 Spec，包含新增清理要求；
原历史源 SHA、R1 与获批计划归档保持。

## 原件与缺口

[recovery-inventory.json](./recovery-inventory.json) 逐项记录恢复的 16 份产品/规格文件及 65 份历史材料。
16 份全部与旧 `source-manifest.json` 的大小及 SHA-256 精确匹配，再逐字节复制到当前工作区。
[source-equivalence.json](./source-equivalence.json) 另比较 1177 份源码、配置与 DDL，恢复时差异为零。
工作树原字节与 Git LF blob 分开记录；最终 Git 字节核验见证据索引。

[previous-run.zip](./previous-run.zip) 无损保存全部旧证据，包括 hook 10 秒、Runner 子进程超时和
早期夹具失败日志；已独立读取全部 member 并逐字节核验。历史 `.log` 的 UTF-16/BOM/换行不改写。
索引中的 `historicalFiles[].path` 同时是 ZIP member 名，可直接解包读取，无需历史 Git 对象。
旧报告、旧 test-coverage 和旧 source-manifest 在 ZIP 中保持历史原貌，不作为本轮成功声明。

旧 integration、targeted、lint/typecheck 日志及部分报告与旧清单不匹配，明确记为缺口；
三份 conformance 原生成路径已缺失，归档副本另核原哈希。原清单中精确匹配、且源码等价的检查
保留复用，见 `history-reuse.json`；不重做有效已绑定检查。其余以本轮运行补足，不放宽超时。
skip、缓存命中、历史实际运行和本轮实际运行分别报告。

## 实施范围

Human-only `GET /api/v1/workbench/configuration-readiness`，必填 `teamId` 和
`workKind=repository|non_repository`，可选 `projectId`/`workItemId`。参数化单条 SELECT
同时重验当前 Human 会话、Actor、Team 可见性和当前配置，响应 `Cache-Control: no-store`。
模型要求 active connection＋enabled model；personal 仅本人、Team 仅所选 Team、workspace
按既有可见性。Agent 要求 active definition＋未撤销 Team grant。仓库仅匹配指定工作上下文，
未指定才读取所选 Team 的 Project 配置；非仓库意图仍校验指定资源范围。

四项检查独立。Runner 恒 `unknown/not_observable`；仓库不适用表示为
`applicability=not_applicable,state=null`。隐藏配置与未配置统一 `blocked/unmet`，不可见与
不存在上下文统一 NOT_FOUND。不返回隐藏名称、数量或标识，不成为委派、激活或执行许可。
零迁移、零新表、零新增事件及写端点。成功、重复、参数错误和查询故障零领域写入，
鉴权拒绝仅允许用户已批准的既有 `authorization_denials`；全局拒绝审计机制保持。

文件覆盖 API 查询/注册、共享 DTO/清单/Human-only 策略、定向集成和契约测试，以及
CONTEXT、AGENT_PROTOCOL、ADR 0074 与仓库规格。路由矩阵来自原 `pnpm generate:route-policy`，
本轮 `pnpm check:route-policy` 核对生成一致性。A2 UI、setup shell、Runner 注册/活性与运行授权不在范围内。

## 验证与收尾

| 检查 | 实际结果与来源 |
|---|---|
| A1 定向 integration | 本轮 11/11 通过，包含实时撤权、上下文隔离及全部 public 表零写入断言 |
| 全量 integration | 本轮 DB 77、API 165、Worker 78，共 320 通过；3 项可选 skip 不计通过 |
| 全量 E2E | 本轮 67/67 通过；67 项名称及 `.last-run` 见 `e2e-summary.json` 和 ZIP 原件 |
| lint / typecheck | 本轮各 18/18 成功，18 项全部命中同输入 Turbo 缓存，如实保留缓存输出 |
| 路由生成一致性 | 本轮 `pnpm check:route-policy` 成功 |
| 全量 unit | 复用精确绑定历史实际运行：29/29 任务、1661 通过、2 可选 skip，0 缓存 |
| contracts / build / CI policy | 精确绑定历史：契约 4 项、构建 18/18、CI 校验及 policy 12 项成功 |
| Agent smoke / conformance / recovery | 精确绑定历史通过；conformance 6/6、显式 recovery 1/1；不以 root 默认 skip 冒充恢复通过 |
| 远端 required CI / 独立复核 / Chief 确认 | 尚待当前交付提交的外部关口，不用历史 CI 或本地成功代替 |

本轮命令、退出码、前后源码摘要及日志 SHA 在 `current-run/*.result.json`；原始日志无损归档后
由 [current-run-index.json](./current-run-index.json) 定位 [current-run.zip](./current-run.zip) 的 member。
`test-coverage.json` 保留七条原验收、九类适用性和完整原 DoD。
必需检查、独审、远端 CI 和 Chief 最终确认分别记录，未完成的关口不预填成功。
本轮运行环境 Node `v24.20.0`、pnpm `9.15.4`，没有升级机器；仓库 canonical Node `22.19.0`
由远端 required CI 验证，版本差异见 `environment.json`。E2E 曾有 Next 缓存 rename 警告，
随后编译、67 项测试与命令退出成功；原日志保留，没有改超时或代码掩盖该警告。

测试仅使用本任务原已登记的三只容器与回环端口。ID、匿名测试卷和共享镜像见
[resources-before.json](./resources-before.json)；测试结束或失败退出均先保全证据，再清理已确认闲置
资源，清理结果见 `cleanup.json`。共享基础镜像、其他任务服务、持久业务数据不清理；不 global prune。
临时环境只注入子进程，未修改系统配置。当前构建及旧工作区保留到实际合入 main、证据保全且无人运行后。
本轮三只 `wm-a1-01a1187a-*` 容器及其三只匿名测试卷已清理并复查不存在；共享 postgres/redis/rustfs
镜像保留，本任务未创建专用镜像或网络。当前 `.next` 和 TEMP 中
`workmesh-a1-01a11ac2-playwright` 已删除，当前依赖保留以供审查及修复。服务日志在
`service-logs.zip`，完整 ID、卷名、绝对路径、保留理由和操作结果在 `cleanup.json`。

演示：用已有 Human session 查询以下两种意图；改变可见模型/Team grant 后重新查询，结果即时变化，
其他项目不补足当前上下文，重复 GET 不持久化投影。

```text
GET /api/v1/workbench/configuration-readiness?teamId=<TEAM>&workKind=repository&projectId=<PROJECT>
GET /api/v1/workbench/configuration-readiness?teamId=<TEAM>&workKind=non_repository&projectId=<PROJECT>
```
