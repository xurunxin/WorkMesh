# Worker 首败诊断方法与边界

检查版本：`d0806bc257fce1fba7ca7b320b79d6698ec6be45`。原产品、测试与 freshness guard 未修改。根级集成首轮失败位于 `retention.integration.test.ts:2278` 的 initialProof；错误没有记录当次 mode/age，因此首败根因仍未定位。

`retention.ts` 用 PostgreSQL `now()` 写入 `worker_seen_at`，用例以宿主 `new Date()` 调用 freshness；guard 拒绝非 archive_only、空时间、负 age 或超过 120000ms 的 age。`worker-clock-diagnostic.json` 保存 50 次跨时钟读取，age 1–2ms，无负数。它们是失败后的样本，不能倒推首败。

定向诊断采用本地临时 Vitest config，继承根 `vitest.integration.config.ts`，只新增一个 setupFiles。setup 对导出函数加如下包裹，仍调用原函数，不改变返回值或错误：

```ts
import { vi } from 'vitest';
import * as provenance from '../apps/worker/src/retention-soak-provenance';
const original = provenance.retentionSoakWorkerFreshnessProof;
vi.spyOn(provenance, 'retentionSoakWorkerFreshnessProof').mockImplementation(
  (identity, evidence, observedAt, maximumAgeMs, expectedConflictCount) => {
    const diagnostic = {
      mode: evidence.workerMode,
      seenAt: evidence.workerSeenAt?.toISOString() ?? null,
      observedAt: observedAt.toISOString(),
      ageMs: evidence.workerSeenAt
        ? observedAt.getTime() - evidence.workerSeenAt.getTime() : null,
      identityMatches: evidence.workerInstanceId === identity.instanceId
        && evidence.workerBuildSha === identity.buildSha,
      conflictCount: evidence.workerIdentityConflictCount,
      expectedConflictCount,
    };
    try {
      const result = original(identity, evidence, observedAt, maximumAgeMs, expectedConflictCount);
      console.log('G1_FRESHNESS_DIAGNOSTIC', JSON.stringify({ ...diagnostic, result: '通过' }));
      return result;
    } catch (error) {
      console.log('G1_FRESHNESS_DIAGNOSTIC', JSON.stringify({
        ...diagnostic, result: error instanceof Error ? error.message : '未知错误',
      }));
      throw error;
    }
  },
);
```

在同一独有测试库执行日志中的 `pnpm -C apps/worker exec vitest run ... -t ... --config ...`，实际只运行目标 1 项、跳过另外 35 项。initialProof 的 mode=archive_only、age=15ms，身份匹配；后两次分别正确拒绝不同身份和冲突计数，目标通过。此配置只用于诊断，不作为标准 worker 验收替代。

随后按仓库标准入口 `pnpm test:integration:worker` 重置同一独有测试库并复验，78 passed + 1 existing skipped；另补首轮未执行的 `pnpm test:integration:recovery`，1/1 通过。两条标准命令没有 setup spy；不重复已通过的 DB/API。根命令 `pnpm test:integration` 首次退出1仍是本轮真实失败，不能把局部补验称作根命令退出0，也不能断言其为偶发或已解决。

完整首败、诊断、worker/recovery 复核日志由最终 JSON 的 `ciAlignment.checks` 固定字节和 SHA-256。临时配置只影响定向诊断，未修改仓库测试、时钟、超时或安全条件。
