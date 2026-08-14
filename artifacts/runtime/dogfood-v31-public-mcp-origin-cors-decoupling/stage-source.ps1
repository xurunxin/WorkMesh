param(
  [switch]$DryRun,
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot,
  [string]$ExecutionBindingPath,
  [string]$ExecutionBindingSha256
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_CORS_REQUIRES_POWERSHELL_7' }
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$runtimeRoot = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling-activation-contract.json'
$expectedBinding = Join-Path $runtimeRoot 'authorization\execution-binding.json'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force

if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract)) { throw 'DOGFOOD_V31_CORS_CONTRACT_PATH_REJECTED' }
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_CORS_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
if ($contract.kind -ne 'DogfoodV31PublicMcpOriginCorsDecouplingActivationContract' -or $contract.selectorBinding -ne 'v31-public-mcp-origin-cors-decoupling-v1') { throw 'DOGFOOD_V31_CORS_CONTRACT_INVALID' }
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
foreach ($entry in @($contract.candidateSource.files)) {
  $path = Join-Path $repoRoot ([string]$entry.path)
  if ((Get-V31OriginSha256 $path) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_CORS_SOURCE_DRIFT:$($entry.path)" }
}
foreach ($entry in @($contract.candidateSource.packageFiles)) {
  $path = Join-Path $repoRoot ([string]$entry.path)
  if ((Get-V31OriginSha256 $path) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_CORS_PACKAGE_DRIFT:$($entry.path)" }
}
$manifest = [ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingPreparedSource';selectorBinding=$contract.selectorBinding;contractSha256=$ContractSha256;root=[string]$contract.candidateApi.root;files=@($contract.candidateSource.files);packageFiles=@($contract.candidateSource.packageFiles);preparedByReference=[bool]1;targetMutationExecuted=[bool]0;preparedAt=[DateTimeOffset]::UtcNow.ToString('O')}
if ($DryRun) {
  Write-V31OriginJson (Join-Path $evidence 'stage-dry-run.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingStageDryRun';result='PASS';contractSha256=$ContractSha256;sourceFiles=@($contract.candidateSource.files).Count;packageFiles=@($contract.candidateSource.packageFiles).Count;preparedWriteExecuted=[bool]0;serviceMutationExecuted=[bool]0;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
  exit 0
}
if ([string]::IsNullOrWhiteSpace($ExecutionBindingPath) -or [string]::IsNullOrWhiteSpace($ExecutionBindingSha256)) { throw 'DOGFOOD_V31_CORS_DIRECT_STAGE_REJECTED' }
if ((Get-V31OriginFullPath $ExecutionBindingPath) -cne (Get-V31OriginFullPath $expectedBinding) -or (Get-V31OriginSha256 $ExecutionBindingPath) -cne $ExecutionBindingSha256) { throw 'DOGFOOD_V31_CORS_STAGE_BINDING_REJECTED' }
$binding = Read-V31OriginJson $ExecutionBindingPath
if ($binding.kind -ne 'DogfoodV31PublicMcpOriginCorsDecouplingExecutionBinding' -or $binding.contractSha256 -cne $ContractSha256 -or $binding.authorizingScript -ne 'start-api-only.ps1' -or [string]::IsNullOrWhiteSpace([string]$binding.approvalSha256)) { throw 'DOGFOOD_V31_CORS_STAGE_BINDING_INVALID' }
$selfCim = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
if ([int]$selfCim.ParentProcessId -ne [int]$binding.authorizingStartPid) { throw 'DOGFOOD_V31_CORS_STAGE_CALLER_REJECTED' }
Assert-V31OriginProcess ([int]$binding.authorizingStartPid) ([string]$binding.authorizingStartTimeUtc) @('start-api-only.ps1',$ContractSha256) | Out-Null
$preparedPath = Join-Path $repoRoot ([string]$contract.execution.preparedSourcePath)
Write-V31OriginJson $preparedPath $manifest
Get-V31OriginSha256 $preparedPath
