// These tests read production files outside their workspace. This inventory is
// shared by PR selection and the validator of Turbo's external test inputs.
export const externalTestInputs = {
  '@workmesh/db': ['apps/api/src/**', 'apps/worker/src/**'],
  '@workmesh/contracts': ['OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'README.md', '.env.example', 'pnpm-lock.yaml', '.github/workflows/**', 'packages/db/src/migration-manifest.ts', 'docs/**', 'scripts/**'],
}

export function testConsumers(paths) {
  return Object.entries(externalTestInputs)
    .filter(([, inputs]) => inputs.some(input => paths.some(path =>
      input.endsWith('/**') ? path.startsWith(input.slice(0, -2)) : path === input)))
    .map(([name]) => name)
}
