import assert from 'node:assert/strict'
import { FakeA2AAgent } from '../../../packages/a2a-adapter/src/index.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type { Execution } from './mcp-coverage.fixture.js'
import { createOptionalDomainsFixture, saveOptionalEvidence } from './optional-domains.fixture.js'

/** CI 与本机 native 验收复用相同六域和准确 origin/target 凭据。 */
export async function createOptionalConsumerFixture() {
  let f:Awaited<ReturnType<typeof createOptionalDomainsFixture>> | undefined
  let origin:Execution,target:Execution
  let targetInstallation:string
  let projectId:string,initiativeId:string,viewId:string,privateViewId:string,loopId:string,runId:string,templateId:string,bindingId:string,taskId:string,targetAgentId:string
  const pinnedMarkdown='M4 中文完整执行指引\n'.repeat(6000)
  try {
    f=await createOptionalDomainsFixture()
    projectId=(await f.human<{id:string}>('POST','/api/v1/projects',{teamId:f.teamId,name:'M4 authorized project'})).id
    origin=await f.createExecution('M4 exact origin',false,undefined,projectId)
    const other=(await f.human<{id:string}>('POST','/api/v1/projects',{teamId:f.teamId,name:'M4 excluded linked project'})).id
    initiativeId=(await f.human<{id:string}>('POST','/api/v1/initiatives',{name:'M4 nonempty rollup',ownerActorId:f.humanActorId,status:'active',projectIds:[projectId,other]})).id
    await f.human('POST','/api/v1/cycles',{teamId:f.teamId,name:'M4 Cycle',startsAt:'2020-01-01T00:00:00Z',durationWeeks:1})
    viewId=(await f.human<{id:string}>('POST','/api/v1/advanced-views',{name:'M4 visible View',entityType:'issue',layout:'list',scope:'team',teamId:f.teamId})).id
    privateViewId=(await f.human<{id:string}>('POST','/api/v1/advanced-views',{name:'M4 Human private',entityType:'issue',layout:'list',scope:'private'})).id
    await f.human('POST','/api/v1/automation-rules',{teamId:f.teamId,name:'M4 existing Rule',trigger:{type:'event',eventTypes:['m4.controlled.never']},actions:[{type:'notify',parameters:{recipientActorId:f.humanActorId,title:'M4 controlled'}}]})
    const recipient=await f.registerTarget(['work:read','work:write','artifact:write','plan:write','message:write'])
    targetInstallation=recipient.token
    targetAgentId=recipient.agentId
    const template=await f.human<{id:string;versionId:string;revision:number}>('POST','/api/v1/templates',{teamId:f.teamId,kind:'agent_run',name:'M4 pinned Template',body:{instructions:pinnedMarkdown,requiredCapabilities:['work:read','work:write','artifact:write','plan:write','message:write']}})
    templateId=template.id
    await f.human('POST',`/api/v1/templates/${template.id}/state`,{status:'active'},template.revision)
    loopId=(await f.human<{id:string}>('POST','/api/v1/loops',{name:'M4 bounded Loop',ownerActorId:f.humanActorId,teamId:f.teamId,projectId,agentId:recipient.agentId,runTemplateVersionId:template.versionId,trigger:{type:'event',eventTypes:['m4.controlled.never']},budget:{maxTokens:100,maxCostMinor:'100',currency:'USD'},noOverlap:true})).id
    const admitted=await f.coordination.runLoopNow(loopId,{occurrenceKey:'m4-first',scheduledFor:'2020-01-01T00:00:00Z'},{idempotencyKey:'m4-first'})
    assert.ok(admitted.sessionId);runId=admitted.runId
    // Loop admission currently records a queued Session without issuing a
    // webhook bootstrap. Use its existing, authority-checked installation
    // refresh endpoint; the origin client and its credential stay untouched.
    const targetClient=new WorkMeshClient({baseUrl:f.baseUrl,installationToken:recipient.token})
    await assert.rejects(new WorkMeshClient({baseUrl:f.baseUrl,installationToken:f.connectionToken}).refreshSessionToken(admitted.sessionId!))
    const accepted=await targetClient.refreshSessionToken(admitted.sessionId!,recipient.token,{idempotencyKey:'m4-target-bootstrap'})
    await targetClient.acknowledge(admitted.sessionId!,{summary:'M4 exact Loop target accepted',externalUrls:[]})
    const queued=await targetClient.getSession<{revision:number}>(admitted.sessionId!)
    await targetClient.transitionState(admitted.sessionId!,'executing','M4 exact target lifecycle',{ifMatch:queued.revision})
    target={sessionId:admitted.sessionId!,workItemId:'',token:accepted.sessionToken,client:targetClient}
    const fake=new FakeA2AAgent()
    const definition=await f.human<{revision:number}>('GET',`/api/v1/agents/${recipient.agentId}`)
    await f.human('PATCH',`/api/v1/agents/${recipient.agentId}`,{supportedProtocols:['native_http','a2a']},definition.revision)
    bindingId=(await f.human<{id:string}>('POST','/api/v1/a2a-bindings',{agentId:recipient.agentId,protocolVersion:'0.3',agentCard:{...fake.card,url:'https://example.com/a2a'}})).id
    taskId='m4-loop-task'
    // Privileged adapter mapping fixture. No imported task or external call;
    // the target Session itself was genuinely admitted/refreshed/acknowledged.
    await f.db.query('INSERT INTO a2a_task_bindings(binding_id,external_task_id,session_id) VALUES($1,$2,$3)',[bindingId,taskId,target.sessionId])
    saveOptionalEvidence('six-domain-fixture.json',{projectId,initiativeId,viewId,privateViewId,loopId,runId,templateId,bindingId,taskId,originSession:origin.sessionId,targetSession:target.sessionId,targetInstallationRefresh:true,foreignInstallationRefused:true,signedTargetDelivery:false,loopWebhookBootstrapUnsupported:true,privilegedA2ATaskMapping:true,productionChanged:false})

    return {f,origin,target,targetInstallation,projectId,initiativeId,viewId,privateViewId,loopId,runId,templateId,bindingId,taskId,targetAgentId,pinnedMarkdown}
  } catch(error) {await f?.close();throw error}
}
