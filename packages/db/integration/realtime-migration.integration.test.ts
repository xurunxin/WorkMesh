import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  appendEvent,
  applyMigrations,
  createDb,
} from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error(
    'Realtime migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.',
  )
if (!/(^|[_-])test(?:[_-]|$)/i.test(
  new URL(databaseUrl).pathname.slice(1),
))
  throw new Error(
    'Realtime migration integration requires a dedicated test database.',
  )

const db = createDb(databaseUrl)
let legacyOwnerId = ''
const legacyEventIds = new Map<string, string>()

describe('realtime event migration and persistence', () => {
  beforeAll(async () => {
    await db.query('DROP SCHEMA public CASCADE')
    await db.query('CREATE SCHEMA public')
    await applyMigrations(db, { through: 24 })

    const workspace = (await db.query<{ id: string }>(
      `INSERT INTO workspaces(name,slug)
       VALUES('Legacy private realtime','legacy-private-realtime')
       RETURNING id`,
    )).rows[0]!
    const owner = (await db.query<{ id: string }>(
      `INSERT INTO actors(
         workspace_id,kind,workspace_role,email,display_name,password_hash
       ) VALUES(
         $1,'human','member','legacy-owner@example.test',
         'Legacy owner','legacy-password-hash'
       ) RETURNING id`,
      [workspace.id],
    )).rows[0]!
    legacyOwnerId = owner.id
    const team = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key)
       VALUES($1,'Legacy private','LPR') RETURNING id`,
      [workspace.id],
    )).rows[0]!
    const session = (await db.query<{ id: string }>(
      `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
       VALUES($1,'legacy-private-session','csrf',now()+interval '1 day')
       RETURNING id`,
      [owner.id],
    )).rows[0]!
    const savedView = (await db.query<{ id: string }>(
      `INSERT INTO saved_views(
         workspace_id,owner_actor_id,team_id,name,filters,layout
       ) VALUES($1,$2,$3,'Legacy personal Team view','{}','list')
       RETURNING id`,
      [workspace.id, owner.id, team.id],
    )).rows[0]!
    const advancedView = (await db.query<{ id: string }>(
      `INSERT INTO advanced_saved_views(
         workspace_id,owner_actor_id,name,entity_type,layout,scope
       ) VALUES($1,$2,'Legacy private advanced','issue','list','private')
       RETURNING id`,
      [workspace.id, owner.id],
    )).rows[0]!
    await db.query(
      `INSERT INTO notification_preferences(workspace_id,actor_id)
       VALUES($1,$2)`,
      [workspace.id, owner.id],
    )
    const notification = (await db.query<{ id: string }>(
      `INSERT INTO notifications(
         workspace_id,recipient_actor_id,priority,kind,title,source_type,
         source_id,dedupe_key
       ) VALUES(
         $1,$2,'update','legacy.notice','Legacy private','legacy',
         gen_random_uuid(),'legacy-private'
       ) RETURNING id`,
      [workspace.id, owner.id],
    )).rows[0]!

    const legacy = [
      ['auth.session.created', 'session', session.id],
      ['saved_view.created', 'saved_view', savedView.id],
      ['notification.created', 'notification', notification.id],
      ['view.created', 'advanced_saved_view', advancedView.id],
      ['notification.preferences_updated', 'actor', owner.id],
      ['saved_view.unresolved', 'saved_view', randomUUID()],
    ] as const
    for (const [eventType, aggregateType, aggregateId] of legacy) {
      const inserted = (await db.query<{ id: string }>(
        `INSERT INTO domain_events(
           workspace_id,event_type,aggregate_type,aggregate_id,actor_id,
           correlation_id,payload
         ) VALUES($1,$2,$3,$4,$5,$6,'{}') RETURNING id`,
        [
          workspace.id,
          eventType,
          aggregateType,
          aggregateId,
          owner.id,
          `legacy-private:${eventType}`,
        ],
      )).rows[0]!
      legacyEventIds.set(eventType, inserted.id)
    }
    await applyMigrations(db)
  }, 300_000)

  afterAll(async () => {
    await db.end()
  })

  it('applies 0025 immediately after the previous migration stage', async () => {
    const versions = await db.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version',
    )
    const appliedVersions = versions.rows.map(row => row.version)
    expect(appliedVersions.indexOf('0025_realtime_event_envelope')).toBe(
      appliedVersions.indexOf('0024_cursor_pagination_indexes') + 1,
    )
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN (
           'domain_event_resources',
           'event_retention_state'
         )
       ORDER BY table_name`,
    )
    expect(tables.rows.map(row => row.table_name)).toEqual([
      'domain_event_resources',
      'event_retention_state',
    ])
  })

  it('backfills only durably proven private audiences and leaves unresolved history fail-closed', async () => {
    const proven = [
      'auth.session.created',
      'saved_view.created',
      'notification.created',
      'view.created',
      'notification.preferences_updated',
    ]
    const rows = await db.query<{
      id: string
      audience_actor_id: string | null
    }>(
      `SELECT id,audience_actor_id
       FROM domain_events
       WHERE id=ANY($1::uuid[])`,
      [[...legacyEventIds.values()]],
    )
    const byId = new Map(
      rows.rows.map(row => [row.id, row.audience_actor_id]),
    )
    for (const eventType of proven)
      expect(byId.get(legacyEventIds.get(eventType)!)).toBe(legacyOwnerId)

    const unresolvedId = legacyEventIds.get('saved_view.unresolved')!
    expect(byId.get(unresolvedId)).toBeNull()
    const unresolvedResources = await db.query(
      `SELECT 1 FROM domain_event_resources
       WHERE domain_event_id=$1 AND resource_type='workspace'`,
      [unresolvedId],
    )
    expect(unresolvedResources.rowCount).toBe(0)
  })

  it('commits v2 metadata, retention, and outbox atomically with exact bigint cursor', async () => {
    const workspace = (await db.query<{ id: string }>(
      `INSERT INTO workspaces(name,slug)
       VALUES('Realtime','realtime') RETURNING id`,
    )).rows[0]!
    const actor = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,display_name)
       VALUES($1,'service','Realtime test') RETURNING id`,
      [workspace.id],
    )).rows[0]!
    const team = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key)
       VALUES($1,'Realtime','RT') RETURNING id`,
      [workspace.id],
    )).rows[0]!
    const state = (await db.query<{ id: string }>(
      `INSERT INTO workflow_states(
         workspace_id,team_id,name,category,color,position
       ) VALUES($1,$2,'Ready','backlog','#64748b',0)
       RETURNING id`,
      [workspace.id, team.id],
    )).rows[0]!
    const project = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,'Realtime project') RETURNING id`,
      [workspace.id, team.id],
    )).rows[0]!
    const workItem = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,status_id,project_id
       ) VALUES($1,$2,1,'Realtime item',$3,$4) RETURNING id`,
      [workspace.id, team.id, state.id, project.id],
    )).rows[0]!
    await db.query(
      `INSERT INTO channels(workspace_id,work_item_id) VALUES($1,$2)`,
      [workspace.id, workItem.id],
    )
    await db.query(
      `SELECT setval(
         'domain_events_cursor_seq',
         9007199254740993,
         false
       )`,
    )
    const client = await db.connect()
    let eventId: string
    try {
      await client.query('BEGIN')
      eventId = await appendEvent(client, {
        workspaceId: workspace.id,
        teamId: team.id,
        actorId: actor.id,
        correlationId: 'realtime-integration',
        type: 'work_item.updated',
        aggregateType: 'work_item',
        aggregateId: workItem.id,
        revision: 1,
        payload: { workItemId: workItem.id },
      })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    const event = (await db.query<{
      cursor: string
      event_version: number
    }>(
      `SELECT cursor::text,event_version
       FROM domain_events WHERE id=$1`,
      [eventId!],
    )).rows[0]!
    expect(event).toEqual({
      cursor: '9007199254740993',
      event_version: 2,
    })
    const resources = await db.query<{
      relation: string
      resource_type: string
      resource_id: string
    }>(
      `SELECT relation,resource_type,resource_id::text
       FROM domain_event_resources
       WHERE domain_event_id=$1
       ORDER BY relation,resource_type,resource_id`,
      [eventId!],
    )
    expect(resources.rows).toEqual([
      {
        relation: 'invalidate',
        resource_type: 'project',
        resource_id: project.id,
      },
      {
        relation: 'invalidate',
        resource_type: 'team',
        resource_id: team.id,
      },
      {
        relation: 'invalidate',
        resource_type: 'work_item',
        resource_id: workItem.id,
      },
      {
        relation: 'scope',
        resource_type: 'project',
        resource_id: project.id,
      },
      {
        relation: 'scope',
        resource_type: 'team',
        resource_id: team.id,
      },
      {
        relation: 'scope',
        resource_type: 'work_item',
        resource_id: workItem.id,
      },
      {
        relation: 'scope',
        resource_type: 'workspace',
        resource_id: workspace.id,
      },
    ])
    await expect(db.query(
      `SELECT 1 FROM event_retention_state WHERE workspace_id=$1`,
      [workspace.id],
    )).resolves.toMatchObject({ rowCount: 1 })
    await expect(db.query(
      `SELECT 1 FROM outbox_events WHERE domain_event_id=$1`,
      [eventId!],
    )).resolves.toMatchObject({ rowCount: 1 })
  })

  it('resolves nested authorities and rejects cross-Team metadata atomically', async () => {
    const fixture = (await db.query<{
      workspace_id: string
      actor_id: string
      team_id: string
      state_id: string
      project_id: string
      work_item_id: string
      channel_id: string
    }>(
      `SELECT workspace.id AS workspace_id,actor.id AS actor_id,
              team.id AS team_id,state.id AS state_id,
              project.id AS project_id,item.id AS work_item_id,
              channel.id AS channel_id
         FROM workspaces workspace
         JOIN actors actor
           ON actor.workspace_id=workspace.id
          AND actor.display_name='Realtime test'
         JOIN teams team
           ON team.workspace_id=workspace.id AND team.key='RT'
         JOIN workflow_states state
           ON state.workspace_id=workspace.id AND state.team_id=team.id
         JOIN projects project
           ON project.workspace_id=workspace.id AND project.team_id=team.id
         JOIN work_items item
           ON item.workspace_id=workspace.id AND item.project_id=project.id
         JOIN channels channel
           ON channel.workspace_id=workspace.id
          AND channel.work_item_id=item.id`,
    )).rows[0]!
    const comment = (await db.query<{ id: string }>(
      `INSERT INTO comments(
         workspace_id,channel_id,author_actor_id,body
       ) VALUES($1,$2,$3,'Nested realtime comment') RETURNING id`,
      [fixture.workspace_id, fixture.channel_id, fixture.actor_id],
    )).rows[0]!
    const secondTeam = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key)
       VALUES($1,'Other realtime','OR') RETURNING id`,
      [fixture.workspace_id],
    )).rows[0]!
    const agentActor = (await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,display_name)
       VALUES($1,'agent','Realtime agent') RETURNING id`,
      [fixture.workspace_id],
    )).rows[0]!
    const agent = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(
         workspace_id,actor_id,slug,display_name
       ) VALUES($1,$2,'realtime-agent','Realtime agent') RETURNING id`,
      [fixture.workspace_id, agentActor.id],
    )).rows[0]!
    await db.query(
      `INSERT INTO agent_team_access(
         workspace_id,agent_id,team_id,granted_by_actor_id
       ) VALUES($1,$2,$3,$4)`,
      [
        fixture.workspace_id,
        agent.id,
        fixture.team_id,
        fixture.actor_id,
      ],
    )

    const commentEvent = await appendEvent(db, {
      workspaceId: fixture.workspace_id,
      teamId: fixture.team_id,
      actorId: fixture.actor_id,
      correlationId: 'comment-resource-resolution',
      type: 'comment.updated',
      aggregateType: 'comment',
      aggregateId: comment.id,
      payload: {},
    })
    const workflowEvent = await appendEvent(db, {
      workspaceId: fixture.workspace_id,
      teamId: fixture.team_id,
      actorId: fixture.actor_id,
      correlationId: 'workflow-resource-resolution',
      type: 'workflow_state.updated',
      aggregateType: 'workflow_state',
      aggregateId: fixture.state_id,
      payload: {},
    })
    const accessEvent = await appendEvent(db, {
      workspaceId: fixture.workspace_id,
      teamId: fixture.team_id,
      actorId: fixture.actor_id,
      correlationId: 'access-resource-resolution',
      type: 'agent.team_access.updated',
      aggregateType: 'agent_team_access',
      aggregateId: agent.id,
      payload: {},
    })

    const invalidates = await db.query<{
      domain_event_id: string
      resource_type: string
      resource_id: string
    }>(
      `SELECT domain_event_id,resource_type,resource_id::text
         FROM domain_event_resources
        WHERE domain_event_id=ANY($1::uuid[]) AND relation='invalidate'
        ORDER BY domain_event_id,resource_type,resource_id`,
      [[commentEvent, workflowEvent, accessEvent]],
    )
    expect(invalidates.rows.filter(row => row.domain_event_id === commentEvent))
      .toEqual([
        {
          domain_event_id: commentEvent,
          resource_type: 'project',
          resource_id: fixture.project_id,
        },
        {
          domain_event_id: commentEvent,
          resource_type: 'team',
          resource_id: fixture.team_id,
        },
        {
          domain_event_id: commentEvent,
          resource_type: 'work_item',
          resource_id: fixture.work_item_id,
        },
      ])
    for (const eventId of [workflowEvent, accessEvent])
      expect(invalidates.rows.filter(row => row.domain_event_id === eventId))
        .toEqual([{
          domain_event_id: eventId,
          resource_type: 'team',
          resource_id: fixture.team_id,
        }])

    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await expect(appendEvent(client, {
        workspaceId: fixture.workspace_id,
        teamId: secondTeam.id,
        actorId: fixture.actor_id,
        correlationId: 'cross-team-resource-rejected',
        type: 'comment.updated',
        aggregateType: 'comment',
        aggregateId: comment.id,
        payload: {},
      })).rejects.toThrow('DOMAIN_EVENT_RESOURCE_TEAM_MISMATCH')
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
    await expect(db.query(
      `SELECT 1 FROM domain_events WHERE correlation_id=$1`,
      ['cross-team-resource-rejected'],
    )).resolves.toMatchObject({ rowCount: 0 })
  })

  it('keeps multi-Team initiative and dependency resources exact without assigning a Workspace audience', async () => {
    const fixture = (await db.query<{
      workspace_id: string
      actor_id: string
      first_team_id: string
      first_project_id: string
      second_team_id: string
    }>(
      `SELECT workspace.id AS workspace_id,actor.id AS actor_id,
              first_team.id AS first_team_id,
              first_project.id AS first_project_id,
              second_team.id AS second_team_id
         FROM workspaces workspace
         JOIN actors actor
           ON actor.workspace_id=workspace.id
          AND actor.display_name='Realtime test'
         JOIN teams first_team
           ON first_team.workspace_id=workspace.id AND first_team.key='RT'
         JOIN projects first_project
           ON first_project.workspace_id=workspace.id
          AND first_project.team_id=first_team.id
         JOIN teams second_team
           ON second_team.workspace_id=workspace.id AND second_team.key='OR'`,
    )).rows[0]!
    const secondProject = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name)
       VALUES($1,$2,'Other realtime project') RETURNING id`,
      [fixture.workspace_id, fixture.second_team_id],
    )).rows[0]!
    const initiative = (await db.query<{ id: string }>(
      `INSERT INTO initiatives(workspace_id,name,owner_actor_id)
       VALUES($1,'Cross-Team realtime initiative',$2) RETURNING id`,
      [fixture.workspace_id, fixture.actor_id],
    )).rows[0]!
    await db.query(
      `INSERT INTO initiative_projects(
         workspace_id,initiative_id,project_id,sort_order
       ) VALUES($1,$2,$3,0),($1,$2,$4,1)`,
      [
        fixture.workspace_id,
        initiative.id,
        fixture.first_project_id,
        secondProject.id,
      ],
    )
    await db.query(
      `INSERT INTO project_dependencies(
         project_id,depends_on_project_id,created_by_actor_id
       ) VALUES($1,$2,$3)`,
      [fixture.first_project_id, secondProject.id, fixture.actor_id],
    )

    const initiativeEvent = await appendEvent(db, {
      workspaceId: fixture.workspace_id,
      actorId: fixture.actor_id,
      correlationId: 'multi-team-initiative',
      type: 'initiative.created',
      aggregateType: 'initiative',
      aggregateId: initiative.id,
      payload: {
        projectIds: [fixture.first_project_id, secondProject.id],
      },
    })
    const dependencyEvent = await appendEvent(db, {
      workspaceId: fixture.workspace_id,
      actorId: fixture.actor_id,
      correlationId: 'multi-team-project-dependency',
      type: 'project.dependency.created',
      aggregateType: 'project',
      aggregateId: fixture.first_project_id,
      payload: { dependsOnProjectId: secondProject.id },
    })

    const events = await db.query<{ id: string; team_id: string | null }>(
      `SELECT id,team_id
         FROM domain_events
        WHERE id=ANY($1::uuid[])
        ORDER BY id`,
      [[initiativeEvent, dependencyEvent]],
    )
    expect(events.rows).toHaveLength(2)
    expect(events.rows.every(event => event.team_id === null)).toBe(true)

    for (const eventId of [initiativeEvent, dependencyEvent]) {
      const resources = await db.query<{
        relation: string
        resource_type: string
        resource_id: string
      }>(
        `SELECT relation,resource_type,resource_id::text
           FROM domain_event_resources
          WHERE domain_event_id=$1
            AND resource_type IN ('team','project')
          ORDER BY relation,resource_type,resource_id`,
        [eventId],
      )
      for (const relation of ['invalidate', 'scope']) {
        const relationResources = resources.rows
          .filter(resource => resource.relation === relation)
          .map(resource => `${resource.resource_type}:${resource.resource_id}`)
        expect(relationResources).toEqual([
          `project:${[fixture.first_project_id, secondProject.id].sort()[0]}`,
          `project:${[fixture.first_project_id, secondProject.id].sort()[1]}`,
          `team:${[fixture.first_team_id, fixture.second_team_id].sort()[0]}`,
          `team:${[fixture.first_team_id, fixture.second_team_id].sort()[1]}`,
        ])
      }
    }
  })

  it('rolls back event, resource metadata, and outbox together', async () => {
    const authority = (await db.query<{
      workspace_id: string
      actor_id: string
    }>(
      `SELECT workspace_id,id AS actor_id
       FROM actors WHERE display_name='Realtime test'`,
    )).rows[0]!
    const correlationId = 'realtime-rollback'
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await appendEvent(client, {
        workspaceId: authority.workspace_id,
        actorId: authority.actor_id,
        correlationId,
        type: 'workspace.updated',
        aggregateType: 'workspace',
        aggregateId: authority.workspace_id,
        payload: {},
      })
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }

    await expect(db.query(
      'SELECT 1 FROM domain_events WHERE correlation_id=$1',
      [correlationId],
    )).resolves.toMatchObject({ rowCount: 0 })
    await expect(db.query(
      `SELECT 1
       FROM domain_event_resources resource
       JOIN domain_events event ON event.id=resource.domain_event_id
       WHERE event.correlation_id=$1`,
      [correlationId],
    )).resolves.toMatchObject({ rowCount: 0 })
    await expect(db.query(
      `SELECT 1
       FROM outbox_events outbox
       JOIN domain_events event ON event.id=outbox.domain_event_id
       WHERE event.correlation_id=$1`,
      [correlationId],
    )).resolves.toMatchObject({ rowCount: 0 })
  })
})
