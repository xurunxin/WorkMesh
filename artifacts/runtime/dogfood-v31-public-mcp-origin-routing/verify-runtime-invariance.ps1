param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [Parameter(Mandatory=$true)][string]$Phase
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
$old = $contract.oldApi
Assert-V31OriginProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
Assert-V31OriginProcess ([int]$old.listenerPid) ([string]$old.listenerStartTimeUtc) @([string]$old.root,'src\server.ts') | Out-Null
if ((Get-V31OriginListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_OLD_API_LISTENER_DRIFT' }
$health = @([pscustomobject]@{name='api';url=[string]$old.healthUrl;status=200})
$null = Wait-V31OriginHttp ([string]$old.healthUrl) @(200) 20
foreach ($role in @($contract.protectedRoles)) {
  Assert-V31OriginProcess ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle) | Out-Null
  Assert-V31OriginProcess ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) @([string]$role.listenerCommandNeedle) | Out-Null
  if ((Get-V31OriginListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_ORIGIN_PROTECTED_LISTENER_DRIFT:$($role.name)" }
  $null = Wait-V31OriginHttp ([string]$role.healthUrl) @(200) 20
  $health += [pscustomobject]@{name=[string]$role.name;url=[string]$role.healthUrl;status=200}
}
$null = Wait-V31OriginHttp ([string]$contract.objectStorage.healthUrl) @(200) 20
$health += [pscustomobject]@{name='object-storage';url=[string]$contract.objectStorage.healthUrl;status=200}
$container = docker inspect ([string]$contract.objectStorage.containerId) --format '{{.Id}}|{{.Image}}|{{.Name}}' 2>$null
$expectedContainer = "$($contract.objectStorage.containerId)|$($contract.objectStorage.imageDigest)|/$($contract.objectStorage.name)"
if ([string]$container -cne $expectedContainer) { throw 'DOGFOOD_V31_ORIGIN_OBJECT_STORAGE_DRIFT' }
$required = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($contract.servedBuild.requiredBuildId)/_buildManifest.js" -TimeoutSec 3
$forbidden = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($contract.servedBuild.forbiddenBuildId)/_buildManifest.js" -TimeoutSec 3
if ([int]$required.StatusCode -ne 200 -or [int]$forbidden.StatusCode -ne 404) { throw 'DOGFOOD_V31_ORIGIN_BUILD_EXCLUSIVITY_DRIFT' }
$future = @($contract.execution.requestPath,$contract.execution.approvalPath,$contract.execution.activationPath,$contract.execution.rollbackPath)
$present = @($future | Where-Object { Test-Path -LiteralPath (Join-Path $repoRoot ([string]$_)) })
if ($present.Count -ne 0) { throw 'DOGFOOD_V31_ORIGIN_FUTURE_ARTIFACT_PRESENT' }
$runtimeResidue = @($contract.candidateApi.statePath,$contract.candidateApi.stopPath,$contract.rollbackApi.statePath,$contract.rollbackApi.stopPath,'artifacts/runtime/dogfood-v31-public-mcp-origin-routing/authorization/execution-binding.json','artifacts/runtime/dogfood-v31-public-mcp-origin-routing/authorization/rollback-execution-binding.json')
$residue = @($runtimeResidue | Where-Object { Test-Path -LiteralPath (Join-Path $repoRoot ([string]$_)) })
if ($residue.Count -ne 0) { throw 'DOGFOOD_V31_ORIGIN_RUNTIME_RESIDUE_PRESENT' }
Write-V31OriginJson (Join-Path $root "runtime-$Phase.json") ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginRuntimeInvariance';result='PASS';phase=$Phase;oldApi=[ordered]@{supervisorPid=[int]$old.supervisorPid;supervisorStartTimeUtc=[string]$old.supervisorStartTimeUtc;listenerPid=[int]$old.listenerPid;listenerStartTimeUtc=[string]$old.listenerStartTimeUtc;port=[int]$old.port};protectedRoles=@($contract.protectedRoles);health=$health;healthCount="$($health.Count)/$($health.Count)";servedBuild=[ordered]@{requiredBuildId=[string]$contract.servedBuild.requiredBuildId;requiredStatus=200;forbiddenBuildId=[string]$contract.servedBuild.forbiddenBuildId;forbiddenStatus=404};futureArtifactsPresent=$present;runtimeResidue=$residue;serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
