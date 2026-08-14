Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-V31OriginFullPath([string]$Path) {
  [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-V31OriginSha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Read-V31OriginJson([string]$Path) {
  Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -DateKind String
}

function Write-V31OriginJson([string]$Path, [object]$Value) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Value | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 -LiteralPath $Path
}

function Assert-V31OriginEvidenceRoot([string]$Path, [string[]]$AllowedRoots) {
  $actual = Get-V31OriginFullPath $Path
  $matched = [bool]0
  foreach ($root in $AllowedRoots) {
    if ($actual -ceq (Get-V31OriginFullPath $root)) { $matched = [bool]1; break }
  }
  if (-not $matched) { throw 'DOGFOOD_V31_ORIGIN_EVIDENCE_ROOT_REJECTED' }
  New-Item -ItemType Directory -Force -Path $actual | Out-Null
  $actual
}

function Get-V31OriginProcessRecord([int]$ProcessId) {
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

function Assert-V31OriginProcess([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles) {
  $record = Get-V31OriginProcessRecord $ProcessId
  if (-not $record) { throw "DOGFOOD_V31_ORIGIN_PROCESS_MISSING:$ProcessId" }
  if ($record.startTicks -ne [DateTimeOffset]::Parse($StartTimeUtc).UtcTicks) { throw "DOGFOOD_V31_ORIGIN_PROCESS_START_MISMATCH:$ProcessId" }
  $command = $record.commandLine.Replace('/','\')
  foreach ($needle in $CommandNeedles) {
    if (-not $command.Contains($needle.Replace('/','\'), [StringComparison]::OrdinalIgnoreCase)) { throw "DOGFOOD_V31_ORIGIN_PROCESS_COMMAND_MISMATCH:$ProcessId" }
  }
  $record
}

function Get-V31OriginListenerPid([int]$Port) {
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw "DOGFOOD_V31_ORIGIN_LISTENER_COUNT:${Port}:$($owners.Count)" }
  [int]$owners[0]
}

function Wait-V31OriginHttp([string]$Url, [int[]]$ExpectedStatus, [int]$Attempts = 120) {
  foreach ($attempt in 1..$Attempts) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 2
      if ($ExpectedStatus -contains [int]$response.StatusCode) { return $response }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "DOGFOOD_V31_ORIGIN_HTTP_TIMEOUT:$Url"
}

function Stop-V31OriginExactTree([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles, [string]$StopPath) {
  $record = Get-V31OriginProcessRecord $ProcessId
  if (-not $record) { return [pscustomobject]@{status='already_absent';pid=$ProcessId} }
  Assert-V31OriginProcess $ProcessId $StartTimeUtc $CommandNeedles | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StopPath) | Out-Null
  Set-Content -Encoding utf8 -LiteralPath $StopPath -Value ([DateTimeOffset]::UtcNow.ToString('O'))
  taskkill.exe /PID $ProcessId /T /F | Out-Null
  foreach ($attempt in 1..80) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return [pscustomobject]@{status='stopped';pid=$ProcessId} }
    Start-Sleep -Milliseconds 100
  }
  throw "DOGFOOD_V31_ORIGIN_STOP_TIMEOUT:$ProcessId"
}

function Start-V31OriginSupervisor([string]$ScriptPath, [string[]]$Arguments, [string]$StatePath, [int]$Port, [string]$HealthUrl) {
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $launcher = Start-Process -FilePath $pwsh -ArgumentList (@('-NoLogo','-NoProfile','-NonInteractive','-File',$ScriptPath) + $Arguments) -WindowStyle Hidden -PassThru
  foreach ($attempt in 1..160) {
    if (Test-Path -LiteralPath $StatePath) {
      try {
        $state = Read-V31OriginJson $StatePath
        if ($state.status -eq 'RUNNING' -and $state.role -eq 'api' -and [int]$state.port -eq $Port) {
          $null = Wait-V31OriginHttp $HealthUrl @(200) 20
          if ((Get-V31OriginListenerPid $Port) -ne [int]$state.listenerPid) { throw 'DOGFOOD_V31_ORIGIN_STATE_LISTENER_MISMATCH' }
          return $state
        }
      } catch {}
    }
    if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) { throw 'DOGFOOD_V31_ORIGIN_SUPERVISOR_EXITED' }
    Start-Sleep -Milliseconds 250
  }
  throw 'DOGFOOD_V31_ORIGIN_SUPERVISOR_STATE_TIMEOUT'
}

function Invoke-V31PublicOriginCompensation(
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
    else { throw "DOGFOOD_V31_ORIGIN_OLD_OWNER_REJECTED:$decision" }
    & $VerifyRestoredRuntime | Out-Null
  } catch { $errors += "restore:$($_.Exception.Message)" }
  $result = if ($errors.Count -eq 0) { 'ROLLED_BACK_RUNTIME_VERIFIED' } else { 'ROLLBACK_FAILED' }
  $receipt = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginRollback';result=$result;primaryError=$PrimaryError;candidateCleanup=$cleanup;oldApiRestore=$restore;errors=$errors;completedAt=[DateTimeOffset]::UtcNow.ToString('O')}
  & $WriteTerminalReceipt $receipt
  if ($result -ne 'ROLLED_BACK_RUNTIME_VERIFIED') { throw "DOGFOOD_V31_ORIGIN_COMPENSATION_FAILED:$($errors -join '|')" }
  [pscustomobject]$receipt
}

Export-ModuleMember -Function Get-V31OriginFullPath,Get-V31OriginSha256,Read-V31OriginJson,Write-V31OriginJson,Assert-V31OriginEvidenceRoot,Get-V31OriginProcessRecord,Assert-V31OriginProcess,Get-V31OriginListenerPid,Wait-V31OriginHttp,Stop-V31OriginExactTree,Start-V31OriginSupervisor,Invoke-V31PublicOriginCompensation
