// These tests read production files outside their workspace. This inventory is
// shared by PR selection and the validator of Turbo's external test inputs.
export const externalTestInputs = {
  '@workmesh/connector': ['apps/api/assets/skills/**', 'skills/workmesh/public-key.pem'],
  '@workmesh/db': ['apps/api/src/**', 'apps/worker/src/**'],
  '@workmesh/contracts': ['OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'README.md', '.env.example', 'pnpm-lock.yaml', '.github/workflows/**', 'packages/db/src/migration-manifest.ts', 'docs/**', 'scripts/**'],
}

// tsc includes integration/E2E fixtures too. Their direct imports are broader
// than runtime package dependencies; hash the source they actually compile.
const packageTypeInputs = ['packages/*/src/**', 'packages/*/package.json']
export const externalTypecheckInputs = {
  '@workmesh/connector': ['apps/api/src/**', 'apps/mcp/src/**', ...packageTypeInputs],
  '@workmesh/conformance': ['apps/api/src/**', 'apps/mcp/src/**', 'apps/connector/src/**', 'docs/integration/examples/**', ...packageTypeInputs],
  '@workmesh/api': ['apps/worker/src/**', 'apps/fake-agent/src/**', 'apps/mcp/src/**', 'apps/connector/src/**', 'apps/connector/test-support/**', ...packageTypeInputs],
}

export function testConsumers(paths) {
  return Object.entries(externalTestInputs)
    .filter(([, inputs]) => inputs.some(input => paths.some(path =>
      input.endsWith('/**') ? path.startsWith(input.slice(0, -2)) : path === input)))
    .map(([name]) => name)
}
