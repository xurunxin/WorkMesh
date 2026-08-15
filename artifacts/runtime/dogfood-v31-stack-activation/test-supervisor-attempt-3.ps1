param([string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence\supervisor-binding-attempt-3'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-versioned-supervisor-binding-repair-verification\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor-attempt-3.ps1'
$contractPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract-attempt-3.json'
Import-Module $modulePath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$contractSha = Get-V31Sha256 $contractPath
$runtimeStateRoot = Join-Path $runtimeRoot 'runtime\probe-attempt-3'
function Get-CandidateProcessCount {
  @(
    Get-CimInstance Win32_Process | Where-Object {
      [string]$_.CommandLine -like '*role-supervisor-attempt-3.ps1*' -or
      [string]$_.CommandLine -like '*dogfood-v31-stack-activation\prepared-active-origin\apps\web\server.js*' -or
      [string]$_.CommandLine -like '*mcp-entrypoint-v31.mts*'
    }
  ).Count
}
$positive = @()
foreach ($mode in @('candidate','rollback')) {
  foreach ($role in @('web','mcp')) {
    $caseRoot = Join-Path $evidenceRoot "$mode-$role"
    $statePath = Join-Path $runtimeStateRoot "$mode-$role.json"
    $stopPath = Join-Path $runtimeStateRoot "$mode-$role.stop"
    $output = (& pwsh.exe -NoLogo -NoProfile -File $supervisorPath -Role $role -Mode $mode -ContractPath $contractPath -ContractSha256 $contractSha -StatePath $statePath -StopPath $stopPath -DryRun -EvidenceRootOverride $caseRoot 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "DOGFOOD_V31_SUPERVISOR_POSITIVE_FAILED:${mode}:${role}:$output" }
    $receiptPath = Join-Path $caseRoot "supervisor-$mode-$role.json"
    $receipt = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json -DateKind String
    $candidateProcessCount = Get-CandidateProcessCount
    if ($receipt.result -ne 'PASS' -or $receipt.childCreated -or $candidateProcessCount -ne 0 -or (Test-Path -LiteralPath $statePath) -or (Test-Path -LiteralPath $stopPath)) { throw "DOGFOOD_V31_SUPERVISOR_POSITIVE_INVARIANT:${mode}:${role}" }
    $positive += [pscustomobject]@{ mode = $mode; role = $role; receiptSha256 = Get-V31Sha256 $receiptPath; childCreated = [bool]$receipt.childCreated; candidateProcessCount = $candidateProcessCount }
  }
}
$negative = @()
$cases = @(
  @{ name = 'wrong-contract-path'; args = @('-Role','web','-Mode','candidate','-ContractPath',(Join-Path $runtimeRoot 'stage-active-origin-attempt-2.ps1'),'-ContractSha256',$contractSha,'-StatePath',(Join-Path $runtimeStateRoot 'n1.json'),'-StopPath',(Join-Path $runtimeStateRoot 'n1.stop'),'-DryRun','-EvidenceRootOverride',$evidenceRoot); code = 'DOGFOOD_V31_SUPERVISOR_PATH_REJECTED' },
  @{ name = 'wrong-contract-hash'; args = @('-Role','web','-Mode','candidate','-ContractPath',$contractPath,'-ContractSha256',('0' * 64),'-StatePath',(Join-Path $runtimeStateRoot 'n2.json'),'-StopPath',(Join-Path $runtimeStateRoot 'n2.stop'),'-DryRun','-EvidenceRootOverride',$evidenceRoot); code = 'DOGFOOD_V31_SUPERVISOR_CONTRACT_SHA' },
  @{ name = 'wrong-state-root'; args = @('-Role','web','-Mode','candidate','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-StatePath',(Join-Path $evidenceRoot 'n3.json'),'-StopPath',(Join-Path $runtimeStateRoot 'n3.stop'),'-DryRun','-EvidenceRootOverride',$evidenceRoot); code = 'DOGFOOD_V31_SUPERVISOR_PATH_REJECTED' },
  @{ name = 'wrong-stop-root'; args = @('-Role','web','-Mode','candidate','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-StatePath',(Join-Path $runtimeStateRoot 'n4.json'),'-StopPath',(Join-Path $evidenceRoot 'n4.stop'),'-DryRun','-EvidenceRootOverride',$evidenceRoot); code = 'DOGFOOD_V31_SUPERVISOR_PATH_REJECTED' },
  @{ name = 'wrong-evidence-root'; args = @('-Role','web','-Mode','candidate','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-StatePath',(Join-Path $runtimeStateRoot 'n5.json'),'-StopPath',(Join-Path $runtimeStateRoot 'n5.stop'),'-DryRun','-EvidenceRootOverride',(Join-Path $runtimeRoot 'evidence-sibling')); code = 'DOGFOOD_V31_SUPERVISOR_EVIDENCE_REJECTED' },
  @{ name = 'invalid-mode'; args = @('-Role','web','-Mode','invalid','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-StatePath',(Join-Path $runtimeStateRoot 'n6.json'),'-StopPath',(Join-Path $runtimeStateRoot 'n6.stop'),'-DryRun','-EvidenceRootOverride',$evidenceRoot); code = 'ValidateSet' }
)
foreach ($case in $cases) {
  $output = (& pwsh.exe -NoLogo -NoProfile -File $supervisorPath @($case.args) 2>&1 | Out-String)
  $exitCode = $LASTEXITCODE
  $candidateProcessCount = Get-CandidateProcessCount
  if ($exitCode -eq 0 -or $output -notlike "*$($case.code)*" -or $candidateProcessCount -ne 0) { throw "DOGFOOD_V31_SUPERVISOR_NEGATIVE_FAILED:$($case.name)" }
  $negative += [pscustomobject]@{ name = $case.name; rejected = [bool]1; candidateProcessCount = $candidateProcessCount }
}
$result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31VersionedSupervisorProbe'; result = 'PASS'; selectorBinding = 'v31-stack-activation-v3'; positive = $positive; negative = $negative; childProcessesCreated = 0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
$result | ConvertTo-Json -Depth 16 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'supervisor-probe.json')
$result | ConvertTo-Json -Depth 16
