param([Parameter(Mandatory=$true)][string]$EvidenceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$allowed = Join-Path $repoRoot 'artifacts\gates\dogfood-v31-public-mcp-browser-cors-activation-contract-verification\independent'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-browser-cors-activation\runtime-module.psm1'
Import-Module $modulePath -Force
$root = Assert-V31McpEvidenceRoot $EvidenceRoot @($allowed)
$paths = @('runtime-module.psm1','role-supervisor.ps1','start-mcp-only.ps1','rollback-mcp-only.ps1','test-compensation.ps1','audit-ast.ps1') | ForEach-Object { Join-Path (Split-Path -Parent $PSCommandPath) $_ }
$results = @()
foreach ($path in $paths) {
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  $bareFalse = @($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq '$false'},[bool]1)).Count
  $strictMode = @($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Set-StrictMode'},[bool]1)).Count
  $dateKindMissing = @($ast.FindAll({param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'ConvertFrom-Json' -and $node.Extent.Text -notmatch '-DateKind\s+String'},[bool]1)).Count
  if ($errors.Count -ne 0 -or $bareFalse -ne 0 -or $strictMode -lt 1 -or $dateKindMissing -ne 0) { throw "DOGFOOD_V31_MCP_CORS_AST_FAILED:$path" }
  $results += [pscustomobject]@{path=$path;parseErrors=$errors.Count;bareFalse=$bareFalse;strictMode=$strictMode;dateKindMissing=$dateKindMissing}
}
Write-V31McpJson (Join-Path $root 'ast-audit.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpBrowserCorsAstAudit';result='PASS';files=$results;checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
