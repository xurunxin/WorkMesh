param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
$allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$root = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowed
$results = @()

function Run-Case([string]$Name, [scriptblock]$Stop, [scriptblock]$Discover, [scriptblock]$Restore, [scriptblock]$Verify, [string]$ExpectedResult, [int]$ExpectedReceiptCount) {
  $receiptBox = [pscustomobject]@{items=@()}
  $threw = [bool]0
  try {
    $actual = Invoke-V31PublicOriginCompensation -PrimaryError $Name -StopCandidate $Stop -DiscoverOldOwner $Discover -RestoreOldOwner $Restore -VerifyRestoredRuntime $Verify -WriteTerminalReceipt { param([object]$Receipt) $receiptBox.items += [pscustomobject]$Receipt }
    $result = [string]$actual.result
  } catch {
    $threw = [bool]1
    if ($receiptBox.items.Count -eq 0) { throw "DOGFOOD_V31_ORIGIN_PROBE_RECEIPT_MISSING:$Name" }
    $result = [string]$receiptBox.items[-1].result
  }
  if ($result -ne $ExpectedResult -or $receiptBox.items.Count -ne $ExpectedReceiptCount) { throw "DOGFOOD_V31_ORIGIN_PROBE_CASE_FAILED:${Name}:${result}:$($receiptBox.items.Count)" }
  $script:results += [pscustomobject]@{name=$Name;result=$result;receiptCount=$receiptBox.items.Count;threw=$threw}
}

Run-Case 'retained-old-owner' { [pscustomobject]@{status='absent'} } { 'retained' } { throw 'restore_must_not_run' } { $true } 'ROLLED_BACK_RUNTIME_VERIFIED' 1
Run-Case 'missing-old-owner-restart' { [pscustomobject]@{status='stopped'} } { 'missing' } { [pscustomobject]@{status='restarted';webOrigin='http://127.0.0.1:3300'} } { $true } 'ROLLED_BACK_RUNTIME_VERIFIED' 1
Run-Case 'unknown-owner' { [pscustomobject]@{status='absent'} } { 'unknown' } { throw 'restore_must_not_run' } { $true } 'ROLLBACK_FAILED' 1
Run-Case 'candidate-cleanup-failure' { throw 'synthetic_cleanup_failure' } { 'retained' } { throw 'restore_must_not_run' } { $true } 'ROLLBACK_FAILED' 1
Run-Case 'old-restart-failure' { [pscustomobject]@{status='stopped'} } { 'missing' } { throw 'synthetic_restart_failure' } { $true } 'ROLLBACK_FAILED' 1

Write-V31OriginJson (Join-Path $root 'compensation-probe.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCompensationProbe';result='PASS';productionFunction='Invoke-V31PublicOriginCompensation';productionCallers=@('start-public-origin.ps1','rollback-public-origin.ps1');cases=$results;terminalReceipts='5/5';serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
