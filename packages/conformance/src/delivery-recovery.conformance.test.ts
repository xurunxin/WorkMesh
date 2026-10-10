import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import type {ProviderActionProjection,ReviewDelegationResponse} from '@workmesh/contracts'
import {canonicalMergeApprovalPayload,canonicalActionApprovalPayload} from '@workmesh/domain'
import {sendArtifactBytes,readArtifactBytes} from '../../../apps/agent-runner/src/delivery-transfer.js'
import {createDeliveryRecoveryFixture,saveDeliveryEvidence,sha256,type DeliveryMode} from './delivery-recovery.fixture.js'

type Fixture=Awaited<ReturnType<typeof createDeliveryRecoveryFixture>>
let f:Fixture
describe('M3 Native HTTP/MCP/Pi精确Git与review闭环',()=>{
  beforeAll(async()=>{f=await createDeliveryRecoveryFixture()})
  afterAll(async()=>{if(f)await f.close()})
  it.each(['native','mcp','pi'] as DeliveryMode[])('%s精确action最新read/branch/path正负例与Human终态诊断',async mode=>{
    const s=await f.prepare(mode),p=s.parent
    const branch=await p.client.requestProviderAction<{id:string}>({kind:'create_branch',repositoryId:s.repositoryId,workItemId:p.workItemId,sessionId:p.sessionId,name:s.branch,baseSha:'base'})
    await f.worker().tick()
    if(mode==='native') {
      await expect(f.coordination.getProviderAction(branch.id)).rejects.toThrow()
      expect(await f.coordination.getProviderAction(branch.id,{sessionId:p.sessionId})).toMatchObject({id:branch.id,status:'completed'})
    }
    if(mode==='mcp') {
      const coordination=await f.connect('read-write')
      await expect(f.mcpCall(coordination,'get_provider_action',{id:branch.id})).rejects.toThrow()
      expect(await f.mcpCall(coordination,'get_provider_action',{id:branch.id,sessionId:p.sessionId})).toMatchObject({id:branch.id,status:'completed'})
    }
    const commit=await p.client.requestProviderAction<{id:string}>({kind:'create_commit',repositoryId:s.repositoryId,workItemId:p.workItemId,sessionId:p.sessionId,branch:s.branch,expectedHeadSha:'base',message:'Query original action',files:[{path:'src/query.ts',content:'safe'}]})
    await f.worker().tick()
    const read=async(id:string):Promise<ProviderActionProjection>=>mode==='native'?p.client.getProviderAction(id):mode==='mcp'?f.mcpCall(s.mcp,'get_provider_action',{id,sessionId:p.sessionId}):f.piCall(p,f.connectionToken,'workmesh_get_provider_action',{id})
    const results=[]
    for(const change of ['read','branch','path'] as const) {
      const id=change==='path'?commit.id:branch.id
      expect(await read(id)).toMatchObject({id,status:'completed'})
      const pin={workItemId:p.workItemId,baseBranch:'main',baseSha:'base',branchPattern:change==='branch'?'private/{workItemKey}-{slug}':'workmesh/{workItemKey}-{slug}',allowedPaths:change==='path'?['elsewhere/**']:['src/**'],permissions:change==='read'?['review']:['read','write_branch','open_pr','review','merge','ci']}
      await f.human('POST',`/api/v1/repositories/${s.repositoryId}/context`,pin);await f.worker().tick()
      if(mode==='native')await expect(read(id)).rejects.toMatchObject({code:'NOT_FOUND'})
      else await expect(read(id)).rejects.toThrow(/NOT_FOUND/)
      results.push({change,id,denied:true})
      await f.human('POST',`/api/v1/repositories/${s.repositoryId}/context`,{...pin,branchPattern:'workmesh/{workItemKey}-{slug}',allowedPaths:['src/**'],permissions:['read','write_branch','open_pr','review','merge','ci']});await f.worker().tick()
      expect(await read(id)).toMatchObject({id,status:'completed'})
    }
    const value=await read(commit.id)
    const revision=(await p.client.getSession<{revision:number}>(p.sessionId)).revision
    await p.client.complete(p.sessionId,{summary:'Original exact action confirmed',artifactIds:value.artifactIds,checks:[],limitations:[]},{ifMatch:revision})
    expect(await f.human('GET',`/api/v1/provider-actions/${commit.id}`)).toMatchObject({id:commit.id,status:'completed'})
    await expect(read(commit.id)).rejects.toThrow()
    saveDeliveryEvidence(`${mode}-query-boundaries.json`,{results,terminalHumanAllowed:true,terminalERefused:true,explicitCoordinationBridge:mode==='pi'?'不适用：Runner固定当前E':true})
  })
  it.each(['native','mcp','pi'] as DeliveryMode[])('%s principal Team成员撤销：action隐藏、review创建与重放及子仓库读拒绝，恢复正对照',async mode=>{
    const s=await f.prepare(mode),p=s.parent
    const principal=(await f.db.query<{id:string;workspace_id:string;workspace_role:string}>('SELECT a.id,a.workspace_id,a.workspace_role FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN actors a ON a.id=d.principal_human_actor_id WHERE s.id=$1',[p.sessionId])).rows[0]!
    await f.db.query("UPDATE actors SET workspace_role='member' WHERE id=$1",[principal.id])
    await f.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT(team_id,actor_id) DO NOTHING",[principal.workspace_id,f.teamId,principal.id])
    let removed=false
    const addMembership=()=>f.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT(team_id,actor_id) DO NOTHING",[principal.workspace_id,f.teamId,principal.id])
    const removeMembership=()=>f.db.query('DELETE FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',[principal.workspace_id,f.teamId,principal.id])
    const deniedResponses:Array<{path:string;status:number}>=[]
    const proxy=await f.afterResponse(async(path,status)=>{
      if(removed && status>=400 && (path.startsWith('/api/v1/provider-actions/')||path.endsWith('/context')||path.endsWith('/review-delegations'))) {
        deniedResponses.push({path,status});await addMembership()
      }
    })
    const pi=async<T>(execution:typeof p,token:string,name:string,args:Record<string,unknown>):Promise<T>=>{
      // Human config is admin-only; restore the original member identity before
      // Runner admission. Revoke after model admission, restore after the actual
      // denied API response so the next model request can receive that error.
      await f.db.query("UPDATE actors SET workspace_role='admin' WHERE id=$1",[principal.id])
      try {return await f.piCall(execution,token,name,args,{apiUrl:proxy,beforeRun:async()=>{await addMembership();await f.db.query("UPDATE actors SET workspace_role='member' WHERE id=$1",[principal.id])},beforeTool:async()=>{if(removed)await removeMembership()}})}
      finally {await f.db.query("UPDATE actors SET workspace_role='member' WHERE id=$1",[principal.id]);if(removed)await removeMembership()}
    }
    try {
      const branch=await p.client.requestProviderAction<{id:string}>({kind:'create_branch',repositoryId:s.repositoryId,workItemId:p.workItemId,sessionId:p.sessionId,name:s.branch,baseSha:'base'})
      await f.worker().tick()
      const read=()=>mode==='native'?p.client.getProviderAction(branch.id):mode==='mcp'?f.mcpCall<ProviderActionProjection>(s.mcp,'get_provider_action',{id:branch.id,sessionId:p.sessionId}):pi<ProviderActionProjection>(p,f.connectionToken,'workmesh_get_provider_action',{id:branch.id})
      expect(await read()).toMatchObject({id:branch.id,status:'completed'})
      const key=randomUUID(),body={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Membership bounded review',repositoryIds:[s.repositoryId]}
      const create=(idempotencyKey=key)=>mode==='native'?p.client.createReviewDelegation(p.sessionId,body,{idempotencyKey}):mode==='mcp'?f.mcpCall<ReviewDelegationResponse>(s.mcp,'create_review_delegation',{...body,sessionId:p.sessionId,idempotencyKey}):pi<ReviewDelegationResponse>(p,f.connectionToken,'workmesh_create_review_delegation',body)
      // Pi writes get their stable operation key from the actual persisted tool call.
      const review=await create(),reviewer=await f.receive(review.session.id,s.target.token),mcp=await f.connect('read-write',reviewer)
      const childRead=()=>mode==='native'?reviewer.client.getRepositoryContext<unknown[]>(s.repositoryId):mode==='mcp'?f.mcpCall<unknown[]>(mcp,'get_repository_context',{repositoryId:s.repositoryId,sessionId:reviewer.sessionId}):pi<unknown[]>(reviewer,s.target.token,'workmesh_get_repository_context',{repositoryId:s.repositoryId})
      expect(await childRead()).toHaveLength(1)
      const replayKey=mode==='pi'?(await f.db.query<{idempotency_key:string}>("SELECT idempotency_key FROM api_idempotency_keys WHERE workspace_id=$1 AND response_body->'session'->>'id'=$2",[principal.workspace_id,review.session.id])).rows[0]?.idempotency_key:key
      const replay=()=>p.client.createReviewDelegation(p.sessionId,body,{idempotencyKey:replayKey!})
      expect(replayKey).toBeTruthy();expect(await replay()).toEqual(review)
      const count=async()=>(await f.db.query('SELECT count(*)::int AS children FROM agent_sessions WHERE parent_session_id=$1',[p.sessionId])).rows[0]
      const before=await count()
      await f.db.query('DELETE FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',[principal.workspace_id,f.teamId,principal.id]);removed=true
      await expect(read()).rejects.toThrow()
      await expect(childRead()).rejects.toThrow()
      await expect(replay()).rejects.toMatchObject({status:403})
      await expect(create(randomUUID())).rejects.toThrow()
      expect(await count()).toEqual(before)
      await f.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer')",[principal.workspace_id,f.teamId,principal.id]);removed=false
      expect(await read()).toMatchObject({id:branch.id,status:'completed'});expect(await childRead()).toHaveLength(1);expect(await replay()).toEqual(review);expect(await count()).toEqual(before)
      if(mode==='pi')expect(deniedResponses).toHaveLength(3)
      saveDeliveryEvidence(`${mode}-principal-membership.json`,{actionId:branch.id,childId:review.session.id,deniedAfterRemoval:true,restored:true,before,after:await count(),deniedResponses,piReplayViaExactPersistedKey:mode==='pi'})
    } finally {
      if(removed)await f.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT(team_id,actor_id) DO NOTHING",[principal.workspace_id,f.teamId,principal.id])
      await f.db.query('UPDATE actors SET workspace_role=$2 WHERE id=$1',[principal.id,principal.workspace_role])
    }
  })
  it.each(['native','mcp','pi'] as DeliveryMode[])('%s上传状态/数组/取消/受控下载及health准确Human批准',async mode=>{
    const s=await f.prepare(mode),p=s.parent
    const invoke=async<T>(native:()=>Promise<T>,mcp:string,pi:string,args:Record<string,unknown>,piArgs?:Record<string,unknown>):Promise<T>=>mode==='native'?native():mode==='mcp'?f.mcpCall(s.mcp,mcp,args):f.piCall(p,f.connectionToken,pi,piArgs??Object.fromEntries(Object.entries(args).filter(([key])=>!['sessionId','idempotencyKey'].includes(key))))
    const bytes=Buffer.from('M3 controlled file evidence\n'),base64=bytes.toString('base64'),checksum=sha256(bytes.toString())
    const input={sessionId:p.sessionId,workItemId:p.workItemId,projectId:s.projectId,repositoryId:s.repositoryId,sourceTool:'M3 real transfer',filename:'evidence.txt',mimeType:'text/plain',sizeBytes:bytes.length,checksum}
    const request=()=>invoke(()=>p.client.requestArtifactUpload(input,{idempotencyKey:randomUUID()}),'request_artifact_upload','workmesh_request_artifact_upload',{...input,idempotencyKey:randomUUID()},Object.fromEntries(Object.entries({...input,contentBase64:base64}).filter(([key])=>!['sessionId','sizeBytes','checksum'].includes(key))))
    const upload=await request(),origin=new URL(process.env.S3_ENDPOINT!).origin
    if(mode!=='pi')await sendArtifactBytes(upload,base64,[origin])
    const status=()=>invoke(()=>p.client.getArtifactUploadStatus(upload.id),'get_artifact_upload_status','workmesh_get_artifact_upload_status',{uploadId:upload.id,sessionId:p.sessionId})
    expect(await status()).toMatchObject({id:upload.id,status:'pending',expectedChecksum:checksum})
    await expect(invoke(()=>p.client.getArtifactDownload(upload.id),'download_verified_artifact','workmesh_download_verified_artifact',{uploadId:upload.id,sessionId:p.sessionId})).rejects.toThrow()
    await invoke(()=>p.client.finalizeArtifactUpload(upload.id,p.sessionId),'finalize_artifact_upload','workmesh_finalize_artifact_upload',{uploadId:upload.id,sessionId:p.sessionId})
    await f.verifyUploads();const verified=await status()
    expect(verified).toMatchObject({status:'verified',actualChecksum:checksum});expect(verified.artifactId).toBeTruthy()
    const download=await invoke(()=>p.client.getArtifactDownload(upload.id),'download_verified_artifact','workmesh_download_verified_artifact',{uploadId:upload.id,sessionId:p.sessionId})
    const received=mode==='pi'?download:await readArtifactBytes(download,verified,[origin])
    expect(received).toMatchObject({contentBase64:base64,sizeBytes:bytes.length,checksum})
    const artifacts=await invoke(()=>p.client.listWorkItemArtifacts(p.workItemId),'list_work_item_artifacts','workmesh_list_work_item_artifacts',{workItemId:p.workItemId,sessionId:p.sessionId})
    expect(artifacts).toEqual(expect.arrayContaining([expect.objectContaining({id:verified.artifactId,type:'file'})]))
    const canceled=await request(),cancelKey=randomUUID()
    const cancel=()=>invoke(()=>p.client.cancelArtifactUpload(canceled.id,p.sessionId,{idempotencyKey:cancelKey}),'cancel_artifact_upload','workmesh_cancel_artifact_upload',{uploadId:canceled.id,sessionId:p.sessionId,idempotencyKey:cancelKey})
    expect(await cancel()).toEqual({id:canceled.id,status:'canceled'})
    expect(await invoke(()=>p.client.getArtifactUploadStatus(canceled.id),'get_artifact_upload_status','workmesh_get_artifact_upload_status',{uploadId:canceled.id,sessionId:p.sessionId})).toMatchObject({status:'canceled'})
    const health={health:'on_track' as const,summary:'Exact observed file evidence',confidence:0.7,uncertainty:'Only local fake provider tested',sources:[{kind:'work_item' as const,id:p.workItemId,observedAt:new Date().toISOString(),value:{artifactId:verified.artifactId}}],source:'agent' as const,publish:false}
    const publish=async(body:typeof health & {approvalId?:string})=>{
      const revision=(await p.client.getProject<{revision:number}>(s.projectId)).revision
      return invoke(()=>p.client.createProjectHealthUpdate(s.projectId,body,{sessionId:p.sessionId,ifMatch:revision,idempotencyKey:randomUUID()}),'create_project_health_update','workmesh_create_project_health_update',{...body,projectId:s.projectId,sessionId:p.sessionId,revision,idempotencyKey:randomUUID()},{...body,source:undefined,projectId:s.projectId,ifMatch:revision})
    }
    await publish(health)
    await expect(publish({...health,publish:true})).rejects.toThrow()
    const exact={projectId:s.projectId,health:health.health,summary:health.summary,forecastAt:null,confidence:health.confidence,uncertainty:health.uncertainty,sources:health.sources}
    const approval=await p.client.requestApproval({sessionId:p.sessionId,approvalType:'project_health',actionName:'project.health.publish',actionPayloadSanitized:exact,actionPayloadHash:sha256(canonicalActionApprovalPayload(exact)),riskLevel:'high',rationaleSummary:'Human exact publication',requiredApprovals:1,expiresAt:new Date(Date.now()+600000).toISOString()}) as unknown as {id:string;revision:number}
    await f.human('POST',`/api/v1/approvals/${approval.id}/decide`,{decision:'approved',reason:'Exact health facts'},approval.revision)
    await expect(publish({...health,summary:'Changed after approval',publish:true,approvalId:approval.id})).rejects.toThrow()
    expect((await f.db.query('SELECT status FROM approvals WHERE id=$1',[approval.id])).rows[0]).toEqual({status:'approved'})
    await publish({...health,publish:true,approvalId:approval.id})
    expect((await f.db.query('SELECT status FROM approvals WHERE id=$1',[approval.id])).rows[0]).toEqual({status:'consumed'})
    const history=await invoke(()=>p.client.getProjectHealthHistory(s.projectId),'get_project_health_history','workmesh_get_project_health_history',{projectId:s.projectId,sessionId:p.sessionId})
    expect(history.items).toHaveLength(2)
    const listed=await invoke(()=>p.client.listRepositories(),'list_repositories','workmesh_list_repositories',{sessionId:p.sessionId})
    expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({id:s.repositoryId})]))
    saveDeliveryEvidence(`${mode}-transfer-health.json`,{uploadId:upload.id,verified,artifactId:verified.artifactId,canceledId:canceled.id,checksum,approvalId:approval.id,history,signedMaterialHiddenFromModel:mode==='pi'})
  })
  it.each(['parent','definition','grant','context','child','gitea'] as const)('显式review成功→%s收窄/撤权→原key/body重放拒绝且不重复交付',async kind=>{
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
    if(kind==='child')await f.db.query("UPDATE delegations SET status='revoked',revoked_at=clock_timestamp() WHERE id=$1",[first.session.delegation_id])
    // Admin-owned DB fixture changes provider facts while feature remains off;
    // placeholder ciphertext is never decoded or sent to a real provider.
    if(kind==='gitea')await f.db.query("UPDATE provider_connections SET provider='gitea',installation_id='local-fixture',credentials_ciphertext=decode('00','hex') WHERE id=$1",[s.connectionId])
    if(kind==='context') {
      await f.human('POST',`/api/v1/repositories/${s.repositoryId}/context`,{sessionId:s.parent.sessionId,baseBranch:'main',baseSha:'base',branchPattern:'workmesh/{workItemKey}-{slug}',allowedPaths:['src/**'],permissions:['read','review']})
      await f.worker().tick()
    }
    const changed=await counts()
    await expect(create()).rejects.toMatchObject({status:403})
    expect(await counts()).toEqual(changed)
    saveDeliveryEvidence(`review-replay-${kind}.json`,{childId:first.session.id,before,changed,after:await counts(),originalKeyRejected:true})
  })
  it('显式review初次创建三方repo:read缺任一、错仓库及非法清单拒绝，恢复后正对照',async()=>{
    const s=await f.prepare('native'),parent=s.parent.sessionId
    const body={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Explicit bounded review',repositoryIds:[s.repositoryId]}
    const create=(input=body)=>s.parent.client.createReviewDelegation(parent,input,{idempotencyKey:randomUUID()})
    const count=async()=>(await f.db.query(`SELECT (SELECT count(*) FROM agent_sessions) AS children,(SELECT count(*) FROM session_budget_reservations) AS reservations,(SELECT count(*) FROM agent_webhook_deliveries) AS deliveries`)).rows[0]
    const before=await count()
    for(const repositoryIds of [[],[s.repositoryId,s.repositoryId],Array.from({length:101},()=>randomUUID()),[randomUUID()]])await expect(create({...body,repositoryIds})).rejects.toThrow()
    for(const kind of ['parent','definition','grant'] as const){
      const target=kind==='parent'?{table:'delegations',column:'permissions_snapshot',where:'id=(SELECT delegation_id FROM agent_sessions WHERE id=$1)',values:[parent]}:kind==='definition'?{table:'agent_definitions',column:'approved_capabilities',where:'id=$1',values:[s.target.agentId]}:{table:'agent_team_access',column:'approved_capabilities',where:'agent_id=$1 AND team_id=$2',values:[s.target.agentId,f.teamId]}
      const original=(await f.db.query(`SELECT ${target.column} AS capabilities FROM ${target.table} WHERE ${target.where}`,target.values)).rows[0]!.capabilities
      try {
        await f.db.query(`UPDATE ${target.table} SET ${target.column}=array_remove(${target.column},'repo:read') WHERE ${target.where}`,target.values)
        await expect(create()).rejects.toMatchObject({status:403});expect(await count()).toEqual(before)
      } finally {await f.db.query(`UPDATE ${target.table} SET ${target.column}=$${target.values.length+1} WHERE ${target.where}`,[...target.values,original])}
    }
    expect(await count()).toEqual(before)
    const valid=await create();expect(valid.session.parent_session_id).toBe(parent)
    saveDeliveryEvidence('review-initial-authorization.json',{before,after:await count(),childId:valid.session.id,tripleIntersectionValidated:true,invalidInputsRejected:true})
  })
  it('显式repo reviewer父预算100/child60/review40：预算满及普通子完成后合法旧回执不再admission',async()=>{
    const s=await f.prepare('native',{maxInputTokens:100}),p=s.parent
    const ordinaryTarget=await f.registerTarget()
    const child=await p.client.createChildSession(p.sessionId,{agentId:ordinaryTarget.agentId,planStepId:s.step,planVersionId:s.planId,initialPrompt:'Bounded ordinary child',budget:{maxInputTokens:60}})
    const key=randomUUID(),body={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Bounded explicit repo reviewer',repositoryIds:[s.repositoryId],budget:{maxInputTokens:40}}
    const create=()=>p.client.createReviewDelegation(p.sessionId,body,{idempotencyKey:key})
    const review=await create()
    const budgets=(await f.db.query('SELECT budget FROM agent_sessions WHERE id=ANY($1::uuid[]) ORDER BY id',[[p.sessionId,child.id,review.session.id]])).rows
    expect(budgets.map(row=>row.budget.maxInputTokens).sort((a:number,b:number)=>a-b)).toEqual([40,60,100])
    const count=async()=>(await f.db.query(`SELECT (SELECT count(*) FROM agent_sessions WHERE parent_session_id=$1) AS children,
      (SELECT count(*) FROM session_budget_reservations WHERE parent_session_id=$1) AS reservations,
      (SELECT count(*) FROM agent_webhook_deliveries WHERE session_id=ANY($2::uuid[])) AS deliveries`,[p.sessionId,[child.id,review.session.id]])).rows[0]
    const before=await count();expect(await create()).toEqual(review);expect(await count()).toEqual(before)
    const ordinary=await f.receive(child.id,ordinaryTarget.token)
    await ordinary.client.complete(ordinary.sessionId,{summary:'Ordinary child completed',artifactIds:[],checks:[],limitations:[],noArtifactReason:'Native bounded budget fixture'},{ifMatch:(await ordinary.client.getSession<{revision:number}>(ordinary.sessionId)).revision})
    const after=await count();expect(await create()).toEqual(review);expect(await count()).toEqual(after)
    saveDeliveryEvidence('explicit-review-budget-replay.json',{parentId:p.sessionId,childId:child.id,reviewerId:review.session.id,budgets,before,after,oldReceiptStable:true})
  })

  it.each(['native','mcp','pi'] as DeliveryMode[])('%s准确base/path→Git action→独立reviewer→Human批准→终态',async mode=>{
    const s=await f.prepare(mode),p=s.parent
    const link={sessionId:p.sessionId,workItemId:p.workItemId,projectId:s.projectId,repositoryId:s.repositoryId,planStepId:s.step}
    const invoke=async<T>(native:()=>Promise<T>,mcp:string,pi:string,args:Record<string,unknown>):Promise<T>=>mode==='native'?native():mode==='mcp'?f.mcpCall(s.mcp,mcp,args):f.piCall(p,f.connectionToken,pi,Object.fromEntries(Object.entries(args).filter(([key])=>!['sessionId','idempotencyKey'].includes(key))))
    const leaseBody={sessionId:p.sessionId,resourceType:'work_item' as const,resourceId:p.workItemId,kind:'exclusive' as const,ttlSeconds:3600,reason:'M3 exact delivery'}
    const lease=await invoke(()=>p.client.acquireLease(leaseBody),'acquire_lease','workmesh_acquire_lease',leaseBody)
    expect(lease).toHaveProperty('id')
    const context=await invoke(()=>p.client.getRepositoryContext<Array<{base_sha:string;allowed_paths:string[];guidance:unknown[]}>>(s.repositoryId),'get_repository_context','workmesh_get_repository_context',{repositoryId:s.repositoryId,sessionId:p.sessionId})
    expect(context[0]).toMatchObject({base_sha:'base',allowed_paths:['src/**']});expect(context[0]!.guidance.length).toBeGreaterThan(0)
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
    await f.db.query(`INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
      VALUES($1,$2,$3,'check_run',$4,$5)`,[s.connectionId,s.repositoryId,randomUUID(),sha256('retry:'+head),{check_run:{id:43,name:'optional-retry',status:'completed',conclusion:'failure',head_sha:head,updated_at:new Date().toISOString(),pull_requests:[{number:action.result.number}]}}])
    await f.worker().tick()
    const retryPayload={provider:'fake',connectionId:s.connectionId,repositoryId:s.repositoryId,pullRequestId:pr,checkRunId:'43',headSha:head}
    const retryHash=sha256(canonicalActionApprovalPayload(retryPayload))
    const retryApproval=await p.client.requestApproval({sessionId:p.sessionId,approvalType:'provider_action',actionName:'provider.ci.retry',actionPayloadSanitized:retryPayload,actionPayloadHash:retryHash,riskLevel:'medium',rationaleSummary:'Exact failed check retry',requiredApprovals:1,expiresAt:new Date(Date.now()+600000).toISOString()}) as unknown as {id:string;revision:number}
    await f.human('POST',`/api/v1/approvals/${retryApproval.id}/decide`,{decision:'approved',reason:'Exact retry'},retryApproval.revision)
    const retryInput={sessionId:p.sessionId,approvalId:retryApproval.id,actionPayloadHash:retryHash,headSha:head}
    const retry=await invoke(()=>p.client.retryCiCheck<{id:string}>(pr,'43',retryInput,{idempotencyKey:randomUUID()}),'retry_ci_check','workmesh_retry_ci_check',{...retryInput,pullRequestId:pr,checkRunId:'43',checkId:'43'})
    await confirm(retry.id)
    expect((await f.db.query("SELECT status FROM ci_check_projections WHERE pull_request_id=$1 AND external_id='43'",[pr])).rows[0]).toEqual({status:'failed'})
    const reviewInput={reviewerAgentId:s.target.agentId,planStepId:s.reviewStep,planVersionId:s.planId,initialPrompt:'Review exact repository and current head',ttlSeconds:3600,repositoryIds:[s.repositoryId]}
    const delegated=await invoke(()=>p.client.createReviewDelegation(p.sessionId,reviewInput,{idempotencyKey:randomUUID()}),'create_review_delegation','workmesh_create_review_delegation',{...reviewInput,sessionId:p.sessionId,idempotencyKey:randomUUID()}) as ReviewDelegationResponse
    const reviewer=await f.receive(delegated.session.id,s.target.token)
    const r=await f.connect('read-write',reviewer)
    const reviewInvoke=async<T>(native:()=>Promise<T>,mcp:string,pi:string,args:Record<string,unknown>):Promise<T>=>mode==='native'?native():mode==='mcp'?f.mcpCall(r,mcp,args):f.piCall(reviewer,s.target.token,pi,Object.fromEntries(Object.entries(args).filter(([key])=>!['sessionId','idempotencyKey'].includes(key))))
    const read=await reviewInvoke(()=>reviewer.client.getProjectDelivery(s.projectId,{pullRequestId:pr}),'get_project_delivery','workmesh_get_project_delivery',{projectId:s.projectId,pullRequestId:pr,sessionId:reviewer.sessionId})
    expect(read.providerPullRequests).toHaveLength(1);expect(read.providerPullRequests[0]).toMatchObject({id:pr,headSha:head})
    const room=(await f.db.query<{id:string}>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1",[p.sessionId])).rows[0]!.id
    const message={sessionId:reviewer.sessionId,intent:'review_result' as const,body:'Independent exact-head review approved',payload:{pullRequestId:pr,headSha:head}}
    await reviewInvoke(()=>reviewer.client.postRoomMessage(room,message),'post_work_room_message','workmesh_send_room_message',{...message,roomId:room})
    const reviewArtifactInput={...link,sessionId:reviewer.sessionId,planStepId:undefined,pullRequestId:pr,headSha:head,type:'code_review' as const,title:'Independent review',checksum:sha256('review:'+head),sourceTool:'M3 reviewer',result:'passed' as const,metadata:{headSha:head}}
    const artifact=await reviewInvoke(()=>reviewer.client.publishDeliveryArtifact<{id:string}>(reviewArtifactInput),'publish_delivery_artifact','workmesh_publish_delivery_artifact',reviewArtifactInput)
    const structured={sessionId:reviewer.sessionId,artifactId:artifact.id,headSha:head,verdict:'approved' as const,summary:'Reviewed actual head and current required checks',findings:[],evidence:[evidence.id],metadata:{}}
    await reviewInvoke(()=>reviewer.client.publishStructuredReview(pr,structured),'publish_structured_review','workmesh_publish_structured_review',{...structured,pullRequestId:pr})
    expect((await f.db.query('SELECT evidence FROM structured_reviews WHERE pull_request_id=$1 AND artifact_id=$2',[pr,artifact.id])).rows[0]).toEqual({evidence:[evidence.id]})
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
    const suggestionInput={workItemId:p.workItemId,pullRequestId:pr,rationale:'Merged exact reviewed head; Human decides completion',evidenceArtifactIds:[evidence.id]}
    await invoke(()=>p.client.suggestCompletion(s.projectId,suggestionInput,{sessionId:p.sessionId}),'suggest_work_item_completion','workmesh_suggest_work_item_completion',{...suggestionInput,sessionId:p.sessionId,projectId:s.projectId})
    const draft={health:'on_track' as const,body:'Current reviewed head merged',evidenceArtifactIds:[evidence.id]}
    await invoke(()=>p.client.draftProjectUpdate(s.projectId,draft,{sessionId:p.sessionId}),'draft_project_update','workmesh_draft_project_update',{...draft,projectId:s.projectId,sessionId:p.sessionId})
    expect((await f.db.query('SELECT status FROM approvals WHERE id=$1',[approval.id])).rows[0]).toEqual({status:'consumed'})
    expect((await f.db.query('SELECT s.category FROM work_items w JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1',[p.workItemId])).rows[0]!.category).not.toBe('completed')
    const revision=(await p.client.getSession<{revision:number}>(p.sessionId)).revision
    const completionKey=randomUUID()
    await p.client.complete(p.sessionId,{summary:'Git and independent review delivered',artifactIds:[evidence.id],checks:[],limitations:[]},{ifMatch:revision,idempotencyKey:completionKey})
    const results=await f.coordination.getSessionExecutionResult(p.sessionId,{action:'complete',operationKey:completionKey})
    expect(results).toMatchObject({session:{id:p.sessionId,state:'completed'},action:{confirmation:'confirmed',operationKey:completionKey},originalResult:{sessionId:p.sessionId}})
    expect(await f.human('GET',`/api/v1/provider-actions/${merge.id}`)).toMatchObject({status:'completed'})
    await expect(p.client.getProviderAction(merge.id)).rejects.toThrow()
    saveDeliveryEvidence(`${mode}-chain.json`,{repositoryId:s.repositoryId,branch:s.branch,context,actions:[branch.id,commit.id,opened.id,retry.id,merge.id],head,reviewerSessionId:reviewer.sessionId,artifactIds:[evidence.id,artifact.id],approvalId:approval.id,children,results})
  })
})
