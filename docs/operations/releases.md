# Release operations

This runbook covers the Stable Core RC and no-rebuild GA workflows. It does not
replace the final 24-hour multi-Agent soak or the evidence comment required by
Gate #1.

## Repository controls

Protect `main` with the aggregate `Required CI` status check, require the branch
to be current before merge, apply the rule to administrators, and disable force
pushes and deletion. Configure the `stable-release` environment with a required
reviewer and a deployment tag policy matching `v1.0.0*`. Ordinary CI has only
`contents: read`; package, OIDC, attestation, and Release write permissions exist
only on protected release jobs.

Set the repository variable `WORKMESH_RELEASE_WEB_API_URL` to the externally
visible HTTPS API origin before creating an RC. It is a non-secret Web build
input and is recorded in both the OCI label and release manifest. Changing it
requires a new candidate.

Set `WORKMESH_RELEASE_WEB_ORIGIN` to the externally visible HTTPS Web origin,
without a path or trailing slash. The protected production smoke uses it for
the API origin check. A protected preflight freezes both release origins after
CI and security checks; an empty value, a path, or a non-HTTPS URL blocks the
candidate before any immutable image is published.

GHCR login uses the `stable-release` environment secret
`GHCR_PUBLISH_TOKEN` when configured and otherwise falls back to the job-scoped
`GITHUB_TOKEN`. Registry login and registry-backed build/SBOM attestations use
the same selected credential so publication cannot succeed and then fail only
while attaching attestations. The environment secret is only needed for an
existing granular-permission package that cannot grant the repository Actions
access. Scope it to package publication and repository attestations, keep it
only in `stable-release`, and remove or rotate it after repository Actions
access is restored. GitHub Release and repository metadata operations continue
to use the job-scoped `GITHUB_TOKEN`.

## Enforcement probe

Manually dispatch `Release Candidate` with `failure_probe=true`. The first job
must fail with exit code 86 and `Intentional failure-probe`. All later jobs must
be skipped, no `workmesh-*` candidate image tag may appear, and no GitHub Release
may be created. Retain the failed run URL as Issue #10 evidence.

## Candidate

1. Confirm the exact `main` commit has a green `Required CI` check and all
   Stable child implementation issues are closed.
2. Create and push the next monotonic `v1.0.0-rc.N` tag. A moved or reused image
   tag is rejected; a partially published failed candidate is abandoned and a
   new RC number is required.
3. Approve the `stable-release` deployment. The workflow reproduces full CI,
   blocks High/Critical dependency, source, secret, configuration, and image
   findings, then builds API, Worker, MCP, and Web production images.
4. Verify the prerelease contains `release-manifest.json`, its Sigstore bundle,
   tag provenance, four uniquely prefixed image records, SPDX SBOMs, scan
   reports, image signatures, and GitHub attestation bundles.
5. Deploy only the manifest's digest references. Run the final 24-hour
   multi-Agent soak on that exact commit and production image set.

No automatic retry exists. A GitHub-hosted infrastructure failure may be rerun
only before any immutable candidate image is published. Once publication starts,
use a new RC number so the evidence chain stays unambiguous.

## Verify a candidate

Install cosign 3.0.6 and download all candidate Release assets. The expected
certificate issuer is `https://token.actions.githubusercontent.com`; the
identity is:

```text
https://github.com/xurunxin/WorkMesh/.github/workflows/release-candidate.yml@refs/tags/v1.0.0-rc.N
```

Verify the manifest bundle, each `<service>-sbom.sigstore.json`, and each
`name@digest` image signature. Independently hash the raw registry manifest and
compare it with the digest recorded in `release-manifest.json`.

## Promote GA

After the candidate's final soak and every Gate #1 check pass, manually dispatch
`Promote GA Without Rebuild` with the accepted RC and `v1.0.0`. Approve the
protected environment. The workflow refuses an existing GA tag or Release,
verifies all candidate evidence, pulls each `name@digest`, and pushes only the
GA tag. If any observed digest differs it emits `PROMOTION_DIGEST_MISMATCH` and
does not create the GA Release.

The GA Release contains the original signed candidate manifest plus a signed
promotion record and GA tag-provenance record. Image signatures, SBOM
attestations, and build provenance remain attached to the unchanged digests.
