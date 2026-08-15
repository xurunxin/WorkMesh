param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling-activation-contract.json'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract) -or (Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_CORS_CONTRACT_REJECTED' }
$contract = Read-V31OriginJson $ContractPath
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
$startSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot ([string]$contract.scripts.start.path))
$rollbackSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot ([string]$contract.scripts.rollback.path))
if (-not $startSource.Contains('Invoke-V31PublicOriginCompensation @args',[StringComparison]::Ordinal) -or -not $rollbackSource.Contains('Invoke-V31PublicOriginCompensation @args',[StringComparison]::Ordinal)) { throw 'DOGFOOD_V31_CORS_PRODUCTION_COMPENSATION_SEAM_MISSING' }
$cases = @()
function Run-Case([string]$Name,[string]$Decision,[bool]$CleanupFails,[bool]$VerifyFails) {
  $script:receipt = $null
  $script:restoreCalls = 0
  $thrown = $null
  try {
    $args = @{
      PrimaryError = $Name
      StopCandidate = { if ($CleanupFails) { throw 'cleanup-fault' }; [pscustomobject]@{status='stopped'} }
      DiscoverOldOwner = { $Decision }
      RestoreOldOwner = { $script:restoreCalls++; [pscustomobject]@{status='started'} }
      VerifyRestoredRuntime = { if ($VerifyFails) { throw 'verify-fault' } }
      WriteTerminalReceipt = { param([object]$Receipt) $script:receipt = $Receipt }
    }
    $null = Invoke-V31PublicOriginCompensation @args
  } catch { $thrown = $_.Exception.Message }
  [pscustomobject]@{name=$Name;decision=$Decision;cleanupFails=$CleanupFails;verifyFails=$VerifyFails;restoreCalls=$script:restoreCalls;receiptResult=[string]$script:receipt.result;receiptWritten=[bool]($null -ne $script:receipt);thrown=$thrown}
}
$cases += Run-Case 'retained' 'retained' ([bool]0) ([bool]0)
$cases += Run-Case 'missing' 'missing' ([bool]0) ([bool]0)
$cases += Run-Case 'unknown' 'unknown' ([bool]0) ([bool]0)
$cases += Run-Case 'cleanup-failure' 'retained' ([bool]1) ([bool]0)
$cases += Run-Case 'verify-failure' 'retained' ([bool]0) ([bool]1)
if (@($cases | Where-Object { -not $_.receiptWritten }).Count -ne 0) { throw 'DOGFOOD_V31_CORS_TERMINAL_RECEIPT_MISSING' }
if ($cases[0].receiptResult -ne 'ROLLED_BACK_RUNTIME_VERIFIED' -or $cases[0].restoreCalls -ne 0 -or $cases[1].receiptResult -ne 'ROLLED_BACK_RUNTIME_VERIFIED' -or $cases[1].restoreCalls -ne 1) { throw 'DOGFOOD_V31_CORS_SUCCESS_CASE_FAILED' }
if (@($cases | Select-Object -Skip 2 | Where-Object { $_.receiptResult -ne 'ROLLBACK_FAILED' -or [string]::IsNullOrWhiteSpace([string]$_.thrown) }).Count -ne 0) { throw 'DOGFOOD_V31_CORS_FAILURE_CASE_FAILED' }
Write-V31OriginJson (Join-Path $evidence 'compensation-probe.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingCompensationProbe';result='PASS';contractSha256=$ContractSha256;sharedProductionSeam=[bool]1;cases=$cases;terminalReceipts='5/5';checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
