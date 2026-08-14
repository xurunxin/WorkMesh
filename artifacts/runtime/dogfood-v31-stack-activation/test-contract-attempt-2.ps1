param([string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification-attempt-2\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$stagePath = Join-Path $runtimeRoot 'stage-active-origin-attempt-2.ps1'
Import-Module $modulePath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null

$passGate = Join-Path $evidenceRoot 'synthetic-pass-gate.yaml'
$badGate = Join-Path $evidenceRoot 'synthetic-bad-gate.yaml'
@('GateReport:','  result: PASS','  transition:','    allowed: true','    scope: request_creation_only','  observed_at: 2026-08-14T00:00:00.000Z') | Set-Content -Encoding utf8 -LiteralPath $passGate
@('GateReport:','  result: PASS','  transition:','    allowed: false','    scope: request_creation_only') | Set-Content -Encoding utf8 -LiteralPath $badGate
$null = Read-V31GateReport $passGate
$badGateRejected = [bool]0
try { $null = Read-V31GateReport $badGate } catch { if ($_.Exception.Message -eq 'DOGFOOD_V31_GATE_ALLOWED_INVALID') { $badGateRejected = [bool]1 } else { throw } }
if (-not $badGateRejected) { throw 'DOGFOOD_V31_BAD_GATE_ACCEPTED' }

$contract = [pscustomobject]@{ selectorBinding = 'v31-stack-activation-v2' }
$now = [DateTimeOffset]::Parse('2026-08-14T08:00:00Z')
$request = [pscustomobject]@{ selectorBinding = 'v31-stack-activation-v2'; scope = 'v31_stack_activation_once'; contractSha256 = ('a' * 64); gateSha256 = ('b' * 64); expiresAt = '2026-08-14T09:00:00Z' }
$approval = [pscustomobject]@{ selectorBinding = 'v31-stack-activation-v2'; scope = 'v31_stack_activation_once'; contractSha256 = ('a' * 64); gateSha256 = ('b' * 64); requestSha256 = ('c' * 64); decision = 'approved'; expiresAt = '2026-08-14T08:55:00Z' }
$null = Assert-V31Authorization $request $approval $contract ('a' * 64) ('b' * 64) ('c' * 64) $now
$negativeCases = 0
foreach ($mutation in @('selector','request_hash','expired','decision')) {
  $requestCase = $request.PSObject.Copy()
  $approvalCase = $approval.PSObject.Copy()
  switch ($mutation) {
    selector { $approvalCase.selectorBinding = 'wrong' }
    request_hash { $approvalCase.requestSha256 = ('d' * 64) }
    expired { $approvalCase.expiresAt = '2026-08-14T07:59:00Z' }
    decision { $approvalCase.decision = 'rejected' }
  }
  try { $null = Assert-V31Authorization $requestCase $approvalCase $contract ('a' * 64) ('b' * 64) ('c' * 64) $now } catch { $negativeCases++ }
}
if ($negativeCases -ne 4) { throw 'DOGFOOD_V31_AUTH_NEGATIVE_MATRIX' }

$restoreMatrix = [ordered]@{
  retained = Get-V31RestoreDecision @(101) 101 ([bool]1)
  missing = Get-V31RestoreDecision @() 101 ([bool]0)
  unknown = Get-V31RestoreDecision @(202) 101 ([bool]1)
  orphan = Get-V31RestoreDecision @(101) 101 ([bool]0)
}
if ($restoreMatrix.retained -ne 'retain_exact_old_owner' -or $restoreMatrix.missing -ne 'start_rollback_owner' -or $restoreMatrix.unknown -ne 'fail_closed_unknown_or_partial_owner' -or $restoreMatrix.orphan -ne 'fail_closed_unknown_or_partial_owner') { throw 'DOGFOOD_V31_RESTORE_MATRIX' }

$binaryFixture = [byte[]](0,255,1) + [Text.Encoding]::UTF8.GetBytes('http://127.0.0.1:34601') + [byte[]](254,2)
$binaryExpected = [byte[]](0,255,1) + [Text.Encoding]::UTF8.GetBytes('http://127.0.0.1:3301') + [byte[]](254,2)
$binaryActual = Convert-V31OriginBytes $binaryFixture
$binaryTransformExact = [Convert]::ToHexString($binaryActual) -ceq [Convert]::ToHexString($binaryExpected)
if (-not $binaryTransformExact) { throw 'DOGFOOD_V31_BINARY_TRANSFORM' }
$emptyActual = Convert-V31OriginBytes ([byte[]]::new(0))
$emptyTransformExact = $null -ne $emptyActual -and $emptyActual.GetType().FullName -ceq 'System.Byte[]' -and $emptyActual.Length -eq 0
if (-not $emptyTransformExact) { throw 'DOGFOOD_V31_EMPTY_BINARY_TRANSFORM' }

$directStageRejected = [bool]0
$directOutput = (& pwsh.exe -NoLogo -NoProfile -File $stagePath -EvidenceRootOverride $evidenceRoot 2>&1 | Out-String)
$directExit = $LASTEXITCODE
if ($directExit -ne 0 -and $directOutput -like '*DOGFOOD_V31_DIRECT_STAGE_REJECTED*') { $directStageRejected = [bool]1 }
if (-not $directStageRejected) { throw 'DOGFOOD_V31_DIRECT_STAGE_ACCEPTED' }
$outsideRoot = Join-Path $runtimeRoot 'verifier-sibling-rejected'
$outsideRejected = [bool]0
$outsideOutput = (& pwsh.exe -NoLogo -NoProfile -File $stagePath -DryRun -EvidenceRootOverride $outsideRoot 2>&1 | Out-String)
$outsideExit = $LASTEXITCODE
if ($outsideExit -ne 0 -and $outsideOutput -like '*DOGFOOD_V31_EVIDENCE_ROOT_REJECTED*') { $outsideRejected = [bool]1 }
if (-not $outsideRejected -or (Test-Path -LiteralPath $outsideRoot)) { throw 'DOGFOOD_V31_OUTSIDE_ROOT_BOUNDARY' }

Remove-Item -LiteralPath $passGate,$badGate -Force
$result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31ActivationContractProbe'; result = 'PASS'; gate = [ordered]@{ positive = [bool]1; negative = [bool]1 }; authorization = [ordered]@{ positive = 1; negative = $negativeCases }; compensation = $restoreMatrix; binaryTransformExact = $binaryTransformExact; emptyTransformExact = $emptyTransformExact; directStageRejected = $directStageRejected; outsideRootRejectedPreWrite = $outsideRejected; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'contract-probe.json')
$result | ConvertTo-Json -Depth 12
