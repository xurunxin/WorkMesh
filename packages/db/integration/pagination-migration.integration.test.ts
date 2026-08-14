import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Pagination migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Pagination migration integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)

describe('cursor pagination indexes', () => {
  beforeAll(async () => {
    await db.query('DROP SCHEMA public CASCADE')
    await db.query('CREATE SCHEMA public')
    await applyMigrations(db)
  })
  afterAll(async () => { await db.end() })

  it('installs every planned keyset access path', async () => {
    const expected = [
      'teams_workspace_name_page',
      'workflow_states_team_position_page',
      'projects_workspace_updated_page',
      'actors_workspace_human_name_page',
      'work_items_workspace_updated_page',
      'comments_workspace_channel_created_page',
      'saved_views_owner_name_page',
      'agent_definitions_workspace_name_page',
      'agent_sessions_workspace_updated_page',
      'agent_plan_versions_session_revision_page',
      'artifacts_workspace_created_page',
      'approvals_workspace_created_page',
      'inbox_items_recipient_status_created_page',
      'leases_workspace_created_page',
      'handoffs_workspace_created_page',
      'repositories_workspace_name_page',
      'cycles_workspace_starts_page',
      'initiatives_workspace_priority_updated_page',
      'advanced_saved_views_workspace_updated_page',
      'project_health_updates_project_created_page',
      'automation_rules_workspace_updated_page',
      'automation_runs_workspace_created_page',
      'loops_workspace_updated_page',
      'templates_workspace_kind_name_page',
    ]
    const indexes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname=current_schema() AND indexname=ANY($1::text[])`,
      [expected],
    )
    expect(new Set(indexes.rows.map(row => row.indexname))).toEqual(new Set(expected))
  })

  it('uses the team keyset index and traverses more than 100 bounded pages', async () => {
    const slug = `pagination-load-${randomUUID().slice(0, 12)}`
    const client = await db.connect()
    let workspaceId: string | undefined
    try {
      const workspace = await client.query<{ id: string }>(
        'INSERT INTO workspaces(name,slug) VALUES($1,$2) RETURNING id',
        ['Pagination load', slug],
      )
      workspaceId = workspace.rows[0]!.id
      await client.query(
        `INSERT INTO teams(workspace_id,name,key)
         SELECT $1, 'Team ' || lpad(value::text,5,'0'), 'P' || lpad(value::text,5,'0')
         FROM generate_series(1,10050) AS value`,
        [workspaceId],
      )
      await client.query('ANALYZE teams')
      await client.query('SET enable_seqscan=off')
      const plan = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN (COSTS OFF)
         SELECT id,name FROM teams
         WHERE workspace_id=$1 AND deleted_at IS NULL
           AND ((name > $2) OR (name IS NOT DISTINCT FROM $2 AND id > $3))
         ORDER BY name,id LIMIT 101`,
        [workspaceId, 'Team 00001', '00000000-0000-0000-0000-000000000000'],
      )
      expect(plan.rows.map(row => row['QUERY PLAN']).join('\n'))
        .toContain('teams_workspace_name_page')

      let afterName: string | undefined
      let afterId: string | undefined
      let pageCount = 0
      let itemCount = 0
      let maximumBatch = 0
      while (true) {
        const values: unknown[] = [workspaceId]
        const keyset = afterName && afterId
          ? 'AND ((name > $2) OR (name IS NOT DISTINCT FROM $2 AND id > $3))'
          : ''
        if (afterName && afterId) values.push(afterName, afterId)
        const result = await client.query<{ id: string; name: string }>(
          `SELECT id,name FROM teams
           WHERE workspace_id=$1 AND deleted_at IS NULL ${keyset}
           ORDER BY name,id LIMIT 101`,
          values,
        )
        maximumBatch = Math.max(maximumBatch, result.rows.length)
        const items = result.rows.slice(0, 100)
        pageCount += 1
        itemCount += items.length
        if (result.rows.length <= 100) break
        afterName = items.at(-1)!.name
        afterId = items.at(-1)!.id
      }
      expect({ pageCount, itemCount, maximumBatch }).toEqual({
        pageCount: 101,
        itemCount: 10050,
        maximumBatch: 101,
      })
    } finally {
      await client.query('RESET enable_seqscan')
      if (workspaceId)
        await client.query('DELETE FROM workspaces WHERE id=$1', [workspaceId])
      client.release()
    }
  }, 120_000)
})
