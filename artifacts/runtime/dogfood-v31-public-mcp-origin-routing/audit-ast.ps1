param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
$allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$root = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowed
$results = @()
foreach ($property in $contract.scripts.psobject.Properties) {
  $entry = $property.Value
  $path = Join-Path $repoRoot ([string]$entry.path)
  if ((Get-V31OriginSha256 $path) -cne [string]$entry.sha256) { throw "DOGFOOD_V31_ORIGIN_SCRIPT_HASH_MISMATCH:$($property.Name)" }
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  $source = Get-Content -Raw -LiteralPath $path
  $strictMode = ([regex]::Matches($source,'(?m)^Set-StrictMode\s+-Version\s+Latest\s*$')).Count
  $bareFalse = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.Extent.Text.Trim() -ceq '$false' },$true)).Count
  $jsonCommands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'ConvertFrom-Json' },$true))
  $missingDateKind = @($jsonCommands | Where-Object { $_.Extent.Text -notmatch '(?i)-DateKind\s+String' }).Count
  if ($errors.Count -ne 0 -or $strictMode -ne 1 -or $bareFalse -ne 0 -or $missingDateKind -ne 0) { throw "DOGFOOD_V31_ORIGIN_AST_FAILED:$($property.Name)" }
  $results += [pscustomobject]@{name=$property.Name;path=[string]$entry.path;sha256=[string]$entry.sha256;parseErrors=$errors.Count;strictModeLatest=$strictMode;bareFalseCommandAst=$bareFalse;convertFromJsonCount=$jsonCommands.Count;missingDateKindString=$missingDateKind}
}
Write-V31OriginJson (Join-Path $root 'ast-audit.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginAstAudit';result='PASS';scripts=$results;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
