Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-V31McpFullPath([string]$Path) {
  [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-V31McpSha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Read-V31McpJson([string]$Path) {
  Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -DateKind String
}

function Write-V31McpJson([string]$Path, [object]$Value) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Value | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 -LiteralPath $Path
}

function Assert-V31McpEvidenceRoot([string]$Path, [string[]]$AllowedRoots) {
  $actual = Get-V31McpFullPath $Path
  $matched = [bool]0
  foreach ($root in $AllowedRoots) {
    if ($actual -ceq (Get-V31McpFullPath $root)) { $matched = [bool]1; break }
  }
  if (-not $matched) { throw 'DOGFOOD_V31_MCP_CORS_EVIDENCE_ROOT_REJECTED' }
  New-Item -ItemType Directory -Force -Path $actual | Out-Null
  $actual
}

function Get-V31McpProcessRecord([int]$ProcessId) {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
  [pscustomobject]@{
    pid = $ProcessId
    startTimeUtc = $process.StartTime.ToUniversalTime().ToString('O')
    startTicks = $process.StartTime.ToUniversalTime().Ticks
    parentPid = [int]$cim.ParentProcessId
    commandLine = [string]$cim.CommandLine
    executablePath = [string]$cim.ExecutablePath
  }
}

function Assert-V31McpProcess([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles) {
  $record = Get-V31McpProcessRecord $ProcessId
  if (-not $record) { throw "DOGFOOD_V31_MCP_CORS_PROCESS_MISSING:$ProcessId" }
  if ($record.startTicks -ne [DateTimeOffset]::Parse($StartTimeUtc).UtcTicks) { throw "DOGFOOD_V31_MCP_CORS_PROCESS_START_MISMATCH:$ProcessId" }
  $command = $record.commandLine.Replace('/','\')
  foreach ($needle in $CommandNeedles) {
    if (-not $command.Contains($needle.Replace('/','\'), [StringComparison]::OrdinalIgnoreCase)) { throw "DOGFOOD_V31_MCP_CORS_PROCESS_COMMAND_MISMATCH:$ProcessId" }
  }
  $record
}

function Get-V31McpListenerPid([int]$Port) {
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw "DOGFOOD_V31_MCP_CORS_LISTENER_COUNT:${Port}:$($owners.Count)" }
  [int]$owners[0]
}

function Wait-V31McpHttp([string]$Url, [int[]]$ExpectedStatus, [int]$Attempts = 120) {
  foreach ($attempt in 1..$Attempts) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 2
      if ($ExpectedStatus -contains [int]$response.StatusCode) { return $response }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "DOGFOOD_V31_MCP_CORS_HTTP_TIMEOUT:$Url"
}

function Stop-V31McpExactTree([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles, [string]$StopPath) {
  $record = Get-V31McpProcessRecord $ProcessId
  if (-not $record) { return [pscustomobject]@{status='already_absent';pid=$ProcessId} }
  Assert-V31McpProcess $ProcessId $StartTimeUtc $CommandNeedles | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StopPath) | Out-Null
  Set-Content -Encoding utf8 -LiteralPath $StopPath -Value ([DateTimeOffset]::UtcNow.ToString('O'))
  taskkill.exe /PID $ProcessId /T /F | Out-Null
  foreach ($attempt in 1..80) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return [pscustomobject]@{status='stopped';pid=$ProcessId} }
    Start-Sleep -Milliseconds 100
  }
  throw "DOGFOOD_V31_MCP_CORS_STOP_TIMEOUT:$ProcessId"
}

function Read-V31McpGateReport([string]$Path) {
  $text = Get-Content -Raw -LiteralPath $Path
  $pattern = '(?ms)^GateReport:\s*$.*?^  result:\s*PASS\s*$.*?^  transition:\s*$.*?^    allowed:\s*true\s*$.*?^    scope:\s*request_creation_only\s*$'
  if (-not [regex]::IsMatch($text,$pattern)) { throw 'DOGFOOD_V31_MCP_CORS_GATE_NOT_AUTHORIZING' }
  [pscustomobject]@{result='PASS';allowed=[bool]1;scope='request_creation_only'}
}

function Resolve-V31McpOldOwnerDecision([bool]$SupervisorExists, [int[]]$ListenerOwners, [int]$ExpectedListenerPid) {
  if ($SupervisorExists -and $ListenerOwners.Count -eq 1 -and $ListenerOwners[0] -eq $ExpectedListenerPid) { return 'retained' }
  if (-not $SupervisorExists -and $ListenerOwners.Count -eq 0) { return 'missing' }
  'unknown'
}

function Invoke-V31McpCompensation(
  [Parameter(Mandatory=$true)][scriptblock]$StopCandidate,
  [Parameter(Mandatory=$true)][scriptblock]$DiscoverOldOwner,
  [Parameter(Mandatory=$true)][scriptblock]$RestoreOldOwner,
  [Parameter(Mandatory=$true)][scriptblock]$VerifyRestoredRuntime,
  [Parameter(Mandatory=$true)][scriptblock]$WriteTerminalReceipt,
  [string]$PrimaryError = 'explicit_rollback'
) {
  $cleanup = $null
  $restore = $null
  $errors = @()
  try { $cleanup = & $StopCandidate } catch { $errors += "cleanup:$($_.Exception.Message)" }
  try {
    $decision = [string](& $DiscoverOldOwner)
    if ($decision -eq 'retained') { $restore = [pscustomobject]@{status='retained'} }
    elseif ($decision -eq 'missing') { $restore = & $RestoreOldOwner }
    else { throw "DOGFOOD_V31_MCP_CORS_OLD_OWNER_REJECTED:$decision" }
    & $VerifyRestoredRuntime | Out-Null
  } catch { $errors += "restore:$($_.Exception.Message)" }
  $result = if ($errors.Count -eq 0) { 'ROLLED_BACK_RUNTIME_VERIFIED' } else { 'ROLLBACK_FAILED' }
  $receipt = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsRollback';result=$result;primaryError=$PrimaryError;candidateCleanup=$cleanup;oldMcpRestore=$restore;errors=$errors;completedAt=[DateTimeOffset]::UtcNow.ToString('O')}
  & $WriteTerminalReceipt $receipt
  if ($result -ne 'ROLLED_BACK_RUNTIME_VERIFIED') { throw "DOGFOOD_V31_MCP_CORS_COMPENSATION_FAILED:$($errors -join '|')" }
  [pscustomobject]$receipt
}

Export-ModuleMember -Function Get-V31McpFullPath,Get-V31McpSha256,Read-V31McpJson,Write-V31McpJson,Assert-V31McpEvidenceRoot,Get-V31McpProcessRecord,Assert-V31McpProcess,Get-V31McpListenerPid,Wait-V31McpHttp,Stop-V31McpExactTree,Read-V31McpGateReport,Resolve-V31McpOldOwnerDecision,Invoke-V31McpCompensation
