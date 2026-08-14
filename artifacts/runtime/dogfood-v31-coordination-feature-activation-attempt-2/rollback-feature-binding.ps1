param(
  [switch]$DryRun,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$ActivationPath,
  [Parameter(Mandatory=$true)][string]$ActivationSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_COORD_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation-attempt-2'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
Import-Module $modulePath -Force
if ((Get-V31Sha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_COORD_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31Json $ContractPath
if ([string]$contract.scripts.rollback.sha256 -cne (Get-V31Sha256 $PSCommandPath) -or [string]$contract.scripts.module.sha256 -cne (Get-V31Sha256 $modulePath)) { throw 'DOGFOOD_V31_COORD_SCRIPT_HASH_MISMATCH' }
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $controlRoot ([string]$_) })
$evidence = Assert-V31EvidenceRoot $EvidenceRoot $allowedRoots
if ($DryRun) {
  Write-V31Json (Join-Path $evidence 'rollback-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureRollbackDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
$expectedActivation = Join-Path $controlRoot ([string]$contract.execution.activationPath)
if ((Get-V31FullPath $ActivationPath) -cne (Get-V31FullPath $expectedActivation) -or (Get-V31Sha256 $ActivationPath) -cne $ActivationSha256) { throw 'DOGFOOD_V31_COORD_ACTIVATION_BINDING_REJECTED' }
$activation = Read-V31Json $ActivationPath
if ($activation.kind -ne 'DogfoodV31CoordinationFeatureActivation' -or $activation.contractSha256 -cne $ContractSha256) { throw 'DOGFOOD_V31_COORD_ACTIVATION_INVALID' }
foreach ($role in @('worker','api')) {
  $candidate = $contract.candidateRoles.$role
  $statePath = Join-Path $controlRoot ([string]$candidate.statePath)
  if (Test-Path -LiteralPath $statePath) {
    $state = Read-V31Json $statePath
    if ($state.status -eq 'RUNNING') { Stop-V31ExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256,$role) (Join-Path $controlRoot ([string]$candidate.stopPath)) | Out-Null }
  }
}
$restored = @()
foreach ($role in @('api','worker')) {
  $old = $contract.oldRoles.$role
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$old.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 0) { throw "DOGFOOD_V31_COORD_ROLLBACK_PORT_BUSY:$role" }
  $statePath = Join-Path $controlRoot ([string]$old.statePath)
  $stopPath = Join-Path $controlRoot ([string]$old.stopPath)
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $scriptPath = Join-Path $controlRoot ([string]$old.scriptPath)
  $oldContractPath = Join-Path $controlRoot ([string]$old.contractPath)
  $args = @('-Role',$role)
  if ($old.mode) { $args += @('-Mode',[string]$old.mode) }
  $args += @('-ContractPath',$oldContractPath,'-ContractSha256',[string]$old.contractSha256,'-StatePath',$statePath,'-StopPath',$stopPath)
  $restored += Start-V31Supervisor $scriptPath $args $statePath ([int]$old.port) ([string]$old.healthUrl) $role
}
$rollbackPath = Join-Path $controlRoot ([string]$contract.execution.rollbackPath)
Write-V31Json $rollbackPath ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureRollback';result='ROLLED_BACK_RUNTIME_VERIFIED';contractSha256=$ContractSha256;activationSha256=$ActivationSha256;oldRoleRestore=$restored;completedAt=[DateTimeOffset]::UtcNow.ToString('O')})
