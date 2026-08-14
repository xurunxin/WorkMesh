param([Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation'
Import-Module (Join-Path $runtimeRoot 'runtime-module.psm1') -Force
$allowed = @(
  (Join-Path $runtimeRoot 'evidence\worker'),
  (Join-Path $controlRoot 'artifacts\gates\dogfood-v31-coordination-feature-binding-verification\independent')
)
$root = Assert-V31EvidenceRoot $EvidenceRoot $allowed
$cases = @(
  @{name='exact-old-retained';alive=$true;listener=$true;owners=1;expected='retain'},
  @{name='old-missing-clean-port';alive=$false;listener=$false;owners=0;expected='restart'},
  @{name='old-missing-unknown-owner';alive=$false;listener=$false;owners=1;expected='reject'},
  @{name='old-alive-wrong-listener';alive=$true;listener=$false;owners=1;expected='reject'},
  @{name='old-alive-duplicate-listener';alive=$true;listener=$true;owners=2;expected='reject'}
)
$results = @()
foreach ($case in $cases) {
  $actual = Resolve-V31OldRoleConvergenceDecision ([bool]$case.alive) ([bool]$case.listener) ([int]$case.owners)
  if ($actual -cne $case.expected) { throw "DOGFOOD_V31_COORD_COMPENSATION_CASE_FAILED:$($case.name)" }
  $results += [ordered]@{name=$case.name;actual=$actual;expected=$case.expected;passed=$true}
}
Write-V31Json (Join-Path $root 'compensation-probe.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureCompensationProbe';result='PASS';cases=$results;productionFunction='Resolve-V31OldRoleConvergenceDecision';serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
