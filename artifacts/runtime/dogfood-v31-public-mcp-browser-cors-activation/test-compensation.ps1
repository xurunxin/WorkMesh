param([Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation\runtime-module.psm1'
Import-Module $modulePath -Force
$allowed = Join-Path $repoRoot 'artifacts\gates\dogfood-v31-public-mcp-browser-cors-activation-contract-verification\independent'
$root = Assert-V31McpEvidenceRoot $EvidenceRoot @($allowed)
$contract = Read-V31McpJson (Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation-contract.json')
$decisions = @(
  [pscustomobject]@{name='retained';actual=(Resolve-V31McpOldOwnerDecision ([bool]1) @([int]$contract.oldMcp.listenerPid) ([int]$contract.oldMcp.listenerPid));expected='retained'},
  [pscustomobject]@{name='missing';actual=(Resolve-V31McpOldOwnerDecision ([bool]0) @() ([int]$contract.oldMcp.listenerPid));expected='missing'},
  [pscustomobject]@{name='wrong-listener';actual=(Resolve-V31McpOldOwnerDecision ([bool]1) @(99999) ([int]$contract.oldMcp.listenerPid));expected='unknown'},
  [pscustomobject]@{name='extra-listener';actual=(Resolve-V31McpOldOwnerDecision ([bool]1) @([int]$contract.oldMcp.listenerPid,99999) ([int]$contract.oldMcp.listenerPid));expected='unknown'},
  [pscustomobject]@{name='listener-without-supervisor';actual=(Resolve-V31McpOldOwnerDecision ([bool]0) @([int]$contract.oldMcp.listenerPid) ([int]$contract.oldMcp.listenerPid));expected='unknown'}
)
foreach($decision in $decisions){if($decision.actual -ne $decision.expected){throw "DOGFOOD_V31_MCP_CORS_OWNER_DECISION_FAILED:$($decision.name)"}}
$liveSupervisor = Get-V31McpProcessRecord ([int]$contract.oldMcp.supervisorPid)
[int[]]$liveOwners = @(Get-NetTCPConnection -State Listen -LocalPort 3302 -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
$liveDecision = Resolve-V31McpOldOwnerDecision ([bool]($null -ne $liveSupervisor)) $liveOwners ([int]$contract.oldMcp.listenerPid)
if ($liveDecision -ne 'retained') { throw 'DOGFOOD_V31_MCP_CORS_LIVE_OWNER_DECISION_FAILED' }
$cases = @()
foreach ($case in @(
  @{name='retained';decision='retained';cleanupFails=[bool]0;restoreFails=[bool]0;expected='ROLLED_BACK_RUNTIME_VERIFIED'},
  @{name='missing';decision='missing';cleanupFails=[bool]0;restoreFails=[bool]0;expected='ROLLED_BACK_RUNTIME_VERIFIED'},
  @{name='unknown';decision='unknown';cleanupFails=[bool]0;restoreFails=[bool]0;expected='ROLLBACK_FAILED'},
  @{name='cleanup-failure';decision='retained';cleanupFails=[bool]1;restoreFails=[bool]0;expected='ROLLBACK_FAILED'},
  @{name='restore-failure';decision='missing';cleanupFails=[bool]0;restoreFails=[bool]1;expected='ROLLBACK_FAILED'}
)) {
  $terminal = $null
  $threw = [bool]0
  try {
    $null = Invoke-V31McpCompensation -PrimaryError $case.name -StopCandidate { if ($case.cleanupFails) { throw 'synthetic_cleanup' }; [pscustomobject]@{status='stopped'} } -DiscoverOldOwner { $case.decision } -RestoreOldOwner { if ($case.restoreFails) { throw 'synthetic_restore' }; [pscustomobject]@{status='started'} } -VerifyRestoredRuntime { if ($case.restoreFails) { throw 'synthetic_verify' } } -WriteTerminalReceipt { param([object]$Receipt) $script:terminal=$Receipt }
  } catch { $threw = [bool]1 }
  if ($null -eq $terminal -or [string]$terminal.result -ne [string]$case.expected) { throw "DOGFOOD_V31_MCP_CORS_COMPENSATION_CASE_FAILED:$($case.name)" }
  if (($case.expected -eq 'ROLLBACK_FAILED') -ne $threw) { throw "DOGFOOD_V31_MCP_CORS_COMPENSATION_THROW_FAILED:$($case.name)" }
  $cases += [pscustomobject]@{name=$case.name;result=$terminal.result;threw=$threw}
}
Write-V31McpJson (Join-Path $root 'compensation-matrix.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsCompensationMatrix';result='PASS';ownerDecisions=$decisions;liveOwnerDecision=$liveDecision;cases=$cases;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
