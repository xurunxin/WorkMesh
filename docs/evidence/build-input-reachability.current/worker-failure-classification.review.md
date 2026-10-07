# 根级集成失败分类：现场补充，尚未闭合

本轮读取/诊断版本为 `37857eef5a67555564097ace07871ac44ed24195`。产品源码、标准测试及 guard 未改；前轮根级 `pnpm test:integration` 的 `integration.4.log` 原字节、退出1保持。此首败没有当次 `workerMode`、`workerSeenAt`、`observedAt` 或 `ageMs`，测试库已经随前轮专有容器清理；无法从历史错误栈或后续采样恢复该现场，不能编造。

## 拒绝条件与当前真实现场

freshness guard 在 `apps/worker/src/retention-soak-provenance.ts:397` 拒绝四种条件：mode不等于archive_only、缺workerSeenAt、age<0、age>120000ms。身份或冲突计数错误有不同错误码，不属于这次首败的错误码。条件需要逐项读取实际参数来区分，后续成功不足以选择其中一项作为历史原因。

本轮临时诊断继承原Vitest integration配置，以setup包裹导出函数；**先调用原函数，再在成功或catch分支记录已经传入的参数和各条件布尔值**，原结果/错误原样返回或抛出。相较前轮在调用前构造诊断，此次不会在原guard执行前做字段序列化或打印。未改时间、guard、测试断言或重试设置。

| 本轮诊断 | workerMode | workerSeenAt（UTC） | observedAt（UTC） | ageMs | 实际结果 |
|---|---|---|---|---:|---|
| retention完整文件 initialProof | archive_only | 2026-10-07T18:04:26.755Z | 2026-10-07T18:04:26.763Z | 8 | freshness通过 |
| 全worker上下文 initialProof | archive_only | 2026-10-07T18:06:15.484Z | 2026-10-07T18:06:15.490Z | 6 | freshness通过 |

两次initialProof的wrongMode、missingSeenAt、negativeAge、staleAge均为false；其后的不同身份和冲突计数均按原测试预期被拒绝。原始场景记录及时间/错误见 `integration-retention-diagnostic.1.log`（36/36通过）和 `integration-worker-scene.1.log`（78通过/1既有skip）。后者用于覆盖原失败的全worker上下文，仍是带观测setup的诊断，**不是标准根命令通过**。前轮标准worker/recovery补验保持各自版本与局部结论。

## 分类与重跑决定

分类状态：**未完成，无法认定为产品回归或基础设施问题。** 两次有现场参数的诊断都未复现原freshness错误；首败现场已不可恢复。50次时钟采样与本轮正age均不能倒推旧age，不把错误归为时钟偏差，也不标记为已解决的偶发失败。

`docs/CI.md:96–99` 要求失败分类后才能重跑。本轮执行上述有明确现场观测目的的诊断；没有继续重复worker/recovery局部验收，没有重跑已通过的lint、typecheck、单测、E2E，也**未把未分类的首败用于启动标准根命令重跑**。必要后续是：在下一次出现同类失败时保留四项现场与具体拒绝条件，完成有依据分类，再运行未修改配置/源码的标准 `pnpm test:integration`，取得退出0并保留首败。若需改变guard或仓库诊断设计，交总管处理，G1不擅自调整。

因此独审第3项仍blocking；本轮没有标准根命令退出0，不能关闭其必需检查。独审第1/2项仅补范围/契约，尚未制作ZIP/index，也未取得最新head正式selection/Required CI成功。G1/R1门禁继续关闭。
