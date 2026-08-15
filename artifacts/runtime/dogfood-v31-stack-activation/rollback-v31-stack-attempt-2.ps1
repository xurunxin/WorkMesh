param([switch]$DryRun, [string]$ContractSha256, [string]$ContractGateSha256, [string]$RequestSha256, [string]$ApprovalSha256, [string]$ActivationSha256, [string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification-attempt-2\independent'
$contractPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract-attempt-2.json'
$gatePath = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-gate-attempt-2.yaml'
$requestPath = Join-Path $controlRoot 'artifacts\approvals\dogfood-v31-stack-activation-request-attempt-2.json'
$approvalPath = Join-Path $controlRoot 'artifacts\approvals\dogfood-v31-stack-activation-human-approval-attempt-2.json'
$activationPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation.json'
$rollbackPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-rollback.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor.ps1'
Import-Module $modulePath -Force

function Get-Status([string]$Url) { try { [int](Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 4).StatusCode } catch { 0 } }
function Assert-Build([string]$Required, [string]$Forbidden) {
  if ((Get-Status "http://127.0.0.1:3300/_next/static/$Required/_buildManifest.js") -ne 200) { throw 'DOGFOOD_V31_REQUIRED_BUILD_MISSING' }
  if ((Get-Status "http://127.0.0.1:3300/_next/static/$Forbidden/_buildManifest.js") -eq 200) { throw 'DOGFOOD_V31_FORBIDDEN_BUILD_SERVED' }
}
function Start-Role([string]$Role, [string]$EffectiveContractSha) {
  $statePath = Join-Path $runtimeRoot "runtime\rollback-$Role.json"
  $stopPath = Join-Path $runtimeRoot "runtime\rollback-$Role.stop"
  Remove-Item -LiteralPath $statePath,$stopPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statePath) | Out-Null
  $process = Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoLogo','-NoProfile','-File',$supervisorPath,'-Role',$Role,'-Mode','rollback','-ContractPath',$contractPath,'-ContractSha256',$EffectiveContractSha,'-StatePath',$statePath,'-StopPath',$stopPath) -WindowStyle Hidden -PassThru
  $start = (Get-Process -Id $process.Id -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')
  $state = Wait-V31SupervisorState $statePath rollback $process.Id
  [pscustomobject]@{ role = $Role; mode = 'rollback'; supervisorPid = $process.Id; supervisorStartTimeUtc = $start; statePath = $statePath; stopPath = $stopPath; state = $state }
}

$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
$contract = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json -DateKind String
$actualContractSha = Get-V31Sha256 $contractPath
if ($contract.kind -ne 'DogfoodV31StackActivationContract' -or $contract.selectorBinding -ne 'v31-stack-activation-v2') { throw 'DOGFOOD_V31_CONTRACT_INVALID' }
if (-not [string]::IsNullOrWhiteSpace($ContractSha256) -and $ContractSha256 -cne $actualContractSha) { throw 'DOGFOOD_V31_CONTRACT_ARGUMENT_MISMATCH' }
foreach ($binding in @(@{ path = $modulePath; hash = $contract.scripts.module.sha256 }, @{ path = $supervisorPath; hash = $contract.scripts.supervisor.sha256 }, @{ path = $PSCommandPath; hash = $contract.scripts.rollback.sha256 }, @{ path = (Join-Path $runtimeRoot 'start-v31-stack-attempt-2.ps1'); hash = $contract.scripts.start.sha256 })) { if ((Get-V31Sha256 $binding.path) -cne [string]$binding.hash) { throw 'DOGFOOD_V31_SCRIPT_HASH_MISMATCH' } }
$protectedPids = @()
foreach ($role in $contract.protectedRuntime) {
  $null = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) "protected-$($role.role)"
  if ((Get-V31ListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_PROTECTED_LISTENER:$($role.role)" }
  $null = Assert-V31Process ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) ([string]$role.listenerCommandContains) "protected-$($role.role)-listener"
  $protectedPids += [int]$role.supervisorPid
  $protectedPids += [int]$role.listenerPid
  $null = Wait-V31HttpReady ([string]$role.healthUrl) 1
}
$null = Wait-V31HttpReady 'http://127.0.0.1:59000/minio/health/ready' 1
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$preflight = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31StackRollbackPreflight'; result = 'PASS'; dryRun = [bool]$DryRun; contractSha256 = $actualContractSha; protectedRoles = @($contract.protectedRuntime.role); targetMutationExecuted = [bool]0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
$preflight | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'rollback-preflight.json')
if ($DryRun) { $preflight | ConvertTo-Json -Depth 12; return }
foreach ($value in @($ContractSha256,$ContractGateSha256,$RequestSha256,$ApprovalSha256,$ActivationSha256)) { if ([string]::IsNullOrWhiteSpace($value)) { throw 'DOGFOOD_V31_AUTH_ARGUMENT_MISSING' } }
foreach ($item in @(@{ path = $contractPath; hash = $ContractSha256 }, @{ path = $gatePath; hash = $ContractGateSha256 }, @{ path = $requestPath; hash = $RequestSha256 }, @{ path = $approvalPath; hash = $ApprovalSha256 }, @{ path = $activationPath; hash = $ActivationSha256 })) { if ((Get-V31Sha256 $item.path) -cne [string]$item.hash) { throw 'DOGFOOD_V31_AUTH_HASH_MISMATCH' } }
$null = Read-V31GateReport $gatePath
$request = Get-Content -Raw -LiteralPath $requestPath | ConvertFrom-Json -DateKind String
$approval = Get-Content -Raw -LiteralPath $approvalPath | ConvertFrom-Json -DateKind String
$activation = Get-Content -Raw -LiteralPath $activationPath | ConvertFrom-Json -DateKind String
$null = Assert-V31Authorization $request $approval $contract $ContractSha256 $ContractGateSha256 $RequestSha256 ([DateTimeOffset]::UtcNow)
if ($activation.status -ne 'ACTIVE_PENDING_HUMAN_ACCEPTANCE' -or [string]$activation.contractSha256 -cne $ContractSha256) { throw 'DOGFOOD_V31_ACTIVATION_RECEIPT_INVALID' }
if (Test-Path -LiteralPath $rollbackPath) { throw 'DOGFOOD_V31_ROLLBACK_EXISTS' }
$restored = @{}
foreach ($name in @('web','mcp')) {
  $runtime = $activation.runtime.$name
  $null = Stop-V31ExactTree ([int]$runtime.supervisorPid) ([string]$runtime.supervisorStartTimeUtc) 'role-supervisor.ps1' ([string]$runtime.stopPath) $protectedPids "candidate-$name"
}
foreach ($name in @('web','mcp')) { $restored[$name] = Start-Role $name $actualContractSha }
$null = Wait-V31HttpReady 'http://127.0.0.1:3300/'
$null = Wait-V31HttpReady 'http://127.0.0.1:3302/readyz'
Assert-Build $contract.rollbackBuildId $contract.candidateBuildId
$receipt = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31StackRollback'; status = 'ROLLED_BACK_RUNTIME_VERIFIED'; contractSha256 = $ContractSha256; activationSha256 = $ActivationSha256; rolledBackAt = [DateTimeOffset]::UtcNow.ToString('O'); restored = $restored; databaseMutation = [bool]0; objectStoreMutation = [bool]0 }
$receipt | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -LiteralPath $rollbackPath
$receipt | ConvertTo-Json -Depth 20
