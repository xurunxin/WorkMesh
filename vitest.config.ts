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
  test: { include: ['**/*.test.ts', '**/*.test.tsx'], exclude: ['**/node_modules/**', '**/integration/**'], setupFiles: localVitestSetup(), passWithNoTests: true },
})
