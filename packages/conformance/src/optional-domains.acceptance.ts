import assert from 'node:assert/strict'
import { createExternalConsumer } from './joint-clients.external.js'
import { createOptionalConsumerFixture } from './optional-domains.consumer.fixture.js'
import { saveOptionalEvidence } from './optional-domains.fixture.js'

// 本机必需入口；缺客户端或私有证据路径必须失败，不能 skip。
if (!process.env.M5_CLIENT_EXECUTABLE || !process.env.M5_EVIDENCE_ROOT) {
  throw new Error('M4_NATIVE_CLIENT_AND_PRIVATE_EVIDENCE_REQUIRED')
}
const f = await createOptionalConsumerFixture()
try {
  const {origin,target,initiativeId,templateId,pinnedMarkdown,runId,bindingId,taskId,targetAgentId}=f
  await target.client.recordUsage({dedupeKey:'m4-native-known',agentId:targetAgentId,sessionId:target.sessionId,
    occurredAt:'2020-01-01T00:00:00Z',inputTokens:17,currency:'USD',costSource:'manual',costMinor:'9007199254740993'})
  await target.client.recordUsage({dedupeKey:'m4-native-unknown',agentId:targetAgentId,sessionId:target.sessionId,
    occurredAt:'2020-01-01T00:00:00Z',inputTokens:17,currency:'EUR',costSource:'unknown'})
  const native=await createExternalConsumer({baseUrl:f.f.baseUrl,sessionToken:origin.token,allowedTools:['get_initiative_rollup','get_usage_summary']})
  try {
    const rollup=await native.invoke<{projectCount:number;totalItems:number}>('get_initiative_rollup',{initiativeId})
    assert.equal(rollup.projectCount,1);assert.equal(rollup.totalItems,1)
    const usage=await native.invoke<{currency_buckets:unknown[]}>('get_usage_summary',{})
    assert.deepEqual(usage.currency_buckets,[])
    saveOptionalEvidence('native-opencode-model-received.json',{actualClient:'native OpenCode',exactExecution:origin.sessionId,
      modelReceivedRollup:true,modelReceivedUsage:true,entry:'test:acceptance:m4',rollup,usage})
  } finally {await native.close()}
  const targetNative=await createExternalConsumer({baseUrl:f.f.baseUrl,sessionToken:target.token,
    allowedTools:['list_templates','get_automation_run','get_usage_summary','get_a2a_task_events']})
  try {
    const pins=await targetNative.invoke<{items:Array<{id:string;body:{instructions:string}}>}>('list_templates',{limit:1})
    assert.equal(pins.items.length,1);assert.equal(pins.items[0]!.id,templateId)
    assert.equal(pins.items[0]!.body.instructions,pinnedMarkdown)
    const run=await targetNative.invoke<{id:string;session_id:string}>('get_automation_run',{runId})
    assert.equal(run.id,runId);assert.equal(run.session_id,target.sessionId)
    const usage=await targetNative.invoke<{unknown_cost_records:number;currency_buckets:unknown[]}>('get_usage_summary',{})
    assert.equal(usage.unknown_cost_records,1)
    assert.deepEqual(usage.currency_buckets,[{currency:'EUR',known_cost_minor:'0',unknown_cost_records:1},
      {currency:'USD',known_cost_minor:'9007199254740993',unknown_cost_records:0}])
    const page=await targetNative.invoke<{cursor:string;events:unknown[]}>('get_a2a_task_events',{bindingId,taskId})
    assert.equal(typeof page.cursor,'string');assert.ok(page.events.length>0)
    saveOptionalEvidence('native-target-model-received.json',{exactTargetSession:target.sessionId,fullTemplateReceived:true,
      runUsageAndA2AReceived:true,entry:'test:acceptance:m4',run,usage,page})
  } finally {await targetNative.close()}
  console.log(JSON.stringify({nativeOriginAndTarget:'passed',entry:'test:acceptance:m4',requiredCiNative:'not_run',finalAcceptance:'pending_formal_review_and_required_ci'}))
} catch(error) {
  saveOptionalEvidence('native-acceptance-failure.json',{entry:'test:acceptance:m4',error:String(error),accepted:false})
  throw error
} finally {await f.f.close()}
