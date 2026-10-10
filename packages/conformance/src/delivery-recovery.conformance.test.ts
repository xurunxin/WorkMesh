import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import type {ProviderActionProjection,ReviewDelegationResponse} from '@workmesh/contracts'
import {canonicalMergeApprovalPayload} from '@workmesh/domain'
import {createDeliveryRecoveryFixture,saveDeliveryEvidence,sha256,type DeliveryMode} from './delivery-recovery.fixture.js'

type Fixture=Awaited<ReturnType<typeof createDeliveryRecoveryFixture>>
let f:Fixture
describe('M3 Native HTTP/MCP/Pi精确Git与review闭环',()=>{
  beforeAll(async()=>{f=await createDeliveryRecoveryFixture()})
  afterAll(async()=>{if(f)await f.close()})
  it.each(['parent','definition','grant','context'] as const)('显式review成功→%s收窄/撤权→原key/body重放拒绝且不重复交付',async kind=>{
    const s=await f.prepare('native'),key=randomUUID()
    const body={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Bounded repository review',ttlSeconds:3600,repositoryIds:[s.repositoryId]}
    const create=()=>s.parent.client.createReviewDelegation(s.parent.sessionId,body,{idempotencyKey:key})
    const [first,second]=await Promise.all([create(),create()]);expect(second).toEqual(first)
    const counts=async()=>(await f.db.query(`SELECT (SELECT count(*)::int FROM agent_sessions) AS children,
      (SELECT count(*)::int FROM delegations) AS delegations,(SELECT count(*)::int FROM session_budget_reservations) AS reservations,
      (SELECT count(*)::int FROM leases) AS leases,(SELECT count(*)::int FROM agent_webhook_deliveries) AS deliveries,
      (SELECT count(*)::int FROM api_idempotency_keys) AS receipts`)).rows[0]
    const before=await counts();expect(await create()).toEqual(first);expect(await counts()).toEqual(before)
    const delegation=(await f.db.query('SELECT permissions_snapshot,capability_scope FROM delegations WHERE id=$1',[first.session.delegation_id])).rows[0]!
    expect(delegation.permissions_snapshot).toEqual(['work:read','work:write','artifact:write','repo:read'])
    expect(delegation.capability_scope.repositoryIds).toEqual([s.repositoryId])
    if(kind==='parent')await f.db.query("UPDATE delegations SET capability_scope=capability_scope || '{\"repositoryIds\":[]}'::jsonb WHERE id=(SELECT delegation_id FROM agent_sessions WHERE id=$1)",[s.parent.sessionId])
    if(kind==='definition')await f.db.query("UPDATE agent_definitions SET approved_capabilities=array_remove(approved_capabilities,'repo:read') WHERE id=$1",[s.target.agentId])
    if(kind==='grant')await f.db.query("UPDATE agent_team_access SET approved_capabilities=array_remove(approved_capabilities,'repo:read') WHERE agent_id=$1 AND team_id=$2",[s.target.agentId,f.teamId])
    if(kind==='context') {
      await f.human('POST',`/api/v1/repositories/${s.repositoryId}/context`,{sessionId:s.parent.sessionId,baseBranch:'main',baseSha:'base',branchPattern:'workmesh/{workItemKey}-{slug}',allowedPaths:['src/**'],permissions:['read','review']})
      await f.worker().tick()
    }
    const changed=await counts()
    await expect(create()).rejects.toMatchObject({status:403})
    expect(await counts()).toEqual(changed)
    saveDeliveryEvidence(`review-replay-${kind}.json`,{childId:first.session.id,before,changed,after:await counts(),originalKeyRejected:true})
  })
  it.each(['native','mcp','pi'] as DeliveryMode[])('%s准确base/path→Git action→独立reviewer→Human批准→终态',async mode=>{
    const s=await f.prepare(mode),p=s.parent
    const link={sessionId:p.sessionId,workItemId:p.workItemId,projectId:s.projectId,repositoryId:s.repositoryId,planStepId:s.step}
    const lease=await p.client.acquireLease({sessionId:p.sessionId,resourceType:'work_item',resourceId:p.workItemId,kind:'exclusive',ttlSeconds:3600,reason:'M3 exact delivery'})
    expect(lease).toHaveProperty('id')
    const context=await p.client.getRepositoryContext<Array<{base_sha:string;allowed_paths:string[];guidance:unknown[]}>>(s.repositoryId)
    expect(context[0]).toMatchObject({base_sha:'base',allowed_paths:['src/**']});expect(context[0]!.guidance.length).toBeGreaterThan(0)
    const invoke=async<T>(native:()=>Promise<T>,mcp:string,pi:string,args:Record<string,unknown>):Promise<T>=>mode==='native'?native():mode==='mcp'?f.mcpCall(s.mcp,mcp,args):f.piCall(p,f.connectionToken,pi,Object.fromEntries(Object.entries(args).filter(([key])=>!['sessionId','idempotencyKey'].includes(key))))
    const confirm=async(id:string)=>{
      await f.worker().tick()
      const result=await invoke(()=>p.client.getProviderAction(id),'get_provider_action','workmesh_get_provider_action',{id,sessionId:p.sessionId})
      expect(result).toMatchObject({id,status:'completed',effect:'committed',recovery:{kind:'none'}})
      return result as ProviderActionProjection
    }
    const b={...link,name:s.branch,baseSha:'base'}
    const branch=await invoke(()=>p.client.requestProviderAction<{id:string}>({...b,kind:'create_branch'},{idempotencyKey:randomUUID()}),'create_repository_branch','workmesh_create_repository_branch',{...b,idempotencyKey:randomUUID()})
    await confirm(branch.id)
    const c={...link,branch:s.branch,expectedHeadSha:'base',message:'M3 local change',files:[{path:'src/change.ts',content:'export const exact = true\n'}]}
    const commit=await invoke(()=>p.client.requestProviderAction<{id:string}>({...c,kind:'create_commit'},{idempotencyKey:randomUUID()}),'create_repository_commit','workmesh_create_repository_commit',{...c,idempotencyKey:randomUUID()})
    const commitResult=await confirm(commit.id)
    expect(commitResult.kind).toBe('create_commit')
    const open={...link,baseBranch:'main',headBranch:s.branch,title:'M3 delivery',body:'Current-head evidence',draft:false}
    const opened=await invoke(()=>p.client.requestProviderAction<{id:string}>({...open,kind:'open_pull_request'},{idempotencyKey:randomUUID()}),'open_pull_request','workmesh_open_pull_request',{...open,idempotencyKey:randomUUID()})
    const action=await confirm(opened.id)
    if(action.kind!=='open_pull_request'||!action.result?.projectionId)throw new Error('Missing exact PR projection')
    const pr=action.result.projectionId,head=action.result.headSha
    // Provider-observation fixture uses the actual durable webhook/job path.
    await f.db.query(`INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
      VALUES($1,$2,$3,'check_run',$4,$5)`,[s.connectionId,s.repositoryId,randomUUID(),sha256(head),{check_run:{id:42,name:'required',status:'completed',conclusion:'success',head_sha:head,updated_at:new Date().toISOString(),pull_requests:[{number:action.result.number}]}}])
    await f.worker().tick()
    const evidenceInput={...link,pullRequestId:pr,headSha:head,type:'test_report' as const,title:'Current-head checks',checksum:sha256(head),sourceTool:'M3 conformance',result:'passed' as const,metadata:{headSha:head}}
    const evidence=await invoke(()=>p.client.publishDeliveryArtifact<{id:string}>(evidenceInput,{idempotencyKey:randomUUID()}),'publish_delivery_artifact','workmesh_publish_delivery_artifact',evidenceInput)
    const reviewInput={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Review exact repository and current head',ttlSeconds:3600,repositoryIds:[s.repositoryId]}
    const delegated=await invoke(()=>p.client.createReviewDelegation(p.sessionId,reviewInput,{idempotencyKey:randomUUID()}),'create_review_delegation','workmesh_create_review_delegation',{...reviewInput,sessionId:p.sessionId,idempotencyKey:randomUUID()}) as ReviewDelegationResponse
    const reviewer=await f.receive(delegated.session.id,s.target.token)
    const r=await f.connect('read-write',reviewer)
    const read=await f.mcpCall<{providerPullRequests:Array<{id:string;headSha:string}>}>(r,'get_project_delivery',{projectId:s.projectId,pullRequestId:pr,sessionId:reviewer.sessionId})
    expect(read.providerPullRequests).toHaveLength(1);expect(read.providerPullRequests[0]).toMatchObject({id:pr,headSha:head})
    const room=(await f.db.query<{id:string}>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1",[p.sessionId])).rows[0]!.id
    await f.mcpCall(r,'post_work_room_message',{sessionId:reviewer.sessionId,roomId:room,intent:'review_result',body:'Independent exact-head review approved',payload:{pullRequestId:pr,headSha:head}})
    const reviewArtifactInput={...link,sessionId:reviewer.sessionId,planStepId:undefined,pullRequestId:pr,headSha:head,type:'code_review' as const,title:'Independent review',checksum:sha256('review:'+head),sourceTool:'M3 reviewer',result:'passed' as const,metadata:{headSha:head}}
    const artifact=mode==='pi'?await f.piCall<{id:string}>(reviewer,s.target.token,'workmesh_publish_delivery_artifact',Object.fromEntries(Object.entries(reviewArtifactInput).filter(([key])=>key!=='sessionId'))):await f.mcpCall<{id:string}>(r,'publish_delivery_artifact',reviewArtifactInput)
    await f.mcpCall(r,'publish_structured_review',{sessionId:reviewer.sessionId,pullRequestId:pr,artifactId:artifact.id,headSha:head,verdict:'approved',summary:'Reviewed actual head and current required checks',findings:[],evidence:[evidence.id]})
    const rr=await reviewer.client.getSession<{revision:number}>(reviewer.sessionId)
    await reviewer.client.complete(reviewer.sessionId,{summary:'Independent review delivered',artifactIds:[artifact.id],checks:[],limitations:[]},{ifMatch:rr.revision})
    const children=await p.client.listChildSessions(p.sessionId,{childSessionId:reviewer.sessionId})
    expect(children.items[0]).toMatchObject({state:'completed',resultArtifactIds:[artifact.id]})
    const payload={provider:'fake' as const,connectionId:s.connectionId,repositoryId:s.repositoryId,pullRequestId:action.result.providerPullRequestId,headSha:head,method:'squash' as const}
    const hash=sha256(canonicalMergeApprovalPayload(payload))
    const approval=await p.client.requestApproval({sessionId:p.sessionId,approvalType:'merge',actionName:'provider.pull_request.merge',actionPayloadSanitized:payload,actionPayloadHash:hash,riskLevel:'high',rationaleSummary:'Exact-head reviewed',requiredApprovals:1,expiresAt:new Date(Date.now()+600000).toISOString()}) as unknown as {id:string;revision:number}
    await f.human('POST',`/api/v1/approvals/${approval.id}/decide`,{decision:'approved',reason:'Human reviewed exact head'},approval.revision)
    const mergeInput={sessionId:p.sessionId,approvalId:approval.id,actionPayloadHash:hash,headSha:head,method:'squash' as const}
    const merge=await invoke(()=>p.client.requestMerge<{id:string}>(pr,mergeInput,{idempotencyKey:randomUUID()}),'merge_pull_request','workmesh_merge_pull_request',{...mergeInput,pullRequestId:pr,idempotencyKey:randomUUID()})
    await confirm(merge.id)
    expect((await f.db.query('SELECT status FROM approvals WHERE id=$1',[approval.id])).rows[0]).toEqual({status:'consumed'})
    expect((await f.db.query('SELECT s.category FROM work_items w JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1',[p.workItemId])).rows[0]!.category).not.toBe('completed')
    const revision=(await p.client.getSession<{revision:number}>(p.sessionId)).revision
    const completionKey=randomUUID()
    await p.client.complete(p.sessionId,{summary:'Git and independent review delivered',artifactIds:[evidence.id],checks:[],limitations:[]},{ifMatch:revision,idempotencyKey:completionKey})
    const results=await f.coordination.getSessionExecutionResult(p.sessionId,{action:'complete',operationKey:completionKey})
    expect(results).toMatchObject({session:{id:p.sessionId,state:'completed'},action:{confirmation:'confirmed',operationKey:completionKey},originalResult:{sessionId:p.sessionId}})
    saveDeliveryEvidence(`${mode}-chain.json`,{repositoryId:s.repositoryId,branch:s.branch,context,actions:[branch.id,commit.id,opened.id,merge.id],head,reviewerSessionId:reviewer.sessionId,artifactIds:[evidence.id,artifact.id],approvalId:approval.id,children,results})
  })
})
