param([switch]$DryRun, [string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$candidateVerifier = Join-Path $runtimeRoot 'verify-candidate.mjs'
Import-Module $modulePath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
if (-not $DryRun) { throw 'DOGFOOD_V31_DIRECT_STAGE_REJECTED' }
$candidate = (& node.exe $candidateVerifier | ConvertFrom-Json -DateKind String)
if ($LASTEXITCODE -ne 0 -or $candidate.result -ne 'PASS') { throw 'DOGFOOD_V31_CANDIDATE_INVALID' }
$result = [ordered]@{
  artifactVersion = 1
  kind = 'DogfoodV31ActiveOriginStageDryRun'
  result = 'PASS'
  dryRun = [bool]1
  source = $candidate.standalone
  prepared = [ordered]@{ mode = 'predicted'; fileCount = $candidate.standalone.fileCount; canonicalSha256 = $candidate.standalone.preparedCanonicalSha256; actualBytesVerified = [bool]0 }
  targetMutationExecuted = [bool]0
  capturedAt = [DateTimeOffset]::UtcNow.ToString('O')
}
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'stage-dry-run.json')
$result | ConvertTo-Json -Depth 12
