import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync,existsSync,appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer } from '../../../apps/mcp/src/index.js'
import { createPlanningCollaborationFixture } from './planning-collaboration.fixture.js'

export const optionalEvidenceRoot=resolve(import.meta.dirname,'../../../docs/plan/agent-mcp-m4/execution')
export const saveOptionalEvidence=(name:string,value:unknown)=>{
  const output=resolve(optionalEvidenceRoot,name)
  mkdirSync(resolve(output,'..'),{recursive:true})
  const bytes=Buffer.from(JSON.stringify(value,null,2).replace(/wm[ips]_[A-Za-z0-9_-]+/g,'[credential]')+'\n')
  const objects=resolve(optionalEvidenceRoot,'evidence-objects')
  mkdirSync(objects,{recursive:true})
  // Retain every observed revision by content identity, without duplicating
  // build trees or overwriting a first failure with a later successful run.
  for(const body of [existsSync(output)?readFileSync(output):undefined,bytes]) if(body) {
    const digest=createHash('sha256').update(body).digest('hex')
    const object=resolve(objects,digest)
    if(!existsSync(object))writeFileSync(object,body)
    appendFileSync(resolve(optionalEvidenceRoot,'evidence-ledger.ndjson'),JSON.stringify({name,sha256:digest,bytes:body.length,source:`evidence-objects/${digest}`,observedUtc:new Date().toISOString()})+'\n')
  }
  writeFileSync(output,bytes)
}
export const optionalFeatures={WORKMESH_BETA_PLANNING:'true',WORKMESH_BETA_TEMPLATES:'true',WORKMESH_BETA_COSTS:'true',WORKMESH_EXPERIMENTAL_AUTOMATION:'true',WORKMESH_EXPERIMENTAL_AGENT_LOOPS:'true',WORKMESH_EXPERIMENTAL_A2A:'true'}
export const createOptionalDomainsFixture=()=>createPlanningCollaborationFixture({features:optionalFeatures,
  capabilities:['work:read','work:write','plan:write','artifact:write','message:write','automation:manage']})

/** Capture real public registrations, before qualified tools/list filters.
 * Wrappers call the original SDK registration, including installDiscovery. */
export async function captureOptionalRegistration() {
  const originalTool=McpServer.prototype.registerTool
  const originalResource=McpServer.prototype.registerResource
  const captures:Array<{mode:string;bindings:string[]}>=[]
  let ids:string[]=[]
  try {
    McpServer.prototype.registerTool=(function(this:McpServer,...args:Parameters<typeof originalTool>) {
      ids.push('tool:'+args[0]);return Reflect.apply(originalTool,this,args)
    }) as typeof originalTool
    McpServer.prototype.registerResource=(function(this:McpServer,...args:Parameters<typeof originalResource>) {
      ids.push('resource:'+args[0]);return originalResource.apply(this,args)
    }) as typeof originalResource
    for(const mode of ['read-only','read-write'] as const) {
      ids=[]
      const server=createWorkMeshMcpServer({client:new WorkMeshClient({baseUrl:'http://127.0.0.1:1',sessionToken:'registration-only-no-request'}),mode,coordination:true,transport:'embedded'})
      captures.push({mode,bindings:[...new Set(ids)].sort()})
      await server.close()
    }
  } finally {
    McpServer.prototype.registerTool=originalTool;McpServer.prototype.registerResource=originalResource
  }
  const sources=['apps/mcp/src/index.ts','apps/mcp/src/discovery.ts','packages/agent-sdk/src/index.ts','packages/conformance/src/optional-domains.fixture.ts'].map(path=>{
    const bytes=readFileSync(resolve(optionalEvidenceRoot,'../../../..',path))
    return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
  })
  const result={kind:'actual_registerTool_registerResource',capturedUtc:new Date().toISOString(),networkRequests:0,captures,sources}
  saveOptionalEvidence('registration-capture.json',result)
  return result
}
if(process.argv.includes('--capture-registration')) {
  const result=await captureOptionalRegistration()
  console.log(JSON.stringify({modeCounts:result.captures.map(item=>({mode:item.mode,count:item.bindings.length})),networkRequests:0}))
}
