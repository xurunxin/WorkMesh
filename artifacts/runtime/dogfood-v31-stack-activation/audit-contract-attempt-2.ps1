param([string]$EvidenceRootOverride)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-stack-activation'
$runtimeEvidence = Join-Path $runtimeRoot 'evidence'
$verifierEvidence = Join-Path $controlRoot 'artifacts\gates\dogfood-v31-stack-activation-contract-verification-attempt-2\independent'
$modulePath = Join-Path $runtimeRoot 'runtime-module-attempt-2.psm1'
Import-Module $modulePath -Force
$evidenceRoot = if ([string]::IsNullOrWhiteSpace($EvidenceRootOverride)) { $runtimeEvidence } else { Get-V31FullPath $EvidenceRootOverride }
if (-not (Test-V31UnderPath $evidenceRoot $runtimeEvidence) -and -not (Test-V31UnderPath $evidenceRoot $verifierEvidence)) { throw 'DOGFOOD_V31_EVIDENCE_ROOT_REJECTED' }
$files = @('runtime-module-attempt-2.psm1','stage-active-origin-attempt-2.ps1','role-supervisor.ps1','start-v31-stack-attempt-2.ps1','rollback-v31-stack-attempt-2.ps1','test-contract-attempt-2.ps1','test-prepared-attempt-2.ps1','verify-runtime-invariance-attempt-2.ps1','audit-contract-attempt-2.ps1')
$rows = @()
foreach ($name in $files) {
  $path = Join-Path $runtimeRoot $name
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
  $bareFalse = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.Extent.Text.Trim() -ceq '$false' }, $true)).Count
  $strict = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.Extent.Text -match 'Set-StrictMode\s+-Version\s+Latest' }, $true)).Count
  $dateKindMissing = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'ConvertFrom-Json' -and $node.Extent.Text -notmatch '-DateKind\s+String' }, $true)).Count
  $rows += [pscustomobject]@{ file = $name; parseErrors = @($errors).Count; strictModeLatest = $strict; bareFalseCommands = $bareFalse; convertFromJsonDateKindMissing = $dateKindMissing }
}
if (@($rows | Where-Object { $_.parseErrors -ne 0 -or $_.strictModeLatest -lt 1 -or $_.bareFalseCommands -ne 0 -or $_.convertFromJsonDateKindMissing -ne 0 }).Count -ne 0) { throw 'DOGFOOD_V31_AST_AUDIT_FAILED' }
$result = [ordered]@{ artifactVersion = 1; kind = 'DogfoodV31ActivationContractAstAudit'; result = 'PASS'; files = $rows; capturedAt = [DateTimeOffset]::UtcNow.ToString('O') }
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
$result | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $evidenceRoot 'ast-audit.json')
$result | ConvertTo-Json -Depth 12
