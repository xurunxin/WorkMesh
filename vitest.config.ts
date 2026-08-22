import { defineConfig } from 'vitest/config'

// apps/web uses `"jsx": "preserve"` in tsconfig because Next.js does the
// transform at build time. Under vitest, esbuild needs the automatic
// transform so .tsx files can be loaded directly. packages/ui already
// uses `"jsx": "react-jsx"`, so this setting is a no-op there.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['**/*.test.ts', '**/*.test.tsx'], exclude: ['**/node_modules/**', '**/integration/**'], setupFiles: ['./vitest-setup.ts'], passWithNoTests: true },
})
