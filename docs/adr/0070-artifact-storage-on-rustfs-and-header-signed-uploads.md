# Artifact storage on RustFS and header-signed uploads

Status: Accepted

## Context

Artifact storage ran on MinIO. MinIO withdrew the `minio/minio` and `minio/mc`
repositories from Docker Hub (the repository endpoint now returns 404), and its
`quay.io` namespace then began answering unauthenticated manifest requests with
`401 Unauthorized` for both images. Local caches still worked, so a developer
machine could pass while every CI run failed: `api-integration` and
`recovery-integration` both died in their infrastructure step with
`docker: Error response from daemon: unauthorized` and exit code 125. No pull
request could reach a green required check, and the pin could not be repaired by
switching registries because no public registry served the images.

Separately, uploading an artifact exposed a second defect that MinIO had been
tolerating. The upload intent returns a presigned PUT plus the headers the
uploader must send. `createUploadUrl` listed `x-amz-checksum-sha256` in
`signableHeaders`, but the SDK presigner hoists that header into the query string
anyway, so the client sent it as a header the signature did not cover. MinIO
accepted the request; strict S3 servers reject it with
`AccessDenied: There were headers present in the request which were not signed`.
The same hoisting silently dropped object metadata for the same reason: the
metadata a verified upload depends on was never applied to the stored object.

The retention and recovery paths make the replacement non-trivial. They depend on
versioning, `ObjectLockEnabledForBucket` at creation, `COMPLIANCE` retention,
legal hold, delete markers, and `ListObjectVersions`, and the recovery
integration test fails closed with `RECOVERY_TARGET_OBJECT_LOCK_REQUIRED`
without them.

## Decision

Artifact storage runs on RustFS (`rustfs/rustfs:1.0.0`), pinned by digest
`sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff` in
CI and by tag in Compose. One image covers both roles: it serves S3 and also
ships `curl` with `--aws-sigv4`, so the bucket-initialization step no longer
needs a second client image. Object Lock is requested with
`x-amz-bucket-object-lock-enabled: true` at creation, and `200` and `409` are
both treated as success so the step stays idempotent.

The service names `minio` and `minio-init` and the `MINIO_ROOT_USER` /
`MINIO_ROOT_PASSWORD` variables are kept as the contract shared with the release
flow and the production validator; RustFS reads those names natively. Only the
image changes, so `S3_*` endpoints, buckets, and credentials are untouched.

`createUploadUrl` now returns `{ url, requiredHeaders }` instead of a bare URL.
Both are derived from the same expectation, and every header the uploader is told
to send is placed in `signableHeaders` and held out of the query string with
`unhoistableHeaders`. The route returns those headers verbatim rather than
recomputing them.

## Alternatives

- **Keep MinIO and vendor the images.** Rejected: no public registry serves
  them, so the supply chain would have to be maintained by hand, and the pin
  would keep failing closed for every contributor.
- **Drop artifact storage from CI.** Rejected: it removes the upload, retention,
  and recovery coverage that protects the append-only evidence guarantees.
- **Run `mc` from a separately sourced image.** Rejected: it re-introduces the
  unavailable dependency for a single unauthenticated `PUT`, and the server image
  already carries a signed-request client.
- **Relax the presigned request to rely on query-string parameters only.**
  Rejected: the intent contract documents header delivery, and query-string
  metadata is not applied by strict servers, which would silently drop the
  checksum the verified-upload path requires.
- **Loosen CI to skip the failing jobs.** Rejected: it would hide a real
  infrastructure failure rather than fix it.

## Consequences

Artifact storage builds are pullable again and both integration jobs can run.
Uploads require the headers returned with the intent; a client that omits them, or
that sends extra unsigned headers, is rejected rather than silently accepted. The
checksum the signature covers is the one stored on the object, so verification no
longer depends on a server tolerating an unsigned header. Retention and recovery
keep their existing guarantees on a server that was verified to implement
versioning, Object Lock, `COMPLIANCE` retention, legal hold, delete markers, and
version listing.

RustFS is a younger project than MinIO; version compatibility is now a
consideration for upgrades. The digest pin bounds that risk to an explicitly
reviewed build.

## Migration

No database migration and no application data migration. Compose consumers that
override the artifact-storage image must move off the withdrawn MinIO images.
Existing buckets are compatible as-is; `minio-init` still requests Object Lock so
a fresh bucket keeps the retention guarantees. Rendered Compose must be
re-validated with `pnpm ci:validate` and
`pnpm validate:production-images --env-file=<env file>`.

## Spec changes

`docs/CI.md` describes data-plane jobs as using RustFS. `README.md` refers to the
compatibility claims of the artifact store rather than naming MinIO.
`docs/adr/0021-artifact-upload-and-provenance.md` keeps describing the upload
flow, which is unchanged apart from the headers now being signed; the presigned
PUT, finalization, and verification semantics it records remain accurate.
