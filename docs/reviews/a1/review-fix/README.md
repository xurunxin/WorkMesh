# A1 独审阻塞项修复记录

## 审查输入与范围

审查对象为 `1054c7a4c80b86515d33a58d43134ea9fcbfaf95`。本轮重新 fetch 并读取
main，仍为 `1078bbcd527550bfabee73093b7ffd0032d3fd24`。本记录响应独审指出的
Installation Token 身份解析副作用，不新建计划，不改已确认的规划或历史证据。
完整中文计划及精确来源仍见 `docs/plan/a1-configuration-readiness.md` 与
`docs/plan/a1-configuration-readiness/source.json`；历史归档及 source-manifest
保留其原运行对象，不能用于声称本修复已经验收。

有效 `X-WorkMesh-Installation-Token` 在全局 `preHandler` 中先进入
`resolveCoordinationIdentity`，后才由 Human-only 策略拒绝。解析会更新连接和
凭据使用时间，且可创建或续期 Coordination Session、领域事件及 outbox。
此前覆盖的 Agent Session bearer 拒绝没有覆盖此路径。反馈成立。

## 实际修改

`apps/api/src/server.ts` 在调用该解析器之前读取已有绑定路由策略：

```ts
if (coordinationToken !== undefined) {
  const policy = policyForRequest(request);
  if (policy.authentication === "human_session")
    throw new DomainError("FORBIDDEN", "Installation credentials are not allowed for this route", {
      authorizationStage: "identity",
      policyId: policy.policyId,
    });
}
```

全局错误处理仍执行既有 `recordAuthorizationDenial`。拒绝发生在凭据解析前，
不伪造已认证 Actor，因此审计中的 principal 标识为空；仍记录 operation、policy、
identity 阶段及 FORBIDDEN。不记录原 token，不抑制拒绝审计。
使用策略而非硬编码 readiness 路由，已有 Coordination 身份端点和混合身份策略
继续按原流程解析。

已重新读取审查引用的 `configuration-readiness.ts` 注册位置：

```ts
preValidation: async request => { configurationReadinessQuerySchema.parse(request.query) },
```

此参数校验保留。修复在其后的全局身份解析入口，早于有副作用的解析器，
不把参数校验当作身份拒绝。查询仍不授权执行，Runner 恒 unknown；零 schema、
零迁移、无新事件或写入端点，唯一许可写入仍为既有拒绝安全审计。

## 回归与证据

`apps/api/integration/configuration-readiness.integration.test.ts` 新增三个参数化用例：

- `审查回归：有效 Installation Token 首次及重复 GET 只写拒绝审计`
- `审查回归：有效 Installation Token 已有会话及重复 GET 只写拒绝审计`
- `审查回归：有效 Installation Token 过期会话及重复 GET 只写拒绝审计`

每例通过真实注册、Team grant、创建连接及 redeem 获取有效凭据，校验配对后尚无
Coordination Session；已有和过期场景通过正常 identity 端点建立会话，过期场景
仅在测试夹具中修改 expires_at。每例依次发送两次同凭据 GET 和一次同时携带
Human cookie 的 GET，断言 403、无 token 泄露、各 public 表的内容摘要及行数不变，
仅 `authorization_denials` 每次增加一条并校验实际 correlation 对应审计字段。
比较结束后再次调用正常 identity 端点并断言成功，已有会话保持 ID，过期会话
替换 ID，以证明凭据有效而非无效凭据的假阳性。

先仅加入测试，在未修复的生产源码上实际复现三例失败，11 个原用例由名称过滤跳过；
`regression` 首败完整保存。修复后定向 14/14 通过。全量检查结果、源码运行前后
摘要和工作树/Git blob 绑定以本目录最终清单为准，不覆写上轮归档。

## 资源与门禁

本轮专用资源在 `resources.json` 登记，只有本任务的三个新容器使用 35432/36379/39000
回环端口；S3 测试 bucket 为 `workmesh-artifacts`。其他任务资源不使用或删除。
配置仅注入子进程，bootstrap 随机且不落盘；没有机器升级、系统环境修改、专用镜像
或专用网络。结束或失败退出均在保存日志后清理本轮闲置资源，实际结果另存清理清单。
当前构建及未合入的旧 dirty workspace 保留，不 force 清理。

本轮修复不能自行代表独审通过、远端 required CI、Chief 确认或 actual main 合入。
完成本地检查和字节保全后，仍需上述既有外部门禁读回。

## 本轮最终验证与保全

| 检查 | 实际结果 |
| --- | --- |
| 定向集成 | 14/14 通过，含三种有效 Installation Token 场景 |
| lint / typecheck | 各 18/18 任务成功，各 4 项缓存；API 任务实际执行 |
| 单元测试 | 29/29 任务成功，1661 通过、2 可选跳过，0 缓存 |
| 完整构建 | 18/18 任务成功，0 缓存 |
| 路由生成一致性 / CI 配置与证据校验 | 成功；路由矩阵未手改 |
| 全量集成 | DB 77、API 168、Worker 78，共 323 通过；3 可选跳过不计通过 |
| 全量 E2E 最终重跑 | 67/67 通过，0 跳过，0 缓存；源码与超时均未修改 |

3 个集成跳过项分别是 Runner 真实模型可选用例、Worker retention upgrade barrier
和未显式启用的 recovery。前轮显式 recovery 通过仍是历史证据，不当作本轮运行。
以上九项最终检查运行前后均绑定生产输入摘要：
`0ca18a5edf6734d2bc4535e55e2747daef92b857b0a54abd0a9af5603382c229`。
逐条命令、退出码、缓存计数及 E2E 的 67 项名称见 [verification.json](./verification.json)。

首次 E2E 在 `apps/web/e2e/stage0.spec.ts:204` 等待新建 Team 出现在列表时失败，
1 项失败、66 项未运行。对应 POST 最终为 200，耗时约 9992.93ms，而既有断言窗口
是 10000ms。这条请求未携带 Installation Token；这里只记录时序证据，未定位延迟
根因。保存失败现场后按同一生产源码、原超时和完整命令重跑，实际 67/67 通过。
没有改动 UI、E2E 用例或超时来绕过失败。详见 [失败分析](./e2e-failure-analysis.json)。

[checks-raw.zip](./checks-raw.zip) 保留 51 个原字节成员：11 次运行的日志、前后源码
快照、结果，以及最终 `.last-run` 和 6 份服务日志。两次首败分别标明来源，不混入
当前通过结果。[成员清单](./checks-raw.index.json) 记录每个成员的字节数及 SHA，
归档逐成员与原件比较一致后才删除重复日志与快照副本；结果 JSON 保留便于阅读。
[E2E 首败归档](./e2e-first-failure.zip) 保留截图、视频、上下文和脱敏 trace，
[清单](./e2e-first-failure.index.json) 分别记录原 SHA 与保留件 SHA。trace 脱敏四个
临时凭据值；安装表单凭据为 password 输入，截图与视频原字节保留。不保存 `.auth`。
脱敏方法见 `preserve-e2e-failure.py`，不声称脱敏 trace 与原件字节相同。

## 已执行的资源清理

以下三只本轮专用容器经归属标签和唯一卷引用核验，已 stop、保全日志，再 `docker rm -v`，
容器与三只匿名测试卷均复查不存在：

- `wm-a1-review-01a11ac2-pg`：`6f9c72d87c8f4e50db2563a481e82e5473f5c4112f201d0974dfb7832c4f1151`
- `wm-a1-review-01a11ac2-redis`：`726797bd68526bc3299c31f0787b47904214ae4f6b2a83ee3bf4626ab34ae54d`
- `wm-a1-review-01a11ac2-s3`：`9bcb02ed887d60d154128b62cf8d5f389ae5840ae1ad507f0d52bdeca57c2a54`

已按登记的绝对路径删除本轮 `apps/web/.next` 和
`C:\Users\xurx\AppData\Local\Temp\workmesh-a1-01a11ac2-playwright`，没有删除构建目录本身。
登记的两个 Chromium profile 已由 Playwright 自动清理，复查不存在；登记进程按 PID
与创建时间确认退出，没有强杀其他任务进程。完整路径、卷 ID、操作与结果见
[cleanup.json](./cleanup.json)，创建时归属见 [resources.json](./resources.json)。

共享 postgres/redis/rustfs 镜像和 bridge 网络、其他任务容器保持；本轮未创建专用镜像
或网络。当前构建、依赖及既有 `.turbo/dist` 保留供复核；旧 dirty workspace 尚不满足
actual main 合入、成果全部保全、无人使用的正式 worktree 清理条件，继续保留。
没有 global prune、force worktree 删除或系统配置残留。

当前完整生产源码与实际暂存 Git blob 的最终绑定见 `source-manifest.json`。
零 schema/迁移差异；既有 API 响应、事件契约和审批授权规则不变。
修复后的独审、远端 required CI 与 Chief 确认仍待外部读回，不预填通过。
