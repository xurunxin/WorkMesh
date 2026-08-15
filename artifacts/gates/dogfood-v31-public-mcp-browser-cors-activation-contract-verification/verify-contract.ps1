Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_MCP_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$contractPath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation-contract.json'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation'
$independent = Join-Path $repoRoot 'artifacts\gates\dogfood-v31-public-mcp-browser-cors-activation-contract-verification\independent'
$badRoot = Join-Path $repoRoot 'artifacts\gates\dogfood-v31-public-mcp-browser-cors-activation-contract-verification\worker-sibling'
$modulePath = Join-Path $runtimeRoot 'runtime-module.psm1'
Import-Module $modulePath -Force
$contract = Read-V31McpJson $contractPath
$contractSha = Get-V31McpSha256 $contractPath
$null = Assert-V31McpEvidenceRoot $independent @($independent)

function Get-RuntimeSnapshot {
  $rows = @()
  foreach ($role in @($contract.protectedRoles)) {
    $supervisor = Assert-V31McpProcess ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) @([string]$role.supervisorNeedle)
    $listener = Assert-V31McpProcess ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) @([string]$role.listenerNeedle)
    if ((Get-V31McpListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_MCP_CORS_RUNTIME_LISTENER_DRIFT:$($role.name)" }
    $health = Wait-V31McpHttp ([string]$role.healthUrl) @(200) 20
    $rows += [pscustomobject]@{name=$role.name;port=[int]$role.port;supervisorPid=[int]$supervisor.pid;supervisorStartTimeUtc=$supervisor.startTimeUtc;listenerPid=[int]$listener.pid;listenerStartTimeUtc=$listener.startTimeUtc;health=[int]$health.StatusCode}
  }
  $oldSupervisor = Assert-V31McpProcess ([int]$contract.oldMcp.supervisorPid) ([string]$contract.oldMcp.supervisorStartTimeUtc) @([string]$contract.oldMcp.supervisorScript,[string]$contract.oldMcp.contractPath)
  $oldListener = Assert-V31McpProcess ([int]$contract.oldMcp.listenerPid) ([string]$contract.oldMcp.listenerStartTimeUtc) @([string]$contract.oldMcp.entrypointPath,[string]$contract.oldMcp.root)
  if ((Get-V31McpListenerPid 3302) -ne [int]$contract.oldMcp.listenerPid) { throw 'DOGFOOD_V31_MCP_CORS_OLD_LISTENER_DRIFT' }
  $mcpHealth = Wait-V31McpHttp ([string]$contract.oldMcp.healthUrl) @(200) 20
  $minioHealth = Wait-V31McpHttp ([string]$contract.objectStorage.healthUrl) @(200) 20
  [ordered]@{protected=$rows;mcp=[pscustomobject]@{supervisorPid=[int]$oldSupervisor.pid;supervisorStartTimeUtc=$oldSupervisor.startTimeUtc;listenerPid=[int]$oldListener.pid;listenerStartTimeUtc=$oldListener.startTimeUtc;health=[int]$mcpHealth.StatusCode};minio=[int]$minioHealth.StatusCode}
}

$fixed = @(
  @{path=$contract.graph.path;sha=$contract.graph.sha256},
  @{path='artifacts/gates/dogfood-v31-public-mcp-browser-cors-gate.yaml';sha=$contract.claimInputs.implementationGateSha256},
  @{path='artifacts/implementation/dogfood-v31-public-mcp-browser-cors-repair.json';sha=$contract.claimInputs.implementationReportSha256},
  @{path=$contract.candidateSource.httpPath;sha=$contract.candidateSource.httpSha256}
)
foreach($entry in $fixed){if((Get-V31McpSha256 (Join-Path $repoRoot ([string]$entry.path))) -cne [string]$entry.sha){throw "DOGFOOD_V31_MCP_CORS_FIXED_INPUT_DRIFT:$($entry.path)"}}
foreach($entry in $contract.scripts.psobject.Properties){if((Get-V31McpSha256 (Join-Path $repoRoot ([string]$entry.Value.path))) -cne [string]$entry.Value.sha256){throw "DOGFOOD_V31_MCP_CORS_SCRIPT_DRIFT:$($entry.Name)"}}
foreach($entry in @(@{path=$contract.oldMcp.supervisorScript;sha=$contract.oldMcp.supervisorScriptSha256},@{path=$contract.oldMcp.entrypointPath;sha=$contract.oldMcp.entrypointSha256},@{path=$contract.oldMcp.contractPath;sha=$contract.oldMcp.contractSha256},@{path=$contract.oldMcp.executionBindingPath;sha=$contract.oldMcp.executionBindingSha256})){if((Get-V31McpSha256 ([string]$entry.path)) -cne [string]$entry.sha){throw "DOGFOOD_V31_MCP_CORS_OLD_INPUT_DRIFT:$($entry.path)"}}
$before = Get-RuntimeSnapshot

$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
& $pwsh -NoLogo -NoProfile -NonInteractive -File (Join-Path $runtimeRoot 'audit-ast.ps1') -EvidenceRoot $independent
if ($LASTEXITCODE -ne 0) { throw 'DOGFOOD_V31_MCP_CORS_AST_PROBE_FAILED' }
& $pwsh -NoLogo -NoProfile -NonInteractive -File (Join-Path $runtimeRoot 'test-compensation.ps1') -EvidenceRoot $independent
if ($LASTEXITCODE -ne 0) { throw 'DOGFOOD_V31_MCP_CORS_COMPENSATION_PROBE_FAILED' }
& $pwsh -NoLogo -NoProfile -NonInteractive -File (Join-Path $runtimeRoot 'start-mcp-only.ps1') -DryRun -ContractPath $contractPath -ContractSha256 $contractSha -EvidenceRoot $independent
if ($LASTEXITCODE -ne 0) { throw 'DOGFOOD_V31_MCP_CORS_START_DRY_RUN_FAILED' }
& $pwsh -NoLogo -NoProfile -NonInteractive -File (Join-Path $runtimeRoot 'rollback-mcp-only.ps1') -DryRun -ContractPath $contractPath -ContractSha256 $contractSha -EvidenceRoot $independent
if ($LASTEXITCODE -ne 0) { throw 'DOGFOOD_V31_MCP_CORS_ROLLBACK_DRY_RUN_FAILED' }

if (Test-Path -LiteralPath $badRoot) { throw 'DOGFOOD_V31_MCP_CORS_BAD_ROOT_PREEXISTED' }
$wrongRootResults = @()
$badCalls = @(
  @{name='start';script='start-mcp-only.ps1';args=@('-DryRun','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-EvidenceRoot',$badRoot)},
  @{name='rollback';script='rollback-mcp-only.ps1';args=@('-DryRun','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-EvidenceRoot',$badRoot)},
  @{name='supervisor';script='role-supervisor.ps1';args=@('-DryRun','-Mode','candidate','-ContractPath',$contractPath,'-ContractSha256',$contractSha,'-StatePath',(Join-Path $runtimeRoot 'runtime\probe.json'),'-StopPath',(Join-Path $runtimeRoot 'runtime\probe.stop'),'-EvidenceRoot',$badRoot)}
)
foreach($call in $badCalls){
  $output = @(& $pwsh -NoLogo -NoProfile -NonInteractive -File (Join-Path $runtimeRoot $call.script) @($call.args) 2>&1)
  if ($LASTEXITCODE -eq 0 -or (Test-Path -LiteralPath $badRoot)) { throw "DOGFOOD_V31_MCP_CORS_WRONG_ROOT_NOT_REJECTED:$($call.name)" }
  $wrongRootResults += [pscustomobject]@{name=$call.name;exitCode=$LASTEXITCODE;rejected=[bool]1;residue=[bool]0;error=([string]($output | Select-Object -Last 1))}
}

$future = @($contract.execution.requestPath,$contract.execution.approvalPath,$contract.execution.activationPath,$contract.execution.rollbackPath)
foreach($path in $future){if(Test-Path -LiteralPath (Join-Path $repoRoot ([string]$path))){throw "DOGFOOD_V31_MCP_CORS_FUTURE_ARTIFACT_EXISTS:$path"}}
foreach($path in @($contract.candidateMcp.statePath,$contract.candidateMcp.stopPath,$contract.rollbackMcp.statePath,$contract.rollbackMcp.stopPath)){if(Test-Path -LiteralPath (Join-Path $repoRoot ([string]$path))){throw "DOGFOOD_V31_MCP_CORS_RUNTIME_RESIDUE:$path"}}
if(Test-Path -LiteralPath (Join-Path $runtimeRoot ([string]$contract.execution.executionBindingPath))){throw 'DOGFOOD_V31_MCP_CORS_RUNTIME_RESIDUE:execution-binding'}
$after = Get-RuntimeSnapshot
if (($before | ConvertTo-Json -Depth 20 -Compress) -cne ($after | ConvertTo-Json -Depth 20 -Compress)) { throw 'DOGFOOD_V31_MCP_CORS_RUNTIME_INVARIANCE_FAILED' }
$originResponse = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3301/mcp' -Headers @{Origin='http://127.0.0.1:3300'} -TimeoutSec 4
$currentAllowOrigin = [string]@($originResponse.Headers['Access-Control-Allow-Origin'])[0]

$summary = [ordered]@{
  artifactVersion=1
  kind='DogfoodV31PublicMcpBrowserCorsActivationContractIndependentVerification'
  result='PASS'
  contractPath='artifacts/runtime/dogfood-v31-public-mcp-browser-cors-activation-contract.json'
  contractSha256=$contractSha
  fixedInputs=4
  boundScripts=@($contract.scripts.psobject.Properties).Count
  dryRuns=@('supervisor','start','rollback')
  compensationCases=5
  ownerDecisionCases=5
  wrongRoot=$wrongRootResults
  runtimeBefore=$before
  runtimeAfter=$after
  runtimeInvariant=[bool]1
  futureArtifactsAbsent=4
  runtimeResidue=0
  currentPreActivationCors=[ordered]@{status=[int]$originResponse.StatusCode;allowOrigin=$currentAllowOrigin;expectedToBeRepairedByActivation=[bool]1}
  transitionScope='request_creation_only'
  requestCreation=[bool]0
  activation=[bool]0
  browser=[bool]0
  workmeshMutation=[bool]0
  securityScan=[bool]0
  checkedAt=[DateTimeOffset]::UtcNow.ToString('O')
}
Write-V31McpJson (Join-Path $independent 'final-independent-summary.json') $summary
$summary | ConvertTo-Json -Depth 30
