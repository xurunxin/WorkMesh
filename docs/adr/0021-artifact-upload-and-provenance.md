# Artifact upload and provenance

Status: Accepted

## Context

Stage 3 artifacts include provider links and uploaded test/build evidence. Metadata without a checksum and producer/resource links is not sufficient audit evidence.

## Decision

Every delivery artifact has a SHA-256 checksum, source tool, producer actor, session, work item, optional project/plan step, repository, and PR link. Test reports may include the command and normalized result. Provider-created branch, commit, and PR artifacts are produced by the worker after provider success.

File uploads begin with a short-lived S3-compatible presigned PUT that binds expected checksum, size, MIME type, storage key, actor, session, and resource links. Finalization records committed verification work; the worker then reads the object from S3/MinIO and streams it through SHA-256 verification outside the API transaction. An intent observed past its deadline during finalization atomically becomes terminally expired with an outbox-backed audit event before the API returns the stable expiry error. Replays return the same error without reopening verification or duplicating the audit event. Size, MIME, metadata, or checksum mismatch is retried boundedly and ultimately rejects the upload without publishing an artifact. Verified uploads materialize immutable artifacts of type `file` and receive separately authorized short-lived presigned GET URLs.

Uploaded `file` evidence is deliberately not eligible as WorkMesh structured-review authority. An independent reviewer must publish an exact-head delivery artifact of type `code_review` with repository, pull-request, checksum, source-tool, session, and work-item provenance, then reference that artifact when publishing the structured review.

## Alternatives

Trusting filenames or URLs; accepting checksum after upload without a prior intent; streaming object bytes through the API process.

## Consequences

Artifacts remain traceable and large objects stay out of PostgreSQL and the API process. Deployment supplies S3/MinIO endpoint, bucket, region, and credentials; the built-in adapter handles signing and verification.

## Migration

Migration 0008 adds artifact links and upload intents without mutating existing immutable artifact facts.

## Spec changes

Delivery artifact and upload-intent contracts require checksum and provenance links.
