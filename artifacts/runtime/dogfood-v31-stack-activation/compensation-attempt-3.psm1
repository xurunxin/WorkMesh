Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-V31Attempt3Compensation {
  param(
    [hashtable]$CandidateRuntime,
    [object[]]$ReplacedRuntime,
    [string]$Reason,
    [scriptblock]$StopCandidate,
    [scriptblock]$GetListenerOwners,
    [scriptblock]$IsOldSupervisorAlive,
    [scriptblock]$AssertRetainedOwner,
    [scriptblock]$StartRollbackOwner,
    [scriptblock]$VerifyRestoredRuntime,
    [scriptblock]$WriteTerminalReceipt
  )
  $restored = [ordered]@{}
  $candidateStops = [ordered]@{}
  $terminalStatus = 'ROLLED_BACK_RUNTIME_VERIFIED'
  $compensationError = $null
  try {
    foreach ($name in @('web','mcp')) {
      if ($CandidateRuntime.ContainsKey($name)) {
        $candidateStops[$name] = & $StopCandidate $name $CandidateRuntime[$name]
      }
    }
    foreach ($role in $ReplacedRuntime) {
      $owners = @(& $GetListenerOwners $role)
      $oldSupervisorAlive = [bool](& $IsOldSupervisorAlive $role)
      if ($owners.Count -eq 1 -and [int]$owners[0] -eq [int]$role.listenerPid -and $oldSupervisorAlive) {
        $restored[[string]$role.role] = & $AssertRetainedOwner $role
      } elseif ($owners.Count -eq 0) {
        $restored[[string]$role.role] = & $StartRollbackOwner $role
      } else {
        throw "DOGFOOD_V31_COMPENSATION_UNKNOWN_OWNER:$($role.role)"
      }
    }
    $null = & $VerifyRestoredRuntime
  } catch {
    $terminalStatus = 'ROLLBACK_FAILED'
    $compensationError = $_.Exception.Message
  }
  $receipt = [ordered]@{
    artifactVersion = 1
    kind = 'DogfoodV31StackRollback'
    status = $terminalStatus
    reason = $Reason
    compensationError = $compensationError
    rolledBackAt = [DateTimeOffset]::UtcNow.ToString('O')
    candidateStops = $candidateStops
    restored = $restored
    databaseMutation = [bool]0
    objectStoreMutation = [bool]0
  }
  & $WriteTerminalReceipt $receipt
  if ($terminalStatus -ne 'ROLLED_BACK_RUNTIME_VERIFIED') {
    throw "DOGFOOD_V31_COMPENSATION_FAILED:$compensationError"
  }
  [pscustomobject]$receipt
}

Export-ModuleMember -Function Invoke-V31Attempt3Compensation
