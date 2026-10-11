# 最终视觉与必需检查摘录

视觉两轮各 14 通过、56 次原始附件严格一致；整体 D0 因通用 mocked-dev 失败仍关闭。退出码及完整原始日志哈希见 [stabilized-verification.json](stabilized-verification.json)。条件跳过与旧失败不改写。

## pnpm lint

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    4.874s 
```

## pnpm typecheck

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    5.105s 
```

## pnpm test

退出码：0。

```text
@workmesh/git-provider:test:       Tests  13 passed (13)
@workmesh/contracts:test:       Tests  180 passed (180)
@workmesh/observability:test:       Tests  16 passed (16)
@workmesh/artifact-storage:test:       Tests  22 passed (22)
@workmesh/ui:test:       Tests  50 passed (50)
@workmesh/agent-sdk:test:       Tests  33 passed (33)
@workmesh/domain:test:       Tests  65 passed (65)
@workmesh/a2a-adapter:test:       Tests  4 passed (4)
@workmesh/agent-runner:test:       Tests  48 passed (48)
@workmesh/config:test:       Tests  33 passed (33)
@workmesh/fake-agent:test:       Tests  4 passed (4)
@workmesh/conformance:test:       Tests  1 passed (1)
@workmesh/mcp:test:       Tests  38 passed (38)
@workmesh/db:test:       Tests  28 passed (28)
@workmesh/recovery:test:       Tests  7 passed (7)
@workmesh/worker:test:       Tests  163 passed | 2 skipped (165)
@workmesh/api:test:       Tests  174 passed (174)
@workmesh/web:test:       Tests  776 passed (776)
 Tasks:    29 successful, 29 total
Cached:    28 cached, 29 total
  Time:    2m7.239s 
```

## pnpm test:integration

退出码：0。

```text
 Test Files  17 passed (17)
      Tests  77 passed (77)
 Test Files  22 passed (22)
      Tests  154 passed | 1 skipped (155)
 Test Files  8 passed | 1 skipped (9)
      Tests  78 passed | 1 skipped (79)
 Test Files  1 skipped (1)
      Tests  1 skipped (1)
```

## pnpm test:e2e

退出码：0。

```text
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
  Time:    3m29.841s 
```

## pnpm test:integration:recovery

退出码：0。

```text
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## pnpm --filter @workmesh/worker test:integration -- integration/retention-upgrade-barrier.integration.test.ts

退出码：0。

```text
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
