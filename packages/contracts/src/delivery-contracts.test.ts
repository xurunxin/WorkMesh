import {randomUUID} from 'node:crypto'
import {describe,expect,it} from 'vitest'
import {parseProviderActionCheckpoint,providerActionProjectionSchema} from './delivery-contracts.js'
import {reviewDelegationInputSchema} from './child-session-contracts.js'

describe('M3 exact action白名单与显式review仓库合同',()=>{
  it('拒错误kind/target checkpoint，不以adapter去重或merged观察冒原动作成功',()=>{
    expect(parseProviderActionCheckpoint({kind:'create_branch',provider:'github',payload:{name:'exact',baseSha:'base'},result:{name:'other',headSha:'base'}})).toBeNull()
    expect(parseProviderActionCheckpoint({kind:'retry_ci_check',provider:'gitea',payload:{checkRunId:'42'},result:{requested:true,checkRunId:'42'}})).toBeNull()
    expect(parseProviderActionCheckpoint({kind:'create_commit',provider:'gitea',payload:{branch:'a',files:[{},{}]},result:{id:'commit',sha:'commit',branch:'a',uri:'https://example.test'}})).toBeNull()
    expect(parseProviderActionCheckpoint({kind:'merge_pull_request',provider:'github',payload:{},result:{state:'merged'}})).toBeNull()
  })
  it('省略保持既有合同；显式非空无重复且不接受不安全投影字段',()=>{
    const body={reviewerAgentId:randomUUID(),planStepId:randomUUID(),planVersionId:randomUUID(),initialPrompt:'Review',ttlSeconds:300}
    expect(reviewDelegationInputSchema.parse(body).repositoryIds).toBeUndefined()
    expect(reviewDelegationInputSchema.safeParse({...body,repositoryIds:[]}).success).toBe(false)
    const id=randomUUID();expect(reviewDelegationInputSchema.safeParse({...body,repositoryIds:[id,id]}).success).toBe(false)
    const now=new Date().toISOString()
    const projection={id,provider:'github',connectionId:id,repositoryId:id,requesterActorId:id,sessionId:id,workItemId:id,projectId:null,planStepId:null,expectedHeadSha:null,approvalId:null,status:'dead',effect:'unknown',kind:'create_branch',target:{branchName:'exact',baseSha:'base'},result:null,artifactIds:[],createdAt:now,updatedAt:now,completedAt:null,error:{code:'PROVIDER_ACTION_OUTCOME_UNKNOWN'},recovery:{kind:'human_reconcile',scheduled:false,nextQueryAt:null}}
    expect(providerActionProjectionSchema.safeParse(projection).success).toBe(true)
    expect(providerActionProjectionSchema.safeParse({...projection,payload:{secret:'hidden'}}).success).toBe(false)
    expect(providerActionProjectionSchema.safeParse({...projection,recovery:{kind:'poll_same_action',scheduled:true,nextQueryAt:now}}).success).toBe(false)
  })
})
