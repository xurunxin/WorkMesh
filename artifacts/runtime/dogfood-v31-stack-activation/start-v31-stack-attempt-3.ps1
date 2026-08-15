param([switch]$DryRun, [string]$ContractSha256, [string]$ContractGateSha256, [string]$RequestSha256, [string]$ApprovalSha256, [string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-versioned-supervisor-binding-repair-verification\independent'
$contractPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract-attempt-3.json'
$gatePath = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-versioned-supervisor-binding-repair-gate.yaml'
$requestPath = Join-Path $controlRoot 'artifacts\approvals\dogfood-v31-stack-activation-request-attempt-3.json'
$approvalPath = Join-Path $controlRoot 'artifacts\approvals\dogfood-v31-stack-activation-human-approval-attempt-3.json'
$activationPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-attempt-3.json'
$rollbackPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-rollback-attempt-3.json'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$compensationModulePath = Join-Path $runtimeRoot 'compensation-attempt-3.psm1'
$supervisorPath = Join-Path $runtimeRoot 'role-supervisor-attempt-3.ps1'
$stagePath = Join-Path $runtimeRoot 'stage-active-origin-attempt-2.ps1'
$rollbackScript = Join-Path $runtimeRoot 'rollback-v31-stack-attempt-3.ps1'
$candidateVerifier = Join-Path $runtimeRoot 'verify-candidate.mjs'
$candidateRoot = 'G:\Projects\MetronX\WorkMesh-human-experience-v31'
$candidateStandalone = Join-Path $candidateRoot 'apps\web\.next\standalone'
$candidateWebRoot = Join-Path $candidateRoot 'apps\web'
$preparedRoot = Join-Path $runtimeRoot 'prepared-active-origin'
Import-Module $modulePath -Force
Import-Module $compensationModulePath -Force

function Get-Status([string]$Url) {
  try { [int](Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri $Url -TimeoutSec 4).StatusCode } catch { 0 }
}
function Assert-Build([string]$Required, [string]$Forbidden) {
  if ((Get-Status "http://127.0.0.1:3300/_next/static/$Required/_buildManifest.js") -ne 200) { throw 'DOGFOOD_V31_REQUIRED_BUILD_MISSING' }
  if ((Get-Status "http://127.0.0.1:3300/_next/static/$Forbidden/_buildManifest.js") -eq 200) { throw 'DOGFOOD_V31_FORBIDDEN_BUILD_SERVED' }
}
function Get-BytesSha([byte[]]$Bytes) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { ([Convert]::ToHexString($algorithm.ComputeHash($Bytes))).ToLowerInvariant() } finally { $algorithm.Dispose() }
}
function Get-Relative([string]$Root, [string]$Path) { [IO.Path]::GetRelativePath($Root, $Path).Replace([IO.Path]::DirectorySeparatorChar, '/') }
function Get-Canonical([string]$Root, [switch]$ExcludeAssets) {
  $rows = [Collections.Generic.List[string]]::new()
  foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File) {
    $relative = Get-Relative $Root $file.FullName
    if ($ExcludeAssets -and ($relative.StartsWith('apps/web/.next/static/') -or $relative.StartsWith('apps/web/public/'))) { continue }
    $rows.Add("$relative`t$(Get-BytesSha ([IO.File]::ReadAllBytes($file.FullName)))`n")
  }
  [pscustomobject]@{ fileCount = $rows.Count; canonicalSha256 = Get-BytesSha ([Text.Encoding]::UTF8.GetBytes((($rows | Sort-Object) -join ''))) }
}
function Assert-Prepared {
  if (-not (Test-Path -LiteralPath $preparedRoot -PathType Container)) { throw 'DOGFOOD_V31_PREPARED_MISSING' }
  $manifest = Get-Canonical $preparedRoot -ExcludeAssets
  if ($manifest.fileCount -ne 1992 -or $manifest.canonicalSha256 -cne '79e580040df6234c86e755a29ab10e9cd4ca867756ba155d695555a2d45c16d4') { throw 'DOGFOOD_V31_PREPARED_DRIFT' }
  if ((Get-Content -Raw -LiteralPath (Join-Path $preparedRoot 'apps\web\.next\BUILD_ID')).Trim() -cne 'Yj0IS_0CtW-lStIuWIemm') { throw 'DOGFOOD_V31_PREPARED_BUILD_ID' }
  $manifest
}
function Initialize-Prepared {
  if (Test-Path -LiteralPath $preparedRoot) { return Assert-Prepared }
  New-Item -ItemType Directory -Force -Path $preparedRoot | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $candidateStandalone -Recurse -File) {
    $target = Join-Path $preparedRoot (Get-Relative $candidateStandalone $file.FullName)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    [IO.File]::WriteAllBytes($target, (Convert-V31OriginBytes ([IO.File]::ReadAllBytes($file.FullName))))
  }
  foreach ($relative in @('apps/web/node_modules/next','apps/web/node_modules/react','node_modules/typescript')) {
    $link = Get-Item -Force -LiteralPath (Join-Path $candidateStandalone $relative)
    $target = Join-Path $preparedRoot $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $linkTarget = if ($link.Target -is [array]) { [string]$link.Target[0] } else { [string]$link.Target }
    New-Item -ItemType SymbolicLink -Path $target -Target $linkTarget | Out-Null
  }
  foreach ($spec in @(@{ source = Join-Path $candidateWebRoot '.next\static'; dest = Join-Path $preparedRoot 'apps\web\.next\static'; transform = [bool]1 }, @{ source = Join-Path $candidateWebRoot 'public'; dest = Join-Path $preparedRoot 'apps\web\public'; transform = [bool]0 })) {
    foreach ($file in Get-ChildItem -LiteralPath $spec.source -Recurse -File) {
      $target = Join-Path $spec.dest (Get-Relative $spec.source $file.FullName)
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      $bytes = [IO.File]::ReadAllBytes($file.FullName)
      if ($spec.transform) { $bytes = Convert-V31OriginBytes $bytes }
      [IO.File]::WriteAllBytes($target, $bytes)
    }
  }
  Assert-Prepared
}
function Start-Role([string]$Role, [string]$Mode, [string]$EffectiveContractSha, [string]$ExecutionBindingPath, [string]$ExecutionBindingSha) {
  $statePath = Join-Path $runtimeRoot "runtime\$Mode-attempt-3-$Role.json"
  $stopPath = Join-Path $runtimeRoot "runtime\$Mode-attempt-3-$Role.stop"
  Remove-Item -LiteralPath $statePath,$stopPath -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statePath) | Out-Null
  $process = Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoLogo','-NoProfile','-File',$supervisorPath,'-Role',$Role,'-Mode',$Mode,'-ContractPath',$contractPath,'-ContractSha256',$EffectiveContractSha,'-StatePath',$statePath,'-StopPath',$stopPath,'-ExecutionBindingPath',$ExecutionBindingPath,'-ExecutionBindingSha256',$ExecutionBindingSha) -WindowStyle Hidden -PassThru
  $start = (Get-Process -Id $process.Id -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')
  $state = Wait-V31SupervisorState $statePath $Mode $process.Id
  [pscustomobject]@{ role = $Role; mode = $Mode; supervisorPid = $process.Id; supervisorStartTimeUtc = $start; statePath = $statePath; stopPath = $stopPath; state = $state }
}

$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
$contract = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json -DateKind String
if ($contract.kind -ne 'DogfoodV31StackActivationContract' -or $contract.selectorBinding -ne 'v31-stack-activation-v3') { throw 'DOGFOOD_V31_CONTRACT_INVALID' }
$actualContractSha = Get-V31Sha256 $contractPath
if (-not [string]::IsNullOrWhiteSpace($ContractSha256) -and $ContractSha256 -cne $actualContractSha) { throw 'DOGFOOD_V31_CONTRACT_ARGUMENT_MISMATCH' }
foreach ($binding in @(@{ path = $modulePath; hash = $contract.scripts.module.sha256 }, @{ path = $compensationModulePath; hash = $contract.scripts.compensationModule.sha256 }, @{ path = $supervisorPath; hash = $contract.scripts.supervisor.sha256 }, @{ path = $stagePath; hash = $contract.scripts.stage.sha256 }, @{ path = $PSCommandPath; hash = $contract.scripts.start.sha256 }, @{ path = $rollbackScript; hash = $contract.scripts.rollback.sha256 }, @{ path = $candidateVerifier; hash = $contract.scripts.candidateVerifier.sha256 }, @{ path = (Join-Path $runtimeRoot 'mcp-entrypoint-v31.mts'); hash = $contract.scripts.mcpEntrypoint.sha256 })) {
  if ((Get-V31Sha256 $binding.path) -cne [string]$binding.hash) { throw 'DOGFOOD_V31_SCRIPT_HASH_MISMATCH' }
}
$candidate = (& node.exe $candidateVerifier | ConvertFrom-Json -DateKind String)
if ($LASTEXITCODE -ne 0 -or $candidate.result -ne 'PASS') { throw 'DOGFOOD_V31_CANDIDATE_INVALID' }
$protectedPids = @()
foreach ($role in $contract.protectedRuntime) {
  $null = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) "protected-$($role.role)"
  $listenerPid = Get-V31ListenerPid ([int]$role.port)
  if ($listenerPid -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_PROTECTED_LISTENER:$($role.role)" }
  $null = Assert-V31Process ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) ([string]$role.listenerCommandContains) "protected-$($role.role)-listener"
  $protectedPids += [int]$role.supervisorPid
  $protectedPids += [int]$role.listenerPid
  $null = Wait-V31HttpReady ([string]$role.healthUrl) 1
}
foreach ($role in @($contract.replacedRuntime.web, $contract.replacedRuntime.mcp)) {
  $null = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) "old-$($role.role)"
  if ((Get-V31ListenerPid ([int]$role.port)) -ne [int]$role.listenerPid) { throw "DOGFOOD_V31_OLD_LISTENER:$($role.role)" }
  $null = Assert-V31Process ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) ([string]$role.listenerCommandContains) "old-$($role.role)-listener"
}
$null = Wait-V31HttpReady 'http://127.0.0.1:59000/minio/health/ready' 1
Assert-Build $contract.rollbackBuildId $contract.candidateBuildId
$secretNames = @('WORKMESH_DOGFOOD_DATABASE_URL','WORKMESH_DOGFOOD_SESSION_SECRET','WORKMESH_DOGFOOD_MASTER_KEY','WORKMESH_DOGFOOD_BOOTSTRAP_TOKEN','WORKMESH_DOGFOOD_CURSOR_KEY','WORKMESH_DOGFOOD_MINIO_PASSWORD')
$secretPresence = [ordered]@{}
foreach ($name in $secretNames) { $secretPresence[$name] = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'User')) }
if (@($secretPresence.Values | Where-Object { -not $_ }).Count -ne 0) { throw 'DOGFOOD_V31_SECRET_NAME_MISSING' }
if ((Test-Path -LiteralPath $activationPath) -or (Test-Path -LiteralPath $rollbackPath)) { throw 'DOGFOOD_V31_TERMINAL_EXISTS' }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$preflight = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31StackActivationPreflight'; result = 'PASS'; dryRun = [bool]$DryRun; contractSha256 = $actualContractSha; candidate = $candidate; protectedRoles = @($contract.protectedRuntime.role); replacedRoles = @('web','mcp'); secretNamesPresent = $secretPresence; databaseMutationRequired = [bool]0; objectStoreMutationRequired = [bool]0; targetMutationExecuted = [bool]0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
$preflight | ConvertTo-Json -Depth 16 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'preflight.json')
if ($DryRun) { $preflight | ConvertTo-Json -Depth 16; return }
foreach ($value in @($ContractSha256, $ContractGateSha256, $RequestSha256, $ApprovalSha256)) { if ([string]::IsNullOrWhiteSpace($value)) { throw 'DOGFOOD_V31_AUTH_ARGUMENT_MISSING' } }
foreach ($item in @(@{ path = $contractPath; hash = $ContractSha256 }, @{ path = $gatePath; hash = $ContractGateSha256 }, @{ path = $requestPath; hash = $RequestSha256 }, @{ path = $approvalPath; hash = $ApprovalSha256 })) { if ((Get-V31Sha256 $item.path) -cne [string]$item.hash) { throw 'DOGFOOD_V31_AUTH_HASH_MISMATCH' } }
$null = Read-V31GateReport $gatePath
$request = Get-Content -Raw -LiteralPath $requestPath | ConvertFrom-Json -DateKind String
$approval = Get-Content -Raw -LiteralPath $approvalPath | ConvertFrom-Json -DateKind String
$null = Assert-V31Authorization $request $approval $contract $ContractSha256 $ContractGateSha256 $RequestSha256 ([DateTimeOffset]::UtcNow)
$executionBindingPath = Join-Path $runtimeRoot 'authorization\attempt-3-start-binding.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $executionBindingPath) | Out-Null
$executionBinding = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31StartExecutionBinding'; contractSha256 = $actualContractSha; gateSha256 = $ContractGateSha256; requestSha256 = $RequestSha256; approvalSha256 = $ApprovalSha256; startScriptSha256 = [string]$contract.scripts.start.sha256; allowedRoles = @('web','mcp'); allowedModes = @('candidate','rollback'); createdAt = [DateTimeOffset]::UtcNow.ToString('O'); expiresAt = ([DateTimeOffset]::UtcNow.AddMinutes(30)).ToString('O') }
$executionBinding | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath $executionBindingPath
$executionBindingSha = Get-V31Sha256 $executionBindingPath
$null = Initialize-Prepared
$targetMutationStarted = [bool]0
$candidateRuntime = @{}
try {
  $targetMutationStarted = [bool]1
  foreach ($role in @($contract.replacedRuntime.web, $contract.replacedRuntime.mcp)) {
    $null = Stop-V31ExactTree ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) ([string]$role.stopPath) $protectedPids "old-$($role.role)"
  }
  foreach ($name in @('web','mcp')) { $candidateRuntime[$name] = Start-Role $name candidate $actualContractSha $executionBindingPath $executionBindingSha }
  $null = Wait-V31HttpReady 'http://127.0.0.1:3300/'
  $null = Wait-V31HttpReady 'http://127.0.0.1:3302/readyz'
  Assert-Build $contract.candidateBuildId $contract.rollbackBuildId
  $receipt = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31StackActivation'; status = 'ACTIVE_PENDING_HUMAN_ACCEPTANCE'; selectorBinding = $contract.selectorBinding; contractSha256 = $ContractSha256; gateSha256 = $ContractGateSha256; requestSha256 = $RequestSha256; approvalSha256 = $ApprovalSha256; executionBindingSha256 = $executionBindingSha; activatedAt = [DateTimeOffset]::UtcNow.ToString('O'); runtime = $candidateRuntime; databaseMutation = [bool]0; objectStoreMutation = [bool]0; rollbackReady = [bool]1 }
  $receipt | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -LiteralPath $activationPath
  $receipt | ConvertTo-Json -Depth 20
} catch {
  if ($targetMutationStarted) {
    $failureReason = $_.Exception.Message
    $stopCandidate = {
      param($name, $runtime)
      Stop-V31ExactTree ([int]$runtime.supervisorPid) ([string]$runtime.supervisorStartTimeUtc) 'role-supervisor-attempt-3.ps1' ([string]$runtime.stopPath) $protectedPids "candidate-$name"
    }
    $getOwners = { param($role) @(Get-NetTCPConnection -State Listen -LocalPort ([int]$role.port) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) }
    $isOldSupervisorAlive = { param($role) $null -ne (Get-Process -Id ([int]$role.supervisorPid) -ErrorAction SilentlyContinue) }
    $assertRetained = {
      param($role)
      $null = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) "retained-$($role.role)"
      Remove-Item -LiteralPath ([string]$role.stopPath) -Force -ErrorAction SilentlyContinue
      [pscustomobject]@{ mode = 'retained-exact-old-owner'; listenerPid = [int]$role.listenerPid }
    }
    $startRollback = { param($role) Start-Role ([string]$role.role) rollback $actualContractSha $executionBindingPath $executionBindingSha }
    $verifyRestored = {
      $null = Wait-V31HttpReady 'http://127.0.0.1:3300/'
      $null = Wait-V31HttpReady 'http://127.0.0.1:3302/readyz'
      Assert-Build $contract.rollbackBuildId $contract.candidateBuildId
    }
    $writeTerminal = { param($receipt) $receipt | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -LiteralPath $rollbackPath }
    $null = Invoke-V31Attempt3Compensation $candidateRuntime @($contract.replacedRuntime.web, $contract.replacedRuntime.mcp) $failureReason $stopCandidate $getOwners $isOldSupervisorAlive $assertRetained $startRollback $verifyRestored $writeTerminal
  }
  throw
}
