param([Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation-attempt-2'
Import-Module (Join-Path $runtimeRoot 'runtime-module.psm1') -Force
$allowed = @(
  (Join-Path $runtimeRoot 'evidence\worker'),
  (Join-Path $controlRoot 'artifacts\gates\dogfood-v31-coordination-feature-binding-verification-attempt-2\independent')
)
$root = Assert-V31EvidenceRoot $EvidenceRoot $allowed
$contract = [pscustomobject]@{
  oldRoles = [pscustomobject]@{
    api = [pscustomobject]@{supervisorPid=101;supervisorStartTimeUtc='2026-08-14T00:00:00Z';listenerPid=201;port=3303;healthUrl='http://api/readyz';scriptPath='old-api.ps1';contractPath='old-api.json';contractSha256='api-sha';statePath='api.json';stopPath='api.stop';mode='candidate'}
    worker = [pscustomobject]@{supervisorPid=102;supervisorStartTimeUtc='2026-08-14T00:00:00Z';listenerPid=202;port=3304;healthUrl='http://worker/readyz';scriptPath='old-worker.ps1';contractPath='old-worker.json';contractSha256='worker-sha';statePath='worker.json';stopPath='worker.stop';mode=$null}
  }
}
$cases = @(
  @{name='both-retained';alive=@{api=$true;worker=$true};owners=@{api=@(201);worker=@(202)};restartFail=$null;cleanupFail=$null;expected='ROLLED_BACK_RUNTIME_VERIFIED';api='retained';worker='retained'},
  @{name='partial-stop-api-restarted-worker-retained';alive=@{api=$false;worker=$true};owners=@{api=@();worker=@(202)};restartFail=$null;cleanupFail=$null;expected='ROLLED_BACK_RUNTIME_VERIFIED';api='restarted';worker='retained'},
  @{name='unknown-api-owner';alive=@{api=$false;worker=$true};owners=@{api=@(909);worker=@(202)};restartFail=$null;cleanupFail=$null;expected='ROLLBACK_FAILED';api='error';worker='retained'},
  @{name='api-restart-failure';alive=@{api=$false;worker=$true};owners=@{api=@();worker=@(202)};restartFail='api';cleanupFail=$null;expected='ROLLBACK_FAILED';api='error';worker='retained'},
  @{name='candidate-cleanup-failure';alive=@{api=$true;worker=$true};owners=@{api=@(201);worker=@(202)};restartFail=$null;cleanupFail='worker';expected='ROLLBACK_FAILED';api='retained';worker='retained'}
)
$results = @()
foreach ($case in $cases) {
  $scenario = [pscustomobject]@{case=$case;receipt=$null;startCalls=0;stopCalls=0;assertProtectedCalls=0}
  $getProcessRecord = { param([int]$ProcessId) $role = if ($ProcessId -eq 101) {'api'} else {'worker'}; if ($scenario.case.alive[$role]) {[pscustomobject]@{pid=$ProcessId}} else {$null} }.GetNewClosure()
  $getPortOwners = { param([int]$Port) $role = if ($Port -eq 3303) {'api'} else {'worker'}; @($scenario.case.owners[$role]) }.GetNewClosure()
  $assertProcess = { param([int]$ProcessId,[string]$StartTimeUtc,[string[]]$CommandNeedles) }.GetNewClosure()
  $getListenerPid = { param([int]$Port) $role = if ($Port -eq 3303) {'api'} else {'worker'}; [int]$scenario.case.owners[$role][0] }.GetNewClosure()
  $waitHttpReady = { param([string]$Url,[int]$Attempts) }.GetNewClosure()
  $removePath = { param([string]$Path) }.GetNewClosure()
  $startSupervisor = { param([string]$ScriptPath,[string[]]$Arguments,[string]$StatePath,[int]$Port,[string]$HealthUrl,[string]$Role) $scenario.startCalls++; if ($scenario.case.restartFail -eq $Role) { throw "SYNTHETIC_RESTART_FAILURE:$Role" }; [pscustomobject]@{role=$Role;status='restarted';supervisorPid=500;listenerPid=600} }.GetNewClosure()
  $stopCandidate = { param([string]$Role) $scenario.stopCalls++; if ($scenario.case.cleanupFail -eq $Role) { throw "SYNTHETIC_CLEANUP_FAILURE:$Role" }; [pscustomobject]@{role=$Role;status='absent'} }.GetNewClosure()
  $assertProtected = { $scenario.assertProtectedCalls++ }.GetNewClosure()
  $writeReceipt = { param([object]$Receipt) $scenario.receipt = $Receipt }.GetNewClosure()
  $operations = @{
    GetProcessRecord=$getProcessRecord;GetPortOwners=$getPortOwners;AssertProcess=$assertProcess;GetListenerPid=$getListenerPid;WaitHttpReady=$waitHttpReady;RemovePath=$removePath;StartSupervisor=$startSupervisor;StopCandidate=$stopCandidate;AssertProtected=$assertProtected;WriteReceipt=$writeReceipt
  }
  $actual = Invoke-V31CoordinationCompensation $contract $controlRoot 'contract-sha' 'synthetic-primary' $true $operations
  if ($actual.result -cne $case.expected -or -not $actual.receiptWritten -or $scenario.receipt.result -cne $case.expected) { throw "DOGFOOD_V31_COORD_COMPENSATION_CASE_FAILED:$($case.name)" }
  $apiStatus = @($actual.oldRoleRestore | Where-Object role -eq 'api')[0].status
  $workerStatus = @($actual.oldRoleRestore | Where-Object role -eq 'worker')[0].status
  if ($apiStatus -cne $case.api -or $workerStatus -cne $case.worker -or $scenario.stopCalls -ne 2 -or $scenario.assertProtectedCalls -ne 1) { throw "DOGFOOD_V31_COORD_COMPENSATION_SEAM_MISMATCH:$($case.name)" }
  $results += [ordered]@{name=$case.name;result=$actual.result;receiptResult=$scenario.receipt.result;api=$apiStatus;worker=$workerStatus;startCalls=$scenario.startCalls;stopCalls=$scenario.stopCalls;assertProtectedCalls=$scenario.assertProtectedCalls;passed=$true}
}
Write-V31Json (Join-Path $root 'compensation-probe.json') ([ordered]@{artifactVersion=2;kind='DogfoodV31CoordinationFeatureCompensationProbe';result='PASS';cases=$results;productionFunctions=@('Invoke-V31CoordinationCompensation','Invoke-V31OldRoleRestore');productionCatchBinding='start-feature-binding.ps1';terminalReceiptExecuted=$true;serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
