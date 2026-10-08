import {randomUUID} from 'node:crypto'
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest'
import {createDb,applyMigrations,installWorkspace,withTx,appendEvent,createChannelTarget,admitChannelEvent,claimChannelNotifications,prepareChannelSend,settleChannelSend,reconcileChannelSend} from '@workmesh/db'
import {loadFeatureConfig} from '@workmesh/config'
import {createClient} from 'redis'
import {createAutomationWorker as createBaseAutomationWorker} from '../../worker/src/automation.js'
import {createWecomAdmission,createWecomNotificationAdapter} from '../../worker/src/wecom-notifications.js'

// Existing API integration provisions PostgreSQL + Redis; Worker CI stays PostgreSQL-only.
const databaseUrl=process.env.DATABASE_URL
if(process.env.RUN_INTEGRATION!=='1'||!databaseUrl||!process.env.REDIS_URL||!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))throw new Error('C2 requires a dedicated integration test database and Redis')
const db=createDb(databaseUrl)
let fixture:{workspaceId:string;teamId:string;humanId:string;workItemId:string;agentId:string;agentActorId:string;templateVersionId:string}
const meta=(suffix:string)=>({workspaceId:fixture.workspaceId,actorId:fixture.humanId,correlationId:`c2:${suffix}:${randomUUID()}`})
const features=loadFeatureConfig({WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS:'true'})
describe('C2 channel delivery with existing Redis integration fixture',()=>{
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE TABLE workspaces CASCADE')
    const installed = await installWorkspace(db, {
      workspaceName: 'Stage 4 Automation',
      workspaceSlug: `stage4-${randomUUID()}`,
      adminName: 'Stage 4 Admin',
      email: `stage4-${randomUUID()}@example.test`,
      password: 'stage-four-integration-password',
    })
    const state = (await db.query<{ id: string }>(
      "SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog' ORDER BY position LIMIT 1",
      [installed.teamId],
    )).rows[0]!
    const item = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
        workspace_id,team_id,number,title,status_id,responsible_human_actor_id,labels
      ) VALUES($1,$2,1,'Scheduled triage',$3,$4,'{}') RETURNING id`,
      [installed.workspaceId, installed.teamId, state.id, installed.actorId],
    )).rows[0]!
    await db.query(
      'UPDATE teams SET next_work_item_number=2 WHERE id=$1',
      [installed.teamId],
    )
    const agentActor = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Stage 4 Agent') RETURNING id",
      [installed.workspaceId],
    )).rows[0]!
    const capabilities = ['work:read', 'work:write']
    const agent = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(
        workspace_id,actor_id,slug,display_name,supported_protocols,requested_capabilities,
        approved_capabilities,max_concurrency
      ) VALUES($1,$2,$3,'Stage 4 Agent',ARRAY['native_http']::agent_protocol[],$4,$4,100) RETURNING id`,
      [installed.workspaceId, agentActor.id, `stage4-${randomUUID()}`, capabilities],
    )).rows[0]!
    await db.query(
      `INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities)
       VALUES($1,$2,$3,$4,$5)`,
      [installed.workspaceId, agent.id, installed.teamId, installed.actorId, capabilities],
    )
    const template = (await db.query<{ id: string }>(
      `INSERT INTO templates(workspace_id,kind,name,owner_actor_id,status)
       VALUES($1,'agent_run',$2,$3,'active') RETURNING id`,
      [installed.workspaceId, `triage-${randomUUID()}`, installed.actorId],
    )).rows[0]!
    const templateVersion = (await db.query<{ id: string }>(
      `INSERT INTO template_versions(template_id,version,body,change_summary,created_by_actor_id)
       VALUES($1,1,$2,'Initial',$3) RETURNING id`,
      [template.id, { requiredCapabilities: capabilities }, installed.actorId],
    )).rows[0]!
    await db.query('UPDATE templates SET current_version_id=$1 WHERE id=$2', [templateVersion.id, template.id])
    fixture = {
      workspaceId: installed.workspaceId,
      teamId: installed.teamId,
      humanId: installed.actorId,
      workItemId: item.id,
      agentId: agent.id,
      agentActorId: agentActor.id,
      templateVersionId: templateVersion.id,
    }
  }, 120_000)
  afterAll(async () => { await db.end() })

    const source = async () => withTx(db, async tx => {
      const row = (await tx.query<{id:string}>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id,payload)
        VALUES($1,$2,$3,'ask','activity',$4,'{"summary":"Private source content must never leave WorkMesh"}') RETURNING id`, [fixture.workspaceId,fixture.humanId,fixture.teamId,randomUUID()])).rows[0]!
      const eventId = await appendEvent(tx, { ...meta('channel-source'), type: 'inbox.item.created', aggregateType: 'inbox_item', aggregateId: row.id, revision: 1 })
      return {id:row.id,eventId}
    })
    const claim = (worker: string, limit = 25) => withTx(db, tx => claimChannelNotifications(tx, worker, ['wecom'], limit, 60))
    const expire = (id: string) => db.query(`UPDATE notification_deliveries SET claimed_at=now()-interval '61 seconds' WHERE id=$1`,[id])
    const state = async (id: string) => (await db.query<{status:string;outcome:string;revision:number;effect_key:string;attempt_count:number;claim_fence:number}>(`SELECT status,outcome,revision,effect_key,attempt_count,claim_fence FROM notification_deliveries WHERE id=$1`,[id])).rows[0]!
    beforeEach(async () => {
      await db.query(`UPDATE notification_deliveries SET status='dead',outcome='failed',claimed_at=NULL,claimed_by=NULL WHERE intent_id IS NOT NULL`)
      await db.query(`UPDATE notification_channel_targets SET enabled=false`)
      await db.query(`UPDATE outbox_events SET status='delivered',locked_at=NULL,locked_by=NULL`)
      await db.query(`UPDATE actors SET is_active=true,workspace_role='admin' WHERE id=$1`, [fixture.humanId])
      await db.query('DELETE FROM notification_preferences WHERE workspace_id=$1 AND actor_id=$2', [fixture.workspaceId,fixture.humanId])
      await db.query(`UPDATE loops SET state='paused',next_run_at=NULL`)
    })
    const approvalSource = () => withTx(db, async tx => {
      const work=(await tx.query<{id:string}>(`INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) SELECT workspace_id,team_id,(SELECT coalesce(max(number),0)+1 FROM work_items WHERE team_id=$2),'C1 concurrent approval',status_id,$3 FROM work_items WHERE id=$1 RETURNING id`,[fixture.workItemId,fixture.teamId,fixture.humanId])).rows[0]!
      const delegation=(await tx.query<{id:string}>(`INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,ARRAY['work:read','work:write'],$7) RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,fixture.humanId,work.id,{teamIds:[fixture.teamId],workItemIds:[work.id]}])).rows[0]!
      const session=(await tx.query<{id:string}>(`INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'awaiting_approval') RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,delegation.id,work.id])).rows[0]!
      const approval=(await tx.query<{id:string}>(`INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,expires_at) VALUES($1,$2,$3,'protected_action','test_c1','{}',$4,'high','Private rationale',now()+interval '1 hour') RETURNING id`,[fixture.workspaceId,session.id,fixture.agentActorId,'sha256:'+'a'.repeat(64)])).rows[0]!
      const eventId=await appendEvent(tx,{...meta('approval-race'),type:'approval.requested',aggregateType:'approval',aggregateId:approval.id,revision:1})
      return {id:approval.id,eventId,sessionId:session.id,delegationId:delegation.id,workItemId:work.id}
    })
    const waitForBlockedTransaction = async (blocker: number) => {
      const deadline=Date.now()+5_000
      while(Date.now()<deadline){
        if((await db.query<{blocked:boolean}>('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',[blocker])).rows[0]!.blocked)return
        await new Promise(resolve=>setTimeout(resolve,20))
      }
      throw new Error('Expected a real PostgreSQL lock wait, not a sequential revocation')
    }
    describe('C2 fake provider 与真实 Redis Lua', () => {
      const redis = createClient({ url: process.env.REDIS_URL })
      let clock = 0
      let namespace = ''
      let sends: Array<{ at: number; body: string }> = []
      beforeAll(async () => { await redis.connect() })
      afterAll(async () => { await redis.quit() })
      beforeEach(async () => {
        clock = 0; namespace = `c2:{${randomUUID()}}`; sends = []
        await redis.hSet(`${namespace}:state`, { epoch: randomUUID(), ready: '0' })
        await db.query(`UPDATE notification_deliveries SET status='dead',claimed_at=NULL,claimed_by=NULL WHERE intent_id IS NULL`)
      })
      afterEach(async () => {
        const keys = await redis.keys(`${namespace}:*`)
        if (keys.length) await redis.del(keys)
      })
      const admission = () => createWecomAdmission({ eval: (script, options) => {
        // 仅替换时钟原语；额度、token 和 epoch 的实际 Lua 在独有 Redis 中执行。
        const args = [...options.arguments]; while (args.length < 4) args.push('')
        args.push(String(Math.floor(clock / 1000)), String((clock % 1000) * 1000))
        return redis.eval(script.replace("local time = redis.call('TIME')", 'local time = {ARGV[5], ARGV[6]}'), { keys: options.keys, arguments: args })
      } }, namespace)
      const c2Target = () => withTx(db, tx => createChannelTarget(tx, meta('c2-target'), { name: 'C2 fake', provider: 'wecom', enabled: true, secretMaterial: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${randomUUID()}` }))
      const adapter = (outcome: 'success' | 'unknown' = 'success') => createWecomNotificationAdapter({
        webOrigin: 'https://workmesh.example.test', admission: admission(),
        dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }],
        fetcher: async (_url, init) => {
          sends.push({ at: clock, body: init.body })
          if (outcome === 'unknown') throw new Error('fake disconnected')
          return { status: 200, body: '{"errcode":0}' }
        },
      })
      const worker = (id: string = randomUUID(), outcome: 'success' | 'unknown' = 'success') => createBaseAutomationWorker({ db, features, workerId: id, channelAdapters: { wecom: adapter(outcome) } })
      const enqueue = async () => { const item = await source(); await withTx(db, tx => admitChannelEvent(tx, item.eventId)); return item }
      it('实际发送窗口：0 秒预留、4 秒发送，60 秒不释放额度，跨 Worker 不出现第 21 条', async () => {
        await c2Target(); for (let i = 0; i < 21; i++) await enqueue()
        const a = worker(), b = worker()
        const [first] = await a.claimNotifications(); expect(first).toBeDefined()
        clock = 4000; await a.deliverNotification(first!)
        for (let i = 0; i < 19; i++) await (i % 2 ? a : b).tick()
        expect(sends).toHaveLength(20)
        clock = 60000; await b.tick(); expect(sends).toHaveLength(20)
        const queued = (await db.query(`SELECT attempt_count,retry_budget_start FROM notification_deliveries WHERE status='pending' AND intent_id IS NOT NULL`)).rows
        expect(queued).toHaveLength(1); expect(queued[0]).toMatchObject({ attempt_count: 0, retry_budget_start: 0 })
        clock = 124001; await db.query(`UPDATE notification_deliveries SET available_at=now() WHERE status='pending' AND intent_id IS NOT NULL`)
        await b.tick(); expect(sends).toHaveLength(21)
        for (const sent of sends) expect(sends.filter(other => other.at > sent.at - 60000 && other.at <= sent.at)).toHaveLength(sent.at === 124001 ? 1 : 20)
        expect(sends.every(sent => !sent.body.includes('Private source'))).toBe(true)
      })
      it('并发 Worker 原子额度上限；崩溃后仅 token 过期，额度仍保留至 D+60', async () => {
        const target = await c2Target(), limit = admission()
        for (let i = 0; i < 20; i++) {
          const result = await limit.reserve(target.endpoint_fingerprint); expect(result.permit).toBeDefined()
          // 模拟进程崩溃后 serial TTL 到期，不提交 finish，不删除 quota。
          await redis.del(`${namespace}:${target.endpoint_fingerprint}:serial`)
        }
        clock = 60000
        const denied = await Promise.all(Array.from({ length: 6 }, () => admission().reserve(target.endpoint_fingerprint)))
        expect(denied.every(row => !row.permit)).toBe(true)
        clock = 119999; expect((await limit.reserve(target.endpoint_fingerprint)).permit).toBeUndefined()
        clock = 120000
        const resumed = await Promise.all(Array.from({ length: 6 }, () => admission().reserve(target.endpoint_fingerprint)))
        expect(resumed.filter(row => row.permit)).toHaveLength(1)
        await resumed.find(row => row.permit)!.permit!.finish()
      })
      it('可信完成晚于发送截止上界：额度至少保留至完成后 60 秒，token 单独释放', async () => {
        const target = await c2Target(), limit = admission(), first = await limit.reserve(target.endpoint_fingerprint)
        clock = 65000; await first.permit!.finish()
        expect(await redis.exists(`${namespace}:${target.endpoint_fingerprint}:serial`)).toBe(0)
        for (let i = 0; i < 19; i++) {
          const next = await limit.reserve(target.endpoint_fingerprint); expect(next.permit).toBeDefined(); await next.permit!.finish()
        }
        clock = 120000; expect((await limit.reserve(target.endpoint_fingerprint)).permit).toBeUndefined()
        clock = 124999; expect((await limit.reserve(target.endpoint_fingerprint)).permit).toBeUndefined()
        clock = 125000
        const resumed = await limit.reserve(target.endpoint_fingerprint); expect(resumed.permit).toBeDefined(); await resumed.permit!.finish()
      })
      it('C2 实际五秒 Abort 结束请求后进入 uncertain，不自动重送且额度保留 D+60', async () => {
        const target = await c2Target(); await enqueue()
        let aborted = false
        const timed = createWecomNotificationAdapter({ webOrigin: 'https://workmesh.example.test', admission: admission(), dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }], fetcher: async (_url, init) => {
          sends.push({ at: clock, body: init.body })
          return new Promise<never>((_, reject) => { init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('fake provider aborted')) }, { once: true }) })
        } })
        const a = createBaseAutomationWorker({ db, features, workerId: 'c2-real-timeout', channelAdapters: { wecom: timed } }), [delivery] = await a.claimNotifications()
        await a.deliverNotification(delivery!)
        expect(aborted).toBe(true); expect(await state(delivery!.id)).toMatchObject({ status: 'failed', outcome: 'uncertain' })
        expect(await redis.exists(`${namespace}:${target.endpoint_fingerprint}:serial`)).toBe(0)
        const quotas = await redis.zRangeWithScores(`${namespace}:${target.endpoint_fingerprint}:quota`, 0, -1)
        expect(quotas.filter(row => row.value !== '__sentinel').every(row => row.score >= 120000)).toBe(true)
        await worker('c2-after-timeout').tick(); expect(sends).toHaveLength(1)
      })
      it('Redis 状态丢失：共享冷却 120 秒，旧 token 不恢复发送', async () => {
        const target = await c2Target(), limit = admission(), old = await limit.reserve(target.endpoint_fingerprint)
        await redis.del(`${namespace}:state`)
        expect(await old.permit!.remainingMs()).toBe(0)
        clock = 119999; expect((await admission().reserve(target.endpoint_fingerprint)).permit).toBeUndefined()
        clock = 120000; await redis.del(`${namespace}:${target.endpoint_fingerprint}:serial`)
        const next = await admission().reserve(target.endpoint_fingerprint); expect(next.permit).toBeDefined(); await next.permit!.finish()
      })
      it('授权锁等待跨窗口，过期 permit 不提交 checkpoint、不外发、不消耗失败预算', async () => {
        await c2Target(); await enqueue(); const a = worker('c2-expired-lock'), [delivery] = await a.claimNotifications()
        const lock = await db.connect(); let sending: Promise<void> | undefined
        try {
          await lock.query('BEGIN'); const pid = (await lock.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
          await lock.query('SELECT 1 FROM actors WHERE id=$1 FOR UPDATE', [fixture.humanId])
          sending = a.deliverNotification(delivery!); await waitForBlockedTransaction(pid)
          clock = 61000; await lock.query('COMMIT')
          await expect(sending).rejects.toMatchObject({ code: 'NOTIFICATION_CLAIM_LOST' }); expect(sends).toHaveLength(0)
          const row = (await db.query(`SELECT status,outcome,attempt_count,retry_budget_start FROM notification_deliveries WHERE id=$1`, [delivery!.id])).rows[0]
          expect(row).toMatchObject({ status: 'pending', attempt_count: 1, retry_budget_start: 1 }); expect(row.outcome).not.toBe('sending')
        } finally { await lock.query('ROLLBACK'); lock.release(); await sending?.catch(() => undefined) }
      })
      it.each(['disabled', 'inactive', 'revoked', 'membership', 'changed', 'muted'] as const)('当前 %s 撤权先提交，真实授权锁后零 fake provider 调用', async change => {
        const target = await c2Target(); await enqueue(); const a = worker('c2-revoked'), [delivery] = await a.claimNotifications()
        const lock = await db.connect(); let sending: Promise<void> | undefined
        try {
          if (change === 'muted') await db.query('INSERT INTO notification_preferences(workspace_id,actor_id) VALUES($1,$2)', [fixture.workspaceId, fixture.humanId])
          await lock.query('BEGIN'); const pid = (await lock.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
          if (change === 'inactive') await lock.query('UPDATE actors SET is_active=false WHERE id=$1', [fixture.humanId])
          else if (change === 'disabled') await lock.query('UPDATE notification_channel_targets SET enabled=false WHERE id=$1', [target.id])
          else if (change === 'revoked') await lock.query("UPDATE notification_channel_targets SET status='revoked',enabled=false WHERE id=$1", [target.id])
          else if (change === 'changed') await lock.query('UPDATE notification_channel_targets SET revision=revision+1 WHERE id=$1', [target.id])
          else if (change === 'muted') await lock.query("UPDATE notification_preferences SET muted_kinds=ARRAY['inbox.item.created'] WHERE workspace_id=$1 AND actor_id=$2", [fixture.workspaceId, fixture.humanId])
          else {
            await lock.query("UPDATE actors SET workspace_role='member' WHERE id=$1", [fixture.humanId])
            await lock.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2', [fixture.teamId, fixture.humanId])
          }
          sending = a.deliverNotification(delivery!); await waitForBlockedTransaction(pid); await lock.query('COMMIT'); await sending
          expect(sends).toHaveLength(0); expect(await state(delivery!.id)).toMatchObject({ status: 'suppressed' })
        } finally {
          await lock.query('ROLLBACK'); lock.release(); await sending?.catch(() => undefined)
          if (change === 'membership') await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin') ON CONFLICT DO NOTHING", [fixture.workspaceId, fixture.teamId, fixture.humanId])
        }
      })
      it('审批 Stop 先提交，C1 当前授权重新检查后零 fake provider 调用', async () => {
        await c2Target(); const item = await approvalSource(); await withTx(db, tx => admitChannelEvent(tx, item.eventId))
        const a = worker('c2-stop'), [delivery] = await a.claimNotifications(), lock = await db.connect()
        let sending: Promise<void> | undefined
        try {
          await lock.query('BEGIN'); const pid = (await lock.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
          await lock.query("UPDATE agent_sessions SET state='stopping',stop_requested_at=now() WHERE id=$1", [item.sessionId])
          sending = a.deliverNotification(delivery!); await waitForBlockedTransaction(pid); await lock.query('COMMIT'); await sending
          expect(sends).toHaveLength(0); expect(await state(delivery!.id)).toMatchObject({ status: 'suppressed' })
        } finally { await lock.query('ROLLBACK'); lock.release(); await sending?.catch(() => undefined) }
      })
      it('同源重放去重，明确拒绝恢复复用 delivery；同 ACK 幂等、旧 fence 拒绝', async () => {
        await c2Target(); const item = await source()
        await Promise.all([withTx(db, tx => admitChannelEvent(tx, item.eventId)), withTx(db, tx => admitChannelEvent(tx, item.eventId))])
        let reject = true
        const controlled = createWecomNotificationAdapter({ webOrigin: 'https://workmesh.example.test', admission: admission(), dnsLookup: async () => [{ address: '8.8.8.8', family: 4 }], fetcher: async (_url, init) => {
          sends.push({ at: clock, body: init.body }); return { status: 200, body: reject ? '{"errcode":45009,"errmsg":"not persisted"}' : '{"errcode":0}' }
        } })
        const a = createBaseAutomationWorker({ db, features, workerId: 'c2-retry', channelAdapters: { wecom: controlled } }), [first] = await a.claimNotifications()
        await a.deliverNotification(first!); expect(await state(first!.id)).toMatchObject({ status: 'failed', outcome: 'failed' })
        expect((await db.query('SELECT last_error FROM notification_deliveries WHERE id=$1', [first!.id])).rows[0]).toEqual({ last_error: 'WECOM_45009' })
        await db.query('UPDATE notification_deliveries SET available_at=now() WHERE id=$1', [first!.id]); reject = false
        const [fresh] = await a.claimNotifications(); expect(fresh!.id).toBe(first!.id); expect(fresh!.effectKey).toBe(first!.effectKey)
        await expect(a.deliverNotification(first!)).rejects.toMatchObject({ code: 'NOTIFICATION_CLAIM_LOST' })
        await a.deliverNotification(fresh!); await withTx(db, tx => settleChannelSend(tx, fresh!.channelClaim!, 'c2-retry', 'delivered'))
        expect(sends).toHaveLength(2); expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1', [item.eventId])).rowCount).toBe(1)
      })
      it('checkpoint 事务回滚不外发；发送后进程崩溃重启进入 uncertain，旧 fence 不 ACK', async () => {
        await c2Target(); await enqueue(); const a = worker('c2-rollback'), [first] = await a.claimNotifications()
        await expect(withTx(db, async tx => { await prepareChannelSend(tx, first!.channelClaim!, 'c2-rollback'); throw new Error('C2_CHECKPOINT_ROLLBACK') })).rejects.toThrow('C2_CHECKPOINT_ROLLBACK')
        expect(sends).toHaveLength(0); expect(await state(first!.id)).toMatchObject({ outcome: 'not_sent' }); await first!.channelPermit!.finish(); await expire(first!.id)
        const crash = createBaseAutomationWorker({ db, features, workerId: 'c2-crash', channelAdapters: { wecom: adapter() }, afterExternalDelivery: async () => { throw new Error('C2_PROCESS_CRASH') } })
        const [next] = await crash.claimNotifications(); await expect(crash.deliverNotification(next!)).rejects.toThrow('C2_PROCESS_CRASH'); expect(sends).toHaveLength(1)
        await expire(next!.id); await worker('c2-restart').tick(); expect(sends).toHaveLength(1)
        expect(await state(next!.id)).toMatchObject({ outcome: 'uncertain' })
        await expect(withTx(db, tx => settleChannelSend(tx, next!.channelClaim!, 'c2-crash', 'delivered'))).rejects.toMatchObject({ code: 'NOTIFICATION_CLAIM_LOST' })
      })
      it('真实 Redis TIME 与部分 bucket 丢失：旧许可失效，共同冷却不吞失败预算', async () => {
        const target = await c2Target(), limit = createWecomAdmission(redis, namespace), result = await limit.reserve(target.endpoint_fingerprint)
        expect(result.permit).toBeDefined(); expect(await result.permit!.remainingMs()).toBeGreaterThan(0)
        await redis.del(`${namespace}:${target.endpoint_fingerprint}:quota`)
        expect(await result.permit!.remainingMs()).toBe(0)
        expect((await limit.reserve(target.endpoint_fingerprint)).retryAfterMs).toBeGreaterThan(119000)
      })
      it('网络未知不自动重送；C1 显式对账复用原 delivery/fence，渠道零决策事件/outbox', async () => {
        await c2Target(); await enqueue()
        const decisions = async () => (await db.query(`SELECT count(*)::int AS n FROM domain_events WHERE event_type LIKE 'decision.%' OR event_type LIKE 'approval.decision.%'`)).rows[0].n
        const decisionOutbox = async () => (await db.query(`SELECT count(*)::int AS n FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.event_type LIKE 'decision.%' OR event.event_type LIKE 'approval.decision.%'`)).rows[0].n
        const before = await decisions(), beforeOutbox = await decisionOutbox(), a = worker('c2-unknown', 'unknown'), [delivery] = await a.claimNotifications()
        await a.deliverNotification(delivery!); expect(await state(delivery!.id)).toMatchObject({ outcome: 'uncertain' }); expect(sends).toHaveLength(1)
        await worker().tick(); expect(sends).toHaveLength(1)
        const current = await state(delivery!.id)
        await withTx(db, tx => reconcileChannelSend(tx, meta('c2-reconcile'), delivery!.id, current.revision, 'retry'))
        await worker().tick(); expect(sends).toHaveLength(2)
        expect(await state(delivery!.id)).toMatchObject({ status: 'delivered', effect_key: delivery!.effectKey })
        expect(await decisions()).toBe(before)
        expect(await decisionOutbox()).toBe(beforeOutbox)
      })
    })
})
