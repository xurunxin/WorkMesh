export type RetentionSoakSampleDatabaseState = Readonly<{
  floor: string;
  workerMode: string;
  workerSeenAt: Date;
  planned: string;
  uploaded: string;
  verified: string;
  verifiedRows: string;
  failed: string;
  pruned: string;
  backlog: string;
  maximumLatencyMs: string;
  currentRunArchived: string;
  outboxPending: string;
  outboxLagMs: string;
  rows: string;
  sizeBytes: string;
  tableSizeBytes: string;
  deadTuples: string;
  connections: string;
}>;

export const retentionSoakSampleQuery = `
  SELECT floor.pruned_through_cursor::text AS floor,
         runtime.worker_mode AS "workerMode",
         runtime.worker_seen_at AS "workerSeenAt",
         count(segment.id) FILTER (WHERE segment.state='planned')::text AS planned,
         count(segment.id) FILTER (WHERE segment.state='uploaded')::text AS uploaded,
         count(segment.id) FILTER (
           WHERE segment.state='verified'
             AND segment.membership_state='exact'
         )::text AS verified,
         (SELECT count(*)
            FROM event_archive_segment_events verified_member
            JOIN event_archive_segments verified_segment
              ON verified_segment.id=verified_member.segment_id
             AND verified_segment.workspace_id=verified_member.workspace_id
           WHERE verified_member.workspace_id=$1
             AND verified_segment.state='verified'
             AND verified_segment.membership_state='exact')::text
           AS "verifiedRows",
         count(segment.id) FILTER (WHERE segment.state='failed')::text AS failed,
         count(segment.id) FILTER (WHERE segment.state='pruned')::text AS pruned,
         (SELECT count(*) FROM domain_events old_event
           WHERE old_event.workspace_id=$1
             AND old_event.occurred_at<=now()-interval '90 days'
             AND NOT EXISTS (
               SELECT 1
                 FROM event_archive_segment_events archived_member
                 JOIN event_archive_segments archived_segment
                   ON archived_segment.id=archived_member.segment_id
                  AND archived_segment.workspace_id=archived_member.workspace_id
                WHERE archived_member.workspace_id=old_event.workspace_id
                  AND archived_member.event_id=old_event.id
                  AND archived_member.event_cursor=old_event.cursor
                  AND archived_segment.membership_state='exact'
                  AND archived_segment.state IN ('verified','pruned')
             ))::text
           AS backlog,
         COALESCE(max(EXTRACT(EPOCH FROM
           (segment.verified_at-segment.created_at))*1000)
           FILTER (WHERE segment.created_at >= $3),0)::text
           AS "maximumLatencyMs",
         (SELECT count(*)
            FROM unnest($2::bigint[]) AS generated(cursor)
           WHERE EXISTS (
             SELECT 1
               FROM event_archive_segment_events current_member
               JOIN event_archive_segments current_segment
                 ON current_segment.id=current_member.segment_id
                AND current_segment.workspace_id=current_member.workspace_id
              WHERE current_member.workspace_id=$1
                AND current_member.event_cursor=generated.cursor
                AND current_segment.membership_state='exact'
                AND current_segment.state IN ('verified','pruned')
           ))::text AS "currentRunArchived",
         (SELECT count(*)
            FROM outbox_events pending_outbox
            JOIN domain_events pending_event
              ON pending_event.id=pending_outbox.domain_event_id
           WHERE pending_event.workspace_id=$1
             AND pending_outbox.status<>'delivered')::text
           AS "outboxPending",
         COALESCE((SELECT EXTRACT(EPOCH FROM
             (now()-min(pending_outbox.created_at)))*1000
           FROM outbox_events pending_outbox
           JOIN domain_events pending_event
             ON pending_event.id=pending_outbox.domain_event_id
           WHERE pending_event.workspace_id=$1
             AND pending_outbox.status<>'delivered'),0)::text
           AS "outboxLagMs",
         (SELECT count(*) FROM domain_events all_event
           WHERE all_event.workspace_id=$1)::text AS rows,
         pg_database_size(current_database())::text AS "sizeBytes",
         pg_total_relation_size('domain_events'::regclass)::text
           AS "tableSizeBytes",
         COALESCE((SELECT sum(table_stats.n_dead_tup)
           FROM pg_stat_user_tables table_stats
           WHERE table_stats.relname IN(
             'domain_events','outbox_events','event_archive_segments',
             'event_archive_segment_events',
             'heartbeat_idempotency_keys','api_idempotency_keys'
           )),0)::text AS "deadTuples",
         (SELECT count(*) FROM pg_stat_activity connection
           WHERE connection.datname=current_database())::text AS connections
    FROM event_retention_state floor
    JOIN retention_job_state runtime
      ON runtime.workspace_id=floor.workspace_id
     AND runtime.job_name='worker_runtime'
    LEFT JOIN event_archive_segments segment
      ON segment.workspace_id=floor.workspace_id
   WHERE floor.workspace_id=$1
   GROUP BY floor.pruned_through_cursor,runtime.worker_mode,
            runtime.worker_seen_at
`;
