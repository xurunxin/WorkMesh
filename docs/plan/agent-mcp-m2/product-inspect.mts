import { writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { createWorkMeshMcpServer, mcpPolicyBindings } from '../../../apps/mcp/src/index.js'
import { WorkMeshClient } from '../../../packages/agent-sdk/src/index.js'
import { agentDiscoveryBindings, routePolicyManifest } from '../../../packages/contracts/src/index.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const client = new WorkMeshClient({baseUrl:'http://127.0.0.1:1',coordinationToken:'inspection-only'})
const server = createWorkMeshMcpServer({client,mode:'read-write',coordination:true})
try {
  const tools = Object.keys((server as unknown as {_registeredTools: Record<string,unknown>})._registeredTools).sort()
  const runner = await readFile(resolve(root,'apps/agent-runner/src/workmesh-tools.ts'),'utf8')
  const runnerNames = [...runner.matchAll(/name:\s*'(workmesh_[^']+)'/g)].map(match=>match[1]).sort()
  await writeFile(resolve(root,'docs/plan/agent-mcp-m2/product-consumer-inspection.json'),JSON.stringify({
    kind:'本机实际注册与源码检查，不发HTTP，不代产品执行',tools,runnerLiteralNames:runnerNames,
    mcpPolicyBindings,agentDiscoveryBindings,routePolicyManifest,
  },null,2)+'\n')
  console.log(JSON.stringify({tools:tools.length,runnerLiteralNames:runnerNames.length,policies:routePolicyManifest.length,networkCalls:0}))
} finally {await server.close()}
