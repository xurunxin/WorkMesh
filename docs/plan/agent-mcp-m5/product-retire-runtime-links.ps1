param([ValidateSet('Audit','Retire')][string]$Mode='Audit')
$ErrorActionPreference='Stop'
$m5Workspace=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../..')).Path
$m5Recovery=(Resolve-Path -LiteralPath (Join-Path $m5Workspace '.tmp/m5-runtime')).Path
$m5Owner=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'product-owner.json') -Raw | ConvertFrom-Json
if ($m5Owner.workspace -ne $m5Workspace -or $m5Owner.runId -ne 'm5-5dbe32e19a') { throw 'M5 owner mismatch' }
$m5Canonical=Join-Path $m5Recovery 'runtime-by-sha/e13e57a7f6b7abddec887e0b2d912d22484077c50dff5bed4f3199bcf63b6088.exe'
if (-not (Test-Path -LiteralPath $m5Canonical -PathType Leaf)) { throw 'No retained canonical runtime; do not retire historical aliases' }
if ((Get-FileHash -LiteralPath $m5Canonical -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'e13e57a7f6b7abddec887e0b2d912d22484077c50dff5bed4f3199bcf63b6088') { throw 'Canonical hash mismatch' }
$m5CanonicalId=(& fsutil file queryfileid $m5Canonical | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Canonical file ID unavailable' }
$m5Plan=[ordered]@{ owner=$m5Owner.runId; workspace=$m5Workspace; mode=$Mode; startedAt=[DateTime]::UtcNow.ToString('o'); canonical=$m5Canonical; canonicalId=$m5CanonicalId; operations=@(); skipped=@(); recursiveDelete=$false; physicalBytesFreed=$null; protectedRecoveryRoot=$m5Recovery }
$m5Receipt=Join-Path $PSScriptRoot ('product-runtime-links-'+$Mode.ToLowerInvariant()+'.json')
if (Test-Path -LiteralPath $m5Receipt) { throw 'Existing receipt protected; use a new explicitly recorded execution instead of overwriting' }
function Save-M5Receipt { $m5Plan | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $m5Receipt -Encoding utf8NoBOM }
Save-M5Receipt
$m5Live=Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine
foreach ($m5Resources in Get-ChildItem -LiteralPath (Join-Path $m5Recovery 'joint-evidence') -Directory -Filter 'opencode-*') {
 $m5ResourceFile=Join-Path $m5Resources.FullName 'resources.json'
 if (-not (Test-Path -LiteralPath $m5ResourceFile)) { $m5Plan.skipped+=@{root=$m5Resources.FullName;reason='No completed owner receipt'};continue }
 $m5Resource=Get-Content -LiteralPath $m5ResourceFile -Raw | ConvertFrom-Json
 if ($m5Resource.root -ne $m5Resources.FullName -or -not $m5Resource.allOwnedProcessesExited -or -not $m5Resource.nativeServerListenerClosed -or -not $m5Resource.protectedUnchanged) { $m5Plan.skipped+=@{root=$m5Resources.FullName;reason='Owned completion/isolation not proved'};continue }
 $m5Cache=Join-Path $m5Resources.FullName 'cache/opencode'
 if (-not (Test-Path -LiteralPath $m5Cache -PathType Container)) { continue }
 foreach ($m5File in Get-ChildItem -LiteralPath $m5Cache -File -Filter 'opencode-service-*.exe') {
  if ($m5File.Name -notmatch '^opencode-service-\d+-[0-9a-f]+\.exe$') { continue }
  $m5Absolute=$m5File.FullName
  if (-not $m5Absolute.StartsWith($m5Recovery+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Absolute target outside owned recovery root' }
  $m5Ancestor=$m5File.Directory
  while ($m5Ancestor.FullName -ne $m5Recovery) {
   if (($m5Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Target has reparse ancestor; stop without alternate deletion' }
   $m5Ancestor=$m5Ancestor.Parent
   if (-not $m5Ancestor) { throw 'Recovery ancestor absent' }
  }
  if (($m5File.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $m5File.LinkType -ne 'HardLink') { throw 'Not a regular hardlink alias' }
  $m5References=@($m5Live | Where-Object { $_.ExecutablePath -eq $m5Absolute -or ($_.CommandLine -and $_.CommandLine.Contains($m5Absolute,[StringComparison]::OrdinalIgnoreCase)) })
  if ($m5References.Count) { $m5Plan.skipped+=@{path=$m5Absolute;reason='Actual active process reference';pids=@($m5References.ProcessId)};continue }
  $m5Identity=(& fsutil file queryfileid $m5Absolute | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $m5Identity -ne $m5CanonicalId) { throw 'Derived runtime identity differs; preserve target' }
  $m5Row=[ordered]@{path=$m5Absolute;logicalBytes=$m5File.Length;fileId=$m5Identity;sha256=$m5Resource.binarySha256;createdUtc=$m5File.CreationTimeUtc.ToString('o');modifiedUtc=$m5File.LastWriteTimeUtc.ToString('o');ownerReceipt=$m5ResourceFile;ownerReceiptSha256=(Get-FileHash -LiteralPath $m5ResourceFile -Algorithm SHA256).Hash.ToLowerInvariant();canonical=$m5Canonical;activeReferences=0;deleted=$false;cmdletSuccess=$null;physicalBytesFreed=$null}
  $m5Plan.operations+=$m5Row;Save-M5Receipt
  if ($Mode -eq 'Retire') {
   try { Remove-Item -LiteralPath $m5Absolute -ErrorAction Stop; $m5Row.cmdletSuccess=$true; $m5Row.deleted=-not (Test-Path -LiteralPath $m5Absolute); if (-not $m5Row.deleted) { throw 'Alias still exists' } }
   catch { $m5Row.cmdletSuccess=$false;$m5Row.failure=$_.Exception.Message;Save-M5Receipt;throw }
   Save-M5Receipt
  }
 }
}
$m5Plan.endedAt=[DateTime]::UtcNow.ToString('o');$m5Plan.logicalAliasBytes=[int64]0
foreach ($m5Operation in $m5Plan.operations) { $m5Plan.logicalAliasBytes += [int64]$m5Operation['logicalBytes'] }
Save-M5Receipt
Write-Output (ConvertTo-Json -Compress @{mode=$Mode;aliases=$m5Plan.operations.Count;deleted=@($m5Plan.operations | Where-Object { $_['deleted'] }).Count;logicalAliasBytes=$m5Plan.logicalAliasBytes;physicalBytesFreed=$null;receipt=$m5Receipt})
