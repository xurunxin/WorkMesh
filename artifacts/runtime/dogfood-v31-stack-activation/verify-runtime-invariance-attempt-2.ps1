param([string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification-attempt-2\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$contractPath = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation-contract-attempt-2.json'
Import-Module $modulePath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
$contract = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json -DateKind String
$expectedRoles = @($contract.protectedRuntime) + @($contract.replacedRuntime.web, $contract.replacedRuntime.mcp)
$listeners = @()
foreach ($role in $expectedRoles) {
  $listenerPid = Get-V31ListenerPid ([int]$role.port)
  $null = Assert-V31Process ([int]$role.supervisorPid) ([string]$role.supervisorStartTimeUtc) ([string]$role.supervisorCommandContains) "$($role.role)-supervisor"
  $listener = Assert-V31Process ([int]$role.listenerPid) ([string]$role.listenerStartTimeUtc) ([string]$role.listenerCommandContains) "$($role.role)-listener"
  $health = Wait-V31HttpReady ([string]$role.healthUrl) 1
  $listeners += [pscustomobject]@{ role = [string]$role.role; port = [int]$role.port; expectedPid = [int]$role.listenerPid; actualPid = $listenerPid; pidExact = $listenerPid -eq [int]$role.listenerPid; startTimeUtc = $listener.startTimeUtc; health = $health }
}
if (@($listeners | Where-Object { -not $_.pidExact -or $_.health -ne 200 }).Count -ne 0) { throw 'DOGFOOD_V31_RUNTIME_DRIFT' }
$minio = Wait-V31HttpReady 'http://127.0.0.1:59000/minio/health/ready' 1
$activeBuild = try { [int](Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3300/_next/static/V-SFnsKVQ5xpM6FrzLW5l/_buildManifest.js' -TimeoutSec 4).StatusCode } catch { 0 }
$candidateBuild = try { [int](Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3300/_next/static/Yj0IS_0CtW-lStIuWIemm/_buildManifest.js' -TimeoutSec 4).StatusCode } catch { 0 }
if ($activeBuild -ne 200 -or $candidateBuild -eq 200 -or $minio -ne 200) { throw 'DOGFOOD_V31_BUILD_OR_MINIO_DRIFT' }
$future = @($contract.futureArtifacts.PSObject.Properties.Value | ForEach-Object { [string]$_ })
$present = @($future | Where-Object { Test-Path -LiteralPath $_ })
if ($present.Count -ne 0) { throw 'DOGFOOD_V31_FUTURE_ARTIFACT_PRESENT' }
$result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31RuntimeInvariance'; result = 'PASS'; listeners = $listeners; minioReady = $minio; activeBuildStatus = $activeBuild; candidateBuildStatus = $candidateBuild; futureArtifactsPresent = $present; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'runtime-invariance.json')
$result | ConvertTo-Json -Depth 12
