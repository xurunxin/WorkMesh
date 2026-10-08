# CI 385 raw-evidence archive

This archive follows the byte-preserving raw-evidence ZIP/index contract recorded at main commit 72dbd5e. ZIP members are content-addressed as bytes/<sha256>; the self-contained index resolves exact logicalPath + version + byteKind tuples. Git-blob bytes and exact checkout bytes are separate tuples. No preserved source log was trimmed or rewritten.

## Contents and source bindings

- run-binding.json binds the PR, base/head SHAs, run/job/artifact IDs, conclusion, failed step cause, and downloaded log hashes. The GitHub ci-plan.log is preserved as delivered; Node error formatting truncates the embedded diff output, so it is not represented as the complete console output.
- diff-check-findings.json lists every affected logical file, diagnostic lines/counts, immutable base/head, command, exit code, raw output byte count, and SHA-256. The complete command output from rerunning the read-only Git check on that exact object range is a separate raw ZIP member.
- All 38 offending evidence logs are archived in three source tuples: Git blob bytes at the audit commit adab318 and PR head 58d59ed, plus independently read worktree bytes. SHA-256, byte counts, checkout normalization, source commit/blob and member mapping are recorded. Whitespace remains unchanged.
- Historical check-index, reverification-index, and run-binding log references add `archivedLog` pointers to exact self-contained `worktree` tuples. These aliases preserve the recorded run version while keeping `sourceCommit: null` where no corresponding committed source blob existed; they do not claim the bytes were present in that old HEAD.
- Setup and cleanup transcript references in reverification records also point to exact archive tuples when the transcript bytes are present. Missing historical service setup records remain missing and are not reconstructed.
- Both changes-raw artifact members and the full gh run view job-log capture have separate logical entries. External-origin entries use sourceCommit=null; sourceBlobId is the standard Git blob digest of the archived bytes and does not claim a GitHub commit.

## Reading

Resolve records by logicalPath + version + byteKind using raw-evidence-index.json (149 tuples, 78 unique members). The archive contract rejects unsafe paths, duplicate normalized names, non-file entries, mismatched lengths, hashes, CRCs, and invalid Git blob IDs. All preserved bytes are available without fetching history or network resources.
