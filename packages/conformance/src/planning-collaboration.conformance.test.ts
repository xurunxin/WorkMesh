import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { childAgentSessionResponseSchema, reviewDelegationResponseSchema, type ChildAgentSession, type ReviewDelegationResponse, type DocumentResponse, type DocumentHistoryResponse, type InboxListItem, type InboxItemDetail, type InboxReplyResponse } from '@workmesh/contracts'
import type { PreparedProjectImport } from '../../../apps/mcp/src/coordination-product.js'
import { createPlanningCollaborationFixture, savePlanningEvidence, type ModelCall } from './planning-collaboration.fixture.js'

type Fixture = Awaited<ReturnType<typeof createPlanningCollaborationFixture>>
let f: Fixture
const call = async <T>(client: Client, name: string, arguments_: Record<string, unknown>): Promise<T> => {
  const result = await client.callTool({ name, arguments: arguments_ })
  expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true)
  return (result.structuredContent as { data: T }).data
}
const boundFields = ['parent_session_id','plan_step_version_id','required_for_parent','inherited_budget','max_child_sessions']
const facts = async () => {
  const hashes: Record<string, { rows: number; sha256: string }> = {}
  for (const table of ['agent_session_tokens','agent_sessions','delegations','api_idempotency_keys','inbox_item_receipts','workbench_turns','workbench_runner_attempts','domain_events','outbox_events','agent_activities','inbox_items','session_budget_reservations','leases','agent_plan_versions','agent_plan_steps','agent_plan_step_identities','agent_plan_step_dependencies','agent_session_prompts','artifacts','room_messages','room_message_recipients','room_message_session_recipients']) {
    const rows = (await f.db.query<{ fact: string }>(`SELECT to_jsonb(fact)::text AS fact FROM ${table} fact ORDER BY to_jsonb(fact)::text`)).rows
    hashes[table] = { rows: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows.map(row=>row.fact))).digest('hex') }
  }
  return hashes
}
const modelResults = (captures: Array<{ results: string[] }>): unknown[] => captures.flatMap(capture=>capture.results.map(result=> {
  const content: unknown = JSON.parse(result)
  return typeof content==='string' ? JSON.parse(content) as unknown : content
}))
describe('M2 真实HTTP、MCP与Pi规划协作闭环', () => {
  beforeAll(async () => { f = await createPlanningCollaborationFixture() })
  afterAll(async () => { if (f) await f.close() })

  it('Document多页history/diff/export/restore新revision、并发冲突，Human评论/Guidance只读与Decision提案', async () => {
    const execution = await f.createExecution('M2 documents and comments')
    const mcp = await f.connect('read-write',execution)
    const documents: DocumentResponse[] = []
    for(let i=0;i<5;i++) documents.push(await call<DocumentResponse>(mcp,'create_document',{ownerType:'work_item',ownerId:execution.workItemId,title:`M2 document ${i}`,markdown:'Original\n',idempotencyKey:randomUUID()}))
    const page = await call<{items:DocumentResponse[];nextCursor:string}>(mcp,'list_documents',{ownerType:'work_item',ownerId:execution.workItemId,limit:1})
    const tail = await execution.client.listDocuments('work_item',execution.workItemId,{limit:100,cursor:page.nextCursor})
    expect(new Set([...page.items,...tail.items].map(item=>item.id))).toEqual(new Set(documents.map(item=>item.id)))
    const doc = documents[0]!
    const edit = {documentId:doc.id,title:doc.title,markdown:'Updated\n',revision:doc.revision,baseRevisionId:doc.currentRevision.id,baseContentHash:doc.currentRevision.contentHash,changeSummary:'Update'}
    const changed = await call<DocumentResponse>(mcp,'update_document',{...edit,idempotencyKey:randomUUID()})
    const conflict = await mcp.callTool({name:'update_document',arguments:{...edit,idempotencyKey:randomUUID()}})
    expect(conflict).toMatchObject({isError:true,structuredContent:{error:{code:'REVISION_CONFLICT'}}})
    const history = await call<DocumentHistoryResponse>(mcp,'list_document_history',{documentId:doc.id,limit:1})
    const historyTail = await execution.client.listDocumentHistory(doc.id,{cursor:history.nextCursor!,limit:1})
    expect([...history.revisions,...historyTail.revisions].map(item=>item.id)).toEqual([changed.currentRevision.id,doc.currentRevision.id])
    const diff = await call<{changes:Array<{kind:string}>}>(mcp,'diff_document_revisions',{documentId:doc.id,fromRevisionId:doc.currentRevision.id,toRevisionId:changed.currentRevision.id})
    expect(diff.changes.some(change=>change.kind==='added')).toBe(true)
    expect(await call<string>(mcp,'export_document_markdown',{documentId:doc.id,revisionId:doc.currentRevision.id})).toBe('Original\n')
    const restored = await call<DocumentResponse>(mcp,'restore_document_revision',{documentId:doc.id,revision:changed.revision,revisionId:doc.currentRevision.id,baseRevisionId:changed.currentRevision.id,baseContentHash:changed.currentRevision.contentHash,changeSummary:'Restore original',idempotencyKey:randomUUID()})
    expect(restored.currentRevision).toMatchObject({revisionNumber:3,restoredFromRevisionId:doc.currentRevision.id,markdown:'Original\n'})
    expect(restored.currentRevision.id).not.toBe(doc.currentRevision.id)
    const documentFacts=async()=>(await f.db.query('SELECT to_jsonb(d)::text AS fact FROM documents d ORDER BY id')).rows
    const documentBefore=await documentFacts()
    for(const wrong of [{baseRevisionId:randomUUID(),baseContentHash:restored.currentRevision.contentHash},{baseRevisionId:restored.currentRevision.id,baseContentHash:`sha256:${'0'.repeat(64)}`}]) {
      const denied=await mcp.callTool({name:'update_document',arguments:{documentId:doc.id,title:doc.title,markdown:'Wrong base\n',revision:restored.revision,...wrong,changeSummary:'Rejected exact base',idempotencyKey:randomUUID()}})
      expect(denied).toMatchObject({isError:true,structuredContent:{error:{code:'CONFLICT'}}})
      expect(await documentFacts()).toEqual(documentBefore)
    }
    let latest=restored
    for(let i=0;i<3;i++)latest=await call<DocumentResponse>(mcp,'update_document',{documentId:doc.id,title:doc.title,markdown:`Additional immutable revision ${i}\n`,revision:latest.revision,baseRevisionId:latest.currentRevision.id,baseContentHash:latest.currentRevision.contentHash,changeSummary:'History pagination',idempotencyKey:randomUUID()})
    const historyIds:string[]=[]
    let historyCursor:string|undefined
    do {const page=await call<DocumentHistoryResponse>(mcp,'list_document_history',{documentId:doc.id,limit:2,...(historyCursor?{cursor:historyCursor}:{})});historyIds.push(...page.revisions.map(row=>row.id));historyCursor=page.nextCursor??undefined}while(historyCursor)
    expect(historyIds).toHaveLength(6);expect(new Set(historyIds).size).toBe(6)
    const comments: string[] = []
    for(let i=0;i<3;i++) comments.push((await f.human<{id:string}>('POST',`/api/v1/work-items/${execution.workItemId}/comments`,{body:`Human comment ${i}`})).id)
    const commentPage = await call<{items:Array<{id:string}>;nextCursor:string}>(mcp,'list_work_item_comments',{workItemId:execution.workItemId,limit:1})
    const commentTail = await execution.client.listWorkItemComments(execution.workItemId,{cursor:commentPage.nextCursor,limit:100})
    expect(new Set([...commentPage.items,...commentTail.items].map(item=>item.id))).toEqual(new Set(comments))
    const humanOnly = await fetch(`${f.baseUrl}/api/v1/work-items/${execution.workItemId}/comments`,{method:'POST',headers:{authorization:`Bearer ${execution.token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({body:'Forbidden Agent comment'})})
    expect(humanOnly.status).toBe(403)
    const guidance = await execution.client.getGuidance('team',f.teamId)
    expect(guidance.scopeId).toBe(f.teamId)
    const publish = await fetch(`${f.baseUrl}/api/v1/teams/${f.teamId}/guidance`,{method:'PUT',headers:{authorization:`Bearer ${execution.token}`,'content-type':'application/json','idempotency-key':randomUUID(),'if-match':'"revision-0"'},body:JSON.stringify({markdown:'Forbidden Agent publication',changeSummary:'Forbidden'})})
    expect(publish.status).toBe(403)
    const decision = await call<{id:string}>(mcp,'create_work_item_decision',{workItemId:execution.workItemId,title:'M2 proposal',rationale:'Human decides',options:['approved','rejected'],affectedResources:[{resourceType:'work_item',resourceId:execution.workItemId,impact:'Review'}],idempotencyKey:randomUUID()})
    expect(await call(mcp,'get_decision',{decisionId:decision.id})).toMatchObject({id:decision.id})
    const finalize = await fetch(`${f.baseUrl}/api/v1/decisions/${decision.id}/finalize`,{method:'POST',headers:{authorization:`Bearer ${execution.token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({selectedOption:'approved'})})
    expect(finalize.status).toBe(403)
    savePlanningEvidence('document-comments-decision.json',{page,history,historyTail,conflict,restored,commentPage,commentTail,guidance,decision,humanOnly:humanOnly.status,publish:publish.status,finalize:finalize.status})
  })

  it('C规划导入逐实体部分成功后重连恢复mapping，完整分页/里程碑/层级/blocks及循环拒绝', async () => {
    const c = await f.connect('read-write')
    const prepared = await call<PreparedProjectImport>(c,'prepare_project_import',{teamRef:f.teamId,defaultStatus:'Ready',project:{sourceId:'project',name:'M2 import'},milestones:[{sourceId:'m1',name:'M2 milestone'}],workItems:[{sourceId:'a',title:'M2 import parent',milestoneSourceId:'m1'},{sourceId:'b',title:'M2 import child',parentSourceId:'a',milestoneSourceId:'m1'}],relations:[{sourceWorkItemId:'a',targetWorkItemId:'b',kind:'blocks'}]})
    await f.db.query("CREATE FUNCTION m2_import_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='M2 import child' THEN RAISE EXCEPTION 'M2 import partial failure'; END IF; RETURN NEW; END $$")
    await f.db.query('CREATE TRIGGER m2_import_failure BEFORE INSERT ON work_items FOR EACH ROW EXECUTE FUNCTION m2_import_failure()')
    let partial: unknown
    try {
      partial = await c.callTool({name:'apply_project_import',arguments:{contentHash:prepared.contentHash,plan:prepared.plan}})
      expect(partial).toMatchObject({isError:true})
      expect((await f.db.query("SELECT count(*)::int AS count FROM work_items WHERE title LIKE 'M2 import %'")).rows[0]).toEqual({count:1})
    } finally { await f.db.query('DROP TRIGGER m2_import_failure ON work_items');await f.db.query('DROP FUNCTION m2_import_failure()') }
    const reconnect = await f.connect('read-write')
    type ImportResult = {mapping:{project:{targetId:string};workItems:Array<{sourceId:string;targetId:string}>;milestones:Array<{targetId:string}>}}
    const restored = await call<ImportResult>(reconnect,'apply_project_import',{contentHash:prepared.contentHash,plan:prepared.plan})
    const replay = await call<ImportResult>(reconnect,'apply_project_import',{contentHash:prepared.contentHash,plan:prepared.plan})
    expect(replay).toEqual(restored)
    const projectId = restored.mapping.project.targetId
    const page = await call<{items:Array<{id:string}>;nextCursor:string}>(reconnect,'list_work_items',{projectId,limit:1})
    const tail = await f.coordination.listWorkItems<{id:string}>({projectId},{cursor:page.nextCursor,limit:200})
    expect([...page.items,...tail.items]).toHaveLength(2)
    const a = restored.mapping.workItems.find(item=>item.sourceId==='a')!.targetId
    const b = restored.mapping.workItems.find(item=>item.sourceId==='b')!.targetId
    expect(await call(reconnect,'get_work_item',{workItemId:b})).toMatchObject({parent_id:a,milestone_id:restored.mapping.milestones[0]!.targetId})
    const cycle = await reconnect.callTool({name:'add_work_item_relation',arguments:{workItemId:b,targetWorkItemId:a,kind:'blocks',idempotencyKey:randomUUID()}})
    expect(cycle).toMatchObject({isError:true,structuredContent:{error:{code:'WORK_ITEM_BLOCK_CYCLE'}}})
    const parent = await call<{revision:number}>(reconnect,'get_work_item',{workItemId:a})
    expect(await reconnect.callTool({name:'update_work_item',arguments:{workItemId:a,revision:parent.revision,parentId:b,idempotencyKey:randomUUID()}})).toMatchObject({isError:true})
    const milestone = await call<{revision:number}>(reconnect,'get_milestone',{milestoneId:restored.mapping.milestones[0]!.targetId})
    expect(await reconnect.callTool({name:'delete_milestone',arguments:{milestoneId:restored.mapping.milestones[0]!.targetId,revision:milestone.revision,idempotencyKey:randomUUID()}})).toMatchObject({isError:true,structuredContent:{error:{code:'MILESTONE_HAS_ACTIVE_WORK_ITEMS'}}})
    const milestones = [restored.mapping.milestones[0]!.targetId]
    for(let i=0;i<4;i++) milestones.push((await call<{id:string}>(reconnect,'create_milestone',{projectId,name:`M2 extra ${i}`,idempotencyKey:randomUUID()})).id)
    // Privileged clock fixture: distinct PostgreSQL microseconds within one JavaScript millisecond.
    const base=(await f.db.query("SELECT date_trunc('milliseconds',clock_timestamp())::text AS stamp")).rows[0]!.stamp as string
    await f.db.query("WITH ranked AS (SELECT id,row_number() OVER(ORDER BY id) AS n FROM project_milestones WHERE project_id=$1) UPDATE project_milestones m SET created_at=$2::timestamptz+r.n*interval '1 microsecond' FROM ranked r WHERE m.id=r.id",[projectId,base])
    const seen:string[]=[]
    let cursor:string|undefined
    do {
      const page = await call<{items:Array<{id:string}>;nextCursor:string|null}>(reconnect,'list_project_milestones',{projectId,limit:2,...(cursor?{cursor}:{})})
      seen.push(...page.items.map(row=>row.id));cursor=page.nextCursor??undefined
    } while(cursor)
    expect(seen).toHaveLength(5);expect(new Set(seen)).toEqual(new Set(milestones))
    const first=await call<{items:unknown[];nextCursor:string}>(reconnect,'list_project_milestones',{projectId,limit:2})
    expect(first.items.every(row=>!JSON.stringify(row).includes('__cursor_created_at'))).toBe(true)
    await f.db.query('UPDATE agent_team_access SET revoked_at=clock_timestamp() WHERE agent_id=$1 AND team_id=$2',[f.agentId,f.teamId])
    try {expect(await reconnect.callTool({name:'list_project_milestones',arguments:{projectId,limit:2,cursor:first.nextCursor}})).toMatchObject({isError:true})}
    finally {await f.db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2',[f.agentId,f.teamId])}
    const status=(await f.coordination.listWorkflowStates<{id:string;name:string}>(f.teamId)).items.find(row=>row.name==='Ready')!.id
    const extra:string[]=[]
    for(let i=0;i<3;i++)extra.push((await call<{id:string}>(reconnect,'create_work_item',{teamId:f.teamId,projectId,statusId:status,title:`Extra graph issue ${i}`,idempotencyKey:randomUUID()})).id)
    const issueIds:string[]=[];let issueCursor:string|undefined
    do {const page=await call<{items:Array<{id:string}>;nextCursor:string|null}>(reconnect,'list_work_items',{projectId,limit:2,...(issueCursor?{cursor:issueCursor}:{})});issueIds.push(...page.items.map(row=>row.id));issueCursor=page.nextCursor??undefined}while(issueCursor)
    expect(issueIds).toHaveLength(5);expect(new Set(issueIds)).toEqual(new Set([a,b,...extra]))
    const related = await call<{id:string;revision:number}>(reconnect,'add_work_item_relation',{workItemId:a,targetWorkItemId:b,kind:'related',idempotencyKey:randomUUID()})
    for(const other of extra)await call(reconnect,'add_work_item_relation',{workItemId:a,targetWorkItemId:other,kind:'related',idempotencyKey:randomUUID()})
    const relations = await call<{items:Array<{id:string;kind:string}>}>(reconnect,'list_work_item_relations',{workItemId:a,limit:200})
    const relationIds:string[]=[];let relationCursor:string|undefined
    do {const page=await call<{items:Array<{id:string}>;nextCursor:string|null}>(reconnect,'list_work_item_relations',{workItemId:a,limit:2,...(relationCursor?{cursor:relationCursor}:{})});relationIds.push(...page.items.map(row=>row.id));relationCursor=page.nextCursor??undefined}while(relationCursor)
    expect(relationIds).toHaveLength(5);expect(new Set(relationIds)).toEqual(new Set(relations.items.map(row=>row.id)))
    expect(relations.items).toContainEqual(expect.objectContaining({id:related.id,kind:'related'}))
    expect(relations.items.some(row=>row.kind==='blocks')).toBe(true)
    await call(reconnect,'remove_work_item_relation',{workItemId:a,relationId:related.id,revision:related.revision,idempotencyKey:randomUUID()})
    expect((await call<{items:Array<{id:string}>}>(reconnect,'list_work_item_relations',{workItemId:a,limit:200})).items.some(row=>row.id===related.id)).toBe(false)
    expect((await f.db.query("SELECT count(*)::int AS count FROM projects WHERE name='M2 import'")).rows[0]).toEqual({count:1})
    // Outside the documented replay window, reconcile the saved mapping through real reads before any write.
    const expired=await f.db.query("UPDATE api_idempotency_keys SET replay_expires_at=clock_timestamp()-interval '1 second' WHERE idempotency_key LIKE 'project-import:%' RETURNING idempotency_key")
    expect(expired.rowCount).toBeGreaterThan(0)
    const beforeReconcile=await facts()
    expect(await call(reconnect,'get_project',{projectId})).toMatchObject({id:projectId})
    for(const item of restored.mapping.workItems)expect(await call(reconnect,'get_work_item',{workItemId:item.targetId})).toMatchObject({id:item.targetId})
    for(const item of restored.mapping.milestones)expect(await call(reconnect,'get_milestone',{milestoneId:item.targetId})).toMatchObject({id:item.targetId})
    expect(await facts()).toEqual(beforeReconcile)
    savePlanningEvidence('planning-import-recovery.json',{prepared,partial,restored,replay,page,tail,cycle,milestones,seen,related,relations,expiredWindowReconciledBySavedMapping:true,automaticReapplyAfterTtl:false})
  })

  it('Runner具名计划评论/assignment proposal/context delta真实Pi固定E和来源，Session fail分开于Turn失败', async () => {
    const parent=await f.createExecution('M2 named planning tools')
    const step=randomUUID()
    await parent.client.publishPlan(parent.sessionId,{changeSummary:'Tool lifecycle',steps:[{id:step,title:'Tool step',ordinal:0,status:'pending',dependsOn:[],acceptanceCriteria:[],expectedArtifacts:[]}]},{ifMatch:(await parent.client.getSession<{revision:number}>(parent.sessionId)).revision})
    const plan=await parent.client.getPlan<{id:string}>(parent.sessionId)
    const hash=`sha256:${'a'.repeat(64)}`
    const artifact=await parent.client.publishArtifact({sessionId:parent.sessionId,workItemId:parent.workItemId,type:'document',title:'Trusted source',checksum:hash,metadata:{source:'M2 authorized artifact'}}) as {id:string}
    const base=(await f.db.query('SELECT context_snapshot_id FROM agent_sessions WHERE id=$1',[parent.sessionId])).rows[0]!.context_snapshot_id as string
    const captures=await f.pi(parent,f.connectionToken,[async()=>({name:'workmesh_comment_plan_step',arguments:{planVersionId:plan.id,planStepId:step,body:'Pi own Plan comment'}}),async()=>({name:'workmesh_propose_plan_step_assignment',arguments:{planStepId:step,skill:'review',rationale:'Proposal for Human approval'}}),async()=>({name:'workmesh_append_context_delta',arguments:{baseSnapshotId:base,rationale:'Append verified artifact',additions:[{sourceType:'artifact',sourceId:artifact.id,hash}]}})])
    expect(captures[0]!.tools).toEqual(expect.arrayContaining(['workmesh_comment_plan_step','workmesh_propose_plan_step_assignment','workmesh_append_context_delta','workmesh_fail_session']))
    const results=modelResults(captures)
    expect(results.some(value=>value && typeof value==='object' && 'snapshot' in value && 'delta' in value)).toBe(true)
    savePlanningEvidence('pi-named-planning-tools.json',{captures,plan,artifact})
    for(const scenario of ['success','stale','stop','revoked','response_lost'] as const) {
      const execution=await f.createExecution(`M2 failure ${scenario}`)
      let failureCaptures:Awaited<ReturnType<typeof f.pi>>=[]
      {
        const apiUrl=scenario==='response_lost'?await f.loseFailResponse():scenario==='stop'||scenario==='revoked'?await f.afterSettlement(async()=>{
          if(scenario==='stop')await f.human('POST',`/api/v1/agent-sessions/${execution.sessionId}/signals`,{signal:'stop',reason:'Human Stop after failed Turn'},(await f.db.query('SELECT revision FROM agent_sessions WHERE id=$1',[execution.sessionId])).rows[0]!.revision)
          else await f.db.query("UPDATE delegations SET status='revoked' WHERE id=(SELECT delegation_id FROM agent_sessions WHERE id=$1)",[execution.sessionId])
        }):undefined
        failureCaptures=await f.pi(execution,f.connectionToken,[async()=>({name:'workmesh_fail_session',arguments:{ifMatch:(await f.db.query('SELECT revision FROM agent_sessions WHERE id=$1',[execution.sessionId])).rows[0]!.revision-(scenario==='stale'?1:0),code:'M2_EXPLICIT_FAILURE',summary:`Public failure ${scenario}`,retryable:false,evidence:['Deterministic fixture evidence']}})],{apiUrl})
      }
      const durable=(await f.db.query(`SELECT s.state,t.status AS turn_status,a.status AS attempt_status,a.external_effects_reconciled FROM agent_sessions s JOIN workbench_turns t ON t.agent_session_id=s.id JOIN workbench_runner_attempts a ON a.turn_id=t.id WHERE s.id=$1`,[execution.sessionId])).rows[0]!
      expect(durable).toMatchObject({state:scenario==='success'||scenario==='response_lost'?'failed':scenario==='stop'?'stopping':'executing',turn_status:'failed',attempt_status:'failed',external_effects_reconciled:true})
      const events=(await f.db.query("SELECT event_type FROM domain_events WHERE session_id=$1 AND event_type IN ('agent.session.failed','workbench.turn.settled')",[execution.sessionId])).rows
      expect(events.filter(row=>row.event_type==='workbench.turn.settled')).toHaveLength(1)
      expect(events.filter(row=>row.event_type==='agent.session.failed')).toHaveLength(scenario==='success'||scenario==='response_lost'?1:0)
      savePlanningEvidence(`pi-session-failure-${scenario}.json`,{failureCaptures,durable,events,twoTransactions:true,automaticCrashRecovery:false})
      // Privileged teardown keeps later source claims independent of intentionally active rejected failures.
      if(scenario==='stale'||scenario==='revoked'||scenario==='stop')await f.db.query("UPDATE agent_sessions SET state='canceled',ended_at=clock_timestamp() WHERE id=$1",[execution.sessionId])
    }
    const mcpExecution=await f.createExecution('M2 MCP fail exact E')
    const mcp=await f.connect('read-write',mcpExecution)
    const revision=(await mcpExecution.client.getSession<{revision:number}>(mcpExecution.sessionId)).revision
    expect(await call(mcp,'fail_session',{sessionId:mcpExecution.sessionId,revision,code:'M2_MCP_FAIL',summary:'Real MCP Session fail',evidence:[],retryable:false})).toMatchObject({state:'failed'})
  })

  it('Pi本人实际创建普通child和reviewer，模型实收创建字段/预算与RESTDB一致，真实API重启保绑定', async () => {
    const parent = await f.createExecution('M2 Pi creation responses', false, {maxInputTokens:100,maxRuntimeSeconds:1000,customUnits:10})
    const target = await f.registerTarget()
    const step = randomUUID(), reviewStep = randomUUID()
    const revision = (await parent.client.getSession<{revision:number}>(parent.sessionId)).revision
    await parent.client.publishPlan(parent.sessionId,{changeSummary:'Pi creates both bounded children',steps:[step,reviewStep].map((id,ordinal)=>({id,title:`Step ${ordinal}`,ordinal,status:'pending' as const,dependsOn:[],acceptanceCriteria:[],expectedArtifacts:[]}))},{ifMatch:revision})
    const plan = await parent.client.getPlan<{id:string}>(parent.sessionId)
    const childCaptures = await f.pi(parent,f.connectionToken,[async()=>({name:'workmesh_create_child_session',arguments:{agentId:target.agentId,planStepId:step,planVersionId:plan.id,initialPrompt:'Pi ordinary child',budget:{maxInputTokens:60,maxRuntimeSeconds:500,customUnits:6}}})])
    const childRaw = modelResults(childCaptures).find(value=>value && typeof value==='object' && 'parent_session_id' in value)
    const child = childAgentSessionResponseSchema.parse(childRaw)
    const compare = async (session:ChildAgentSession) => {
      const dbRow=(await f.db.query('SELECT * FROM agent_sessions WHERE id=$1',[session.id])).rows[0]!
      const rest=await parent.client.listChildSessions(parent.sessionId,{childSessionId:session.id})
      for(const field of [...boundFields,'budget']) expect(session[field as keyof ChildAgentSession],field).toEqual(dbRow[field])
      expect(rest.items).toContainEqual(expect.objectContaining({id:session.id,parentSessionId:parent.sessionId,planVersionId:plan.id}))
    }
    await compare(child)
    expect(child.budget).toEqual({maxInputTokens:60,maxRuntimeSeconds:500,customUnits:6})
    const complete = async (sessionId:string):Promise<ModelCall> => ({name:'workmesh_complete_session',arguments:{ifMatch:(await f.db.query('SELECT revision FROM agent_sessions WHERE id=$1',[sessionId])).rows[0]!.revision,summary:'Verified Pi lifecycle',noArtifactReason:'Deterministic text result'}})
    const execution=await f.receive(child.id,target.token)
    await f.pi(execution,target.token,[()=>complete(child.id)])
    const reviewCaptures=await f.pi(parent,f.connectionToken,[async()=>({name:'workmesh_create_review_delegation',arguments:{reviewerAgentId:target.agentId,planStepId:reviewStep,planVersionId:plan.id,initialPrompt:'Pi independent reviewer',ttlSeconds:300,budget:{maxInputTokens:40,maxRuntimeSeconds:500,customUnits:4}}})])
    const reviewRaw=modelResults(reviewCaptures).find(value=>value && typeof value==='object' && 'session' in value && 'lease' in value)
    const review=reviewDelegationResponseSchema.parse(reviewRaw)
    await compare(review.session)
    expect(review.session.budget).toEqual({maxInputTokens:40,maxRuntimeSeconds:500,customUnits:4})
    const beforeRestart=await facts()
    await f.restart()
    expect(await facts()).toEqual(beforeRestart)
    const blocked=await fetch(`${f.baseUrl}/api/v1/agent-sessions/${parent.sessionId}/complete`,{method:'POST',headers:{authorization:`Bearer ${parent.token}`,'content-type':'application/json','idempotency-key':randomUUID(),'if-match':`"revision-${(await parent.client.getSession<{revision:number}>(parent.sessionId)).revision}"`},body:JSON.stringify({summary:'Review still required',noArtifactReason:'Gate'})})
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toMatchObject({error:{code:'COMPLETION_PLAN_INCOMPLETE',details:{blockerSessionIds:[review.session.id]}}})
    const reviewer=await f.receive(review.session.id,target.token)
    let artifactId:string|undefined
    const room=(await f.db.query("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1",[parent.sessionId])).rows[0]!.id as string
    await f.pi(reviewer,target.token,[async()=>({name:'workmesh_publish_artifact',arguments:{type:'code_review',title:'Pi own review',metadata:{verdict:'approved'}}}),async()=>{
      artifactId=(await f.db.query('SELECT id FROM artifacts WHERE session_id=$1',[reviewer.sessionId])).rows[0]!.id as string
      return {name:'workmesh_send_room_message',arguments:{roomId:room,intent:'review_result',body:'Pi own independent review',payload:{artifactId}}}
    },async()=>({...await complete(reviewer.sessionId),arguments:{...(await complete(reviewer.sessionId)).arguments,artifactIds:[artifactId]}})])
    await f.pi(parent,f.connectionToken,[()=>complete(parent.sessionId)])
    const durable=(await f.db.query(`SELECT s.state,t.status AS turn_status,a.status AS attempt_status FROM agent_sessions s JOIN workbench_turns t ON t.agent_session_id=s.id JOIN workbench_runner_attempts a ON a.turn_id=t.id WHERE s.id=ANY($1::uuid[]) ORDER BY s.id,t.created_at`,[[parent.sessionId,child.id,review.session.id]])).rows
    expect(durable.length).toBeGreaterThanOrEqual(5)
    for(const row of durable) expect(row).toMatchObject({state:'completed',turn_status:'settled',attempt_status:'settled'})
    savePlanningEvidence('pi-creation-response-and-restart.json',{childCaptures,reviewCaptures,child,review,beforeRestart,durable})
  })

  it('有限预算100→child60→reviewer40：受控交付、双证据、父终态拒读与完整响应字段', async () => {
    const parent = await f.createExecution('M2 finite lifecycle', false, { maxInputTokens: 100 })
    const target = await f.registerTarget()
    const step = randomUUID(), reviewStep = randomUUID()
    const current = await parent.client.getSession<{ revision: number }>(parent.sessionId)
    await parent.client.publishPlan(parent.sessionId, { changeSummary: 'M2 bounded chain', steps: [
      { id: step, title: 'Implement', ordinal: 0, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] },
      { id: reviewStep, title: 'Review', ordinal: 1, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] },
    ] }, { ifMatch: current.revision })
    const plan = await parent.client.getPlan<{ id: string }>(parent.sessionId)
    const mcp = await f.connect('read-write', parent)
    const created = await call<ChildAgentSession>(mcp, 'create_child_session', { parentSessionId: parent.sessionId, agentId: target.agentId, planStepId: step, planVersionId: plan.id, initialPrompt: 'Implement with bounded budget', budget: { maxInputTokens: 60 } })
    expect(childAgentSessionResponseSchema.parse(created)).toMatchObject({ parent_session_id: parent.sessionId, plan_step_version_id: plan.id, budget: { maxInputTokens: 60 }, inherited_budget: { maxInputTokens: 60 } })
    for (const field of boundFields) expect(created).toHaveProperty(field)
    const child = await f.receive(created.id, target.token)
    const complete = async (sessionId: string, artifactId?: string): Promise<ModelCall> => {
      const revision = (await f.db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [sessionId])).rows[0]!.revision
      return { name: 'workmesh_complete_session', arguments: { ifMatch: revision, summary: 'M2 verified completion', ...(artifactId ? { artifactIds: [artifactId] } : { noArtifactReason: 'Deterministic bounded lifecycle test.' }) } }
    }
    const childPi = await f.pi(child, target.token, [async()=>({name:'workmesh_get_session',arguments:{}}),() => complete(child.sessionId)])
    expect(modelResults(childPi)).toContainEqual(expect.objectContaining(Object.fromEntries([...boundFields,'budget'].map(key=>[key,created[key as keyof typeof created]]))))
    expect(childPi[0]!.tools).not.toContain('workmesh_publish_plan')
    const projection = await call<{ items: Array<{ id: string; state: string }> }>(mcp, 'list_child_sessions', { parentSessionId: parent.sessionId })
    expect(projection.items).toContainEqual(expect.objectContaining({ id: child.sessionId, state: 'completed' }))
    const input = { reviewerAgentId: target.agentId, planStepId: reviewStep, planVersionId: plan.id, initialPrompt: 'Review independently', ttlSeconds: 300 }
    for (const budget of [undefined, {}, { maxInputTokens: 41 }] as Array<Record<string, number> | undefined>) {
      await expect(parent.client.createReviewDelegation(parent.sessionId, { ...input, ...(budget ? { budget } : {}) })).rejects.toMatchObject({ code: 'CHILD_BUDGET_EXCEEDED' })
    }
    const review = await call<ReviewDelegationResponse>(mcp, 'create_review_delegation', { sessionId: parent.sessionId, ...input, budget: { maxInputTokens: 40 } })
    expect(reviewDelegationResponseSchema.parse(review).session.budget).toEqual({ maxInputTokens: 40 })
    for (const field of boundFields) expect(review.session).toHaveProperty(field)
    const reviewer = await f.receive(review.session.id, target.token)
    const firstHeartbeat = await reviewer.client.heartbeatLease(review.lease.id)
    await new Promise(resolve => setTimeout(resolve, 15))
    const secondHeartbeat = await reviewer.client.heartbeatLease(review.lease.id)
    expect(new Date(secondHeartbeat.heartbeat_at!).getTime()).toBeGreaterThan(new Date(firstHeartbeat.heartbeat_at!).getTime())
    expect(secondHeartbeat.expires_at).toEqual(firstHeartbeat.expires_at)
    const firstRenewal = await reviewer.client.renewLease(review.lease.id, {ttlSeconds:300}, {ifMatch:secondHeartbeat.version})
    const secondRenewal = await reviewer.client.renewLease(review.lease.id, {ttlSeconds:300}, {ifMatch:firstRenewal.version})
    expect(secondRenewal.version).toBe(firstRenewal.version+1)
    savePlanningEvidence('lease-independent-calls.json',{firstHeartbeat,secondHeartbeat,firstRenewal,secondRenewal})
    const deliveryCounts = f.deliveryCounts()
    // Privileged crash fixture models loss of the original 204 after receiver exchange/ACK.
    await f.db.query("UPDATE agent_webhook_deliveries SET status='pending',delivered_at=NULL,available_at=clock_timestamp() WHERE session_id=$1 AND event_type='agent.session.created'",[reviewer.sessionId])
    await f.webhookWorker().tick()
    expect(f.deliveryCounts()).toEqual({accepted:deliveryCounts.accepted,duplicates:deliveryCounts.duplicates+1})
    expect((await f.db.query("SELECT count(*)::int AS count FROM agent_webhook_deliveries WHERE session_id=$1 AND status='delivered' AND event_type='agent.session.created'",[reviewer.sessionId])).rows[0]).toEqual({count:1})
    const room = (await f.db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [parent.sessionId])).rows[0]!.id
    const artifactId = async () => (await f.db.query<{ id: string }>("SELECT id FROM artifacts WHERE session_id=$1 AND type='code_review'", [reviewer.sessionId])).rows[0]!.id
    const beforeReview = await reviewer.client.getSession<{ revision: number }>(reviewer.sessionId)
    await expect(reviewer.client.complete(reviewer.sessionId, { summary: 'Cannot waive review evidence', artifactIds: [], checks: [], limitations: [], noArtifactReason: 'No artifact waiver' }, { ifMatch: beforeReview.revision })).rejects.toMatchObject({ code: 'REVIEW_COMPLETION_EVIDENCE_REQUIRED' })
    const captures = await f.pi(reviewer, target.token, [
      async () => ({ name: 'workmesh_get_session', arguments: {} }),
      async () => ({ name: 'workmesh_publish_artifact', arguments: { type: 'code_review', title: 'M2 independent review', metadata: { verdict: 'approved', summary: 'Reviewed bounded lifecycle' } } }),
      async () => ({ name: 'workmesh_send_room_message', arguments: { roomId: room, intent: 'review_result', body: 'M2 independent review approved.' } }),
      async () => complete(reviewer.sessionId, await artifactId()),
    ])
    expect(captures[0]!.tools).not.toContain('workmesh_publish_plan')
    expect(JSON.stringify(captures)).toContain('code_review')
    expect(modelResults(captures)).toContainEqual(expect.objectContaining({ id: reviewer.sessionId, budget: { maxInputTokens: 40 }, inherited_budget: { maxInputTokens: 40 } }))
    expect(modelResults(captures)).toContainEqual(expect.objectContaining(Object.fromEntries([...boundFields,'budget'].map(key=>[key,review.session[key as keyof typeof review.session]]))))
    const usage = (await f.db.query<{ usage: { inputTokens: number; outputTokens: number; totalTokens: number } }>('SELECT usage FROM workbench_runner_attempts WHERE agent_session_id=$1', [reviewer.sessionId])).rows[0]!.usage
    expect(usage.inputTokens).toBeGreaterThan(0); expect(usage.inputTokens).toBeLessThanOrEqual(40)
    expect(usage.totalTokens).toBe(usage.inputTokens+usage.outputTokens)
    const budgets = (await f.db.query<{ budget: unknown; inherited_budget: unknown; reserved: unknown }>(`SELECT child.budget,child.inherited_budget,reservation.reserved FROM agent_sessions child JOIN session_budget_reservations reservation ON reservation.child_session_id=child.id WHERE child.parent_session_id=$1 ORDER BY child.created_at`, [parent.sessionId])).rows
    expect(budgets).toEqual([60,40].map(value => ({ budget: { maxInputTokens: value }, inherited_budget: { maxInputTokens: value }, reserved: { maxInputTokens: value } })))
    const parentPi = await f.pi(parent, f.connectionToken, [async () => ({ name: 'workmesh_list_child_sessions', arguments: { limit: 1 } }), () => complete(parent.sessionId)])
    const durable = (await f.db.query(`SELECT session.state,turn.status AS turn_status,attempt.status AS attempt_status FROM agent_sessions session JOIN workbench_turns turn ON turn.agent_session_id=session.id JOIN workbench_runner_attempts attempt ON attempt.turn_id=turn.id WHERE session.id=$1`, [parent.sessionId])).rows
    expect(durable).toEqual([{ state: 'completed', turn_status: 'settled', attempt_status: 'settled' }])
    await expect(parent.client.listChildSessions(parent.sessionId)).rejects.toBeDefined()
    savePlanningEvidence('finite-budget-chain.json', { parentId: parent.sessionId, childId: child.sessionId, reviewerId: reviewer.sessionId, budgets, projection, captures, parentPi, durable })
  })

  it('Room→Inbox metadata→claim→read→ACK/reply，Handoff仅Human接受后目标E真实接续', async () => {
    const parent = await f.createExecution('M2 Inbox and Handoff')
    const target = await f.registerTarget()
    const step = randomUUID()
    await parent.client.publishPlan(parent.sessionId,{changeSummary:'Inbox peer',steps:[{id:step,title:'Peer',ordinal:0,status:'pending',dependsOn:[],acceptanceCriteria:[],expectedArtifacts:[]}]},{ifMatch:(await parent.client.getSession<{revision:number}>(parent.sessionId)).revision})
    const plan = await parent.client.getPlan<{id:string}>(parent.sessionId)
    const child = await parent.client.createChildSession(parent.sessionId,{agentId:target.agentId,planStepId:step,planVersionId:plan.id,initialPrompt:'Inbox peer'})
    const peer = await f.receive(child.id,target.token)
    const sourceMcp = await f.connect('read-write',parent), peerMcp = await f.connect('read-write',peer,target.token)
    const room = await call<{id:string}>(sourceMcp,'get_work_room',{workItemId:parent.workItemId})
    const actorId = (await f.db.query<{actor_id:string}>('SELECT actor_id FROM agent_definitions WHERE id=$1',[target.agentId])).rows[0]!.actor_id
    const message = await call<{id:string}>(sourceMcp,'post_work_room_message',{roomId:room.id,sessionId:parent.sessionId,recipientActorId:actorId,intent:'ask',body:'M2 secret body after claim',requiresResponse:true,idempotencyKey:randomUUID()})
    const metadata = await call<{items:InboxListItem[]}>(peerMcp,'list_inbox_items',{status:'open'})
    const item = metadata.items.find(item=>item.source_id===message.id)!
    expect(item.detail_available).toBe(false);expect(JSON.stringify(item)).not.toContain('M2 secret body')
    await expect(peer.client.getInboxItem(item.id)).rejects.toBeDefined()
    const claimKey = randomUUID()
    const claimed = await call<InboxItemDetail>(peerMcp,'claim_inbox_item',{inboxItemId:item.id,idempotencyKey:claimKey})
    expect(await call(peerMcp,'claim_inbox_item',{inboxItemId:item.id,idempotencyKey:claimKey})).toEqual(claimed)
    const beforeRead = await facts()
    const detail = await call<InboxItemDetail>(peerMcp,'get_inbox_item',{inboxItemId:item.id})
    expect(await facts()).toEqual(beforeRead)
    expect(detail.source_message_body).toBe('M2 secret body after claim')
    await call(peerMcp,'acknowledge_inbox_item',{inboxItemId:item.id,idempotencyKey:randomUUID()})
    const current = await peer.client.getInboxItem(item.id)
    const replyKey = randomUUID()
    const replied = await call<InboxReplyResponse>(peerMcp,'reply_inbox_item',{inboxItemId:item.id,revision:current.revision,body:'M2 claimed peer reply',payload:{verified:true},idempotencyKey:replyKey})
    expect(await call(peerMcp,'reply_inbox_item',{inboxItemId:item.id,revision:current.revision,body:'M2 claimed peer reply',payload:{verified:true},idempotencyKey:replyKey})).toEqual(replied)
    expect(replied.replyMessageId).toBeTruthy()
    const receipts = (await f.db.query<{kind:string}>('SELECT kind FROM inbox_item_receipts WHERE inbox_item_id=$1 ORDER BY kind',[item.id])).rows.map(row=>row.kind)
    // GET detail is read-only; the legacy read receipt enum has no write command.
    expect(receipts).toEqual(['claimed','acknowledged','replied'])
    expect(receipts).not.toContain('read')
    await peer.client.complete(peer.sessionId,{summary:'Peer finished',artifactIds:[],checks:[],limitations:[],noArtifactReason:'M2 collaboration fixture'},{ifMatch:(await peer.client.getSession<{revision:number}>(peer.sessionId)).revision})
    const handoff = await call<{id:string}>(sourceMcp,'offer_handoff',{fromSessionId:parent.sessionId,targetAgentId:target.agentId,summary:'M2 continue authorized work',remainingWork:['Verify target turn'],acceptanceCriteria:['Target completed'],requestedCapabilities:['work:read','work:write'],leaseTransferPolicy:'retain',idempotencyKey:randomUUID()})
    const acceptDenied = await fetch(`${f.baseUrl}/api/v1/handoffs/${handoff.id}/accept`,{method:'POST',headers:{authorization:`Bearer ${parent.token}`,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({initialPrompt:'Forbidden Agent acceptance'})})
    expect(acceptDenied.status).toBe(403)
    const accepted = await f.human<{session:{id:string}}>('POST',`/api/v1/handoffs/${handoff.id}/accept`,{initialPrompt:'M2 Human accepted exact target'})
    const successor = await f.receive(accepted.session.id,target.token)
    await f.pi(successor,target.token,[async()=>({name:'workmesh_complete_session',arguments:{ifMatch:(await f.db.query('SELECT revision FROM agent_sessions WHERE id=$1',[successor.sessionId])).rows[0]!.revision as number,summary:'Handoff target complete',noArtifactReason:'M2 bounded continuation'}})])
    expect((await f.db.query('SELECT state FROM agent_sessions WHERE id=$1',[successor.sessionId])).rows[0]).toEqual({state:'completed'})
    expect((await f.db.query('SELECT status FROM handoffs WHERE id=$1',[handoff.id])).rows[0]).toEqual({status:'accepted'})
    await f.human('POST',`/api/v1/handoffs/${handoff.id}/complete`,{reason:'Exact target completed; Human confirms handoff'})
    expect((await f.db.query('SELECT status FROM handoffs WHERE id=$1',[handoff.id])).rows[0]).toEqual({status:'completed'})
    savePlanningEvidence('inbox-handoff-chain.json',{metadata,claimed,detail,replied,receipts,handoff,accepted,targetId:successor.sessionId,acceptDenied:acceptDenied.status})
  })

  it('投递授权fence：Stop及原Connection撤权先提交零HTTP；旧claim不发送，来源竞争回滚后可恢复', async () => {
    const parent = await f.createExecution('M2 delivery fence')
    const target = await f.registerTarget()
    const step = randomUUID()
    await parent.client.publishPlan(parent.sessionId,{changeSummary:'Delivery fence',steps:[{id:step,title:'Delivery',ordinal:0,status:'pending',dependsOn:[],acceptanceCriteria:[],expectedArtifacts:[]}]},{ifMatch:(await parent.client.getSession<{revision:number}>(parent.sessionId)).revision})
    const plan = await parent.client.getPlan<{id:string}>(parent.sessionId)
    const create = ()=>parent.client.createChildSession(parent.sessionId,{agentId:target.agentId,planStepId:step,planVersionId:plan.id,initialPrompt:'Controlled delivery'})
    const first = await create()
    const worker = f.webhookWorker()
    const claimed = (await worker.claimDeliveries()).find(delivery=>delivery.sessionId===first.id)!
    const count = f.deliveryCounts()
    await f.human('POST',`/api/v1/agent-sessions/${first.id}/signals`,{signal:'stop',reason:'Stop before delivery'},first.revision)
    await expect(worker.deliver(claimed)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(count)
    // Release test target capacity after preserving the Stop refusal.
    await f.db.query("UPDATE agent_sessions SET state='canceled',ended_at=clock_timestamp() WHERE id=$1",[first.id])
    await worker.fail(claimed,new Error('Test terminal sender'))
    const second = await create()
    const expired = (await worker.claimDeliveries(25,0)).find(delivery=>delivery.sessionId===second.id)!
    await expect(worker.deliver(expired)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(count)
    await f.db.query("UPDATE agent_webhook_deliveries SET locked_at=clock_timestamp()-interval '120 seconds' WHERE id=$1",[expired.id])
    const old = (await worker.claimDeliveries()).find(delivery=>delivery.sessionId===second.id)!
    await f.db.query("UPDATE agent_webhook_deliveries SET locked_at=clock_timestamp()-interval '120 seconds' WHERE id=$1",[old.id])
    const fresh = (await worker.claimDeliveries()).find(delivery=>delivery.sessionId===second.id)!
    expect(fresh.attemptCount).toBe(old.attemptCount+1)
    await expect(worker.deliver(old)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(count)
    const token = (await f.db.query<{id:string;expires_at:Date;installation_token_id:string}>('SELECT id,expires_at,installation_token_id FROM agent_session_tokens WHERE session_id=$1',[second.id])).rows[0]!
    await f.db.query("UPDATE agent_session_tokens SET expires_at=created_at+interval '1 microsecond' WHERE id=$1",[token.id])
    await expect(worker.deliver(fresh)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'});expect(f.deliveryCounts()).toEqual(count)
    await f.db.query('UPDATE agent_session_tokens SET expires_at=$2 WHERE id=$1',[token.id,token.expires_at])
    await f.db.query('UPDATE agent_installation_tokens SET revoked_at=clock_timestamp() WHERE id=$1',[token.installation_token_id])
    await expect(worker.deliver(fresh)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'});expect(f.deliveryCounts()).toEqual(count)
    await f.db.query('UPDATE agent_installation_tokens SET revoked_at=NULL WHERE id=$1',[token.installation_token_id])
    const connection = (await f.db.query<{id:string}>('SELECT id FROM agent_connections WHERE agent_id=$1',[target.agentId])).rows[0]!.id
    const blocker = await f.db.connect()
    try {
      await blocker.query('BEGIN');await blocker.query('SELECT id FROM agent_connections WHERE id=$1 FOR UPDATE',[connection])
      await expect(worker.deliver(fresh)).rejects.toMatchObject({code:'55P03'})
      expect(f.deliveryCounts()).toEqual(count)
      await blocker.query('ROLLBACK')
    } finally { await blocker.query('ROLLBACK');blocker.release() }
    const installationBlocker = await f.db.connect()
    try {
      await installationBlocker.query('BEGIN')
      await installationBlocker.query('SELECT id FROM agent_installation_tokens WHERE id=(SELECT installation_token_id FROM agent_session_tokens WHERE session_id=$1) FOR UPDATE',[second.id])
      await expect(worker.deliver(fresh)).rejects.toMatchObject({code:'55P03'})
      expect(f.deliveryCounts()).toEqual(count)
      // The sender has released its earlier canonical coordinator lock after timeout.
      await installationBlocker.query('SELECT id FROM delegations WHERE id=(SELECT delegation_id FROM agent_connections WHERE id=$1) FOR UPDATE NOWAIT',[connection])
      await installationBlocker.query('ROLLBACK')
    } finally {await installationBlocker.query('ROLLBACK');installationBlocker.release()}
    const revoker = await f.db.connect()
    let sending: Promise<unknown> | undefined
    let waiting: unknown[] = []
    const revokerPid = (await revoker.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
    try {
      await revoker.query('BEGIN')
      await revoker.query('SELECT id FROM agent_definitions WHERE id=$1 FOR UPDATE',[target.agentId])
      sending = worker.deliver(fresh).then(()=>({allowed:true}),error=>({code:(error as {code:string}).code}))
      for(let i=0;i<100;i++) {
        waiting = (await f.db.query("SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND datname=current_database()",[revokerPid])).rows
        if(waiting.length) break
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      expect(waiting.length).toBeGreaterThan(0)
      await revoker.query('UPDATE agent_connections SET revoked_at=clock_timestamp() WHERE id=$1',[connection])
      await revoker.query('COMMIT')
      expect(await sending).toEqual({code:'WEBHOOK_TARGET_REVOKED'})
      expect(f.deliveryCounts()).toEqual(count)
    } finally { await revoker.query('ROLLBACK');revoker.release();if(sending)await sending }
    await f.db.query('UPDATE agent_connections SET revoked_at=NULL WHERE id=$1',[connection])
    await worker.deliver(fresh)
    expect(f.deliveryCounts().accepted).toBe(count.accepted+1)
    await f.receive(second.id,target.token)
    savePlanningEvidence('delivery-fence.json',{oldAttempt:old.attemptCount,newAttempt:fresh.attemptCount,revokerPid,waiting,before:count,after:f.deliveryCounts(),stopDenied:true,expiredLeaseDenied:true,expiredTokenDenied:true,revokedInstallationDenied:true,sourceNowaitRolledBack:true,sourceRevokedBeforeSend:true})
  })

  it('M1 self-claim通知无nonce仍经准确创建Token ID投递，原Connection撤权拒绝且零HTTP', async () => {
    await f.registerCurrentReceiver()
    const ready = (await f.db.query<{id:string}>("SELECT id FROM workflow_states WHERE team_id=$1 AND category='planned' LIMIT 1",[f.teamId])).rows[0]!.id
    const client = new WorkMeshClient({baseUrl:f.baseUrl,coordinationToken:f.connectionToken,installationToken:f.connectionToken})
    const claim = async (title:string) => {
      const work = await f.human<{id:string;revision:number}>('POST','/api/v1/work-items',{teamId:f.teamId,title,statusId:ready,responsibleHumanActorId:f.humanActorId})
      return client.claimWorkItem(work.id,{}, {ifMatch:work.revision,idempotencyKey:randomUUID()})
    }
    const first = await claim('M2 notify self-claim')
    const worker = f.webhookWorker()
    const delivery = (await worker.claimDeliveries()).find(row=>row.sessionId===first.session.id)!
    expect(delivery.payload).not.toHaveProperty('exchangeToken')
    expect(delivery.payload).toMatchObject({sessionTokenId:expect.any(String)})
    const exact = (await f.db.query<{id:string}>('SELECT id FROM agent_session_tokens WHERE session_id=$1',[first.session.id])).rows[0]!.id
    expect((delivery.payload as {sessionTokenId:string}).sessionTokenId).toBe(exact)
    const counts = f.deliveryCounts()
    // Historical no-ID and wrong-origin fixtures are deliberately not repaired by guessing a token.
    const missingBinding = {sessionId:first.session.id,initialPrompt:'Legacy notification without binding'}
    const wrongBinding = {...delivery.payload as Record<string,unknown>,sessionTokenId:randomUUID()}
    for (const payload of [missingBinding,wrongBinding]) {
      await f.db.query('UPDATE agent_webhook_deliveries SET payload=$2::jsonb WHERE id=$1',[delivery.id,JSON.stringify(payload)])
      await expect(worker.deliver({...delivery,payload})).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
      expect(f.deliveryCounts()).toEqual(counts)
    }
    await f.db.query('UPDATE agent_webhook_deliveries SET payload=$2::jsonb WHERE id=$1',[delivery.id,JSON.stringify(delivery.payload)])
    await expect(worker.deliver({...delivery,leaseExpiresAt:new Date(0)})).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(counts)
    await f.human('POST',`/api/v1/agent-sessions/${first.session.id}/signals`,{signal:'stop',reason:'Self-claim notification Stop fence'},first.session.revision)
    await expect(worker.deliver(delivery)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(counts)
    // Privileged fixture restores only the queued state for the same exact original send binding.
    await f.db.query("UPDATE agent_sessions SET state='queued' WHERE id=$1",[first.session.id])
    await worker.deliver(delivery)
    expect(f.deliveryCounts().accepted).toBe(counts.accepted+1)
    await client.exchangeClaimedSessionToken(first.session.id,first.exchangeToken,{idempotencyKey:randomUUID()})
    // Settle only this fixture to free target admission; notification never conveys token exchange authority.
    await f.db.query("UPDATE agent_sessions SET state='canceled',ended_at=clock_timestamp() WHERE id=$1",[first.session.id])
    const legacy=await claim('M2 legacy notification original claim recovery')
    const legacyDelivery=(await worker.claimDeliveries()).find(row=>row.sessionId===legacy.session.id)!
    const legacyPayload={sessionId:legacy.session.id,initialPrompt:'Legacy missing Token ID'}
    await f.db.query('UPDATE agent_webhook_deliveries SET payload=$2::jsonb WHERE id=$1',[legacyDelivery.id,JSON.stringify(legacyPayload)])
    const legacyCounts=f.deliveryCounts()
    let legacyError:unknown
    try {await worker.deliver({...legacyDelivery,payload:legacyPayload})}catch(error){legacyError=error}
    expect(legacyError).toMatchObject({code:'WEBHOOK_TARGET_REVOKED'})
    await worker.fail(legacyDelivery,legacyError)
    const legacyState=(await f.db.query('SELECT status,last_error_code FROM agent_webhook_deliveries WHERE id=$1',[legacyDelivery.id])).rows[0]!
    expect(legacyState).toMatchObject({status:'dead',last_error_code:'WEBHOOK_TARGET_REVOKED'})
    expect(f.deliveryCounts()).toEqual(legacyCounts)
    const recoveryClient=new WorkMeshClient({baseUrl:f.baseUrl,coordinationToken:f.connectionToken,installationToken:f.connectionToken})
    await recoveryClient.exchangeClaimedSessionToken(legacy.session.id,legacy.exchangeToken,{idempotencyKey:randomUUID()})
    await recoveryClient.acknowledge(legacy.session.id,{summary:'Original claim receipt; notification stays dead',externalUrls:[]})
    expect((await f.db.query('SELECT state FROM agent_sessions WHERE id=$1',[legacy.session.id])).rows[0]).toEqual({state:'acknowledged'})
    savePlanningEvidence('legacy-self-claim-recovery.json',{sessionId:legacy.session.id,deliveryId:legacyDelivery.id,legacyState,exactOriginalClaimReceiptUsed:true,notificationRepaired:false,httpCountUnchanged:true})
    await f.db.query("UPDATE agent_sessions SET state='canceled',ended_at=clock_timestamp() WHERE id=$1",[legacy.session.id])
    const second = await claim('M2 revoked self-claim notice')
    const blocked = (await worker.claimDeliveries()).find(row=>row.sessionId===second.session.id)!
    const connection = (await f.db.query<{id:string}>('SELECT id FROM agent_connections WHERE agent_id=$1',[f.agentId])).rows[0]!.id
    await f.db.query('UPDATE agent_connections SET revoked_at=clock_timestamp() WHERE id=$1',[connection])
    const before = f.deliveryCounts()
    try { await expect(worker.deliver(blocked)).rejects.toMatchObject({code:'WEBHOOK_TARGET_REVOKED'});expect(f.deliveryCounts()).toEqual(before) }
    finally { await f.db.query('UPDATE agent_connections SET revoked_at=NULL WHERE id=$1',[connection]) }
    savePlanningEvidence('self-claim-notification.json',{sessionId:first.session.id,exactTokenId:exact,nonceAbsent:true,delivered:true,missingBindingDenied:true,wrongBindingDenied:true,expiredClaimDenied:true,stopDenied:true,revokedSourceDenied:true,before,after:f.deliveryCounts()})
  })

  it('投影签名分页绑定父/过滤且每页重验授权，GET零业务写、零token/prompt', async () => {
    const parent = await f.createExecution('M2 projection')
    const target = await f.registerTarget()
    const step = randomUUID()
    const revision = (await parent.client.getSession<{ revision: number }>(parent.sessionId)).revision
    await parent.client.publishPlan(parent.sessionId, { changeSummary: 'M2 pagination', steps: [{ id: step, title: 'Read children', ordinal: 0, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }, { ifMatch: revision })
    const plan = await parent.client.getPlan<{ id: string }>(parent.sessionId)
    // Privileged test capacity only; no client limit DTO exists.
    await f.db.query('UPDATE agent_definitions SET max_concurrency=8 WHERE id=$1', [target.agentId])
    const ids: string[] = []
    for (let i=0;i<3;i++) ids.push((await parent.client.createChildSession(parent.sessionId, { agentId: target.agentId, planStepId: step, planVersionId: plan.id, initialPrompt: 'Secret prompt must never appear in projection' })).id)
    const before = await facts()
    const first = await parent.client.listChildSessions(parent.sessionId, {}, { limit: 1 })
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy()
    const second = await parent.client.listChildSessions(parent.sessionId, {}, { limit: 2, cursor: first.nextCursor! })
    expect(new Set([...first.items,...second.items].map(item=>item.id))).toEqual(new Set(ids))
    expect(JSON.stringify([first,second])).not.toMatch(/token|prompt|Secret/)
    expect(await facts()).toEqual(before)
    await expect(parent.client.listChildSessions(parent.sessionId, { childSessionId: ids[0] }, { cursor: first.nextCursor! })).rejects.toBeDefined()
    await expect(parent.client.listChildSessions(parent.sessionId, { childSessionId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const probes: Array<{ label: string; sql: string; restore: string; args: unknown[] }> = [
      { label: '原Connection撤权', sql: "UPDATE agent_connections SET revoked_at=clock_timestamp() WHERE id=$1", restore: 'UPDATE agent_connections SET revoked_at=NULL WHERE id=$1', args: [f.connectionId] },
      { label: 'principal失效', sql: 'UPDATE actors SET is_active=false WHERE id=$1', restore: 'UPDATE actors SET is_active=true WHERE id=$1', args: [f.humanActorId] },
      { label: 'membership移除', sql: 'DELETE FROM memberships WHERE actor_id=$1 AND team_id=$2', restore: '', args: [f.humanActorId,f.teamId] },
      { label: '父暂停', sql: "UPDATE agent_sessions SET state='paused' WHERE id=$1", restore: "UPDATE agent_sessions SET state='executing' WHERE id=$1", args: [parent.sessionId] },
      { label: '父终态', sql: "UPDATE agent_sessions SET state='canceled',ended_at=clock_timestamp() WHERE id=$1", restore: "UPDATE agent_sessions SET state='executing',ended_at=NULL WHERE id=$1", args: [parent.sessionId] },
    ]
    const probeResults: unknown[] = []
    for (const probe of probes) {
      const memberships = probe.label==='membership移除' ? (await f.db.query('SELECT * FROM memberships WHERE actor_id=$1 AND team_id=$2',probe.args)).rows : []
      await f.db.query(probe.sql,probe.args)
      try {
        const snapshot = await facts()
        await expect(parent.client.listChildSessions(parent.sessionId,{},{cursor:first.nextCursor!})).rejects.toBeDefined()
        await expect(parent.client.listChildSessions(parent.sessionId,{childSessionId:randomUUID()})).rejects.not.toMatchObject({code:'NOT_FOUND'})
        expect(await facts()).toEqual(snapshot)
        probeResults.push({ label: probe.label, denied: true, before: snapshot, after: await facts() })
      } finally {
        if (probe.restore) await f.db.query(probe.restore,probe.args)
        else for (const membership of memberships) await f.db.query('INSERT INTO memberships SELECT * FROM jsonb_populate_record(NULL::memberships,$1::jsonb)',[JSON.stringify(membership)])
      }
    }
    const childId = ids[0]!
    const delegation = (await f.db.query<{ delegation_id: string; parent_delegation_id: string }>('SELECT child.delegation_id,delegation.parent_delegation_id FROM agent_sessions child JOIN delegations delegation ON delegation.id=child.delegation_id WHERE child.id=$1',[childId])).rows[0]!
    await f.db.query('UPDATE delegations SET parent_delegation_id=NULL WHERE id=$1',[delegation.delegation_id])
    const bindingBefore = await facts()
    await expect(parent.client.listChildSessions(parent.sessionId,{childSessionId:childId})).rejects.toMatchObject({code:'NOT_FOUND'})
    expect(await facts()).toEqual(bindingBefore)
    await f.db.query('UPDATE delegations SET parent_delegation_id=$2 WHERE id=$1',[delegation.delegation_id,delegation.parent_delegation_id])
    const otherParent = await f.createExecution('M2 wrong parent')
    await expect(parent.client.listChildSessions(otherParent.sessionId)).rejects.toBeDefined()
    await expect(otherParent.client.listChildSessions(otherParent.sessionId,{childSessionId:childId})).rejects.toMatchObject({code:'NOT_FOUND'})
    await f.db.query('UPDATE agent_team_access SET revoked_at=clock_timestamp() WHERE agent_id=$1 AND team_id=$2', [f.agentId,f.teamId])
    const revokedBefore = await facts()
    await expect(parent.client.listChildSessions(parent.sessionId, {}, { cursor: first.nextCursor! })).rejects.toBeDefined()
    expect(await facts()).toEqual(revokedBefore)
    savePlanningEvidence('projection-pages-denial.json', { first,second,before,probeResults,bindingBefore,revokedBefore,after:await facts() })
  })
})
