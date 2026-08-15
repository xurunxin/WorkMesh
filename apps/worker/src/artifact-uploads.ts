import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { S3ArtifactStorage } from '@workmesh/artifact-storage'
import { appendEvent, withTx } from '@workmesh/db'

type Upload = {
  id: string
  workspace_id: string
  work_item_id: string
  session_id: string | null
  project_id: string | null
  plan_step_id: string | null
  repository_id: string | null
  pull_request_id: string | null
  head_sha: string | null
  source_tool: string
  requested_by_actor_id: string
  storage_key: string
  filename: string
  mime_type: string
  size_bytes: number
  expected_checksum: string
  attempt_count: number
  team_id: string
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1_000)

export function createArtifactUploadWorker(input: {
  db: Pool
  storage: Pick<S3ArtifactStorage, 'verify'>
  workerId?: string
}) {
  const workerId = input.workerId ?? `artifact-${randomUUID()}`

  const claim = async (): Promise<Upload | undefined> => withTx(input.db, async tx => {
    const result = await tx.query<Upload>(
      `WITH candidate AS (
         SELECT id FROM artifact_upload_intents
          WHERE status='uploaded' AND attempt_count<8 AND available_at<=now()
            AND (claimed_at IS NULL OR claimed_at<now()-interval '60 seconds')
          ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE artifact_upload_intents u
          SET claimed_at=now(),claimed_by=$1,attempt_count=u.attempt_count+1
         FROM candidate,work_items w
        WHERE u.id=candidate.id AND w.id=u.work_item_id
       RETURNING u.*,w.team_id`,
      [workerId],
    )
    return result.rows[0]
  })

  const verify = async (upload: Upload): Promise<void> => {
    const verified = await input.storage.verify({
      key: upload.storage_key,
      checksum: upload.expected_checksum,
      sizeBytes: Number(upload.size_bytes),
      mimeType: upload.mime_type,
    })
    await withTx(input.db, async tx => {
      const current = await tx.query(
        "SELECT 1 FROM artifact_upload_intents WHERE id=$1 AND status='uploaded' AND claimed_by=$2 FOR UPDATE",
        [upload.id, workerId],
      )
      if (!current.rowCount) throw new Error('ARTIFACT_UPLOAD_CLAIM_LOST')
      const artifact = (await tx.query<{ id: string }>(
        `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,mime_type,size_bytes,checksum,source_tool,metadata)
         VALUES($1,$2,$3,$4,'file',$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          upload.workspace_id, upload.session_id, upload.work_item_id, upload.requested_by_actor_id,
          upload.filename, verified.mimeType, verified.sizeBytes, verified.checksum, upload.source_tool,
          { storageKey: upload.storage_key, sizeBytes: verified.sizeBytes, mimeType: verified.mimeType, uploadIntentId: upload.id },
        ],
      )).rows[0]!
      await tx.query(
        `INSERT INTO artifact_links(
           artifact_id,workspace_id,project_id,work_item_id,session_id,plan_step_id,
           repository_id,pull_request_id,provenance)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          artifact.id, upload.workspace_id, upload.project_id, upload.work_item_id, upload.session_id,
          upload.plan_step_id, upload.repository_id, upload.pull_request_id,
          {
            producerActorId: upload.requested_by_actor_id,
            uploadIntentId: upload.id,
            checksum: verified.checksum,
            sourceTool: upload.source_tool,
            workspaceId: upload.workspace_id,
            projectId: upload.project_id,
            workItemId: upload.work_item_id,
            sessionId: upload.session_id,
            planStepId: upload.plan_step_id,
            repositoryId: upload.repository_id,
            pullRequestId: upload.pull_request_id,
            headSha: upload.head_sha,
          },
        ],
      )
      await tx.query(
        `UPDATE artifact_upload_intents
            SET status='verified',actual_checksum=$3,artifact_id=$4,verified_at=now(),claimed_at=NULL,claimed_by=NULL,last_error=NULL
          WHERE id=$1 AND claimed_by=$2`,
        [upload.id, workerId, verified.checksum, artifact.id],
      )
      await appendEvent(tx, {
        workspaceId: upload.workspace_id, teamId: upload.team_id, actorId: upload.requested_by_actor_id,
        correlationId: `artifact-upload:${upload.id}`, idempotencyKey: upload.id,
        type: 'artifact.upload.verified', aggregateType: 'artifact_upload_intent', aggregateId: upload.id,
        payload: { artifactId: artifact.id, checksum: verified.checksum, sizeBytes: verified.sizeBytes },
      })
    })
  }

  const fail = async (upload: Upload, error: unknown): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = (await tx.query<{ attempt_count: number }>(
        "SELECT attempt_count FROM artifact_upload_intents WHERE id=$1 AND claimed_by=$2 AND status='uploaded' FOR UPDATE",
        [upload.id, workerId],
      )).rows[0]
      if (!current) return
      const terminal = current.attempt_count >= 8
      const reason = errorText(error)
      await tx.query(
        `UPDATE artifact_upload_intents
            SET status=CASE WHEN $3 THEN 'rejected'::artifact_upload_status ELSE status END,
                available_at=now()+(LEAST(300,5*POWER(2,GREATEST(0,$4-1)))::text||' seconds')::interval,
                claimed_at=NULL,claimed_by=NULL,last_error=$5
          WHERE id=$1 AND claimed_by=$2 AND status='uploaded'`,
        [upload.id, workerId, terminal, current.attempt_count, reason],
      )
      if (!terminal) return
      if (process.env.ARTIFACT_INJECT_FAILURE_AFTER_TERMINAL_UPDATE === 'true') throw new Error('ARTIFACT_INJECTED_TERMINAL_ROLLBACK')
      await appendEvent(tx, {
        workspaceId: upload.workspace_id, teamId: upload.team_id, actorId: upload.requested_by_actor_id,
        correlationId: `artifact-upload:${upload.id}`, idempotencyKey: `${upload.id}:rejected`,
        type: 'artifact.upload.rejected', aggregateType: 'artifact_upload_intent', aggregateId: upload.id,
        payload: { reason },
      })
    })
  }

  const tick = async (): Promise<void> => {
    const upload = await claim()
    if (!upload) return
    try { await verify(upload) } catch (error) { await fail(upload, error) }
  }
  return { claim, verify, fail, tick }
}
