import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = resolve(import.meta.dirname, '../../..')
let runner = readFileSync(resolve(root, 'docs/reviews/a2/run-checks.mjs'), 'utf8')
runner = runner.replace('`a2-${randomUUID().slice(0, 8)}`', '`a2-backend-${randomUUID().slice(0, 8)}`')
runner = runner.replace("const files = spawnSync('git', ['ls-files', '-m', '-o', '--exclude-standard']", "const files = spawnSync('git', ['ls-files']")
runner = runner.replace(".filter(file => /^(apps\\/|packages\\/|scripts\\/|OPENAPI\\.yaml|playwright\\.config\\.ts)/.test(file) && existsSync(resolve(root, file)))", ".filter(file => /^(apps\\/|packages\\/|scripts\\/|infra\\/|deploy\\/|OPENAPI\\.yaml|docker-compose.lite.yml|playwright\\.config\\.ts)/.test(file) && existsSync(resolve(root, file)))")
const start = runner.indexOf("  const phase = process.argv[2]")
const end = runner.indexOf("} catch (error)", start)
runner = runner.slice(0, start) + `  const phase = process.argv[2] ?? 'backend'
  if (phase === 'backend') {
    await must(pnpm, ['--filter', '@workmesh/contracts', 'exec', 'vitest', 'run', 'src/repository-configuration-contracts.test.ts', 'src/pagination-contract.test.ts'])
    await must(pnpm, ['--filter', '@workmesh/db', 'exec', 'vitest', 'run', 'src/agent-lock-order-inventory.test.ts'])
    await must(pnpm, ['--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/stage3-delivery.integration.test.ts', 'integration/stage4-operations.integration.test.ts'])
  } else if (phase === 'required') {
    await must(pnpm, ['check:route-policy'])
    for (const name of ['lint', 'typecheck', 'test', 'test:integration', 'test:e2e', 'ci:validate']) await must(pnpm, [name])
    await must(pnpm, ['--filter', '@workmesh/web', 'build'])
  } else throw Error('Unknown backend phase')
` + runner.slice(end)
runner = runner.replace("resolve(import.meta.dirname, 'sanitize-evidence.ps1')", "resolve(root, 'docs/reviews/a2/sanitize-evidence.ps1')")
writeFileSync(resolve(import.meta.dirname, 'run-checks.mjs'), runner)
let lite = gunzipSync(readFileSync(resolve(import.meta.dirname, 'history/product/scripts/verify-a2-lite.mjs.git.gz'))).toString()
lite = lite.replace('`a2-lite-${randomUUID().slice(0, 8)}`', '`a2-backend-lite-${randomUUID().slice(0, 8)}`').replace("'docs/reviews/a2/runs'", "'docs/reviews/a2-backend/runs'")
const from = lite.indexOf("  const located = spawnSync", lite.indexOf('receipts.preInstallProxy'))
const to = lite.indexOf("} catch (error)", from)
lite = lite.slice(0, from) + `  await must(process.execPath, [resolve(root, 'scripts/verify-a2-backend-lite-api.mjs')])
  receipts.outcome = '本机无源码 Lite 现有 Web/后端兼容通过；原新横幅 UI、真实设备与真实厂商未验收'
` + lite.slice(to)
writeFileSync(resolve(root, 'scripts/verify-a2-backend-lite.mjs'), lite)
console.log('已准备独立后端检查及 Lite 入口，不修改历史 runner')
