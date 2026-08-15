param([Parameter(Mandatory=$true)][string]$ContractPath,[Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$controlRoot = 'G:\Projects\MetronX\WorkMesh'
$runtimeRoot = Join-Path $controlRoot 'artifacts\runtime\dogfood-v31-coordination-feature-activation-attempt-2'
Import-Module (Join-Path $runtimeRoot 'runtime-module.psm1') -Force
$contract = Read-V31Json $ContractPath
$allowed = @(
  (Join-Path $runtimeRoot 'evidence\worker'),
  (Join-Path $controlRoot 'artifacts\gates\dogfood-v31-coordination-feature-binding-verification-attempt-2\independent')
)
$root = Assert-V31EvidenceRoot $EvidenceRoot $allowed
$rows = @()
foreach ($entry in $contract.scripts.psobject.Properties) {
  $path = Join-Path $controlRoot ([string]$entry.Value.path)
  if ((Get-V31Sha256 $path) -cne [string]$entry.Value.sha256) { throw "DOGFOOD_V31_COORD_BOUND_SCRIPT_DRIFT:$($entry.Name)" }
  if ([IO.Path]::GetExtension($path) -in @('.ps1','.psm1')) {
    $tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
    $bareFalse = @($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq '$false'},$true)).Count
    if ($errors.Count -ne 0 -or $bareFalse -ne 0) { throw "DOGFOOD_V31_COORD_AST_FAILED:$($entry.Name)" }
    $rows += [ordered]@{name=$entry.Name;parseErrors=$errors.Count;bareFalseCommandAst=$bareFalse;strictMode=((Get-Content -Raw -LiteralPath $path) -match 'Set-StrictMode -Version Latest')}
  }
}
Write-V31Json (Join-Path $root 'ast-audit.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31CoordinationFeatureAstAudit';result='PASS';scripts=$rows;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
