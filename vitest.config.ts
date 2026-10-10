import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export function localVitestSetup(cwd = process.cwd()): string[] {
  const setupFile = resolve(cwd, 'vitest-setup.ts')
  return existsSync(setupFile) ? [setupFile] : []
}

// apps/web uses `"jsx": "preserve"` in tsconfig because Next.js does the
// transform at build time. Under vitest, esbuild needs the automatic
// transform so .tsx files can be loaded directly. packages/ui already
// uses `"jsx": "react-jsx"`, so this setting is a no-op there.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/integration/**', '**/mcp-coverage.conformance.test.ts', '**/execution-recovery.conformance.test.ts', '**/planning-collaboration.conformance.test.ts', '**/delivery-recovery.conformance.test.ts', '**/joint-clients.conformance.test.ts'],
    setupFiles: localVitestSetup(),
    passWithNoTests: true,
    // Turbo runs every package's suite in parallel, and each suite was asking
    // for a worker per core. On a 20-core host that is several hundred
    // processes competing for the same cores, and the heavy jsdom suites
    // (the 300-card work item and agent suites) then lost their wall-clock
    // budget to scheduling delay rather than to the work they assert. Capping
    // the pool keeps a suite's cost proportional to the boxes actually running
    // and leaves a full core's worth of headroom for the package running
    // beside it. It changes no assertion.
    poolOptions: { threads: { minThreads: 1, maxThreads: 4 } },
  },
})
