Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_RECOVERY_REQUIRES_POWERSHELL_7' }

$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
$contractPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract.json'
$contractSha256 = 'b0d9619ea0ee08ff360bbeb4b8369fec29f6bf8eb39c914eaeff83b2c580f42a'

Import-Module -Force $modulePath
if ((Get-V31Sha256 $contractPath) -cne $contractSha256) { throw 'DOGFOOD_V31_RECOVERY_CONTRACT_DRIFT' }
foreach ($port in @(3300, 3302)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    throw "DOGFOOD_V31_RECOVERY_PORT_OCCUPIED:$port"
  }
}

$restored = [ordered]@{}
foreach ($role in @('web', 'mcp')) {
  $statePath = Join-Path $runtimeRoot "runtime\rollback-recovery-attempt-2-$role.json"
  $stopPath = Join-Path $runtimeRoot "runtime\rollback-recovery-attempt-2-$role.stop"
  Remove-Item -LiteralPath $statePath, $stopPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statePath) | Out-Null
  $process = Start-Process -FilePath 'pwsh.exe' -ArgumentList @(
    '-NoLogo', '-NoProfile', '-File', $supervisorPath,
    '-Role', $role, '-Mode', 'rollback',
    '-ContractPath', $contractPath, '-ContractSha256', $contractSha256,
    '-StatePath', $statePath, '-StopPath', $stopPath
  ) -WindowStyle Hidden -PassThru
  $state = Wait-V31SupervisorState $statePath rollback $process.Id
  $restored[$role] = [ordered]@{
    supervisorPid = $process.Id
    supervisorStartTimeUtc = (Get-Process -Id $process.Id -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')
    statePath = $statePath
    stopPath = $stopPath
    listenerPid = [int]$state.listenerPid
    listenerStartTimeUtc = [string]$state.listenerStartTimeUtc
    root = [string]$state.root
    contractSha256 = [string]$state.contractSha256
  }
}

$null = Wait-V31HttpReady 'http://127.0.0.1:3300/'
$null = Wait-V31HttpReady 'http://127.0.0.1:3302/readyz'
[ordered]@{
  artifactVersion = 1
  kind = 'DogfoodV31EmergencyAutomaticRollbackRecovery'
  status = 'ROLLED_BACK_RUNTIME_STARTED'
  reason = 'attempt-2 supervisor rejected the versioned contract before candidate startup; restore the immutable v30 Web and MCP runtime'
  contractSha256 = $contractSha256
  restoredAt = [DateTimeOffset]::UtcNow.ToString('O')
  restored = $restored
  databaseMutation = [bool]0
  objectStoreMutation = [bool]0
  workMeshMutation = [bool]0
} | ConvertTo-Json -Depth 16
