Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-V31FullPath([string]$Path) {
  [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Test-V31UnderPath([string]$Path, [string]$Root) {
  $fullPath = Get-V31FullPath $Path
  $fullRoot = Get-V31FullPath $Root
  $fullPath.Equals($fullRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $fullPath.StartsWith($fullRoot + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Get-V31Sha256([string]$Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Convert-V31OriginBytes([byte[]]$Bytes) {
  $from = [Text.Encoding]::UTF8.GetBytes('http://127.0.0.1:34601')
  $to = [Text.Encoding]::UTF8.GetBytes('http://127.0.0.1:3301')
  $output = [IO.MemoryStream]::new()
  try {
    $index = 0
    while ($index -lt $Bytes.Length) {
      $matched = $index + $from.Length -le $Bytes.Length
      if ($matched) {
        for ($offset = 0; $offset -lt $from.Length; $offset++) {
          if ($Bytes[$index + $offset] -ne $from[$offset]) {
            $matched = [bool]0
            break
          }
        }
      }
      if ($matched) {
        $output.Write($to, 0, $to.Length)
        $index += $from.Length
      } else {
        $output.WriteByte($Bytes[$index])
        $index++
      }
    }
    $output.ToArray()
  } finally {
    $output.Dispose()
  }
}

function Assert-V31Process([int]$ProcessId, [string]$StartTimeUtc, [string]$CommandNeedle, [string]$Role) {
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  if ($process.StartTime.ToUniversalTime().Ticks -ne [DateTimeOffset]::Parse($StartTimeUtc).UtcTicks) {
    throw "DOGFOOD_V31_PROCESS_START_MISMATCH:$Role"
  }
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
  if ($null -eq $cim -or [string]$cim.CommandLine -notlike "*$CommandNeedle*") {
    throw "DOGFOOD_V31_PROCESS_COMMAND_MISMATCH:$Role"
  }
  [pscustomobject]@{ pid = $ProcessId; startTimeUtc = $process.StartTime.ToUniversalTime().ToString('O'); commandLine = [string]$cim.CommandLine }
}

function Get-V31ListenerPid([int]$Port) {
  $owners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1) { throw "DOGFOOD_V31_LISTENER_COUNT:${Port}:$($owners.Count)" }
  [int]$owners[0]
}

function Wait-V31HttpReady([string]$Url, [int]$Attempts = 120) {
  foreach ($attempt in 1..$Attempts) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 2
      if ([int]$response.StatusCode -eq 200) { return [int]$response.StatusCode }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  throw "DOGFOOD_V31_HTTP_TIMEOUT:$Url"
}

function Stop-V31ExactTree([int]$ProcessId, [string]$StartTimeUtc, [string]$CommandNeedle, [string]$StopPath, [int[]]$ProtectedPids, [string]$Role) {
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) { return [pscustomobject]@{ role = $Role; alreadyStopped = [bool]1 } }
  $null = Assert-V31Process $ProcessId $StartTimeUtc $CommandNeedle $Role
  if ($ProtectedPids -contains $ProcessId) { throw "DOGFOOD_V31_PROTECTED_PROCESS:$Role" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StopPath) | Out-Null
  New-Item -ItemType File -Force -Path $StopPath | Out-Null
  foreach ($attempt in 1..40) {
    if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return [pscustomobject]@{ role = $Role; graceful = [bool]1 } }
    Start-Sleep -Milliseconds 100
  }
  taskkill.exe /PID $ProcessId /T /F | Out-Null
  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) { throw "DOGFOOD_V31_STOP_FAILED:$Role" }
  [pscustomobject]@{ role = $Role; graceful = [bool]0; forced = [bool]1 }
}

function Wait-V31SupervisorState([string]$StatePath, [string]$Mode, [int]$SupervisorPid) {
  foreach ($attempt in 1..120) {
    if (Test-Path -LiteralPath $StatePath) {
      $state = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json -DateKind String
      if ($state.status -eq 'RUNNING' -and $state.mode -eq $Mode) { return $state }
    }
    if ($null -eq (Get-Process -Id $SupervisorPid -ErrorAction SilentlyContinue)) { throw 'DOGFOOD_V31_SUPERVISOR_EXITED' }
    Start-Sleep -Milliseconds 250
  }
  throw 'DOGFOOD_V31_SUPERVISOR_STATE_TIMEOUT'
}

function Read-V31GateReport([string]$Path) {
  $lines = @(Get-Content -LiteralPath $Path)
  if (@($lines | Where-Object { $_ -ceq 'GateReport:' }).Count -ne 1) { throw 'DOGFOOD_V31_GATE_ROOT_INVALID' }
  if (@($lines | Where-Object { $_ -ceq '  result: PASS' }).Count -ne 1) { throw 'DOGFOOD_V31_GATE_RESULT_INVALID' }
  $transitionIndex = [Array]::IndexOf($lines, '  transition:')
  if ($transitionIndex -lt 0) { throw 'DOGFOOD_V31_GATE_TRANSITION_MISSING' }
  $transitionLines = @()
  for ($index = $transitionIndex + 1; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^  [^ ]') { break }
    $transitionLines += $lines[$index]
  }
  if (@($transitionLines | Where-Object { $_ -ceq '    allowed: true' }).Count -ne 1) { throw 'DOGFOOD_V31_GATE_ALLOWED_INVALID' }
  if (@($transitionLines | Where-Object { $_ -ceq '    scope: request_creation_only' }).Count -ne 1) { throw 'DOGFOOD_V31_GATE_SCOPE_INVALID' }
  [pscustomobject]@{ result = 'PASS'; allowed = [bool]1; scope = 'request_creation_only' }
}

function Assert-V31Authorization($Request, $Approval, $Contract, [string]$ContractSha256, [string]$GateSha256, [string]$RequestSha256, [DateTimeOffset]$Now) {
  if ([string]$Request.selectorBinding -cne [string]$Contract.selectorBinding -or [string]$Approval.selectorBinding -cne [string]$Contract.selectorBinding) { throw 'DOGFOOD_V31_AUTH_SELECTOR' }
  if ([string]$Request.scope -cne 'v31_stack_activation_once' -or [string]$Approval.scope -cne 'v31_stack_activation_once') { throw 'DOGFOOD_V31_AUTH_SCOPE' }
  if ([string]$Request.contractSha256 -cne $ContractSha256 -or [string]$Request.gateSha256 -cne $GateSha256) { throw 'DOGFOOD_V31_REQUEST_BINDING' }
  if ([string]$Approval.contractSha256 -cne $ContractSha256 -or [string]$Approval.gateSha256 -cne $GateSha256 -or [string]$Approval.requestSha256 -cne $RequestSha256) { throw 'DOGFOOD_V31_APPROVAL_BINDING' }
  if ([string]$Approval.decision -cne 'approved') { throw 'DOGFOOD_V31_APPROVAL_DECISION' }
  $requestExpiry = [DateTimeOffset]::Parse([string]$Request.expiresAt)
  $approvalExpiry = [DateTimeOffset]::Parse([string]$Approval.expiresAt)
  if ($requestExpiry -le $Now -or $approvalExpiry -le $Now -or $approvalExpiry -gt $requestExpiry) { throw 'DOGFOOD_V31_AUTH_EXPIRED' }
  [pscustomobject]@{ selectorBinding = [string]$Contract.selectorBinding; expiresAt = $approvalExpiry.ToString('O') }
}

function Get-V31RestoreDecision([int[]]$ListenerOwners, [int]$ExpectedOldListenerPid, [bool]$ExpectedOldSupervisorAlive) {
  if ($ListenerOwners.Count -eq 1 -and $ListenerOwners[0] -eq $ExpectedOldListenerPid -and $ExpectedOldSupervisorAlive) { return 'retain_exact_old_owner' }
  if ($ListenerOwners.Count -eq 0) { return 'start_rollback_owner' }
  'fail_closed_unknown_or_partial_owner'
}

Export-ModuleMember -Function Get-V31FullPath, Test-V31UnderPath, Get-V31Sha256, Convert-V31OriginBytes, Assert-V31Process, Get-V31ListenerPid, Wait-V31HttpReady, Stop-V31ExactTree, Wait-V31SupervisorState, Read-V31GateReport, Assert-V31Authorization, Get-V31RestoreDecision
