param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$expectedContract = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-cors-decoupling-activation-contract.json'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginFullPath $ContractPath) -cne (Get-V31OriginFullPath $expectedContract) -or (Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_CORS_CONTRACT_REJECTED' }
$contract = Read-V31OriginJson $ContractPath
$allowedRoots = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$evidence = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowedRoots
$results = @()
foreach ($property in $contract.scripts.psobject.Properties) {
  $entry = $property.Value
  $path = Join-Path $repoRoot ([string]$entry.path)
  if ((Get-V31OriginSha256 $path) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_CORS_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  $source = Get-Content -Raw -LiteralPath $path
  $bareFalse = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq '$false'},$true)).Count
  $jsonCommands = @($ast.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'ConvertFrom-Json'},$true))
  $jsonMissingDateKind = @($jsonCommands | Where-Object { -not $_.Extent.Text.Contains('-DateKind String',[StringComparison]::OrdinalIgnoreCase) }).Count
  $strict = [regex]::IsMatch($source,'Set-StrictMode\s+-Version\s+Latest')
  $result = if ($errors.Count -eq 0 -and $bareFalse -eq 0 -and $jsonMissingDateKind -eq 0 -and $strict) { 'PASS' } else { 'BLOCK' }
  $results += [pscustomobject]@{name=$property.Name;path=[string]$entry.path;sha256=[string]$entry.sha256;parseErrors=$errors.Count;strictModeLatest=$strict;bareFalse=$bareFalse;jsonMissingDateKind=$jsonMissingDateKind;result=$result}
}
if (@($results | Where-Object { $_.result -ne 'PASS' }).Count -ne 0) { throw 'DOGFOOD_V31_CORS_AST_AUDIT_FAILED' }
Write-V31OriginJson (Join-Path $evidence 'ast-audit.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginCorsDecouplingAstAudit';result='PASS';contractSha256=$ContractSha256;scripts=$results;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
