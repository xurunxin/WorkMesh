type ExactArchiveRecoveryTarget = Readonly<{
  workspaceId: string;
  eventId: string;
  eventCursor: string;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const exactArchiveRecoveryProofSql = ({
  workspaceId,
  eventId,
  eventCursor,
}: ExactArchiveRecoveryTarget): string => {
  if (!uuidPattern.test(workspaceId) || !uuidPattern.test(eventId))
    throw new Error("RETENTION_ACCEPTANCE_ARCHIVE_PROOF_ID_INVALID");
  if (!/^[1-9][0-9]*$/.test(eventCursor))
    throw new Error("RETENTION_ACCEPTANCE_ARCHIVE_PROOF_CURSOR_INVALID");
  return `
    SELECT count(*)
      FROM event_archive_segment_events member
      JOIN event_archive_segments segment
        ON segment.id=member.segment_id
       AND segment.workspace_id=member.workspace_id
     WHERE member.workspace_id='${workspaceId}'
       AND member.event_id='${eventId}'
       AND member.event_cursor=${eventCursor}::bigint
       AND segment.membership_state='exact'
       AND segment.state IN ('verified','pruned')
       AND segment.object_version_id<>''`;
};
