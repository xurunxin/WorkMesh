import { describe,it,expect,vi } from 'vitest'
import { WorkMeshClient } from './index.js'
const id='11111111-1111-4111-8111-111111111111'
describe('可选域typed SDK准确当前身份',()=>{
  it('A2A bigint checkpoint独立且保空映射cursor；usage金额不转number',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({events:[],cursor:'9007199254740993'})).mockResolvedValueOnce(Response.json({input_tokens:'0',output_tokens:'0',runtime_ms:'0',tool_calls:'0',unknown_cost_records:1,currency_buckets:[{currency:'USD',known_cost_minor:'9007199254740993',unknown_cost_records:1}]}))
    const client=new WorkMeshClient({baseUrl:'http://api.test',sessionToken:'exact-E',installationToken:'other-install',fetch:fetcher})
    expect(await client.getA2ATaskEvents(id,'task /中文','9007199254740992')).toEqual({events:[],cursor:'9007199254740993'})
    expect(new URL(fetcher.mock.calls[0]![0]).pathname).toContain('task%20%2F%E4%B8%AD%E6%96%87')
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get('after')).toBe('9007199254740992')
    const result=await client.getUsageSummary({from:'2020-01-01T00:00:00Z'})
    expect(result.currency_buckets[0]!.known_cost_minor).toBe('9007199254740993')
    expect(fetcher.mock.calls.every(call=>new Headers(call[1].headers).get('authorization')==='Bearer exact-E')).toBe(true)
  })
  it('有限写固定key/body；HTTP403不刷新安装凭据',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'FORBIDDEN',message:'Denied',correlationId:'refusal'}}),{status:403})).mockResolvedValue(Response.json({runId:id,sessionId:null,duplicate:false}))
    const client=new WorkMeshClient({baseUrl:'http://api.test',sessionToken:'own-E',installationToken:'target',fetch:fetcher})
    const body={occurrenceKey:'same-occurrence',scheduledFor:'2020-01-01T00:00:00Z'}
    await expect(client.runLoopNow(id,body,{idempotencyKey:'same-key'})).rejects.toMatchObject({code:'FORBIDDEN',correlationId:'refusal'})
    expect(fetcher).toHaveBeenCalledTimes(1)
    await client.runLoopNow(id,body,{idempotencyKey:'same-key'})
    expect(fetcher.mock.calls[0]![1].body).toBe(fetcher.mock.calls[1]![1].body)
    expect(fetcher.mock.calls.every(call=>new Headers(call[1].headers).get('idempotency-key')==='same-key')).toBe(true)
  })
  it('拒绝不完整成功包与非规范金额/cursor，不丢弃新增字段',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({events:[],cursor:9007199254740993})).mockResolvedValueOnce(Response.json({items:[{id,name:'Pinned',version:2,body:{text:'全量'},newField:'保留'}],nextCursor:null}))
    const client=new WorkMeshClient({baseUrl:'http://api.test',sessionToken:'own',fetch:fetcher})
    await expect(client.getA2ATaskEvents(id,'task')).rejects.toMatchObject({code:'MALFORMED_RESPONSE'})
    expect((await client.listTemplates()).items[0]).toMatchObject({newField:'保留',version:2,body:{text:'全量'}})
    await expect(client.getA2ATaskEvents(id,'task','9223372036854775808')).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
