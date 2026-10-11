# 实际检查日志摘录

以下保留命令实际输出摘要，退出码与完整原始日志哈希见 [checks.json](checks.json)。条件跳过不记作通过；两个集成跳过项另行补验。日志摘录不含认证令牌。

## pnpm lint

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    4.7s 
```

## pnpm typecheck

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    4.809s 
```

## pnpm test

退出码：0。

```text
@workmesh/contracts:test:  Test Files  23 passed (23)
@workmesh/contracts:test:       Tests  180 passed (180)
@workmesh/contracts:test:    Start at  18:08:07
@workmesh/contracts:test:    Duration  4.50s (transform 1.99s, setup 0ms, collect 11.42s, tests 7.24s, environment 4ms, prepare 15.80s)
@workmesh/git-provider:test:  Test Files  2 passed (2)
@workmesh/git-provider:test:       Tests  13 passed (13)
@workmesh/git-provider:test:    Start at  18:08:13
@workmesh/git-provider:test:    Duration  1.01s (transform 63ms, setup 0ms, collect 114ms, tests 40ms, environment 0ms, prepare 417ms)
@workmesh/observability:test:  Test Files  2 passed (2)
@workmesh/observability:test:       Tests  16 passed (16)
@workmesh/observability:test:    Start at  18:08:14
@workmesh/observability:test:    Duration  1.07s (transform 89ms, setup 0ms, collect 131ms, tests 16ms, environment 0ms, prepare 522ms)
@workmesh/artifact-storage:test:  Test Files  2 passed (2)
@workmesh/artifact-storage:test:       Tests  22 passed (22)
@workmesh/artifact-storage:test:    Start at  18:08:15
@workmesh/artifact-storage:test:    Duration  1.40s (transform 102ms, setup 0ms, collect 463ms, tests 35ms, environment 0ms, prepare 602ms)
@workmesh/ui:test:  Test Files  4 passed (4)
@workmesh/ui:test:       Tests  50 passed (50)
@workmesh/ui:test:    Start at  18:08:17
@workmesh/ui:test:    Duration  1.69s (transform 595ms, setup 0ms, collect 1.63s, tests 59ms, environment 0ms, prepare 1.04s)
@workmesh/domain:test:  Test Files  9 passed (9)
@workmesh/domain:test:       Tests  65 passed (65)
@workmesh/domain:test:    Start at  18:08:19
@workmesh/domain:test:    Duration  1.58s (transform 648ms, setup 0ms, collect 1.62s, tests 57ms, environment 1ms, prepare 3.16s)
@workmesh/a2a-adapter:test:  Test Files  1 passed (1)
@workmesh/a2a-adapter:test:       Tests  4 passed (4)
@workmesh/a2a-adapter:test:    Start at  18:08:25
@workmesh/a2a-adapter:test:    Duration  1.04s (transform 46ms, setup 0ms, collect 65ms, tests 7ms, environment 0ms, prepare 265ms)
@workmesh/agent-runner:test:  Test Files  9 passed (9)
@workmesh/agent-runner:test:       Tests  48 passed (48)
@workmesh/agent-runner:test:    Start at  18:08:20
@workmesh/agent-runner:test:    Duration  47.47s (transform 669ms, setup 0ms, collect 19.22s, tests 57.81s, environment 1ms, prepare 3.58s)
@workmesh/config:test:  Test Files  2 passed (2)
@workmesh/config:test:       Tests  33 passed (33)
@workmesh/config:test:    Start at  18:09:14
@workmesh/config:test:    Duration  2.22s (transform 371ms, setup 0ms, collect 672ms, tests 27ms, environment 0ms, prepare 1.35s)
@workmesh/agent-sdk:test:  Test Files  1 passed (1)
@workmesh/agent-sdk:test:       Tests  33 passed (33)
@workmesh/agent-sdk:test:    Start at  18:09:19
@workmesh/agent-sdk:test:    Duration  2.29s (transform 340ms, setup 0ms, collect 539ms, tests 77ms, environment 0ms, prepare 599ms)
@workmesh/db:test:  Test Files  8 passed (8)
@workmesh/db:test:       Tests  28 passed (28)
@workmesh/db:test:    Start at  18:09:46
@workmesh/db:test:    Duration  5.42s (transform 1.32s, setup 0ms, collect 5.91s, tests 4.59s, environment 1ms, prepare 5.92s)
@workmesh/mcp:test:  Test Files  2 passed (2)
@workmesh/mcp:test:       Tests  38 passed (38)
@workmesh/mcp:test:    Start at  18:09:55
@workmesh/mcp:test:    Duration  3.07s (transform 495ms, setup 0ms, collect 2.49s, tests 268ms, environment 0ms, prepare 1.42s)
@workmesh/conformance:test:  Test Files  1 passed (1)
@workmesh/conformance:test:       Tests  1 passed (1)
@workmesh/conformance:test:    Start at  18:10:00
@workmesh/conformance:test:    Duration  1.51s (transform 262ms, setup 0ms, collect 392ms, tests 40ms, environment 0ms, prepare 345ms)
@workmesh/fake-agent:test:  Test Files  1 passed (1)
@workmesh/fake-agent:test:       Tests  4 passed (4)
@workmesh/fake-agent:test:    Start at  18:10:03
@workmesh/fake-agent:test:    Duration  1.30s (transform 211ms, setup 0ms, collect 321ms, tests 14ms, environment 0ms, prepare 286ms)
@workmesh/web:test:  Test Files  113 passed (113)
@workmesh/web:test:       Tests  776 passed (776)
@workmesh/web:test:    Start at  18:08:47
@workmesh/web:test:    Duration  80.37s (transform 14.05s, setup 119.70s, collect 800.18s, tests 39.14s, environment 308.70s, prepare 59.19s)
@workmesh/recovery:test:  Test Files  1 passed (1)
@workmesh/recovery:test:       Tests  7 passed (7)
@workmesh/recovery:test:    Start at  18:10:09
@workmesh/recovery:test:    Duration  1.16s (transform 57ms, setup 0ms, collect 200ms, tests 67ms, environment 0ms, prepare 226ms)
@workmesh/worker:test:  Test Files  23 passed (23)
@workmesh/worker:test:       Tests  163 passed | 2 skipped (165)
@workmesh/worker:test:    Start at  18:10:09
@workmesh/worker:test:    Duration  4.46s (transform 4.06s, setup 0ms, collect 21.86s, tests 1.65s, environment 4ms, prepare 13.12s)
@workmesh/api:test:  Test Files  33 passed (33)
@workmesh/api:test:       Tests  174 passed (174)
@workmesh/api:test:    Start at  18:10:13
@workmesh/api:test:    Duration  22.49s (transform 1.13s, setup 0ms, collect 5.92s, tests 6.38s, environment 4ms, prepare 4.23s)
 Tasks:    29 successful, 29 total
Cached:    2 cached, 29 total
  Time:    2m33.224s 
```

## pnpm test:integration

退出码：0。

```text
 Test Files  17 passed (17)
      Tests  77 passed (77)
   Start at  18:29:07
   Duration  107.62s (transform 280ms, setup 0ms, collect 6.77s, tests 96.43s, environment 2ms, prepare 1.70s)
{"level":"info","message":"Workbench turn telemetry","event":"workbench.turn.telemetry","turnId":"8406a477-4ee8-4df4-8bcc-f450dc4c526b","conversationId":"91489247-be75-4d64-b238-24d71d0a45f9","attemptNo":1,"sessionId":"94863f9d-b5f2-4133-a238-5b895a8ab6c9","correlationId":"dee3db24-738b-4daf-bf50-f9635504c817","status":"settled","outcome":"settled","queueWaitMs":55,"dispatchLagMs":20,"runDurationMs":19,"totalDurationMs":74,"totalTokens":null,"errorCode":null}
{"level":"info","message":"Workbench turn telemetry","event":"workbench.turn.telemetry","turnId":"0b4fad44-8603-4e98-8d08-65142e2ed6e4","conversationId":"4dfd0f6f-4799-4eeb-8c6c-242e65eef90a","attemptNo":1,"sessionId":"f82c2d28-9e95-48b7-a981-e99984bce186","correlationId":"46c7002a-a79d-4595-8d85-29d65f7da7f9","status":"settled","outcome":"settled","queueWaitMs":44,"dispatchLagMs":15,"runDurationMs":105,"totalDurationMs":149,"totalTokens":null,"errorCode":null}
 Test Files  22 passed (22)
      Tests  154 passed | 1 skipped (155)
   Start at  18:31:00
   Duration  123.10s (transform 1.18s, setup 0ms, collect 25.96s, tests 91.34s, environment 2ms, prepare 2.18s)
 Test Files  8 passed | 1 skipped (9)
      Tests  78 passed | 1 skipped (79)
   Start at  18:33:07
   Duration  28.48s (transform 482ms, setup 0ms, collect 5.27s, tests 20.90s, environment 1ms, prepare 866ms)
 Test Files  1 skipped (1)
      Tests  1 skipped (1)
   Start at  18:33:37
   Duration  1.15s (transform 285ms, setup 0ms, collect 854ms, tests 0ms, environment 0ms, prepare 105ms)
```

## pnpm test:e2e

退出码：0。

```text
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
  Time:    3m31.613s 
```

## pnpm test:integration:recovery

退出码：0。

```text
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  18:39:52
   Duration  5.02s (transform 311ms, setup 0ms, collect 910ms, tests 3.81s, environment 0ms, prepare 104ms)
```

## pnpm --filter @workmesh/worker test:integration -- integration/retention-upgrade-barrier.integration.test.ts

退出码：0。

```text
RETENTION_EXTENSION_REAL_PROOF {"versionId":"a9f28e8a-024f-4301-b39e-6edb02a9bc64","lastModified":"2026-10-07T10:40:38.000Z","initialRetainUntil":"2027-10-08T10:40:38.114Z","finalRetainUntil":"2027-10-09T11:40:38.000Z","versionCount":1,"deleteMarkerCount":0,"barrier":{"expectedThrough":29,"snapshotDigest":"sha256:563cc694dee90e8a4d0f4fdd1fd4b7195e0bbb1a23c9cfbafafa1fe4172894e6","objectCount":1,"snapshots":2,"checkedAt":"2026-10-07T10:40:38.171Z"}}
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  18:40:36
   Duration  2.08s (transform 195ms, setup 0ms, collect 698ms, tests 1.06s, environment 0ms, prepare 112ms)
```

## pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=all

退出码：0。

```text
  14 passed (1.4m)
```

## pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none

退出码：0。

```text
  14 passed (1.2m)
```
