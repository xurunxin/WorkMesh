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
         count(segment.id) FILTER (WHERE segment.state='verified')::text AS verified,
         COALESCE(sum(segment.row_count)
           FILTER (WHERE segment.state='verified'),0)::text AS "verifiedRows",
         count(segment.id) FILTER (WHERE segment.state='failed')::text AS failed,
         count(segment.id) FILTER (WHERE segment.state='pruned')::text AS pruned,
         (SELECT count(*) FROM domain_events old_event
           WHERE old_event.workspace_id=$1
             AND old_event.occurred_at<=now()-interval '90 days')::text
           AS backlog,
         COALESCE(max(EXTRACT(EPOCH FROM
           (segment.verified_at-segment.created_at))*1000)
           FILTER (WHERE segment.created_at >= $3),0)::text
           AS "maximumLatencyMs",
         (SELECT count(*)
            FROM unnest($2::bigint[]) AS generated(cursor)
           WHERE EXISTS (
             SELECT 1
               FROM event_archive_segments current_segment
              WHERE current_segment.workspace_id=$1
                AND current_segment.state='verified'
                AND generated.cursor BETWEEN
                  current_segment.start_cursor AND current_segment.end_cursor
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
