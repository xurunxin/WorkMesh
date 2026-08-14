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
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_MCP_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$bindingPath = Join-Path $runtimeRoot 'authorization\rollback-execution-binding.json'
Import-Module $modulePath -Force

function Assert-ScriptBindings([pscustomobject]$Contract) {
  foreach ($property in $Contract.scripts.psobject.Properties) {
    if ((Get-V31McpSha256 (Join-Path $repoRoot ([string]$property.Value.path))) -cne [string]$property.Value.sha256) { throw "DOGFOOD_V31_MCP_CORS_SCRIPT_HASH_MISMATCH:$($property.Name)" }
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

function Stop-Candidate([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.candidateMcp.statePath)
  if (-not (Test-Path -LiteralPath $statePath)) { return [pscustomobject]@{status='absent'} }
  $state = Read-V31McpJson $statePath
  if ($state.status -ne 'RUNNING') { return [pscustomobject]@{status='not_running'} }
  Stop-V31McpExactTree ([int]$state.supervisorPid) ([string]$state.supervisorStartTimeUtc) @($supervisorPath,$ContractSha256) (Join-Path $repoRoot ([string]$Contract.candidateMcp.stopPath))
}

function Discover-Old([pscustomobject]$Contract) {
  $old = $Contract.oldMcp
  $existing = Get-V31McpProcessRecord ([int]$old.supervisorPid)
  [int[]]$owners = @(Get-NetTCPConnection -State Listen -LocalPort 3302 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  Resolve-V31McpOldOwnerDecision ([bool]($null -ne $existing)) $owners ([int]$old.listenerPid)
}

function Start-Old([pscustomobject]$Contract) {
  $statePath = Join-Path $repoRoot ([string]$Contract.rollbackMcp.statePath)
  $stopPath = Join-Path $repoRoot ([string]$Contract.rollbackMcp.stopPath)
  Remove-Item -LiteralPath $statePath,$stopPath -Force -ErrorAction SilentlyContinue
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $arguments = @('-NoLogo','-NoProfile','-NonInteractive','-File',$supervisorPath,'-Mode','rollback','-ContractPath',$ContractPath,'-ContractSha256',$ContractSha256,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$bindingPath,'-ExecutionBindingSha256',(Get-V31McpSha256 $bindingPath))
  $launcher = Start-Process -FilePath $pwsh -ArgumentList $arguments -WindowStyle Hidden -PassThru
  foreach ($attempt in 1..160) {
    if (Test-Path -LiteralPath $statePath) {
      try { $state = Read-V31McpJson $statePath; if ($state.status -eq 'RUNNING') { $null = Wait-V31McpHttp ([string]$Contract.oldMcp.healthUrl) @(200) 20; return $state } } catch {}
    }
    if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) { throw 'DOGFOOD_V31_MCP_CORS_OLD_SUPERVISOR_EXITED' }
    Start-Sleep -Milliseconds 250
  }
  throw 'DOGFOOD_V31_MCP_CORS_OLD_START_TIMEOUT'
}

if ((Get-V31McpFullPath $ContractPath) -cne (Get-V31McpFullPath $expectedContract) -or (Get-V31McpSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_MCP_CORS_CONTRACT_REJECTED' }
$contract = Read-V31McpJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivationContract' -or $contract.selectorBinding -ne 'v31-public-mcp-browser-cors-activation-v1') { throw 'DOGFOOD_V31_MCP_CORS_CONTRACT_INVALID' }
Assert-ScriptBindings $contract
$allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31McpEvidenceRoot $EvidenceRoot $allowed
Assert-ProtectedRuntime $contract
if ($DryRun) {
  Write-V31McpJson (Join-Path $evidence 'rollback-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsRollbackDryRun';result='PASS';targetMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}

$expectedActivation = Join-Path $repoRoot ([string]$contract.execution.activationPath)
if ([string]::IsNullOrWhiteSpace($ActivationPath) -or [string]::IsNullOrWhiteSpace($ActivationSha256) -or (Get-V31McpFullPath $ActivationPath) -cne (Get-V31McpFullPath $expectedActivation) -or (Get-V31McpSha256 $ActivationPath) -cne $ActivationSha256) { throw 'DOGFOOD_V31_MCP_CORS_ACTIVATION_BINDING_REJECTED' }
$activation = Read-V31McpJson $ActivationPath
if ($activation.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivation' -or $activation.contractSha256 -cne $ContractSha256 -or $activation.result -ne 'PASS') { throw 'DOGFOOD_V31_MCP_CORS_ACTIVATION_INVALID' }
$self = Get-Process -Id $PID -ErrorAction Stop
$binding = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsExecutionBinding';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;gateSha256=[string]$activation.gateSha256;requestSha256=[string]$activation.requestSha256;approvalSha256=[string]$activation.approvalSha256;allowedRole='mcp';allowedModes=@('rollback');authorizingPid=$PID;authorizingStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');createdAt=[DateTimeOffset]::UtcNow.ToString('O');expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(10).ToString('O')}
Write-V31McpJson $bindingPath $binding
$rollbackPath = Join-Path $repoRoot ([string]$contract.execution.rollbackPath)
$args = @{
  PrimaryError = 'explicit_rollback'
  StopCandidate = { Stop-Candidate $contract }
  DiscoverOldOwner = { Discover-Old $contract }
  RestoreOldOwner = { Start-Old $contract }
  VerifyRestoredRuntime = { Assert-ProtectedRuntime $contract; $null = Wait-V31McpHttp ([string]$contract.oldMcp.healthUrl) @(200) 20 }
  WriteTerminalReceipt = { param([object]$Receipt) $Receipt['contractSha256']=$ContractSha256; $Receipt['activationSha256']=$ActivationSha256; Write-V31McpJson $rollbackPath $Receipt }
}
$null = Invoke-V31McpCompensation @args
