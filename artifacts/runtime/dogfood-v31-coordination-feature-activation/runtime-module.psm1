Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-V31FullPath([string]$Path) {
  [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Get-V31Sha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Read-V31Json([string]$Path) {
  Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json -DateKind String
}

function Assert-V31EvidenceRoot([string]$Path, [string[]]$AllowedRoots) {
  $actual = Get-V31FullPath $Path
  $matched = $false
  foreach ($root in $AllowedRoots) {
    if ($actual -ceq (Get-V31FullPath $root)) { $matched = $true; break }
  }
  if (-not $matched) { throw 'DOGFOOD_V31_COORD_EVIDENCE_ROOT_REJECTED' }
  New-Item -ItemType Directory -Force -Path $actual | Out-Null
  $actual
}

function Write-V31Json([string]$Path, [object]$Value) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Value | ConvertTo-Json -Depth 30 | Set-Content -Encoding utf8 -LiteralPath $Path
}

function Get-V31ProcessRecord([int]$ProcessId) {
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

function Assert-V31Process([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles) {
  $record = Get-V31ProcessRecord $ProcessId
  if (-not $record) { throw "DOGFOOD_V31_COORD_PROCESS_MISSING:$ProcessId" }
  if ($record.startTicks -ne [DateTimeOffset]::Parse($StartTimeUtc).UtcTicks) { throw "DOGFOOD_V31_COORD_PROCESS_START_MISMATCH:$ProcessId" }
  $normalizedCommand = $record.commandLine.Replace('/','\')
  foreach ($needle in $CommandNeedles) {
    $normalizedNeedle = $needle.Replace('/','\')
    if (-not $normalizedCommand.Contains($normalizedNeedle, [StringComparison]::OrdinalIgnoreCase)) { throw "DOGFOOD_V31_COORD_PROCESS_COMMAND_MISMATCH:$ProcessId" }
  }
  $record
}

function Get-V31ListenerPid([int]$Port) {
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw "DOGFOOD_V31_COORD_LISTENER_COUNT:${Port}:$($owners.Count)" }
  [int]$owners[0]
}

function Wait-V31HttpReady([string]$Url, [int]$Attempts = 120) {
  foreach ($attempt in 1..$Attempts) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 2
      if ([int]$response.StatusCode -eq 200) { return }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "DOGFOOD_V31_COORD_READY_TIMEOUT:$Url"
}

function Stop-V31ExactTree([int]$ProcessId, [string]$StartTimeUtc, [string[]]$CommandNeedles, [string]$StopPath) {
  $record = Get-V31ProcessRecord $ProcessId
  if (-not $record) { return [pscustomobject]@{status='already_absent';pid=$ProcessId} }
  Assert-V31Process $ProcessId $StartTimeUtc $CommandNeedles | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StopPath) | Out-Null
  Set-Content -Encoding utf8 -LiteralPath $StopPath -Value ([DateTimeOffset]::UtcNow.ToString('O'))
  taskkill.exe /PID $ProcessId /T /F | Out-Null
  foreach ($attempt in 1..80) {
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return [pscustomobject]@{status='stopped';pid=$ProcessId} }
    Start-Sleep -Milliseconds 100
  }
  throw "DOGFOOD_V31_COORD_STOP_TIMEOUT:$ProcessId"
}

function Start-V31Supervisor([string]$ScriptPath, [string[]]$Arguments, [string]$StatePath, [int]$Port, [string]$HealthUrl, [string]$ExpectedRole) {
  $pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
  $launcher = Start-Process -FilePath $pwsh -ArgumentList (@('-NoLogo','-NoProfile','-NonInteractive','-File',$ScriptPath) + $Arguments) -WindowStyle Hidden -PassThru
  foreach ($attempt in 1..160) {
    if (Test-Path -LiteralPath $StatePath) {
      try {
        $state = Read-V31Json $StatePath
        if ($state.status -eq 'RUNNING' -and $state.role -eq $ExpectedRole -and [int]$state.port -eq $Port) {
          Wait-V31HttpReady $HealthUrl 20
          if ((Get-V31ListenerPid $Port) -ne [int]$state.listenerPid) { throw "DOGFOOD_V31_COORD_STATE_LISTENER_MISMATCH:$ExpectedRole" }
          return $state
        }
      } catch {}
    }
    if (-not (Get-Process -Id $launcher.Id -ErrorAction SilentlyContinue)) { throw "DOGFOOD_V31_COORD_SUPERVISOR_EXITED:$ExpectedRole" }
    Start-Sleep -Milliseconds 250
  }
  throw "DOGFOOD_V31_COORD_SUPERVISOR_STATE_TIMEOUT:$ExpectedRole"
}

function Resolve-V31OldRoleConvergenceDecision([bool]$OldSupervisorAlive, [bool]$OldListenerMatches, [int]$PortOwnerCount) {
  if ($OldSupervisorAlive) {
    if ($OldListenerMatches -and $PortOwnerCount -eq 1) { return 'retain' }
    return 'reject'
  }
  if ($PortOwnerCount -eq 0) { return 'restart' }
  'reject'
}

Export-ModuleMember -Function Get-V31FullPath,Get-V31Sha256,Read-V31Json,Assert-V31EvidenceRoot,Write-V31Json,Get-V31ProcessRecord,Assert-V31Process,Get-V31ListenerPid,Wait-V31HttpReady,Stop-V31ExactTree,Start-V31Supervisor,Resolve-V31OldRoleConvergenceDecision
