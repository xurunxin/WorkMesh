import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const expected = new Map([
  ['.env.example', 'a08ec66ec5ca6c5b9bd5a558b381aa3d4bde347a9231284045e7204ee53f60d2'],
  ['docker-compose.yml', '5454a37075aa75b3e676bdc3c95326066708eea303a718ab825be1313b8f2ec3'],
  ['apps/api/src/agent-connections.ts', '3fee3064a203aa0f0b05c37afc0c9b41867ce3b54e4d2af2e33cbe01ca0c656d'],
  ['apps/api/src/server.ts', 'fa8173bc4a55615acf266c5ee894521a0c5b2c6e16a7803c6053f1d01fe3da24'],
  ['apps/api/src/origin-routing.test.ts', 'ee7be1ce55cdb3990539f49f396281a93eea571f43010e0c97732f981c9d686c'],
  ['packages/config/src/index.ts', 'e0ce817a65da10753256e38d3c6a802e41f40da776f4054d90d5dd0b17a07d63'],
  ['packages/config/src/index.test.ts', '1f086772d09948c6a6f7769c837fca5873125958bbf6edf965fc6ddcd46aa810'],
  ['packages/config/src/runtime-secrets.mjs', '5f131b44c7ce1cb7be2e4df7792e028fe86c7260ea3126481f662ba41a734a87'],
])

const text = (path) => readFileSync(path, 'utf8')
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const checks = []
const check = (name, condition) => {
  checks.push({ name, result: condition ? 'PASS' : 'BLOCK' })
}

for (const [path, hash] of expected) check(`hash:${path}`, sha256(path) === hash)

const server = text('apps/api/src/server.ts')
const connections = text('apps/api/src/agent-connections.ts')
const config = text('packages/config/src/index.ts')
const runtimeSecrets = text('packages/config/src/runtime-secrets.mjs')

check('config-public-origin-optional', config.includes('PUBLIC_MCP_ORIGIN: z.preprocess(') && config.includes('z.string().url().optional()'))
check('runtime-public-origin-url-validation', runtimeSecrets.includes("'PUBLIC_MCP_ORIGIN',"))
check('server-public-origin-fallback', server.includes('const publicMcpOrigin = config.PUBLIC_MCP_ORIGIN ?? config.WEB_ORIGIN;'))
check('cors-stays-browser-origin', server.includes('origin: config.WEB_ORIGIN,'))
check('realtime-stays-browser-origin', /registerRealtimeRoutes\([\s\S]*?webOrigin:\s*config\.WEB_ORIGIN,/.test(server))
check('agent-routes-receive-both-origins', server.includes('webOrigin: config.WEB_ORIGIN,\n    publicMcpOrigin,'))
check('discovery-uses-public-origin', connections.includes('mcpUrl: endpointUrls.mcpUrl, wellKnownUrl: endpointUrls.wellKnownUrl'))
check('connect-uses-browser-origin', connections.includes('connectUrl: (code: string) => `${webOrigin}/connect#${code}`'))
check('skill-uses-browser-origin', connections.includes('skillDownloadUrl: `${webOrigin}/skills/workmesh-1.1.0.md`'))
check('mcp-uses-public-origin', connections.includes('mcpUrl: `${publicMcpOrigin}/mcp`'))

const blocked = checks.filter((entry) => entry.result !== 'PASS')
const result = { result: blocked.length === 0 ? 'PASS' : 'BLOCK', checks, blocked }
console.log(JSON.stringify(result, null, 2))
if (blocked.length > 0) process.exitCode = 1
