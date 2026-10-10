import { buildApp } from '../../../apps/api/src/server.js'
import { loadFeatureConfig } from '@workmesh/config'

// Test-only process. The caller owns its PID and dedicated database.
const port = Number(process.env.M5_SERVICE_PORT ?? 0)
const app = buildApp({ features: loadFeatureConfig({ WORKMESH_BETA_COORDINATION_MCP: 'true', WORKMESH_BETA_PLANNING: 'true' }), logger: { level: 'error' } })
const url = await app.listen({ port, host: '127.0.0.1' })
console.log(JSON.stringify({ m5Service: 'api', url, pid: process.pid }))
process.once('SIGTERM', () => { void app.close().then(() => process.exit(0)) })
process.once('SIGINT', () => { void app.close().then(() => process.exit(0)) })
