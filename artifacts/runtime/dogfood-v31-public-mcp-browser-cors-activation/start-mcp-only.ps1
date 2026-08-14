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
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_MCP_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$activeRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\execution-binding.json'
Import-Module $modulePath -Force

function Assert-ScriptBindings([pscustomobject]$Contract) {
  foreach ($property in $Contract.scripts.psobject.Properties) {
    $entry = $property.Value
    if ((Get-V31McpSha256 (Join-Path $repoRoot ([string]$entry.path))) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_MCP_CORS_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  }
}

function Assert-ProtectedRuntime([pscustomobject]$Contract) {
  foreach ($role in @($Contract.protectedRoles)) {
    Assert-V31McpProcess ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) @([string]$role.supervisorNeedle) | Out-Null
    Assert-V31McpProcess ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) @([string]$role.listenerNeedle) | Out-Null
    if ((Get-V31McpListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_MCP_CORS_PROTECTED_LISTENER_DRIFT:$($role.name)" }
    $null = Wait-V31McpHttp ([string]$role.healthUrl) @(200) 20
  }
  $null = Wait-V31McpHttp ([string]$Contract.objectStorage.healthUrl) @(200) 20
  $container = docker inspect ([string]$Contract.objectStorage.name) --format '{{.Id}}|{{.Image}}|{{.Name}}' 2>$null
  $expected = "$($Contract.objectStorage.id)|$($Contract.objectStorage.image)|/$($Contract.objectStorage.name)"
  if ([string]$container -cne $expected) { throw 'DOGFOOD_V31_MCP_CORS_OBJECT_STORAGE_DRIFT' }
}

function Assert-OldMcp([pscustomobject]$Contract) {
  $old = $Contract.oldMcp
  Assert-V31McpProcess ([int]$old.supervisorPid) ([string]$old.supervisorStartTimeUtc) @([string]$old.supervisorScript,[string]$old.contractPath,[string]$old.statePath) | Out-Null
  Assert-V31McpProcess ([int]$old.listenerPid) ([string]$old.listenerStartTimeUtc) @([string]$old.entrypointPath,[string]$old.root) | Out-Null
  if ((Get-V31McpListenerPid 3302) -ne [int]$old.listenerPid) { throw 'DOGFOOD_V31_MCP_CORS_OLD_LISTENER_DRIFT' }
  $null = Wait-V31McpHttp ([string]$old.healthUrl) @(200) 20
}

function Assert-Authorization([pscustomobject]$Contract) {
  if ([string]::IsNullOrWhiteSpace($RequestPath) -or [string]::IsNullOrWhiteSpace($RequestSha256) -or [string]::IsNullOrWhiteSpace($ApprovalPath) -or [string]::IsNullOrWhiteSpace($ApprovalSha256)) { throw 'DOGFOOD_V31_MCP_CORS_AUTH_ARGUMENT_MISSING' }
  $expectedGate = Join-Path $repoRoot ([string]$Contract.execution.gatePath)
  $expectedRequest = Join-Path $repoRoot ([string]$Contract.execution.requestPath)
  $expectedApproval = Join-Path $repoRoot ([string]$Contract.execution.approvalPath)
  if ((Get-V31McpFullPath $RequestPath) -cne (Get-V31McpFullPath $expectedRequest) -or (Get-V31McpFullPath $ApprovalPath) -cne (Get-V31McpFullPath $expectedApproval)) { throw 'DOGFOOD_V31_MCP_CORS_AUTH_PATH_REJECTED' }
  if ((Get-V31McpSha256 $RequestPath) -cne $RequestSha256 -or (Get-V31McpSha256 $ApprovalPath) -cne $ApprovalSha256) { throw 'DOGFOOD_V31_MCP_CORS_AUTH_SHA_REJECTED' }
  $gate = Read-V31McpGateReport $expectedGate
  if ($gate.result -ne 'PASS' -or -not $gate.allowed -or $gate.scope -ne 'request_creation_only') { throw 'DOGFOOD_V31_MCP_CORS_GATE_INVALID' }
  $gateSha = Get-V31McpSha256 $expectedGate
  $request = Read-V31McpJson $RequestPath
  $approval = Read-V31McpJson $ApprovalPath
  if ($request.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivationRequest' -or $request.selectorBinding -ne $Contract.selectorBinding -or $request.scope -ne 'v31_mcp_browser_cors_activation_once' -or $request.contractSha256 -cne $ContractSha256 -or $request.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_MCP_CORS_REQUEST_INVALID' }
  if ([DateTimeOffset]::Parse([string]$request.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_MCP_CORS_REQUEST_EXPIRED' }
  if ($approval.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivationApproval' -or $approval.decision -ne 'approved' -or $approval.selectorBinding -ne $Contract.selectorBinding -or $approval.scope -ne $request.scope -or $approval.requestSha256 -cne $RequestSha256 -or $approval.contractSha256 -cne $ContractSha256 -or $approval.gateSha256 -cne $gateSha) { throw 'DOGFOOD_V31_MCP_CORS_APPROVAL_INVALID' }
  if ([DateTimeOffset]::Parse([string]$approval.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_MCP_CORS_APPROVAL_EXPIRED' }
  if (Test-Path -LiteralPath (Join-Path $repoRoot ([string]$Contract.execution.activationPath))) { throw 'DOGFOOD_V31_MCP_CORS_ACTIVATION_ALREADY_EXISTS' }
  if (Test-Path -LiteralPath (Join-Path $repoRoot ([string]$Contract.execution.rollbackPath))) { throw 'DOGFOOD_V31_MCP_CORS_ROLLBACK_ALREADY_EXISTS' }
  [ordered]@{gateSha256=$gateSha;requestSha256=$RequestSha256;approvalSha256=$ApprovalSha256}
}

function Start-CandidateMcp([pscustomobject]$Contract, [string]$BindingSha) {
  $statePath = Join-Path $repoRoot ([string]$Contract.candidateMcp.statePath)
  $stopPath = Join-Path $repoRoot ([string]$Contract.candidateMcp.stopPath)
  Remove-Item -LiteralPath $statePath,$stopPath -Force -ErrorAction SilentlyContinue
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $arguments = @('-NoLogo','-NoProfile','-NonInteractive','-File',$supervisorPath,'-Mode','candidate','-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',$BindingSha)
  $launcher = Start-Process -FilePath $pwsh -ArgumentList $arguments -WindowStyle Hidden -PassThru
  foreach ($attempt in 1..160) {
    if (Test-Path -LiteralPath $statePath) {
      try {
        $state = Read-V31McpJson $statePath
        if ($state.status -eq 'RUNNING' -and [int]$state.port -eq 3302 -and $state.browserOrigin -eq 'http://127.0.0.1:3300') {
          $null = Wait-V31McpHttp 'http://127.0.0.1:3302/readyz' @(200) 20
          if ((Get-V31McpListenerPid 3302) -ne [int]$state.listenerPid) { throw 'DOGFOOD_V31_MCP_CORS_CANDIDATE_LISTENER_DRIFT' }
          return $state
        }
      } catch {}
    }
    if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) { throw 'DOGFOOD_V31_MCP_CORS_CANDIDATE_SUPERVISOR_EXITED' }
    Start-Sleep -Milliseconds 250
  }
  throw 'DOGFOOD_V31_MCP_CORS_CANDIDATE_START_TIMEOUT'
}

function Stop-CandidateIfPresent([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.candidateMcp.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { return [pscustomobject]@{status='absent'} }
  $state = Read-V31McpJson $statePath
  if ($state.status -ne 'RUNNING') { return [pscustomobject]@{status='not_running'} }
  $stopPath = Join-Path $repoRoot ([string]$Contract.candidateMcp.stopPath)
  Stop-V31McpExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256) $stopPath
}

function Get-OldMcpDecision([pscustomobject]$Contract) {
  $old = $Contract.oldMcp
  $existing = Get-V31McpProcessRecord ([int]$old.supervisorPid)
  [int[]]$owners = @(Get-NetTCPConnection -State Listen -LocalPort 3302 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  $decision = Resolve-V31McpOldOwnerDecision ([bool]($null -ne $existing)) $owners ([int]$old.listenerPid)
  if ($decision -eq 'retained') { Assert-OldMcp $Contract }
  $decision
}

function Start-OldMcp([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.rollbackMcp.statePath)
  $stopPath = Join-Path $repoRoot ([string]$Contract.rollbackMcp.stopPath)
  Remove-Item -LiteralPath $statePath,$stopPath -Force -ErrorAction SilentlyContinue
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $arguments = @('-NoLogo','-NoProfile','-NonInteractive','-File',$supervisorPath,'-Mode','rollback','-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',(Get-V31McpSha256 $bindingPath))
  $launcher = Start-Process -FilePath $pwsh -ArgumentList $arguments -WindowStyle Hidden -PassThru
  foreach ($attempt in 1..160) {
    if (Test-Path -LiteralPath $statePath) {
      try {
        $state = Read-V31McpJson $statePath
        if ($state.status -eq 'RUNNING' -and [int]$state.port -eq 3302) { $null = Wait-V31McpHttp ([string]$Contract.oldMcp.healthUrl) @(200) 20; return $state }
      } catch {}
    }
    if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) { throw 'DOGFOOD_V31_MCP_CORS_OLD_SUPERVISOR_EXITED' }
    Start-Sleep -Milliseconds 250
  }
  throw 'DOGFOOD_V31_MCP_CORS_OLD_START_TIMEOUT'
}

function Assert-CandidateCors {
  $headers = @{Origin='http://127.0.0.1:3300'}
  $get = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3301/mcp' -Headers $headers -TimeoutSec 4
  $options = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Method Options -Uri 'http://127.0.0.1:3301/mcp' -Headers @{Origin='http://127.0.0.1:3300';'Access-Control-Request-Method'='GET'} -TimeoutSec 4
  if ([int]$get.StatusCode -ne 401 -or [string]@($get.Headers['Access-Control-Allow-Origin'])[0] -cne 'http://127.0.0.1:3300' -or [string]@($get.Headers['Vary'])[0] -notmatch 'Origin') { throw 'DOGFOOD_V31_MCP_CORS_GET_CONTRACT_FAILED' }
  if ([int]$options.StatusCode -ne 204 -or [string]@($options.Headers['Access-Control-Allow-Origin'])[0] -cne 'http://127.0.0.1:3300') { throw 'DOGFOOD_V31_MCP_CORS_PREFLIGHT_CONTRACT_FAILED' }
  [pscustomobject]@{getStatus=401;optionsStatus=204;allowOrigin='http://127.0.0.1:3300';vary='Origin'}
}

if ((Get-V31McpFullPath $ContractPath) -cne (Get-V31McpFullPath $expectedContract) -or (Get-V31McpSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_MCP_CORS_CONTRACT_REJECTED' }
$contract = Read-V31McpJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivationContract' -or $contract.selectorBinding -ne 'v31-public-mcp-browser-cors-activation-v1') { throw 'DOGFOOD_V31_MCP_CORS_CONTRACT_INVALID' }
Assert-ScriptBindings $contract
$allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31McpEvidenceRoot $EvidenceRoot $allowed
Assert-ProtectedRuntime $contract
Assert-OldMcp $contract
if ($DryRun) {
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $statePath = Join-Path $repoRoot ([string]$contract.candidateMcp.statePath)
  $stopPath = Join-Path $repoRoot ([string]$contract.candidateMcp.stopPath)
  & $pwsh -NoLogo -NoProfile -NonInteractive -File $supervisorPath -DryRun -Mode candidate -ContractPath $ContractPath -ContractSha256 $ContractSha256 -StatePath $statePath -StopPath $stopPath -EvidenceRoot $EvidenceRoot
  if ($LASTEXITCODE -ne 0) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_DRY_RUN_FAILED' }
  Write-V31McpJson (Join-Path $evidence 'start-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsStartDryRun';result='PASS';targetMutationExecuted=[bool]0;oldSupervisorPid=[int]$contract.oldMcp.supervisorPid;oldListenerPid=[int]$contract.oldMcp.listenerPid;protectedRoles=@($contract.protectedRoles.name);checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}

$auth = Assert-Authorization $contract
$self = Get-Process -Id $PID -ErrorAction Stop
$binding = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;allowedRole='mcp';allowedModes=@('candidate','rollback');authorizingPid=$PID;authorizingStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');createdAt=[DateTimeOffset]::UtcNow.ToString('O');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(10).ToString('O')}
Write-V31McpJson $bindingPath $binding
$bindingSha = Get-V31McpSha256 $bindingPath
$mutationStarted = [bool]0
try {
  $mutationStarted = [bool]1
  Stop-V31McpExactTree ([int]$contract.oldMcp.supervisorPid) ([string]$contract.oldMcp.supervisorStartTimeUtc) @([string]$contract.oldMcp.supervisorScript,[string]$contract.oldMcp.contractPath,[string]$contract.oldMcp.statePath) ([string]$contract.oldMcp.stopPath) | Out-Null
  $candidate = Start-CandidateMcp $contract $bindingSha
  Assert-ProtectedRuntime $contract
  $cors = Assert-CandidateCors
  $activationPath = Join-Path $repoRoot ([string]$contract.execution.activationPath)
  Write-V31McpJson $activationPath ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsActivation';result='PASS';status='ACTIVE_PENDING_REPLACEMENT_HUMAN_ACCEPTANCE';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=$auth.gateSha256;requestSha256=$auth.requestSha256;approvalSha256=$auth.approvalSha256;candidate=$candidate;cors=$cors;rollbackReady=[bool]1;completedAt=[DateTimeOffset]::UtcNow.ToString('O');securityScanRun=[bool]0})
} catch {
  $primary = $_.Exception.Message
  if (-not $mutationStarted) { throw }
  $rollbackPath = Join-Path $repoRoot ([string]$contract.execution.rollbackPath)
  $args = @{
    PrimaryError = $primary
    StopCandidate = { Stop-CandidateIfPresent $contract }
    DiscoverOldOwner = { Get-OldMcpDecision $contract }
    RestoreOldOwner = { Start-OldMcp $contract }
    VerifyRestoredRuntime = { Assert-ProtectedRuntime $contract; $null = Wait-V31McpHttp ([string]$contract.oldMcp.healthUrl) @(200) 20 }
    WriteTerminalReceipt = { param([object]$Receipt) $Receipt['contractSha256']=$ContractSha256; Write-V31McpJson $rollbackPath $Receipt }
  }
  $null = Invoke-V31McpCompensation @args
  throw "DOGFOOD_V31_MCP_CORS_ACTIVATION_FAILED:$primary"
}
