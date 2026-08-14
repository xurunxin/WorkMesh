param([string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence\supervisor-binding-attempt-3'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-versioned-supervisor-binding-repair-verification\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$compensationPath = Join-Path $runtimeRoot 'compensation-attempt-3.psm1'
Import-Module $modulePath -Force
Import-Module $compensationPath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$roles = @(
  [pscustomobject]@{ role = 'web'; listenerPid = 101; supervisorPid = 201 },
  [pscustomobject]@{ role = 'mcp'; listenerPid = 102; supervisorPid = 202 }
)
$candidate = @{ web = [pscustomobject]@{ supervisorPid = 301 }; mcp = [pscustomobject]@{ supervisorPid = 302 } }
$cases = @()
foreach ($caseName in @('retain','restart','unknown','restart-failure')) {
  $receipts = [Collections.Generic.List[object]]::new()
  $counters = [ordered]@{ stop = 0; start = 0; verify = 0 }
  $stop = { param($name,$runtime) $counters.stop++; [pscustomobject]@{ role = $name; stopped = [bool]1 } }
  $owners = {
    param($role)
    if ($caseName -eq 'retain') { return @([int]$role.listenerPid) }
    if ($caseName -eq 'unknown' -and $role.role -eq 'web') { return @(999) }
    @()
  }
  $alive = { param($role) $caseName -eq 'retain' }
  $assertRetained = { param($role) [pscustomobject]@{ mode = 'retained-exact-old-owner'; listenerPid = [int]$role.listenerPid } }
  $startRollback = {
    param($role)
    $counters.start++
    if ($caseName -eq 'restart-failure' -and $role.role -eq 'mcp') { throw 'SYNTHETIC_ROLLBACK_START_FAILURE' }
    [pscustomobject]@{ mode = 'rollback'; role = [string]$role.role }
  }
  $verify = { $counters.verify++; [pscustomobject]@{ health = 'PASS'; build = 'PASS' } }
  $write = { param($receipt) $receipts.Add([pscustomobject]$receipt) }
  $threw = [bool]0
  try { $null = Invoke-V31Attempt3Compensation $candidate $roles "synthetic-$caseName" $stop $owners $alive $assertRetained $startRollback $verify $write } catch { $threw = [bool]1 }
  if ($receipts.Count -ne 1) { throw "DOGFOOD_V31_COMPENSATION_RECEIPT_COUNT:$caseName" }
  $receipt = $receipts[0]
  $expectedFailure = $caseName -in @('unknown','restart-failure')
  if ($threw -ne $expectedFailure -or (($receipt.status -eq 'ROLLBACK_FAILED') -ne $expectedFailure) -or $counters.stop -ne 2) { throw "DOGFOOD_V31_COMPENSATION_CASE_FAILED:$caseName" }
  if (-not $expectedFailure -and ($counters.verify -ne 1 -or $receipt.restored.Count -ne 2)) { throw "DOGFOOD_V31_COMPENSATION_SUCCESS_INCOMPLETE:$caseName" }
  $cases += [pscustomobject]@{ name = $caseName; status = [string]$receipt.status; threw = $threw; candidateStops = $counters.stop; rollbackStarts = $counters.start; verifyCalls = $counters.verify; terminalReceiptCount = $receipts.Count }
}
$result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31CompensationProductionSeamProbe'; result = 'PASS'; cases = $cases; terminalReceipts = @($cases).Count; activeRuntimeTouched = [bool]0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
$result | ConvertTo-Json -Depth 16 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'compensation-probe.json')
$result | ConvertTo-Json -Depth 16
