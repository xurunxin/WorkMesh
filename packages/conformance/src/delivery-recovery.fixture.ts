import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import type {Client} from '@modelcontextprotocol/sdk/client/index.js'
import type {Capability} from '@workmesh/contracts'
import {FakeGitProvider} from '@workmesh/git-provider'
import {createProviderActionWorker} from '../../../apps/worker/src/provider-actions.js'
import {createArtifactUploadWorker} from '../../../apps/worker/src/artifact-uploads.js'
import {artifactStorageFromEnvironment} from '../../artifact-storage/src/index.js'
import {createPlanningCollaborationFixture,type ModelCall} from './planning-collaboration.fixture.js'
import type {Execution} from './mcp-coverage.fixture.js'

export const deliveryCapabilities:Capability[]=['work:read','work:write','plan:write','artifact:write','message:write','repo:read','repo:write_branch','repo:open_pr','repo:merge','ci:run']
export const saveDeliveryEvidence=(name:string,value:unknown)=>{
  const root=resolve(import.meta.dirname,'../../../ci-logs/delivery-recovery');mkdirSync(root,{recursive:true})
  writeFileSync(resolve(root,name),JSON.stringify(value,null,2).replace(/wm[ips]_[A-Za-z0-9_-]+/g,'[credential]')+'\n')
}
export const sha256=(text:string)=>`sha256:${createHash('sha256').update(text).digest('hex')}`
export type DeliveryMode='native'|'mcp'|'pi'
export async function createDeliveryRecoveryFixture(){
  const f=await createPlanningCollaborationFixture({capabilities:deliveryCapabilities,features:{WORKMESH_BETA_PLANNING:'true'}})
  const provider=new FakeGitProvider(),worker=()=>createProviderActionWorker({db:f.db,resolveProvider:()=>provider,workerId:`m3-${randomUUID()}`})
  const prepare=async(mode:DeliveryMode,budget?:Record<string,number>)=>{
    const project=await f.human<{id:string}>('POST','/api/v1/projects',{teamId:f.teamId,name:`M3 ${mode}`})
    const parent=await f.createExecution(`M3 ${mode} Git evidence`,false,budget,project.id)
    const connection=await f.human<{id:string}>('POST','/api/v1/provider-connections',{provider:'fake',externalAccountId:randomUUID(),displayName:'M3 local fake',webhookSecret:'m3-local-public-placeholder'})
    const repository=await f.human<{id:string}>('POST','/api/v1/repositories',{connectionId:connection.id,teamId:f.teamId,externalId:randomUUID(),fullName:'m3/local',defaultBranch:'main',requiredChecks:['required']})
    const external=(await f.db.query<{external_id:string}>('SELECT external_id FROM repositories WHERE id=$1',[repository.id])).rows[0]!.external_id
    provider.seedRepository(connection.id,external,'main','base')
    provider.seedRepositoryFiles(connection.id,external,'base',{'AGENTS.md':'# M3 local guidance\n','src/AGENTS.md':'# Allowed source\n'})
    const pin=await f.human<{id:string}>('POST',`/api/v1/repositories/${repository.id}/context`,{workItemId:parent.workItemId,baseBranch:'main',baseSha:'base',branchPattern:'workmesh/{workItemKey}-{slug}',allowedPaths:['src/**'],permissions:['read','write_branch','open_pr','review','merge','ci']})
    await worker().tick()
    // Admin-owned test seed: explicit repository scope on the already approved
    // executor; no role or capability is added by an Agent request.
    await f.db.query("UPDATE delegations SET capability_scope=capability_scope || jsonb_build_object('repositoryIds',jsonb_build_array($2::text)) WHERE id=(SELECT delegation_id FROM agent_sessions WHERE id=$1)",[parent.sessionId,repository.id])
    const item=(await f.db.query<{key:string;number:number}>('SELECT t.key,w.number FROM work_items w JOIN teams t ON t.id=w.team_id WHERE w.id=$1',[parent.workItemId])).rows[0]!
    const step=randomUUID(),reviewStep=randomUUID()
    const revision=(await parent.client.getSession<{revision:number}>(parent.sessionId)).revision
    await parent.client.publishPlan(parent.sessionId,{changeSummary:'M3 Git and independent review',steps:[{id:step,title:'Git evidence',ordinal:0,status:'completed',dependsOn:[],acceptanceCriteria:[],expectedArtifacts:[]},{id:reviewStep,title:'Independent exact-head review',ordinal:1,status:'pending',dependsOn:[step],acceptanceCriteria:[],expectedArtifacts:['code_review']}]},{ifMatch:revision})
    const plan=await parent.client.getPlan<{id:string}>(parent.sessionId)
    const target=await f.registerTarget(['work:read','work:write','artifact:write','repo:read'])
    const mcp=await f.connect('read-write',parent)
    return {mode,parent,projectId:project.id,connectionId:connection.id,repositoryId:repository.id,external,branch:`workmesh/${item.key}-${item.number}-delivery`,step,reviewStep,planId:plan.id,target,mcp,pinId:pin.id}
  }
  const mcpCall=async<T>(client:Client,name:string,args:Record<string,unknown>):Promise<T>=>{
    const result=await client.callTool({name,arguments:args})
    if(result.isError)throw new Error(JSON.stringify(result.structuredContent??result.content))
    return (result.structuredContent as {data:T}).data
  }
  const piCall=async<T>(execution:Execution,installationToken:string,name:string,args:Record<string,unknown>,options:{apiUrl?:string;beforeRun?:()=>Promise<void>;beforeTool?:()=>Promise<void>}={}):Promise<T>=>{
    const captures=await f.pi(execution,installationToken,[async():Promise<ModelCall>=>{await options.beforeTool?.();return {name,arguments:args}}],options)
    const raw=captures.at(-1)?.results.at(-1)
    if(!raw)throw new Error('M3 model did not receive tool result')
    saveDeliveryEvidence(`model-${randomUUID()}.json`,{sessionId:execution.sessionId,name,captures})
    const outer:unknown=JSON.parse(raw)
    let result:unknown
    try {result=typeof outer==='string'?JSON.parse(outer) as unknown:outer}
    catch {throw new Error(typeof outer==='string'?outer:'M3 malformed model result')}
    if(captures.flatMap(capture=>capture.results).some(value=>/X-Amz-Signature|"uploadUrl"|"downloadUrl"|"requiredHeaders"/i.test(value)))throw new Error('M3_MODEL_RECEIVED_SIGNED_MATERIAL')
    if(Array.isArray(result)&&result.length>0&&result.every(issue=>issue&&typeof issue==='object'&&typeof issue.code==='string'&&Array.isArray(issue.path)&&typeof issue.message==='string'))throw new Error(JSON.stringify({validationIssues:result}))
    if(result&&typeof result==='object'&&'error' in result&&result.error)throw new Error(JSON.stringify(result))
    return result as T
  }
  return {...f,provider,worker,prepare,mcpCall,piCall,
    verifyUploads:()=>createArtifactUploadWorker({db:f.db,storage:artifactStorageFromEnvironment(),workerId:`m3-upload-${randomUUID()}`}).tick()}
}
