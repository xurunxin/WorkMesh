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
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_ORIGIN_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\rollback-execution-binding.json'
Import-Module $modulePath -Force

function Assert-ScriptBindings([pscustomobject]$Contract) {
  foreach ($property in $Contract.scripts.psobject.Properties) {
    $entry = $property.Value
    if ((Get-V31OriginSha256 (Join-Path $repoRoot ([string]$entry.path))) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_ORIGIN_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  }
}

function Assert-Protected([pscustomobject]$Contract) {
  foreach ($role in @($Contract.protectedRoles)) {
    Assert-V31OriginProcess ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle) | Out-Null
    if ((Get-V31OriginListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_ORIGIN_PROTECTED_LISTENER_DRIFT:$($role.name)" }
    $null = Wait-V31OriginHttp ([string]$role.healthUrl) @(200) 20
  }
  $null = Wait-V31OriginHttp ([string]$Contract.objectStorage.healthUrl) @(200) 20
  $candidateAsset = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($Contract.servedBuild.requiredBuildId)/_buildManifest.js" -TimeoutSec 3
  $rollbackAsset = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($Contract.servedBuild.forbiddenBuildId)/_buildManifest.js" -TimeoutSec 3
  if ([int]$candidateAsset.StatusCode -ne 200 -or [int]$rollbackAsset.StatusCode -ne 404) { throw 'DOGFOOD_V31_ORIGIN_BUILD_EXCLUSIVITY_DRIFT' }
}

function Assert-PublicOrigin([string]$ExpectedOrigin) {
  $response = Wait-V31OriginHttp 'http://127.0.0.1:3301/.well-known/workmesh-agent' @(200) 20
  $discovery = $response.Content | ConvertFrom-Json -DateKind String
  if ([string]$discovery.mcpUrl -cne "$ExpectedOrigin/mcp" -or [string]$discovery.wellKnownUrl -cne "$ExpectedOrigin/.well-known/workmesh-agent") { throw 'DOGFOOD_V31_ORIGIN_DISCOVERY_MISMATCH' }
  $mcp = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "$ExpectedOrigin/mcp" -TimeoutSec 3
  $expectedStatus = if ($ExpectedOrigin -eq 'http://127.0.0.1:3301') { 401 } else { 404 }
  if ([int]$mcp.StatusCode -ne $expectedStatus) { throw 'DOGFOOD_V31_ORIGIN_MCP_STATUS_MISMATCH' }
}

function Stop-Candidate([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.candidateApi.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { return [pscustomobject]@{status='absent'} }
  $state = Read-V31OriginJson $statePath
  if ($state.status -ne 'RUNNING') { return [pscustomobject]@{status='not_running'} }
  $stopPath = Join-Path $repoRoot ([string]$Contract.candidateApi.stopPath)
  $supervisorResult = Stop-V31OriginExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256,[string]$state.mode) $stopPath
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$Contract.candidateApi.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -eq 0) { return [pscustomobject]@{status='stopped';supervisor=$supervisorResult;listener='absent'} }
  if ($owners.Count -ne 1 -or [int]$owners[0] -ne [int]$state.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_CANDIDATE_LISTENER_REJECTED' }
  Stop-V31OriginExactTree ([int]$state.listenerPid) ([string]$state.listenerStartTimeUtc) @([string]$Contract.candidateApi.root,'src\server.ts') $stopPath | Out-Null
  [pscustomobject]@{status='stopped';supervisor=$supervisorResult;listener='stopped'}
}

function Discover-Old([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  $existing = Get-V31OriginProcessRecord ([int]$old.supervisorPid)
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$old.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($existing -and $owners.Count -eq 1 -and [int]$owners[0] -eq [int]$old.listenerPid) {
    Assert-V31OriginProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
    Assert-V31OriginProcess ([int]$old.listenerPid) ([string]$old.listenerStartTimeUtc) @([string]$old.root,'src\server.ts') | Out-Null
    return 'retained'
  }
  if (-not $existing -and $owners.Count -eq 0) { return 'missing' }
  'unknown'
}

function Start-RollbackApi([pscustomobject]$Contract, [string]$BindingSha) {
  $statePath = Join-Path $repoRoot ([string]$Contract.rollbackApi.statePath)
  $stopPath = Join-Path $repoRoot ([string]$Contract.rollbackApi.stopPath)
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stopPath -Force -ErrorAction SilentlyContinue
  $args = @('-Mode','rollback','-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',$BindingSha)
  Start-V31OriginSupervisor $supervisorPath $args $statePath ([int]$Contract.rollbackApi.port) ([string]$Contract.rollbackApi.healthUrl)
}

function Assert-RestoredApi([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  $oldProcess = Get-V31OriginProcessRecord ([int]$old.supervisorPid)
  if ($oldProcess) {
    Assert-V31OriginProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
    Assert-V31OriginProcess ([int]$old.listenerPid) ([string]$old.listenerStartTimeUtc) @([string]$old.root,'apps\api','server.ts') | Out-Null
    if ((Get-V31OriginListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_OLD_API_LISTENER_DRIFT' }
    return
  }
  $statePath = Join-Path $repoRoot ([string]$Contract.rollbackApi.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { throw 'DOGFOOD_V31_ORIGIN_ROLLBACK_STATE_MISSING' }
  $state = Read-V31OriginJson $statePath
  if ($state.status -ne 'RUNNING' -or $state.mode -ne 'rollback' -or $state.webOrigin -ne 'http://127.0.0.1:3300' -or $state.contractSha256 -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_ROLLBACK_STATE_INVALID' }
  Assert-V31OriginProcess ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256,'rollback') | Out-Null
  Assert-V31OriginProcess ([int]$state.listenerPid) ([string]$state.listenerStartTimeUtc) @([string]$Contract.rollbackApi.root,'src\server.ts') | Out-Null
  if ((Get-V31OriginListenerPid ([int]$Contract.rollbackApi.port)) -ne [int]$state.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_ROLLBACK_LISTENER_DRIFT' }
}

if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract)) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_PATH_REJECTED' }
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpOriginRoutingContract' -or $contract.selectorBinding -ne 'v31-public-mcp-origin-routing-v1') { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_INVALID' }
Assert-ScriptBindings $contract
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
Assert-Protected $contract
if ($DryRun) {
  Write-V31OriginJson (Join-Path $evidence 'rollback-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginRollbackDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
$expectedActivation = Join-Path $repoRoot ([string]$contract.execution.activationPath)
if ([string]::IsNullOrWhiteSpace($ActivationPath) -or [string]::IsNullOrWhiteSpace($ActivationSha256) -or (Get-V31OriginFullPath $ActivationPath) -cne (Get-V31OriginFullPath $expectedActivation) -or (Get-V31OriginSha256 $ActivationPath) -cne $ActivationSha256) { throw 'DOGFOOD_V31_ORIGIN_ACTIVATION_BINDING_REJECTED' }
$activation = Read-V31OriginJson $ActivationPath
if ($activation.kind -ne 'DogfoodV31PublicMcpOriginRoutingActivation' -or $activation.contractSha256 -cne $ContractSha256 -or $activation.result -ne 'PASS') { throw 'DOGFOOD_V31_ORIGIN_ACTIVATION_INVALID' }
$self = Get-Process -Id $PID -ErrorAction Stop
$binding = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=[string]$activation.gateSha256;requestSha256=[string]$activation.requestSha256;approvalSha256=[string]$activation.approvalSha256;authorizingScript='rollback-public-origin.ps1';authorizingStartPid=$PID;authorizingStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');createdAt=[DateTimeOffset]::UtcNow.ToString('O')}
Write-V31OriginJson $bindingPath $binding
$bindingSha = Get-V31OriginSha256 $bindingPath
$rollbackPath = Join-Path $repoRoot ([string]$contract.execution.rollbackPath)
$args = @{
  PrimaryError = 'explicit_rollback'
  StopCandidate = { Stop-Candidate $contract }
  DiscoverOldOwner = { Discover-Old $contract }
  RestoreOldOwner = { Start-RollbackApi $contract $bindingSha }
  VerifyRestoredRuntime = { Assert-Protected $contract; Assert-RestoredApi $contract; $null = Wait-V31OriginHttp ([string]$contract.rollbackApi.healthUrl) @(200) 20; Assert-PublicOrigin 'http://127.0.0.1:3300' }
  WriteTerminalReceipt = { param([object]$Receipt) $Receipt['contractSha256']=$ContractSha256; $Receipt['activationSha256']=$ActivationSha256; Write-V31OriginJson $rollbackPath $Receipt }
}
$null = Invoke-V31PublicOriginCompensation @args
