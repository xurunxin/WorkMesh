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
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_ORIGIN_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$activeRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\execution-binding.json'
Import-Module $modulePath -Force

function Assert-Gate([pscustomobject]$Contract) {
  $gatePath = Join-Path $repoRoot ([string]$Contract.execution.gatePath)
  if (-not (Test-Path -LiteralPath $gatePath)) { throw 'DOGFOOD_V31_ORIGIN_GATE_MISSING' }
  $gateText = Get-Content -Raw -LiteralPath $gatePath
  $pattern = '(?ms)^GateReport:\s*$.*?^  result:\s*PASS\s*$.*?^  transition:\s*$.*?^    allowed:\s*true\s*$.*?^    scope:\s*request_creation_only\s*$'
  if (-not [regex]::IsMatch($gateText,$pattern)) { throw 'DOGFOOD_V31_ORIGIN_GATE_NOT_AUTHORIZING' }
  Get-V31OriginSha256 $gatePath
}

function Assert-Authorization([pscustomobject]$Contract) {
  if ([string]::IsNullOrWhiteSpace($RequestPath) -or [string]::IsNullOrWhiteSpace($ApprovalPath) -or [string]::IsNullOrWhiteSpace($RequestSha256) -or [string]::IsNullOrWhiteSpace($ApprovalSha256)) { throw 'DOGFOOD_V31_ORIGIN_AUTH_ARGUMENT_MISSING' }
  $expectedRequest = Join-Path $repoRoot ([string]$Contract.execution.requestPath)
  $expectedApproval = Join-Path $repoRoot ([string]$Contract.execution.approvalPath)
  if ((Get-V31OriginFullPath $RequestPath) -cne (Get-V31OriginFullPath $expectedRequest) -or (Get-V31OriginFullPath $ApprovalPath) -cne (Get-V31OriginFullPath $expectedApproval)) { throw 'DOGFOOD_V31_ORIGIN_AUTH_PATH_REJECTED' }
  if ((Get-V31OriginSha256 $RequestPath) -cne $RequestSha256 -or (Get-V31OriginSha256 $ApprovalPath) -cne $ApprovalSha256) { throw 'DOGFOOD_V31_ORIGIN_AUTH_SHA_MISMATCH' }
  $request = Read-V31OriginJson $RequestPath
  $approval = Read-V31OriginJson $ApprovalPath
  $gateSha = Assert-Gate $Contract
  if ($request.kind -ne 'DogfoodV31PublicMcpOriginRoutingRequest' -or $request.selectorBinding -ne $Contract.selectorBinding -or $request.contractSha256 -cne $ContractSha256 -or $request.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_ORIGIN_REQUEST_INVALID' }
  if ([DateTimeOffset]::Parse([string]$request.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_ORIGIN_REQUEST_EXPIRED' }
  if ($approval.kind -ne 'DogfoodV31PublicMcpOriginRoutingApproval' -or $approval.decision -ne 'approved' -or $approval.selectorBinding -ne $Contract.selectorBinding -or $approval.requestSha256 -cne $RequestSha256 -or $approval.contractSha256 -cne $ContractSha256 -or $approval.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_ORIGIN_APPROVAL_INVALID' }
  if ([DateTimeOffset]::Parse([string]$approval.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_ORIGIN_APPROVAL_EXPIRED' }
  if (Test-Path -LiteralPath (Join-Path $repoRoot ([string]$Contract.execution.activationPath))) { throw 'DOGFOOD_V31_ORIGIN_ACTIVATION_ALREADY_EXISTS' }
  if (Test-Path -LiteralPath (Join-Path $repoRoot ([string]$Contract.execution.rollbackPath))) { throw 'DOGFOOD_V31_ORIGIN_ROLLBACK_ALREADY_EXISTS' }
  [ordered]@{gateSha256=$gateSha;requestSha256=$RequestSha256;approvalSha256=$ApprovalSha256}
}

function Assert-ScriptBindings([pscustomobject]$Contract) {
  foreach ($property in $Contract.scripts.psobject.Properties) {
    $entry = $property.Value
    $path = Join-Path $repoRoot ([string]$entry.path)
    if ((Get-V31OriginSha256 $path) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_ORIGIN_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  }
}

function Assert-Protected([pscustomobject]$Contract) {
  foreach ($role in @($Contract.protectedRoles)) {
    Assert-V31OriginProcess ([int]$role.pid) ([string]$role.startTimeUtc) @([string]$role.commandNeedle) | Out-Null
    if ((Get-V31OriginListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_ORIGIN_PROTECTED_LISTENER_DRIFT:$($role.name)" }
    $null = Wait-V31OriginHttp ([string]$role.healthUrl) @(200) 20
  }
  $null = Wait-V31OriginHttp ([string]$Contract.objectStorage.healthUrl) @(200) 20
  $container = docker inspect ([string]$Contract.objectStorage.containerId) --format '{{.Id}}|{{.Image}}|{{.Name}}' 2>$null
  $expected = "$($Contract.objectStorage.containerId)|$($Contract.objectStorage.imageDigest)|/$($Contract.objectStorage.name)"
  if ([string]$container -cne $expected) { throw 'DOGFOOD_V31_ORIGIN_OBJECT_STORAGE_DRIFT' }
  $candidateAsset = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($Contract.servedBuild.requiredBuildId)/_buildManifest.js" -TimeoutSec 3
  $rollbackAsset = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:3300/_next/static/$($Contract.servedBuild.forbiddenBuildId)/_buildManifest.js" -TimeoutSec 3
  if ([int]$candidateAsset.StatusCode -ne 200 -or [int]$rollbackAsset.StatusCode -ne 404) { throw 'DOGFOOD_V31_ORIGIN_BUILD_EXCLUSIVITY_DRIFT' }
}

function Assert-PublicOrigin([string]$ExpectedOrigin) {
  $discoveryResponse = Wait-V31OriginHttp 'http://127.0.0.1:3301/.well-known/workmesh-agent' @(200) 20
  $discovery = $discoveryResponse.Content | ConvertFrom-Json -DateKind String
  $expectedMcp = "$ExpectedOrigin/mcp"
  $expectedWellKnown = "$ExpectedOrigin/.well-known/workmesh-agent"
  if ([string]$discovery.mcpUrl -cne $expectedMcp -or [string]$discovery.wellKnownUrl -cne $expectedWellKnown) { throw 'DOGFOOD_V31_ORIGIN_DISCOVERY_MISMATCH' }
  $mcp = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $expectedMcp -TimeoutSec 3
  $expectedStatus = if ($ExpectedOrigin -eq 'http://127.0.0.1:3301') { 401 } else { 404 }
  if ([int]$mcp.StatusCode -ne $expectedStatus) { throw "DOGFOOD_V31_ORIGIN_MCP_STATUS_MISMATCH:$($mcp.StatusCode)" }
  [pscustomobject]@{origin=$ExpectedOrigin;discoveryStatus=200;mcpStatus=$expectedStatus;mcpUrl=$expectedMcp;wellKnownUrl=$expectedWellKnown}
}

function Assert-OldApi([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  Assert-V31OriginProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) | Out-Null
  if ((Get-V31OriginListenerPid ([int]$old.port)) -ne [int]$old.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_OLD_API_LISTENER_DRIFT' }
  $null = Wait-V31OriginHttp ([string]$old.healthUrl) @(200) 20
}

function Start-BoundApi([pscustomobject]$Contract, [string]$Mode, [string]$BindingSha, [string]$StatePath, [string]$StopPath) {
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $StopPath -Force -ErrorAction SilentlyContinue
  $args = @('-Mode',$Mode,'-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$StatePath,'-StopPath',$StopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',$BindingSha)
  Start-V31OriginSupervisor $supervisorPath $args $StatePath ([int]$Contract.candidateApi.port) ([string]$Contract.candidateApi.healthUrl)
}

function Stop-CandidateIfPresent([pscustomobject]$Contract) {
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

function Get-OldOwnerDecision([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  $existing = Get-V31OriginProcessRecord ([int]$old.supervisorPid)
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort ([int]$old.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($existing -and $owners.Count -eq 1 -and [int]$owners[0] -eq [int]$old.listenerPid) {
    Assert-OldApi $Contract
    return 'retained'
  }
  if (-not $existing -and $owners.Count -eq 0) { return 'missing' }
  'unknown'
}

function Assert-RestoredApi([pscustomobject]$Contract) {
  $old = $Contract.oldApi
  $oldProcess = Get-V31OriginProcessRecord ([int]$old.supervisorPid)
  if ($oldProcess) { Assert-OldApi $Contract; return }
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
Assert-OldApi $contract
$beforeOrigin = Assert-PublicOrigin 'http://127.0.0.1:3300'
if ($DryRun) {
  Write-V31OriginJson (Join-Path $evidence 'start-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginStartDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;oldApiPid=[int]$contract.oldApi.supervisorPid;oldOrigin=$beforeOrigin;candidateOrigin='http://127.0.0.1:3301';protectedRoles=@($contract.protectedRoles.name);checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
$auth = Assert-Authorization $contract
$authorizingStart = Get-Process -Id $PID -ErrorAction Stop
$binding = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;authorizingScript='start-public-origin.ps1';authorizingStartPid=$PID;authorizingStartTimeUtc=$authorizingStart.StartTime.ToUniversalTime().ToString('O');createdAt=[DateTimeOffset]::UtcNow.ToString('O')}
Write-V31OriginJson $bindingPath $binding
$bindingSha = Get-V31OriginSha256 $bindingPath
$mutationStarted = [bool]0
try {
  $old = $contract.oldApi
  $mutationStarted = [bool]1
  Stop-V31OriginExactTree ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.scriptPath,[string]$old.contractPath,[string]$old.statePath) (Join-Path $activeRoot ([string]$old.stopPath)) | Out-Null
  $candidateState = Join-Path $repoRoot ([string]$contract.candidateApi.statePath)
  $candidateStop = Join-Path $repoRoot ([string]$contract.candidateApi.stopPath)
  $api = Start-BoundApi $contract 'candidate' $bindingSha $candidateState $candidateStop
  Assert-Protected $contract
  $origin = Assert-PublicOrigin 'http://127.0.0.1:3301'
  $activationPath = Join-Path $repoRoot ([string]$contract.execution.activationPath)
  Write-V31OriginJson $activationPath ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginRoutingActivation';result='PASS';status='ACTIVE_PENDING_REPLACEMENT_HUMAN_ACCEPTANCE';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;api=$api;publicOrigin=$origin;protectedRoles=@($contract.protectedRoles);rollbackReady=[bool]1;completedAt=[DateTimeOffset]::UtcNow.ToString('O');securityScanRun=[bool]0})
} catch {
  $primary = $_.Exception.Message
  $rollbackPath = Join-Path $repoRoot ([string]$contract.execution.rollbackPath)
  $rollbackState = Join-Path $repoRoot ([string]$contract.rollbackApi.statePath)
  $rollbackStop = Join-Path $repoRoot ([string]$contract.rollbackApi.stopPath)
  $compensationArgs = @{
    PrimaryError = $primary
    StopCandidate = { Stop-CandidateIfPresent $contract }
    DiscoverOldOwner = { Get-OldOwnerDecision $contract }
    RestoreOldOwner = { Start-BoundApi $contract 'rollback' $bindingSha $rollbackState $rollbackStop }
    VerifyRestoredRuntime = { Assert-Protected $contract; Assert-RestoredApi $contract; $null = Wait-V31OriginHttp ([string]$contract.oldApi.healthUrl) @(200) 20; $null = Assert-PublicOrigin 'http://127.0.0.1:3300' }
    WriteTerminalReceipt = { param([object]$Receipt) if ($mutationStarted) { $Receipt['contractSha256']=$ContractSha256; Write-V31OriginJson $rollbackPath $Receipt } }
  }
  $null = Invoke-V31PublicOriginCompensation @compensationArgs
  throw "DOGFOOD_V31_ORIGIN_ACTIVATION_FAILED:$primary"
}
