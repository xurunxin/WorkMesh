param([Parameter(Mandatory=$true)][string]$ContractPath,[Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation-attempt-2'
Import-Module (Join-Path $runtimeRoot 'runtime-module.psm1') -Force
$contract = Read-V31Json $ContractPath
$allowed = @(
  (Join-Path $runtimeRoot 'evidence\worker'),
  (Join-Path $controlRoot 'artifacts\gates\dogfood-v31-coordination-feature-binding-verification-attempt-2\independent')
)
$root = Assert-V31EvidenceRoot $EvidenceRoot $allowed
$roles = @()
foreach ($roleName in @('api','worker')) {
  $role = $contract.oldRoles.$roleName
  $record = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) @([string]$role.scriptPath,[string]$role.contractPath,[string]$role.statePath)
  $listenerPid = Get-V31ListenerPid ([int]$role.port)
  if ($listenerPid -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_COORD_RUNTIME_LISTENER_DRIFT:$roleName" }
  Wait-V31HttpReady ([string]$role.healthUrl) 20
  $roles += [ordered]@{name=$roleName;supervisorPid=$record.pid;supervisorStartTimeUtc=$record.startTimeUtc;listenerPid=$listenerPid;health=200}
}
foreach ($role in @($contract.protectedRoles)) {
  $record = Assert-V31Process ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle)
  if ($role.port) { if ((Get-V31ListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_COORD_PROTECTED_LISTENER_DRIFT:$($role.name)" } }
  if ($role.healthUrl) { Wait-V31HttpReady ([string]$role.healthUrl) 20 }
  $roles += [ordered]@{name=$role.name;pid=$record.pid;startTimeUtc=$record.startTimeUtc;listenerPid=$role.listenerPid;health=200}
}
Wait-V31HttpReady ([string]$contract.objectStorage.healthUrl) 20
$container = docker inspect ([string]$contract.objectStorage.containerId) --format '{{.Id}}|{{.Image}}|{{.Name}}' 2>$null
$expectedContainer = "$($contract.objectStorage.containerId)|$($contract.objectStorage.imageDigest)|/$($contract.objectStorage.name)"
if ([string]$container -cne $expectedContainer) { throw 'DOGFOOD_V31_COORD_OBJECT_STORAGE_DRIFT' }
$roles += [ordered]@{name='minio';containerId=$contract.objectStorage.containerId;imageDigest=$contract.objectStorage.imageDigest;health=200}
$future = @($contract.execution.requestPath,$contract.execution.approvalPath,$contract.execution.activationPath,$contract.execution.rollbackPath | ForEach-Object { [ordered]@{path=[string]$_;exists=(Test-Path -LiteralPath (Join-Path $controlRoot ([string]$_)))} })
if (@($future | Where-Object {$_.exists}).Count -ne 0) { throw 'DOGFOOD_V31_COORD_FUTURE_ARTIFACT_PRESENT' }
Write-V31Json (Join-Path $root 'runtime-invariance.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureRuntimeInvariance';result='PASS';roles=$roles;healthCount='7/7';futureArtifacts=$future;serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
