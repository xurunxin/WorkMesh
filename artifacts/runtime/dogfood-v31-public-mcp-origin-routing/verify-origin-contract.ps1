param(
  [Parameter(Mandatory=$true)][string]$ContractPath,
  [Parameter(Mandatory=$true)][string]$ContractSha256,
  [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = 'G:\Projects\MetronX\worktrees\workmesh-human-experience-v31-checkpoint'
$activeRoot = 'G:\Projects\MetronX\WorkMesh'
$modulePath = Join-Path $repoRoot 'artifacts\runtime\dogfood-v31-public-mcp-origin-routing\runtime-module.psm1'
Import-Module $modulePath -Force
if ((Get-V31OriginSha256 $ContractPath) -cne $ContractSha256) { throw 'DOGFOOD_V31_ORIGIN_CONTRACT_SHA_MISMATCH' }
$contract = Read-V31OriginJson $ContractPath
$allowed = @($contract.evidence.allowedRoots | ForEach-Object { Join-Path $repoRoot ([string]$_) })
$root = Assert-V31OriginEvidenceRoot $EvidenceRoot $allowed
$adrPath = Join-Path $repoRoot 'docs\adr\0043-agent-connection-and-coordination-mcp.md'
$apiRoutePath = Join-Path ([string]$contract.candidateApi.root) 'apps\api\src\agent-connections.ts'
$apiServerPath = Join-Path ([string]$contract.candidateApi.root) 'apps\api\src\server.ts'
$routerPath = Join-Path $activeRoot 'artifacts\runtime\dogfood-target\loopback-entrypoint.mjs'
$supervisorPath = Join-Path $repoRoot ([string]$contract.scripts.supervisor.path)
$adr = Get-Content -Raw -LiteralPath $adrPath
$apiRoute = Get-Content -Raw -LiteralPath $apiRoutePath
$apiServer = Get-Content -Raw -LiteralPath $apiServerPath
$router = Get-Content -Raw -LiteralPath $routerPath
$supervisor = Get-Content -Raw -LiteralPath $supervisorPath
if ($adr -notmatch 'served from the\s+same origin as the API') { throw 'DOGFOOD_V31_ORIGIN_ADR_SEAM_MISSING' }
if ($apiRoute -notmatch 'mcpUrl\s*=.*webOrigin' -or $apiRoute -notmatch 'wellKnownUrl:.*webOrigin') { throw 'DOGFOOD_V31_ORIGIN_API_DERIVATION_MISSING' }
if ($apiServer -notmatch 'webOrigin:\s*config\.WEB_ORIGIN') { throw 'DOGFOOD_V31_ORIGIN_SERVER_BINDING_MISSING' }
if ($router -notmatch "port = 3301" -or $router -notmatch "incoming\.url === '/mcp' \? mcp : api") { throw 'DOGFOOD_V31_ORIGIN_ROUTER_SEAM_MISSING' }
if ($supervisor -notmatch 'WEB_ORIGIN = if \(\$Mode -eq ''candidate''\) \{ ''http://127\.0\.0\.1:3301'' \} else \{ ''http://127\.0\.0\.1:3300'' \}') { throw 'DOGFOOD_V31_ORIGIN_SUPERVISOR_BINDING_MISSING' }
$discoveryResponse = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3301/.well-known/workmesh-agent' -TimeoutSec 3
$mcp3301 = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3301/mcp' -TimeoutSec 3
$mcp3300 = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri 'http://127.0.0.1:3300/mcp' -TimeoutSec 3
$discovery = $discoveryResponse.Content | ConvertFrom-Json -DateKind String
if ([int]$discoveryResponse.StatusCode -ne 200 -or [int]$mcp3301.StatusCode -ne 401 -or [int]$mcp3300.StatusCode -ne 404) { throw 'DOGFOOD_V31_ORIGIN_ENDPOINT_COUNTEREXAMPLE_CHANGED' }
if ([string]$discovery.mcpUrl -cne 'http://127.0.0.1:3300/mcp' -or [string]$discovery.wellKnownUrl -cne 'http://127.0.0.1:3300/.well-known/workmesh-agent') { throw 'DOGFOOD_V31_ORIGIN_CURRENT_DISCOVERY_CHANGED' }
Write-V31OriginJson (Join-Path $root 'origin-contract.json') ([ordered]@{artifactVersion=1;kind='DogfoodV31PublicMcpOriginContractProbe';result='PASS';productSourceChanged=[bool]0;adrSameOrigin=[bool]1;apiDerivesFromWebOrigin=[bool]1;routerConvergesDiscoveryAndMcp=[bool]1;candidateSupervisorWebOrigin='http://127.0.0.1:3301';rollbackSupervisorWebOrigin='http://127.0.0.1:3300';currentCounterexample=[ordered]@{discoveryStatus=200;advertisedMcpUrl=[string]$discovery.mcpUrl;advertisedWellKnownUrl=[string]$discovery.wellKnownUrl;mcp3301Status=[int]$mcp3301.StatusCode;mcp3300Status=[int]$mcp3300.StatusCode};checkedAt=[DateTimeOffset]::UtcNow.ToString('O')})
