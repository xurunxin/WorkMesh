import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 3 migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 3 migration integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)

describe('Stage 3 delivery migration', () => {
  beforeAll(async () => { await applyMigrations(db) })
  afterAll(async () => { await db.end() })

  it('installs the bounded provider, review, artifact, and project surfaces', async () => {
    const names = [
      'provider_connections', 'repositories', 'repository_contexts', 'repository_guidance_entries',
      'provider_webhook_deliveries', 'provider_actions', 'commit_projections', 'pull_request_projections',
      'ci_check_projections', 'structured_reviews', 'structured_review_findings', 'merge_approval_bindings',
      'provider_review_projections',
      'artifact_links', 'artifact_upload_intents', 'project_milestones', 'project_updates',
      'project_dependencies', 'completion_suggestions',
    ]
    const result = await db.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
      [names],
    )
    expect(new Set(result.rows.map(row => row.table_name))).toEqual(new Set(names))
  })

  it('keeps merge approvals exact and delivery claims uniquely replayable', async () => {
    const constraints = await db.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema=current_schema() AND constraint_name IN
        ('provider_webhook_deliveries_connection_id_delivery_id_key','merge_approval_bindings_pkey','provider_actions_workspace_id_intent_key_key')`,
    )
    expect(constraints.rowCount).toBe(3)
    const provenanceColumns = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND column_name='source_delivery_id'
          AND table_name IN ('pull_request_projections','ci_check_projections','provider_review_projections')`,
    )
    expect(provenanceColumns.rowCount).toBe(3)
    const orderedProjectionColumns = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name IN ('pull_request_projections','ci_check_projections','provider_review_projections')
          AND column_name IN ('provider_observed_at','provider_observation_rank')`,
    )
    expect(orderedProjectionColumns.rowCount).toBe(6)
    const revisionColumns = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND column_name='revision'
          AND table_name IN ('project_updates','completion_suggestions')`,
    )
    expect(revisionColumns.rowCount).toBe(2)
    const uploadColumns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='artifact_upload_intents'
          AND column_name IN ('repository_id','pull_request_id','head_sha','source_tool')`,
    )
    expect(uploadColumns.rowCount).toBe(4)
    const findingColumns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='structured_review_findings'
          AND column_name IN ('severity','file','line','summary','evidence','recommendation')
          AND is_nullable='NO'`,
    )
    expect(findingColumns.rowCount).toBe(6)
    const guidanceContent = await db.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='repository_guidance_entries'
          AND column_name='content'`,
    )
    expect(guidanceContent.rows[0]?.is_nullable).toBe('NO')
    const contextActionScope = await db.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name,is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='provider_actions'
          AND column_name IN ('session_id','work_item_id')`,
    )
    expect(contextActionScope.rows.every(column => column.is_nullable === 'YES')).toBe(true)
    const actionKindConstraint = await db.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid='provider_actions'::regclass
          AND conname='provider_actions_kind_check'`,
    )
    expect(actionKindConstraint.rows[0]?.definition).toContain('resolve_repository_context')
    expect(actionKindConstraint.rows[0]?.definition).toContain('retry_ci_check')
  })
})
