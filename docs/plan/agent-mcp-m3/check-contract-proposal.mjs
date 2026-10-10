// 仅运行规划DTO与OpenAPI静态样本，不调用产品API/Worker/provider。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const dir=dirname(fileURLToPath(import.meta.url))
const require=createRequire(resolve(dir,'.runtime/package.json'))
const ts=require('typescript'), YAML=require('yaml')
const source=readFileSync(resolve(dir,'dto-proposal.ts'),'utf8')
const converted=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}})
assert.equal(converted.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0)
const module={exports:{}}
new Function('require','module','exports',converted.outputText)(require,module,module.exports)
const {providerActionProjectionProposalSchema: schema,providerActionQueryProposalSchema: query,
  reviewRepositoryIdsProposalSchema: ids,reviewDelegationRepositoryPatchProposalSchema: patch}=module.exports
const shapes=JSON.parse(readFileSync(resolve(dir,'dto-shapes.json'),'utf8'))
const api=YAML.parse(readFileSync(resolve(dir,'openapi-proposal.yaml'),'utf8'))
assert.deepEqual(api.components.schemas.ProviderActionProjection,shapes.response)
assert.deepEqual(api.components.schemas.ExplicitReviewRepositoryIds,shapes.repositoryIds)
assert.equal(api.paths['/api/v1/provider-actions/{id}'].get.operationId,'getProviderAction')
assert.deepEqual(api.paths['/api/v1/provider-actions/{id}'].get.parameters.map(p=>p.name),['id'])
const id='00000000-0000-4000-8000-000000000001'
const now='2030-01-01T00:00:00Z'
const base={id,provider:'fake',connectionId:id,repositoryId:id,requesterActorId:id,sessionId:id,workItemId:id,
  projectId:null,planStepId:null,expectedHeadSha:null,approvalId:null,status:'completed',effect:'committed',
  artifactIds:[],createdAt:now,updatedAt:now,completedAt:now,error:null,recovery:{kind:'none',scheduled:false,nextQueryAt:null}}
const examples={
 create_branch:{target:{branchName:'work/test',baseSha:'base'},result:{branchName:'work/test',headSha:'head'}},
 create_commit:{target:{branchName:'work/test',expectedHeadSha:'head'},result:{providerCommitId:'commit',sha:'next',branchName:'work/test'}},
 open_pull_request:{target:{baseBranch:'main',headBranch:'work/test'},result:{providerPullRequestId:'1',number:1,projectionId:id,baseSha:'base',headSha:'next',state:'open'}},
 merge_pull_request:{target:{providerPullRequestId:'1',headSha:'next',method:'squash'},result:{merged:true,mergeSha:'merged'}},
 retry_ci_check:{target:{providerPullRequestId:'1',headSha:'next',checkRunId:'check1'},result:{requested:true,checkRunId:'check1'}},
 resolve_repository_context:{target:{resourceKind:'work_item',resourceId:id},result:{contextId:id}},
}
let accepted=0,rejected=0
const good=v=>{assert.equal(schema.safeParse(v).success,true,JSON.stringify(v));accepted++}
const bad=v=>{assert.equal(schema.safeParse(v).success,false,JSON.stringify(v));rejected++}
for(const [kind,data] of Object.entries(examples)){
 const sample={...base,kind,...data}
 good(sample)
 for(const status of ['pending','claimed','failed','dead']){
  good({...sample,status,effect:'unknown',result:null,completedAt:null,
    recovery:{kind:status==='dead'?'human_reconcile':'poll_same_action',scheduled:status==='failed',nextQueryAt:status==='dead'?null:now}})
  good({...sample,status,effect:'checkpointed',completedAt:null,recovery:{kind:'human_reconcile',scheduled:false,nextQueryAt:null}})
 }
 for(const field of ['payload','claimed_by','intent_key','rawError','secret'])bad({...sample,[field]:'MUST_NOT_RETURN'})
 bad({...sample,result:{...sample.result,raw:'MUST_NOT_RETURN'}})
 bad({...sample,target:{...sample.target,files:[{content:'PRIVATE'}]}})
 bad({...sample,error:{code:'provider-returned-private-message'}})
 bad({...sample,effect:'unknown'})
 bad({...sample,result:null})
 bad({...sample,status:'failed'})
 bad({...sample,effect:'checkpointed'})
 bad({...sample,recovery:{kind:'poll_same_action',scheduled:false,nextQueryAt:null}})
 if(kind!=='resolve_repository_context')bad({...sample,sessionId:null})
 if(kind==='open_pull_request')bad({...sample,result:{...sample.result,projectionId:null}})
}
assert.equal(query.safeParse({}).success,true)
for(const v of [{sessionId:id},{operationKey:'k'},{claim:true}]){assert.equal(query.safeParse(v).success,false);rejected++}
assert.equal(patch.safeParse({}).success,true)
for(const v of [[],[id,id],['bad'],Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`),null]){
 assert.equal(ids.safeParse(v).success,false);rejected++
}
assert.equal(ids.safeParse([id]).success,true)
assert.equal(ids.safeParse(Array.from({length:100},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`)).success,true)
console.log(JSON.stringify({kindCount:6,statusCount:5,acceptedSamples:accepted,rejectedSamples:rejected,
  schemaParity:true,productTestsExecuted:false,node:process.version,
  dependencies:{zod:require('zod/package.json').version,typescript:ts.version,yaml:require('yaml/package.json').version},exitCode:0}))
