import { Pool, type PoolClient, type QueryResult } from 'pg'
import { vi } from 'vitest'

/** Real statements execute unchanged. Only their returned rows are held at the
 * application boundary so another PG connection can commit or cross expiry. */
export function a2aScanBarrier(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1,
    options: '-c default_transaction_isolation=repeatable\\ read' })
  let scanned!: () => void
  let release!: () => void
  const reached = new Promise<void>(resolve => { scanned = resolve })
  const resume = new Promise<void>(resolve => { release = resolve })
  const evidence: Array<{ phase: string; at: string; isolation?: string }> = []
  let faultAfterInsert = false
  pool.on('connect', (client: PoolClient) => {
    const original = client.query.bind(client) as (text: string, values?: unknown[]) => Promise<QueryResult>
    vi.spyOn(client, 'query').mockImplementation((async (text: string, values?: unknown[]) => {
      const result = await original(text, values)
      if (text.includes('scanned AS (')) {
        const mode = await original('SHOW transaction_isolation')
        evidence.push({ phase: 'scan_statement_completed', at: new Date().toISOString(), isolation: mode.rows[0].transaction_isolation as string })
        scanned()
        await resume
      }
      if (text.includes('inserted AS (INSERT INTO a2a_deliveries')) {
        evidence.push({ phase: 'final_statement_completed', at: new Date().toISOString() })
        if (faultAfterInsert) {
          // Genuine SQL error after the guarded insert: withTx must roll back it.
          await original('SELECT 1 / 0')
        }
      }
      return result
    }) as typeof client.query)
  })
  return { pool, reached, release, evidence, injectTransactionFailure: () => { faultAfterInsert = true } }
}

/** A pure projection has one statement snapshot and no final write. Hold the
 * real statement before execution or after it returns, never substitute rows. */
export function readSnapshotBarrier(connectionString:string,phase:'before'|'after') {
  const pool=new Pool({connectionString,max:1})
  let reach!:()=>void,release!:()=>void
  const reached=new Promise<void>(resolve=>{reach=resolve})
  const resume=new Promise<void>(resolve=>{release=resolve})
  pool.on('connect',(client:PoolClient)=>{
    const original=client.query.bind(client) as (text:string,values?:unknown[])=>Promise<QueryResult>
    vi.spyOn(client,'query').mockImplementation((async(text:string,values?:unknown[])=>{
      if(phase==='before'){reach();await resume}
      const result=await original(text,values)
      if(phase==='after'){reach();await resume}
      return result
    }) as typeof client.query)
  })
  return {pool,reached,release}
}
