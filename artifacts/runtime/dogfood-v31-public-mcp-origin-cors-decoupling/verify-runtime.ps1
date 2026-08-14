param(
  [Parameter(Mandatory=$true)][ValidateSet('before','after')][string]$Label,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling-activation-contract.json'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract) -or (Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_CORS_CONTRACT_REJECTED' }
$contract = Read-V31OriginJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpOriginCorsDecouplingActivationContract') { throw 'DOGFOOD_V31_CORS_CONTRACT_INVALID' }
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
$runtime = @()
$old = $contract.oldApi
$oldProcess = Assert-V31OriginProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath)
if ((Get-V31OriginListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw 'DOGFOOD_V31_CORS_OLD_API_LISTENER_DRIFT' }
$oldListener = Assert-V31OriginProcess ([int]$old.listenerPid) ([string]$old.listenerStartTimeUtc) @([string]$old.root,'src\server.ts')
$null = Wait-V31OriginHttp ([string]$old.healthUrl) @(200) 20
$runtime += [pscustomobject]@{name='api';supervisorPid=[int]$old.supervisorPid;supervisorStartTimeUtc=$oldProcess.startTimeUtc;listenerPid=[int]$old.listenerPid;listenerStartTimeUtc=$oldListener.startTimeUtc;port=[int]$old.port;health=200}
foreach ($role in @($contract.protectedRoles)) {
  $supervisor = Assert-V31OriginProcess ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle)
  if ((Get-V31OriginListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_CORS_PROTECTED_LISTENER_DRIFT:$($role.name)" }
  $listener = Assert-V31OriginProcess ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) @([string]$role.listenerCommandNeedle)
  $null = Wait-V31OriginHttp ([string]$role.healthUrl) @(200) 20
  $runtime += [pscustomobject]@{name=[string]$role.name;supervisorPid=[int]$role.pid;supervisorStartTimeUtc=$supervisor.startTimeUtc;listenerPid=[int]$role.listenerPid;listenerStartTimeUtc=$listener.startTimeUtc;port=[int]$role.port;health=200}
}
$null = Wait-V31OriginHttp ([string]$contract.objectStorage.healthUrl) @(200) 20
$cors = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Options -Uri 'http://127.0.0.1:3303/api/v1/auth/me' -Headers @{Origin='http://127.0.0.1:3301';'Access-Control-Request-Method'='GET'} -TimeoutSec 3
$allowOrigin = @($cors.Headers['Access-Control-Allow-Origin'])[0]
if ([int]$cors.StatusCode -ne 204 -or [string]$allowOrigin -cne 'http://127.0.0.1:3301') { throw 'DOGFOOD_V31_CORS_ACTIVE_PRECONDITION_DRIFT' }
$future = @($contract.execution.requestPath,$contract.execution.approvalPath,$contract.execution.activationPath,$contract.execution.rollbackPath,$contract.execution.preparedSourcePath)
$present = @($future | Where-Object { Test-Path -LiteralPath (Join-Path $repoRoot ([string]$_)) })
if ($present.Count -ne 0) { throw "DOGFOOD_V31_CORS_FUTURE_ARTIFACT_PRESENT:$($present -join ',')" }
$result = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingRuntimeInvariance';result='PASS';label=$Label;contractSha256=$ContractSha256;runtime=$runtime;health='7/7';activeCorsOrigin=[string]$allowOrigin;futureArtifactsPresent=@($present);checkedAt=[DateTimeOffset]::UtcNow.ToString('O')}
Write-V31OriginJson (Join-Path $evidence "runtime-$Label.json") $result
