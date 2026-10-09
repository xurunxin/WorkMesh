$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-Sha256([string]$path) {
    $stream = [System.IO.File]::OpenRead($path)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $hasher.Dispose(); $stream.Dispose() }
}
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$evidenceDir = Join-Path $workspaceRoot 'docs/plan/agent-mcp-m1/product-evidence'
$receiptPath = Join-Path $evidenceDir 'build-complete.json'
$receipt = Get-Content -LiteralPath $receiptPath -Encoding UTF8 -Raw | ConvertFrom-Json
if ($null -eq $receipt.exitCode -or $receipt.status -ne 'finished') { throw 'Build is not finished' }
$lastBuild = Get-Content -LiteralPath (Join-Path $evidenceDir 'build-fixture-fixed.json') -Encoding UTF8 -Raw | ConvertFrom-Json
if ($null -eq $lastBuild.exitCode -or $lastBuild.status -ne 'finished') { throw 'Latest build is not finished' }
$active = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @($receipt.processId, $lastBuild.processId) -and $_.CommandLine -like '*01a12031-e9de-75c4-ab40-b44affcd71f6*' })
if ($active.Count) { throw 'Build process is still active' }
$inputsArchive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $evidenceDir $receipt.inputArchive))
try {
    $reader = [System.IO.StreamReader]::new($inputsArchive.GetEntry('inputs.json').Open())
    try { $inputs = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
} finally { $inputsArchive.Dispose() }
$before = @{}
foreach ($row in $inputs) { $before[$row.path] = $true }
$tracked = @{}
foreach ($path in @(git -C $workspaceRoot ls-files)) { $tracked[$path] = $true }
$candidates = @(git -C $workspaceRoot ls-files --others --exclude-standard -- apps/api/src apps/mcp/src)
$items = @()
# Runtime starts after the potentially long input archive capture in the recorder.
$firstStarted = (Get-Item -LiteralPath (Join-Path $evidenceDir $receipt.inputArchive)).LastWriteTimeUtc
$firstEnded = $firstStarted.AddSeconds($receipt.runtimeSeconds + 5)
foreach ($path in $candidates) {
    if ($path -notmatch '\.(js|d\.ts)$' -or $before.ContainsKey($path) -or $tracked.ContainsKey($path)) { throw ('Unproven build output: ' + $path) }
    $full = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $path))
    if (-not $full.StartsWith($workspaceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes workspace' }
    $file = Get-Item -LiteralPath $full
    $ancestor = $file
    while ($ancestor -and $ancestor.FullName.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
        if ($ancestor.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw ('Link target: ' + $path) }
        if ($ancestor -is [System.IO.FileInfo]) { $ancestor = $ancestor.Directory } else { $ancestor = $ancestor.Parent }
    }
    $source = $full -replace '\.(js|d\.ts)$', '.ts'
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw ('Missing adjacent source: ' + $path) }
    if ($file.LastWriteTimeUtc -lt $firstStarted -or $file.LastWriteTimeUtc -gt $firstEnded) { throw ('Output not created by first build interval: ' + $path) }
    $items += [PSCustomObject]@{ path=$path; absolutePath=$full; bytes=$file.Length; sha256=(Get-Sha256 $full); removed=$false; preservation='build-spill-originals.zip'; proof='untracked, absent from recorded build inputs, adjacent TypeScript source, first failed build write interval, exact workspace path, no reparse point, build processes idle' }
}
$archivePath = Join-Path $evidenceDir 'build-spill-originals.zip'
if (Test-Path -LiteralPath $archivePath) { throw 'Preservation archive exists; do not replace' }
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($item in $items) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.absolutePath, $item.path) | Out-Null }
} finally { $archive.Dispose() }
$readBack = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($item in $items) {
        $stream = $readBack.GetEntry($item.path).Open()
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $hasher.Dispose(); $stream.Dispose() }
        if ($hash -ne $item.sha256) { throw ('Preservation mismatch: ' + $item.path) }
    }
} finally { $readBack.Dispose() }
$auditPath = Join-Path $evidenceDir 'build-spill-cleanup.json'
$audit = [PSCustomObject]@{ workspace=$workspaceRoot; sourceReceipt='build-complete.json'; checkedLatestBuild='build-fixture-fixed.json'; processStartBoundarySource='completed input archive LastWriteTimeUtc, before subprocess spawn'; processStartBoundary=$firstStarted.ToString('o'); processEndBoundary=$firstEnded.ToString('o'); archive='build-spill-originals.zip'; archiveSha256=(Get-Sha256 $archivePath); resources=$items; status='preserved'; error=$null }
function Save-Audit { [System.IO.File]::WriteAllText($auditPath, (($audit | ConvertTo-Json -Depth 8) + "`n"), [System.Text.UTF8Encoding]::new($false)) }
Save-Audit
try {
    foreach ($item in $items) {
        if ((Get-Sha256 $item.absolutePath) -ne $item.sha256) { throw ('Output changed after preservation: ' + $item.path) }
        Remove-Item -LiteralPath $item.absolutePath
        $item.removed = -not (Test-Path -LiteralPath $item.absolutePath)
        Save-Audit
    }
    $audit.status = 'finished'
    Save-Audit
    Write-Output ('Preserved and removed owned generated files: ' + $items.Count)
} catch {
    $audit.status = 'stopped'
    $audit.error = $_.Exception.Message
    Save-Audit
    throw
}
