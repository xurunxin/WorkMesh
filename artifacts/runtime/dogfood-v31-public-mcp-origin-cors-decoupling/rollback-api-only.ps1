param(
  [switch]$DryRun,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [string]$ActivationPath,
  [string]$ActivationSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling-activation-contract.json'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\rollback-execution-binding.json'
Import-Module $modulePath -Force

function Assert-ScriptBindings([pscustomobject]$Contract) {
  foreach ($property in $Contract.scripts.psobject.Properties) {
    $entry = $property.Value
    if ((Get-V31OriginSha256 (Join-Path $repoRoot ([string]$entry.path))) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_CORS_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  }
}
function Assert-Protected([pscustomobject]$Contract) {
  foreach ($role in @($Contract.protectedRoles)) {
    Assert-V31OriginProcess ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle) | Out-Null
    if ((Get-V31OriginListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw 'DOGFOOD_V31_CORS_PROTECTED_LISTENER_DRIFT' }
    $null = Wait-V31OriginHttp ([string]$role.healthUrl) @(200) 20
  }
  $null = Wait-V31OriginHttp ([string]$Contract.objectStorage.healthUrl) @(200) 20
}
function Assert-OriginContract([string]$ExpectedCorsOrigin) {
  $cors = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Options -Uri 'http://127.0.0.1:3303/api/v1/auth/me' -Headers @{Origin=$ExpectedCorsOrigin;'Access-Control-Request-Method'='GET'} -TimeoutSec 3
  $allowOrigin = @($cors.Headers['Access-Control-Allow-Origin'])[0]
  if ([int]$cors.StatusCode -ne 204 -or [string]$allowOrigin -cne $ExpectedCorsOrigin) { throw 'DOGFOOD_V31_CORS_BROWSER_ORIGIN_MISMATCH' }
  $response = Wait-V31OriginHttp 'http://127.0.0.1:3301/.well-known/workmesh-agent' @(200) 20
  $discovery = $response.Content | ConvertFrom-Json -DateKind String
  $mcp = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3301/mcp' -TimeoutSec 3
  if ([string]$discovery.mcpUrl -cne 'http://127.0.0.1:3301/mcp' -or [int]$mcp.StatusCode -ne 401) { throw 'DOGFOOD_V31_CORS_PUBLIC_ENDPOINT_MISMATCH' }
}
function Stop-Candidate([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.candidateApi.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { return [pscustomobject]@{status='absent'} }
  $state = Read-V31OriginJson $statePath
  if ($state.status -ne 'RUNNING') { return [pscustomobject]@{status='not_running'} }
  $stopPath = Join-Path $repoRoot ([string]$Contract.candidateApi.stopPath)
  $result = Stop-V31OriginExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256,'candidate') $stopPath
  [pscustomobject]@{status='stopped';supervisor=$result}
}
function Discover-Old([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  $existing = Get-V31OriginProcessRecord ([int]$old.supervisorPid)
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$old.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($existing -and $owners.Count -eq 1 -and [int]$owners[0] -eq [int]$old.listenerPid) { return 'retained' }
  if (-not $existing -and $owners.Count -eq 0) { return 'missing' }
  'unknown'
}
function Start-Rollback([pscustomobject]$Contract, [string]$BindingSha) {
  $statePath = Join-Path $repoRoot ([string]$Contract.rollbackApi.statePath)
  $stopPath = Join-Path $repoRoot ([string]$Contract.rollbackApi.stopPath)
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $args = @('-Mode','rollback','-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',$BindingSha)
  Start-V31OriginSupervisor $supervisorPath $args $statePath ([int]$Contract.rollbackApi.port) ([string]$Contract.rollbackApi.healthUrl)
}

if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract) -or (Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_CORS_CONTRACT_REJECTED' }
$contract = Read-V31OriginJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpOriginCorsDecouplingActivationContract' -or $contract.selectorBinding -ne 'v31-public-mcp-origin-cors-decoupling-v1') { throw 'DOGFOOD_V31_CORS_CONTRACT_INVALID' }
Assert-ScriptBindings $contract
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
Assert-Protected $contract
if ($DryRun) {
  Write-V31OriginJson (Join-Path $evidence 'rollback-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingRollbackDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
$expectedActivation = Join-Path $repoRoot ([string]$contract.execution.activationPath)
if ([string]::IsNullOrWhiteSpace($ActivationPath) -or [string]::IsNullOrWhiteSpace($ActivationSha256) -or (Get-V31OriginFullPath $ActivationPath) -cne (Get-V31OriginFullPath $expectedActivation) -or (Get-V31OriginSha256 $ActivationPath) -cne $ActivationSha256) { throw 'DOGFOOD_V31_CORS_ACTIVATION_BINDING_REJECTED' }
$activation = Read-V31OriginJson $ActivationPath
if ($activation.kind -ne 'DogfoodV31PublicMcpOriginCorsDecouplingActivation' -or $activation.contractSha256 -cne $ContractSha256 -or $activation.result -ne 'PASS') { throw 'DOGFOOD_V31_CORS_ACTIVATION_INVALID' }
$self = Get-Process -Id $PID -ErrorAction Stop
$binding = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=[string]$activation.gateSha256;requestSha256=[string]$activation.requestSha256;approvalSha256=[string]$activation.approvalSha256;authorizingScript='rollback-api-only.ps1';authorizingStartPid=$PID;authorizingStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');preparedSourceSha256=[string]$activation.preparedSourceSha256;createdAt=[DateTimeOffset]::UtcNow.ToString('O')}
Write-V31OriginJson $bindingPath $binding
$bindingSha = Get-V31OriginSha256 $bindingPath
$rollbackPath = Join-Path $repoRoot ([string]$contract.execution.rollbackPath)
$args = @{
  PrimaryError = 'explicit_rollback'
  StopCandidate = { Stop-Candidate $contract }
  DiscoverOldOwner = { Discover-Old $contract }
  RestoreOldOwner = { Start-Rollback $contract $bindingSha }
  VerifyRestoredRuntime = { Assert-Protected $contract; $null = Wait-V31OriginHttp ([string]$contract.rollbackApi.healthUrl) @(200) 20; Assert-OriginContract 'http://127.0.0.1:3301' }
  WriteTerminalReceipt = { param([object]$Receipt) $Receipt['contractSha256']=$ContractSha256; $Receipt['activationSha256']=$ActivationSha256; Write-V31OriginJson $rollbackPath $Receipt }
}
$null = Invoke-V31PublicOriginCompensation @args
