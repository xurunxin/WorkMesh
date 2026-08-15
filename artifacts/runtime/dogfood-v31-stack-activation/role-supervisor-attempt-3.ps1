param(
  [Parameter(Mandatory = $true)][ValidateSet('web','mcp')][string]$Role,
  [Parameter(Mandatory = $true)][ValidateSet('candidate','rollback')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$ContractPath,
  [Parameter(Mandatory = $true)][string]$ContractSha256,
  [Parameter(Mandatory = $true)][string]$StatePath,
  [Parameter(Mandatory = $true)][string]$StopPath,
  [switch]$DryRun,
  [string]$EvidenceRootOverride,
  [string]$ExecutionBindingPath,
  [string]$ExecutionBindingSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$contractExpected = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract-attempt-3.json'
$runtimeStateRoot = Join-Path $runtimeRoot 'runtime'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence\supervisor-binding-attempt-3'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-versioned-supervisor-binding-repair-verification\independent'
$executionBindingRoot = Join-Path $runtimeRoot 'authorization'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
Import-Module $modulePath -Force
if ((Get-V31FullPath $ContractPath) -cne (Get-V31FullPath $contractExpected) -or -not (Test-V31UnderPath $StatePath $runtimeStateRoot) -or -not (Test-V31UnderPath $StopPath $runtimeStateRoot)) { throw 'DOGFOOD_V31_SUPERVISOR_PATH_REJECTED' }
if ((Get-V31Sha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_SUPERVISOR_CONTRACT_SHA' }
$contract = Get-Content -Raw -LiteralPath $ContractPath | ConvertFrom-Json -DateKind String
if ($contract.kind -ne 'DogfoodV31StackActivationContract' -or $contract.selectorBinding -ne 'v31-stack-activation-v3') { throw 'DOGFOOD_V31_SUPERVISOR_CONTRACT_INVALID' }
if ([string]$contract.scripts.supervisor.sha256 -cne (Get-V31Sha256 $PSCommandPath)) { throw 'DOGFOOD_V31_SUPERVISOR_HASH' }
if ($DryRun) {
  if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { throw 'DOGFOOD_V31_SUPERVISOR_EVIDENCE_REQUIRED' }
  $evidenceRoot = Get-V31FullPath $EvidenceRootOverride
  if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_SUPERVISOR_EVIDENCE_REJECTED' }
} else {
  if ([string]::IsNullOrWhiteSpace($ExecutionBindingPath) -or [string]::IsNullOrWhiteSpace($ExecutionBindingSha256)) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_REQUIRED' }
  $expectedBindingPath = Get-V31FullPath $ExecutionBindingPath
  if (-not (Test-V31UnderPath $expectedBindingPath $executionBindingRoot)) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_PATH' }
  if ((Get-V31Sha256 $expectedBindingPath) -cne $ExecutionBindingSha256) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_SHA' }
  $executionBinding = Get-Content -Raw -LiteralPath $expectedBindingPath | ConvertFrom-Json -DateKind String
  if ($executionBinding.kind -notin @('DogfoodV31StartExecutionBinding','DogfoodV31RollbackExecutionBinding') -or [string]$executionBinding.contractSha256 -cne $ContractSha256) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_INVALID' }
  if ([DateTimeOffset]::Parse([string]$executionBinding.expiresAt) -le [DateTimeOffset]::UtcNow) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_EXPIRED' }
  if ($Role -notin @($executionBinding.allowedRoles) -or $Mode -notin @($executionBinding.allowedModes)) { throw 'DOGFOOD_V31_SUPERVISOR_EXECUTION_BINDING_SCOPE' }
}
$binding = $contract.runtimeModes.$Mode.$Role
$expectedPort = if ($Role -eq 'web') { 3300 } else { 3302 }
if ([int]$binding.port -ne $expectedPort) { throw 'DOGFOOD_V31_SUPERVISOR_PORT' }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
if ($Role -eq 'web') {
  $spec = @{ file = $node; args = @((Join-Path ([string]$binding.root) 'apps\web\server.js')); cwd = (Join-Path ([string]$binding.root) 'apps\web'); env = @{ NODE_ENV = 'production'; NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3301'; PORT = '3300'; HOSTNAME = '127.0.0.1' }; port = 3300; health = 'http://127.0.0.1:3300/' }
} else {
  $entrypoint = if ($Mode -eq 'candidate') { Join-Path $runtimeRoot 'mcp-entrypoint-v31.mts' } else { Join-Path $controlRoot 'artifacts\runtime\dogfood-target\mcp-entrypoint.mts' }
  $spec = @{ file = $pnpm; args = @('-C','apps/mcp','exec','tsx',$entrypoint); cwd = [string]$binding.root; env = @{ NODE_ENV = 'production'; WORKMESH_API_URL = 'http://127.0.0.1:3303'; WORKMESH_BETA_COORDINATION_MCP = 'true'; WORKMESH_MCP_MODE = 'read-write'; HOST = '127.0.0.1'; PORT = '3302' }; port = 3302; health = 'http://127.0.0.1:3302/readyz' }
}
if ($DryRun) {
  New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
  $receipt = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31SupervisorDryRun'; result = 'PASS'; dryRun = [bool]1; role = $Role; mode = $Mode; contractPath = (Get-V31FullPath $ContractPath); contractSha256 = $ContractSha256; statePath = (Get-V31FullPath $StatePath); stopPath = (Get-V31FullPath $StopPath); root = [string]$binding.root; port = [int]$spec.port; healthUrl = [string]$spec.health; childCreated = [bool]0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
  $receipt | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot "supervisor-$Mode-$Role.json")
  $receipt | ConvertTo-Json -Depth 12
  return
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
$generation = 0
$restartCount = 0
while ($true) {
  $generation++
  $stdout = "$StatePath.generation-$generation.stdout.log"
  $stderr = "$StatePath.generation-$generation.stderr.log"
  $child = Start-Process -FilePath $spec.file -ArgumentList $spec.args -WorkingDirectory $spec.cwd -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Environment $spec.env
  $childStart = (Get-Process -Id $child.Id -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')
  try {
    $null = Wait-V31HttpReady $spec.health
    $listenerPid = Get-V31ListenerPid $spec.port
    $listener = Get-Process -Id $listenerPid -ErrorAction Stop
    $self = Get-Process -Id $PID -ErrorAction Stop
    $state = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31DurableRoleSupervisor'; status = 'RUNNING'; role = $Role; mode = $Mode; supervisorPid = $PID; supervisorStartTimeUtc = $self.StartTime.ToUniversalTime().ToString('O'); generation = $generation; restartCount = $restartCount; childPid = $child.Id; childStartTimeUtc = $childStart; listenerPid = $listenerPid; listenerStartTimeUtc = $listener.StartTime.ToUniversalTime().ToString('O'); port = $spec.port; healthUrl = $spec.health; root = [string]$binding.root; contractSha256 = $ContractSha256; secretValuesSerialized = [bool]0; updatedAt = [DateTimeOffset]::UtcNow.ToString('O') }
    $state | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath $StatePath
    $listener.WaitForExit()
  } catch {
    $process = Get-Process -Id $child.Id -ErrorAction SilentlyContinue
    if ($null -ne $process) { taskkill.exe /PID $child.Id /T /F | Out-Null }
    if ((Test-Path -LiteralPath $StopPath) -or $restartCount -ge 1) { throw }
  }
  if (Test-Path -LiteralPath $StopPath) { exit 0 }
  if ($restartCount -ge 1) { exit 1 }
  foreach ($attempt in 1..40) { if (-not (Get-NetTCPConnection -State Listen -LocalPort $spec.port -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }
  if (Get-NetTCPConnection -State Listen -LocalPort $spec.port -ErrorAction SilentlyContinue) { throw "DOGFOOD_V31_RESTART_PORT_BUSY:$($spec.port)" }
  $restartCount++
}
