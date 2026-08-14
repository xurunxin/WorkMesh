param([Parameter(Mandatory)][string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 7) { throw 'DOGFOOD_V31_REQUIRES_POWERSHELL_7' }
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierRoot = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification-attempt-2\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
$candidateRoot = 'G:\Projects\MetronX\WorkMesh-human-experience-v31'
$candidateStandalone = Join-Path $candidateRoot 'apps\web\.next\standalone'
$candidateWebRoot = Join-Path $candidateRoot 'apps\web'
Import-Module $modulePath -Force
$evidenceRoot = Get-V31FullPath $EvidenceRootOverride
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierRoot)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
$preparedRoot = Join-Path $evidenceRoot 'prepared-probe'

function Get-Relative([string]$Root, [string]$Path) {
  [IO.Path]::GetRelativePath($Root, $Path)
}

function Get-Canonical([string]$Root) {
  $rows = @()
  foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File) {
    $relative = (Get-Relative $Root $file.FullName).Replace('\','/')
    if ($relative -match '^apps/web/(\.next/static|public)/') { continue }
    $rows += "$relative`t$(Get-V31Sha256 $file.FullName)`n"
  }
  $joined = (($rows | Sort-Object) -join '')
  [pscustomobject]@{ fileCount = $rows.Count; canonicalSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($joined))).ToLowerInvariant() }
}

function Assert-ProbePrepared {
  if (-not (Test-Path -LiteralPath $preparedRoot -PathType Container)) { throw 'DOGFOOD_V31_PREPARED_MISSING' }
  $manifest = Get-Canonical $preparedRoot
  if ($manifest.fileCount -ne 1992 -or $manifest.canonicalSha256 -cne '79e580040df6234c86e755a29ab10e9cd4ca867756ba155d695555a2d45c16d4') { throw 'DOGFOOD_V31_PREPARED_DRIFT' }
  $emptyTarget = Join-Path $preparedRoot 'node_modules\.pnpm\client-only@0.0.1\node_modules\client-only\index.js'
  if (-not (Test-Path -LiteralPath $emptyTarget -PathType Leaf) -or (Get-Item -LiteralPath $emptyTarget).Length -ne 0) { throw 'DOGFOOD_V31_EMPTY_FILE_NOT_PRESERVED' }
  $manifest
}

function Initialize-ProbePrepared {
  if (Test-Path -LiteralPath $preparedRoot) { return Assert-ProbePrepared }
  New-Item -ItemType Directory -Force -Path $preparedRoot | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath $candidateStandalone -Recurse -File) {
    $target = Join-Path $preparedRoot (Get-Relative $candidateStandalone $file.FullName)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $bytes = Convert-V31OriginBytes ([IO.File]::ReadAllBytes($file.FullName))
    [IO.File]::WriteAllBytes($target, $bytes)
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
  Assert-ProbePrepared
}

if (Test-Path -LiteralPath $preparedRoot) {
  $resolved = Get-V31FullPath $preparedRoot
  if (-not (Test-V31UnderPath $resolved $evidenceRoot)) { throw 'DOGFOOD_V31_PREPARED_ROOT_REJECTED' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
try {
  $first = Initialize-ProbePrepared
  $reuse = Initialize-ProbePrepared
  $result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31PreparedEmptyByteProbe'; result = 'PASS'; firstWrite = $first; reuse = $reuse; emptyFilePreserved = [bool]1; activeTargetMutation = [bool]0; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
} finally {
  if (Test-Path -LiteralPath $preparedRoot) {
    $resolved = Get-V31FullPath $preparedRoot
    if (-not (Test-V31UnderPath $resolved $evidenceRoot)) { throw 'DOGFOOD_V31_PREPARED_ROOT_REJECTED' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
$result.residualPreparedRoot = Test-Path -LiteralPath $preparedRoot
if ($result.residualPreparedRoot) { throw 'DOGFOOD_V31_PREPARED_RESIDUE' }
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'prepared-probe.json')
$result | ConvertTo-Json -Depth 12
