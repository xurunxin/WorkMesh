param(
  [Parameter(Mandatory=$true)][ValidateSet('candidate','rollback')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$StopPath,
  [Parameter(Mandatory=$true)][string]$ExecutionBindingPath,
  [Parameter(Mandatory=$true)][string]$ExecutionBindingSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_ORIGIN_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing-contract.json'
$expectedBinding = Join-Path $runtimeRoot 'authorization\execution-binding.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
Import-Module $modulePath -Force

function UserEnv([string]$Name) {
  $allowed = @('WORKMESH_DOGFOOD_DATABASE_URL','WORKMESH_DOGFOOD_SESSION_SECRET','WORKMESH_DOGFOOD_MASTER_KEY','WORKMESH_DOGFOOD_BOOTSTRAP_TOKEN','WORKMESH_DOGFOOD_CURSOR_KEY','WORKMESH_DOGFOOD_MINIO_PASSWORD')
  if ($allowed -cnotcontains $Name) { throw "DOGFOOD_V31_ORIGIN_ENV_NAME_REJECTED:$Name" }
  $value = [Environment]::GetEnvironmentVariable($Name,'User')
  if ([string]::IsNullOrWhiteSpace($value)) { throw "DOGFOOD_V31_ORIGIN_ENV_MISSING:$Name" }
  $value
}

if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract)) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_PATH_REJECTED' }
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_SHA_MISMATCH' }
if ((Get-V31OriginFullPath $ExecutionBindingPath) -cne (Get-V31OriginFullPath $expectedBinding)) { throw 'DOGFOOD_V31_ORIGIN_BINDING_PATH_REJECTED' }
if ((Get-V31OriginSha256 $ExecutionBindingPath) -cne $ExecutionBindingSha256) { throw 'DOGFOOD_V31_ORIGIN_BINDING_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
$binding = Read-V31OriginJson $ExecutionBindingPath
if ($contract.kind -ne 'DogfoodV31PublicMcpOriginRoutingContract' -or $contract.selectorBinding -ne 'v31-public-mcp-origin-routing-v1') { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_INVALID' }
if ($binding.kind -ne 'DogfoodV31PublicMcpOriginExecutionBinding' -or $binding.selectorBinding -ne $contract.selectorBinding -or $binding.contractSha256 -cne $ContractSha256 -or [string]::IsNullOrWhiteSpace([string]$binding.approvalSha256) -or @('start-public-origin.ps1','rollback-public-origin.ps1') -cnotcontains [string]$binding.authorizingScript) { throw 'DOGFOOD_V31_ORIGIN_EXECUTION_BINDING_INVALID' }
$selfCim = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
if ([int]$selfCim.ParentProcessId -ne [int]$binding.authorizingStartPid) { throw 'DOGFOOD_V31_ORIGIN_AUTHORIZING_PARENT_MISMATCH' }
Assert-V31OriginProcess ([int]$binding.authorizingStartPid) ([string]$binding.authorizingStartTimeUtc) @([string]$binding.authorizingScript,$ContractSha256) | Out-Null
if ([string]$contract.scripts.supervisor.sha256 -cne (Get-V31OriginSha256 $PSCommandPath) -or [string]$contract.scripts.module.sha256 -cne (Get-V31OriginSha256 $modulePath)) { throw 'DOGFOOD_V31_ORIGIN_SCRIPT_HASH_MISMATCH' }

$api = $contract.candidateApi
$environment = @{
  NODE_ENV = 'production'
  DATABASE_URL = (UserEnv 'WORKMESH_DOGFOOD_DATABASE_URL')
  REDIS_URL = 'redis://127.0.0.1:56380'
  SESSION_SECRET = (UserEnv 'WORKMESH_DOGFOOD_SESSION_SECRET')
  WORKMESH_MASTER_KEY = (UserEnv 'WORKMESH_DOGFOOD_MASTER_KEY')
  WORKMESH_BOOTSTRAP_TOKEN = (UserEnv 'WORKMESH_DOGFOOD_BOOTSTRAP_TOKEN')
  PAGINATION_CURSOR_KEYS = ('dogfood-v2:' + (UserEnv 'WORKMESH_DOGFOOD_CURSOR_KEY'))
  PAGINATION_CURSOR_ACTIVE_KID = 'dogfood-v2'
  S3_ENDPOINT = 'http://127.0.0.1:59000'
  S3_BUCKET = 'workmesh-artifacts'
  S3_ACCESS_KEY_ID = 'workmesh'
  S3_SECRET_ACCESS_KEY = (UserEnv 'WORKMESH_DOGFOOD_MINIO_PASSWORD')
  S3_REGION = 'us-east-1'
  S3_FORCE_PATH_STYLE = 'true'
  API_HOST = '127.0.0.1'
  API_PORT = '3303'
  WEB_ORIGIN = if ($Mode -eq 'candidate') { 'http://127.0.0.1:3301' } else { 'http://127.0.0.1:3300' }
  WORKMESH_BETA_COORDINATION_MCP = 'true'
}
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
$generation = 0
$restartCount = 0
while ($true) {
  $generation++
  $stdout = "$StatePath.generation-$generation.stdout.log"
  $stderr = "$StatePath.generation-$generation.stderr.log"
  $child = Start-Process -FilePath $pnpm -ArgumentList @('-C','apps/api','exec','tsx','src/server.ts') -WorkingDirectory ([string]$api.root) -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr -Environment $environment
  $childStart = (Get-Process -Id $child.Id -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')
  try {
    $null = Wait-V31OriginHttp ([string]$api.healthUrl) @(200)
    $listenerPid = Get-V31OriginListenerPid ([int]$api.port)
    $listener = Get-Process -Id $listenerPid -ErrorAction Stop
    $self = Get-Process -Id $PID -ErrorAction Stop
    $state = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginApiSupervisor';status='RUNNING';role='api';mode=$Mode;supervisorPid=$PID;supervisorStartTimeUtc=$self.StartTime.ToUniversalTime().ToString('O');generation=$generation;restartCount=$restartCount;childPid=$child.Id;childStartTimeUtc=$childStart;listenerPid=$listenerPid;listenerStartTimeUtc=$listener.StartTime.ToUniversalTime().ToString('O');port=[int]$api.port;healthUrl=[string]$api.healthUrl;root=[string]$api.root;webOrigin=[string]$environment.WEB_ORIGIN;coordinationFeatureEnabled=[bool]1;contractSha256=$ContractSha256;executionBindingSha256=$ExecutionBindingSha256;secretValuesSerialized=[bool]0;updatedAt=[DateTimeOffset]::UtcNow.ToString('O')}
    Write-V31OriginJson $StatePath $state
    $listener.WaitForExit()
  } catch {
    $live = Get-Process -Id $child.Id -ErrorAction SilentlyContinue
    if ($live -and $live.StartTime.ToUniversalTime().Ticks -eq [DateTimeOffset]::Parse($childStart).UtcTicks) { taskkill.exe /PID $child.Id /T /F | Out-Null }
    if ((Test-Path -LiteralPath $StopPath) -or $restartCount -ge 3) { throw }
  }
  if (Test-Path -LiteralPath $StopPath) { exit 0 }
  $live = Get-Process -Id $child.Id -ErrorAction SilentlyContinue
  if ($live -and $live.StartTime.ToUniversalTime().Ticks -eq [DateTimeOffset]::Parse($childStart).UtcTicks) { taskkill.exe /PID $child.Id /T /F | Out-Null }
  if ($restartCount -ge 3) { exit 1 }
  foreach ($attempt in 1..40) { if (-not (Get-NetTCPConnection -State Listen -LocalPort ([int]$api.port) -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 100 }
  if (Get-NetTCPConnection -State Listen -LocalPort ([int]$api.port) -ErrorAction SilentlyContinue) { throw "DOGFOOD_V31_ORIGIN_RESTART_PORT_BUSY:$($api.port)" }
  $restartCount++
  Start-Sleep -Milliseconds 250
}
