# 本轮实际运行摘录

当前结论以 [review-fix-verification.json](review-fix-verification.json) 为准；检查原始日志仅在本地临时目录，仓库保留 SHA-256、实际摘录及失败原始 PNG。正式 E2E 不含 mocked-dev 或 D0。

## pnpm lint

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    5.066s 
```

## pnpm typecheck

退出码：0。

```text
 Tasks:    18 successful, 18 total
Cached:    17 cached, 18 total
  Time:    4.643s 
```

## pnpm test

退出码：0。

```text
@workmesh/git-provider:test:  Test Files  2 passed (2)
@workmesh/git-provider:test:       Tests  13 passed (13)
@workmesh/ui:test:  Test Files  4 passed (4)
@workmesh/ui:test:       Tests  50 passed (50)
@workmesh/artifact-storage:test:  Test Files  2 passed (2)
@workmesh/artifact-storage:test:       Tests  22 passed (22)
@workmesh/contracts:test:  Test Files  23 passed (23)
@workmesh/contracts:test:       Tests  180 passed (180)
@workmesh/observability:test:  Test Files  2 passed (2)
@workmesh/observability:test:       Tests  16 passed (16)
@workmesh/a2a-adapter:test:  Test Files  1 passed (1)
@workmesh/a2a-adapter:test:       Tests  4 passed (4)
@workmesh/domain:test:  Test Files  9 passed (9)
@workmesh/domain:test:       Tests  65 passed (65)
@workmesh/config:test:  Test Files  2 passed (2)
@workmesh/config:test:       Tests  33 passed (33)
@workmesh/agent-sdk:test:  Test Files  1 passed (1)
@workmesh/agent-sdk:test:       Tests  33 passed (33)
@workmesh/agent-runner:test:  Test Files  9 passed (9)
@workmesh/agent-runner:test:       Tests  48 passed (48)
@workmesh/fake-agent:test:  Test Files  1 passed (1)
@workmesh/fake-agent:test:       Tests  4 passed (4)
@workmesh/mcp:test:  Test Files  2 passed (2)
@workmesh/mcp:test:       Tests  38 passed (38)
@workmesh/conformance:test:  Test Files  1 passed (1)
@workmesh/conformance:test:       Tests  1 passed (1)
@workmesh/db:test:  Test Files  8 passed (8)
@workmesh/db:test:       Tests  28 passed (28)
@workmesh/recovery:test:  Test Files  1 passed (1)
@workmesh/recovery:test:       Tests  7 passed (7)
@workmesh/worker:test:  Test Files  23 passed (23)
@workmesh/worker:test:       Tests  163 passed | 2 skipped (165)
@workmesh/api:test:  Test Files  33 passed (33)
@workmesh/api:test:       Tests  174 passed (174)
@workmesh/web:test:  Test Files  113 passed (113)
@workmesh/web:test:       Tests  776 passed (776)
 Tasks:    29 successful, 29 total
Cached:    28 cached, 29 total
  Time:    1m41.976s 
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

## pnpm --dir apps/web exec vitest run e2e/playwright-config-contract.test.ts

退出码：0。

```text
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## pnpm exec vitest run scripts/verify-web-ui-final-verification.test.ts scripts/run-web-ui-final-playwright.test.ts

退出码：0。

```text
 Test Files  2 passed (2)
      Tests  17 passed (17)
```

## pnpm exec tsx scripts/verify-playwright-suite-scope.mts --output .tmp/d0-review-suite-scope.json

退出码：0。

```text
四个测试发现与归属校验均通过，见 review-suite-scope.json
```

## pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --grep 看板 --update-snapshots=all

退出码：0。

```text
  ok 1 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (4.8s)
  ok 2 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (4.4s)
  2 passed (23.7s)
```

## pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none

退出码：1。

```text
  ok  1 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作台：覆盖、两次采集一致、D1 可直接比对 (11.4s)
  ok  2 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (9.5s)
  ok  3 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 项目总览：覆盖、两次采集一致、D1 可直接比对 (5.6s)
  ok  4 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › Agent 详情：覆盖、两次采集一致、D1 可直接比对 (7.3s)
  ok  5 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项列表：覆盖、两次采集一致、D1 可直接比对 (5.6s)
  x   6 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项详情：覆盖、两次采集一致、D1 可直接比对 (4.7s)
  ok  7 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 设置：覆盖、两次采集一致、D1 可直接比对 (5.8s)
  ok  8 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作台：覆盖、两次采集一致、D1 可直接比对 (4.3s)
  ok  9 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (4.5s)
  ok 10 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 项目总览：覆盖、两次采集一致、D1 可直接比对 (4.4s)
  ok 11 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › Agent 详情：覆盖、两次采集一致、D1 可直接比对 (4.4s)
  ok 12 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项列表：覆盖、两次采集一致、D1 可直接比对 (4.9s)
  ok 13 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项详情：覆盖、两次采集一致、D1 可直接比对 (4.6s)
  ok 14 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 设置：覆盖、两次采集一致、D1 可直接比对 (4.1s)
    Error: expect(page).toHaveScreenshot(expected) failed
      3 pixels (ratio 0.01 of all image pixels) are different.
      - 3 pixels (ratio 0.01 of all image pixels) are different.
      - 3 pixels (ratio 0.01 of all image pixels) are different.
    Expected: e2e\baselines\d0\win32\desktop-1440x1000\issue-detail.png
    Received: ..\..\.tmp\d0-review-capture-final\mocked-dev\output\mocked-d0-visual-baseline.-ec6d8-基线-工作项详情：覆盖、两次采集一致、D1-可直接比对-desktop-1440x1000\issue-detail-1-actual.png
  1 failed
  13 passed (1.9m)
```

## pnpm --dir apps/web exec playwright test --config playwright.d0.config.ts --update-snapshots=none

退出码：1。

```text
  ok  1 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作台：覆盖、两次采集一致、D1 可直接比对 (6.7s)
  ok  2 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (4.9s)
  ok  3 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 项目总览：覆盖、两次采集一致、D1 可直接比对 (4.5s)
  ok  4 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › Agent 详情：覆盖、两次采集一致、D1 可直接比对 (5.7s)
  ok  5 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项列表：覆盖、两次采集一致、D1 可直接比对 (4.3s)
  ok  6 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项详情：覆盖、两次采集一致、D1 可直接比对 (4.9s)
  ok  7 [desktop-1440x1000] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 设置：覆盖、两次采集一致、D1 可直接比对 (5.3s)
  ok  8 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作台：覆盖、两次采集一致、D1 可直接比对 (4.1s)
  ok  9 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 看板：覆盖、两次采集一致、D1 可直接比对 (5.0s)
  ok 10 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 项目总览：覆盖、两次采集一致、D1 可直接比对 (4.2s)
  ok 11 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › Agent 详情：覆盖、两次采集一致、D1 可直接比对 (4.6s)
  ok 12 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项列表：覆盖、两次采集一致、D1 可直接比对 (4.7s)
  x  13 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 工作项详情：覆盖、两次采集一致、D1 可直接比对 (3.2s)
  ok 14 [mobile-390x844] › e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5 › D0 亮色视觉基线 › 设置：覆盖、两次采集一致、D1 可直接比对 (4.4s)
    Error: 两个独立上下文的 PNG 必须逐字节一致
    Expected: "c65f1e8467be0e81cae76a1de1e6ffc0a6829504c4d95b29b15375b715c62002"
    Received: "f9bacad2bef6b5927a04414e3a515b0344112c13d4a4ef94013f3d48f5966b6a"
  1 failed
  13 passed (1.4m)
```

## pnpm --dir apps/web exec playwright test --config playwright.mocked.config.ts

退出码：1。

```text
  ok   1 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 320x800 (1.7s)
  ok   2 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 375x812 (1.5s)
  ok   3 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 390x844 (1.5s)
  ok   4 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 760x900 (1.6s)
  ok   5 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 761x900 (1.7s)
  ok   6 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 768x1024 (1.8s)
  ok   7 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 1440x900 (1.8s)
  ok   8 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 1440x1000 (1.6s)
  ok   9 e2e\human-reflow.spec.ts:135:3 › project rail and shell reflow at 1920x1080 (1.7s)
  x   10 e2e\mocked\accessibility-keyboard.mocked.spec.ts:368:3 › Task 6.6 desktop English keyboard and semantic journey › covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore (16.9s)
  x   11 e2e\mocked\accessibility-keyboard.mocked.spec.ts:511:3 › Task 6.6 phone Chinese keyboard and semantic journey › covers compact selectors, mobile navigation, local table scrolling, top layers, and containment (15.1s)
  x   12 e2e\mocked\accessibility-keyboard.mocked.spec.ts:623:3 › Agent and Session deep-link semantic smoke at 1920px en (18.1s)
  x   13 e2e\mocked\accessibility-keyboard.mocked.spec.ts:623:3 › Agent and Session deep-link semantic smoke at 390px zh-CN (12.7s)
  ok  14 e2e\mocked\accessibility-keyboard.mocked.spec.ts:658:3 › Login Install and Connect public semantic boundary at 1920px en (19.0s)
  ok  15 e2e\mocked\accessibility-keyboard.mocked.spec.ts:658:3 › Login Install and Connect public semantic boundary at 390px zh-CN (4.7s)
  x   16 e2e\mocked\agents-interactions.mocked.spec.ts:25:1 › restores approval URL state, keeps History read-only, and retries one bulk decision idempotently (12.5s)
  x   17 e2e\mocked\agents-interactions.mocked.spec.ts:70:1 › keeps Peek, Team Access, selection, URL, and stable Agent navigation independent (30.1s)
  ok  18 e2e\mocked\agents-interactions.mocked.spec.ts:119:1 › replays an equivalent direct decision once and rejects a conflicting body without a second commit (139ms)
  x   19 e2e\mocked\agents-interactions.mocked.spec.ts:154:1 › rejects malformed approval decisions before mutating the fixture (56ms)
  x   20 e2e\mocked\agents-responsive.mocked.spec.ts:180:3 › responsive product surfaces at 320x800 (11.6s)
  x   21 e2e\mocked\agents-responsive.mocked.spec.ts:180:3 › responsive product surfaces at 375x812 (11.4s)
  x   22 e2e\mocked\agents-responsive.mocked.spec.ts:180:3 › responsive product surfaces at 390x844 (11.6s)
  x   23 e2e\mocked\agents-responsive.mocked.spec.ts:180:3 › responsive product surfaces at 760x900 (11.6s)
  x   24 e2e\mocked\agents-responsive.mocked.spec.ts:180:3 › responsive product surfaces at 761x900 (11.6s)
```

## pnpm --dir apps/web exec playwright test --config playwright.mocked.config.ts e2e/mocked/accessibility-keyboard.mocked.spec.ts --grep "covers Home detail" --max-failures=1

退出码：1。

```text
  x  1 e2e\mocked\accessibility-keyboard.mocked.spec.ts:368:3 › Task 6.6 desktop English keyboard and semantic journey › covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore (18.9s)
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.agent-registry-card')
    Expected: 2
    Received: 0
  1 failed
```

## pnpm --dir apps/web exec playwright test --config ../../.tmp/d0-review-original.config.ts e2e/mocked/accessibility-keyboard.mocked.spec.ts --grep "covers Home detail" --max-failures=1

退出码：1。

```text
  x  1 e2e\mocked\accessibility-keyboard.mocked.spec.ts:368:3 › Task 6.6 desktop English keyboard and semantic journey › covers Home detail, Agents, Settings, Operations, tabs, tables, layers, and focus restore (17.3s)
Testing stopped early after 1 maximum allowed failures.
    Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('.agent-registry-card')
    Expected: 2
    Received: 0
  1 failed
```
