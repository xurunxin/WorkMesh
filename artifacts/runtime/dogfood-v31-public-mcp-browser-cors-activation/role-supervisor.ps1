param(
  [Parameter(Mandatory=$true)][ValidateSet('candidate','rollback')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$StopPath,
  [switch]$DryRun,
  [string]$EvidenceRoot,
  [string]$ExecutionBindingPath,
  [string]$ExecutionBindingSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_MCP_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation-contract.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
Import-Module $modulePath -Force

if ((Get-V31McpFullPath $ContractPath) -cne (Get-V31McpFullPath $expectedContract) -or (Get-V31McpSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_CONTRACT_REJECTED' }
$contract = Read-V31McpJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpBrowserCorsActivationContract' -or $contract.selectorBinding -ne 'v31-public-mcp-browser-cors-activation-v1') { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_CONTRACT_INVALID' }
if ((Get-V31McpSha256 $PSCommandPath) -cne [string]$contract.scripts.supervisor.sha256 -or (Get-V31McpSha256 $modulePath) -cne [string]$contract.scripts.module.sha256) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_SCRIPT_DRIFT' }
$runtimeStateRoot = Join-Path $runtimeRoot 'runtime'
if (-not ((Get-V31McpFullPath $StatePath).StartsWith((Get-V31McpFullPath $runtimeStateRoot) + '\',[StringComparison]::Ordinal)) -or -not ((Get-V31McpFullPath $StopPath).StartsWith((Get-V31McpFullPath $runtimeStateRoot) + '\',[StringComparison]::Ordinal))) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_STATE_PATH_REJECTED' }

if ($DryRun) {
  $allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
  $root = Assert-V31McpEvidenceRoot $EvidenceRoot $allowed
  Write-V31McpJson (Join-Path $root 'supervisor-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsSupervisorDryRun';result='PASS';targetMutationExecuted=[bool]0;contractSha256=$ContractSha256;statePath=(Get-V31McpFullPath $StatePath);stopPath=(Get-V31McpFullPath $StopPath);port=3302;browserOrigin='http://127.0.0.1:3300';checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}

$expectedBinding = Join-Path $runtimeRoot ([string]$contract.execution.executionBindingPath)
if ([string]::IsNullOrWhiteSpace($ExecutionBindingPath) -or [string]::IsNullOrWhiteSpace($ExecutionBindingSha256) -or (Get-V31McpFullPath $ExecutionBindingPath) -cne (Get-V31McpFullPath $expectedBinding) -or (Get-V31McpSha256 $ExecutionBindingPath) -cne $ExecutionBindingSha256) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_BINDING_REJECTED' }
$binding = Read-V31McpJson $ExecutionBindingPath
if ($binding.kind -ne 'DogfoodV31PublicMcpBrowserCorsExecutionBinding' -or $binding.selectorBinding -ne $contract.selectorBinding -or $binding.contractSha256 -cne $ContractSha256 -or $binding.allowedRole -ne 'mcp' -or $Mode -notin @($binding.allowedModes)) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_BINDING_INVALID' }
if ([DateTimeOffset]::Parse([string]$binding.expiresAt).UtcDateTime -le [DateTimeOffset]::UtcNow.UtcDateTime) { throw 'DOGFOOD_V31_MCP_CORS_SUPERVISOR_BINDING_EXPIRED' }

$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
if ($Mode -eq 'candidate') {
  $entrypoint = Join-Path $runtimeRoot 'mcp-entrypoint-v31-browser-cors.mts'
  $workingRoot = $repoRoot
  if ((Get-V31McpSha256 $entrypoint) -cne [string]$contract.scripts.entrypoint.sha256) { throw 'DOGFOOD_V31_MCP_CORS_ENTRYPOINT_DRIFT' }
} else {
  $entrypoint = [string]$contract.oldMcp.entrypointPath
  $workingRoot = [string]$contract.oldMcp.root
  if ((Get-V31McpSha256 $entrypoint) -cne [string]$contract.oldMcp.entrypointSha256) { throw 'DOGFOOD_V31_MCP_CORS_OLD_ENTRYPOINT_DRIFT' }
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
$generation = 0
$restartCount = 0
while ($true) {
  $generation++
  $stdout = "$StatePath.generation-$generation.stdout.log"
  $stderr = "$StatePath.generation-$generation.stderr.log"
  $child = Start-Process -FilePath $pnpm -ArgumentList @('-C','apps/mcp','exec','tsx',$entrypoint) -WorkingDirectory $workingRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Environment @{NODE_ENV='production';WORKMESH_API_URL='http://127.0.0.1:3303';WORKMESH_BETA_COORDINATION_MCP='true';WORKMESH_MCP_MODE='read-write';WORKMESH_BROWSER_ORIGIN='http://127.0.0.1:3300';HOST='127.0.0.1';PORT='3302'}
  try {
    $null = Wait-V31McpHttp 'http://127.0.0.1:3302/readyz' @(200)
    $listenerPid = Get-V31McpListenerPid 3302
    $listener = Get-Process -Id $listenerPid -ErrorAction Stop
    $self = Get-Process -Id $PID -ErrorAction Stop
    $state = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsSupervisor';status='RUNNING';role='mcp';mode=$Mode;supervisorPid=$PID;supervisorStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');generation=$generation;restartCount=$restartCount;childPid=$child.Id;listenerPid=$listenerPid;listenerStartTimeUtc=$listener.StartTime.ToUniversalTime().ToString('O');port=3302;healthUrl='http://127.0.0.1:3302/readyz';root=$workingRoot;browserOrigin=if($Mode -eq 'candidate'){'http://127.0.0.1:3300'}else{$null};contractSha256=$ContractSha256;secretValuesSerialized=[bool]0;updatedAt=[DateTimeOffset]::UtcNow.ToString('O')}
    Write-V31McpJson $StatePath $state
    $listener.WaitForExit()
  } catch {
    $process = Get-Process -Id $child.Id -ErrorAction SilentlyContinue
    if ($null -ne $process) { taskkill.exe /PID $child.Id /T /F | Out-Null }
    if ((Test-Path -LiteralPath $StopPath) -or $restartCount -ge 1) { throw }
  }
  if (Test-Path -LiteralPath $StopPath) { exit 0 }
  if ($restartCount -ge 1) { exit 1 }
  foreach ($attempt in 1..40) { if (-not (Get-NetTCPConnection -State Listen -LocalPort 3302 -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }
  if (Get-NetTCPConnection -State Listen -LocalPort 3302 -ErrorAction SilentlyContinue) { throw 'DOGFOOD_V31_MCP_CORS_RESTART_PORT_BUSY' }
  $restartCount++
}
