param(
  [switch]$DryRun,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [string]$RequestPath,
  [string]$RequestSha256,
  [string]$ApprovalPath,
  [string]$ApprovalSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_COORD_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation'
$expectedContract = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\execution-binding.json'
Import-Module $modulePath -Force

function Assert-Gate([pscustomobject]$Contract) {
  $gatePath = Join-Path $controlRoot ([string]$Contract.execution.gatePath)
  if (-not (Test-Path -LiteralPath $gatePath)) { throw 'DOGFOOD_V31_COORD_GATE_MISSING' }
  $gateText = Get-Content -Raw -LiteralPath $gatePath
  $pattern = '(?ms)^GateReport:\s*$.*?^  result:\s*PASS\s*$.*?^  transition:\s*$.*?^    allowed:\s*true\s*$.*?^    scope:\s*request_creation_only\s*$'
  if (-not [regex]::IsMatch($gateText,$pattern)) { throw 'DOGFOOD_V31_COORD_GATE_NOT_AUTHORIZING' }
  Get-V31Sha256 $gatePath
}

function Assert-Authorization([pscustomobject]$Contract) {
  if ([string]::IsNullOrWhiteSpace($RequestPath) -or [string]::IsNullOrWhiteSpace($ApprovalPath) -or [string]::IsNullOrWhiteSpace($RequestSha256) -or [string]::IsNullOrWhiteSpace($ApprovalSha256)) { throw 'DOGFOOD_V31_COORD_AUTH_ARGUMENT_MISSING' }
  $expectedRequest = Join-Path $controlRoot ([string]$Contract.execution.requestPath)
  $expectedApproval = Join-Path $controlRoot ([string]$Contract.execution.approvalPath)
  if ((Get-V31FullPath $RequestPath) -cne (Get-V31FullPath $expectedRequest) -or (Get-V31FullPath $ApprovalPath) -cne (Get-V31FullPath $expectedApproval)) { throw 'DOGFOOD_V31_COORD_AUTH_PATH_REJECTED' }
  if ((Get-V31Sha256 $RequestPath) -cne $RequestSha256 -or (Get-V31Sha256 $ApprovalPath) -cne $ApprovalSha256) { throw 'DOGFOOD_V31_COORD_AUTH_SHA_MISMATCH' }
  $request = Read-V31Json $RequestPath
  $approval = Read-V31Json $ApprovalPath
  $gateSha = Assert-Gate $Contract
  if ($request.kind -ne 'DogfoodV31CoordinationFeatureActivationRequest' -or $request.selectorBinding -ne $Contract.selectorBinding -or $request.contractSha256 -cne $ContractSha256 -or $request.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_COORD_REQUEST_INVALID' }
  if ([DateTimeOffset]::Parse([string]$request.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_COORD_REQUEST_EXPIRED' }
  if ($approval.kind -ne 'DogfoodV31CoordinationFeatureActivationApproval' -or $approval.decision -ne 'approved' -or $approval.selectorBinding -ne $Contract.selectorBinding -or $approval.requestSha256 -cne $RequestSha256 -or $approval.contractSha256 -cne $ContractSha256 -or $approval.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_COORD_APPROVAL_INVALID' }
  if ([DateTimeOffset]::Parse([string]$approval.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_COORD_APPROVAL_EXPIRED' }
  if (Test-Path -LiteralPath (Join-Path $controlRoot ([string]$Contract.execution.activationPath))) { throw 'DOGFOOD_V31_COORD_ACTIVATION_ALREADY_EXISTS' }
  if (Test-Path -LiteralPath (Join-Path $controlRoot ([string]$Contract.execution.rollbackPath))) { throw 'DOGFOOD_V31_COORD_ROLLBACK_ALREADY_EXISTS' }
  [ordered]@{gateSha256=$gateSha;requestSha256=$RequestSha256;approvalSha256=$ApprovalSha256}
}

function Assert-Protected([pscustomobject]$Contract) {
  foreach ($role in @($Contract.protectedRoles)) {
    Assert-V31Process ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle) | Out-Null
    if ($role.port -and (Get-V31ListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_COORD_PROTECTED_LISTENER_DRIFT:$($role.name)" }
    if ($role.healthUrl) { Wait-V31HttpReady ([string]$role.healthUrl) 20 }
  }
  Wait-V31HttpReady ([string]$Contract.objectStorage.healthUrl) 20
  $container = docker inspect ([string]$Contract.objectStorage.containerId) --format '{{.Id}}|{{.Image}}|{{.Name}}' 2>$null
  $expected = "$($Contract.objectStorage.containerId)|$($Contract.objectStorage.imageDigest)|/$($Contract.objectStorage.name)"
  if ([string]$container -cne $expected) { throw 'DOGFOOD_V31_COORD_OBJECT_STORAGE_DRIFT' }
}

function Start-Candidate([pscustomobject]$Contract, [string]$Role, [string]$ExecutionBindingSha) {
  $candidate = $Contract.candidateRoles.$Role
  $statePath = Join-Path $controlRoot ([string]$candidate.statePath)
  $stopPath = Join-Path $controlRoot ([string]$candidate.stopPath)
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $arguments = @('-Role',$Role,'-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',$ExecutionBindingSha)
  Start-V31Supervisor $supervisorPath $arguments $statePath ([int]$candidate.port) ([string]$candidate.healthUrl) $Role
}

function Restore-OldRole([pscustomobject]$Contract, [string]$Role) {
  $old = $Contract.oldRoles.$Role
  $existing = Get-V31ProcessRecord ([int]$old.supervisorPid)
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$old.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  $listenerMatches = $owners.Count -eq 1 -and [int]$owners[0] -eq [int]$old.listenerPid
  $decision = Resolve-V31OldRoleConvergenceDecision ([bool]($null -ne $existing)) ([bool]$listenerMatches) $owners.Count
  if ($decision -eq 'reject') { throw "DOGFOOD_V31_COORD_UNKNOWN_OR_DRIFTED_OWNER:$Role" }
  if ($existing) {
    Assert-V31Process ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
    if ((Get-V31ListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw "DOGFOOD_V31_COORD_RETAINED_LISTENER_DRIFT:$Role" }
    Wait-V31HttpReady ([string]$old.healthUrl) 20
    return [pscustomobject]@{role=$Role;status='retained';supervisorPid=[int]$old.supervisorPid;listenerPid=[int]$old.listenerPid}
  }
  $statePath = Join-Path $controlRoot ([string]$old.statePath)
  $stopPath = Join-Path $controlRoot ([string]$old.stopPath)
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $scriptPath = Join-Path $controlRoot ([string]$old.scriptPath)
  $oldContractPath = Join-Path $controlRoot ([string]$old.contractPath)
  $args = @('-Role',$Role)
  if ($old.mode) { $args += @('-Mode',[string]$old.mode) }
  $args += @('-ContractPath',$oldContractPath,'-ContractSha256',[string]$old.contractSha256,'-StatePath',$statePath,'-StopPath',$stopPath)
  Start-V31Supervisor $scriptPath $args $statePath ([int]$old.port) ([string]$old.healthUrl) $Role
}

function Stop-CandidateIfPresent([pscustomobject]$Contract, [string]$Role) {
  $candidate = $Contract.candidateRoles.$Role
  $statePath = Join-Path $controlRoot ([string]$candidate.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { return [pscustomobject]@{role=$Role;status='absent'} }
  $state = Read-V31Json $statePath
  if ($state.status -ne 'RUNNING') { return [pscustomobject]@{role=$Role;status='not_running'} }
  Stop-V31ExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256,$Role) (Join-Path $controlRoot ([string]$candidate.stopPath))
}

if ((Get-V31FullPath $ContractPath) -cne (Get-V31FullPath $expectedContract)) { throw 'DOGFOOD_V31_COORD_CONTRACT_PATH_REJECTED' }
if ((Get-V31Sha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_COORD_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31Json $ContractPath
if ($contract.kind -ne 'DogfoodV31CoordinationFeatureActivationContract' -or $contract.selectorBinding -ne 'v31-coordination-feature-binding-v1') { throw 'DOGFOOD_V31_COORD_CONTRACT_INVALID' }
if ([string]$contract.scripts.start.sha256 -cne (Get-V31Sha256 $PSCommandPath) -or [string]$contract.scripts.module.sha256 -cne (Get-V31Sha256 $modulePath) -or [string]$contract.scripts.supervisor.sha256 -cne (Get-V31Sha256 $supervisorPath)) { throw 'DOGFOOD_V31_COORD_SCRIPT_HASH_MISMATCH' }
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $controlRoot ([string]$_) })
$evidence = Assert-V31EvidenceRoot $EvidenceRoot $allowedRoots
Assert-Protected $contract
foreach ($role in @('api','worker')) {
  $old = $contract.oldRoles.$role
  Assert-V31Process ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
  if ((Get-V31ListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw "DOGFOOD_V31_COORD_OLD_LISTENER_DRIFT:$role" }
  Wait-V31HttpReady ([string]$old.healthUrl) 20
}
if ($DryRun) {
  Write-V31Json (Join-Path $evidence 'start-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureStartDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;roles=@('api','worker');featureValue='true';protectedRoles=@($contract.protectedRoles.name);checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
$auth = Assert-Authorization $contract
$authorizingStart = Get-Process -Id $PID -ErrorAction Stop
$executionBinding = [ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;authorizingStartPid=$PID;authorizingStartTimeUtc=$authorizingStart.StartTime.ToUniversalTime().ToString('O');createdAt=[DateTimeOffset]::UtcNow.ToString('O')}
Write-V31Json $bindingPath $executionBinding
$bindingSha = Get-V31Sha256 $bindingPath
$mutationStarted = $false
try {
  foreach ($role in @('worker','api')) {
    $old = $contract.oldRoles.$role
    $mutationStarted = $true
    Stop-V31ExactTree ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) (Join-Path $controlRoot ([string]$old.stopPath)) | Out-Null
  }
  $api = Start-Candidate $contract 'api' $bindingSha
  $worker = Start-Candidate $contract 'worker' $bindingSha
  Assert-Protected $contract
  $activationPath = Join-Path $controlRoot ([string]$contract.execution.activationPath)
  Write-V31Json $activationPath ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureActivation';result='PASS';status='ACTIVE_PENDING_HUMAN_ACCEPTANCE';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;api=$api;worker=$worker;protectedRoles=@($contract.protectedRoles);featureRegistryExpected=$true;rollbackReady=$true;completedAt=[DateTimeOffset]::UtcNow.ToString('O');securityScanRun=[bool]0})
} catch {
  $primary = $_.Exception.Message
  $cleanup = @()
  $restore = @()
  $rollbackStatus = 'ROLLED_BACK_RUNTIME_VERIFIED'
  try {
    foreach ($role in @('worker','api')) { $cleanup += Stop-CandidateIfPresent $contract $role }
    foreach ($role in @('api','worker')) { $restore += Restore-OldRole $contract $role }
    Assert-Protected $contract
  } catch {
    $rollbackStatus = 'ROLLBACK_FAILED'
    $restore += [pscustomobject]@{status='error';message=$_.Exception.Message}
  }
  if ($mutationStarted) {
    $rollbackPath = Join-Path $controlRoot ([string]$contract.execution.rollbackPath)
    Write-V31Json $rollbackPath ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureRollback';result=$rollbackStatus;primaryError=$primary;candidateCleanup=$cleanup;oldRoleRestore=$restore;contractSha256=$ContractSha256;completedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  }
  throw "DOGFOOD_V31_COORD_ACTIVATION_FAILED:${primary}:$rollbackStatus"
}
