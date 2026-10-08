param([Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runs'))
$taskRunRoot = [IO.Path]::GetFullPath($RunDirectory)
if (-not $taskRunRoot.StartsWith($taskEvidenceRoot + [IO.Path]::DirectorySeparatorChar) -or -not (Test-Path -LiteralPath $taskRunRoot -PathType Container)) { throw '证据目录越界' }
$taskFiles = @(Get-ChildItem -LiteralPath $taskRunRoot -Recurse -File)
if (@(Get-ChildItem -LiteralPath $taskRunRoot -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw '证据树含链接，停止' }
$taskRunReceipt = Get-Content -LiteralPath (Join-Path $taskRunRoot 'receipts.json') -Raw | ConvertFrom-Json
if (@($taskRunReceipt.resources | Where-Object { $_.type -eq 'container' -and $_.id -and $_.cleanup.code -ne 0 }).Count) { throw '本轮容器收尾未确认，不删除认证状态' }
$taskReceiptPath = Join-Path $taskRunRoot 'sanitization.json'
$taskEntries = New-Object Collections.Generic.List[object]
if (Test-Path -LiteralPath $taskReceiptPath) { foreach ($taskOldEntry in @(Get-Content -LiteralPath $taskReceiptPath -Raw | ConvertFrom-Json)) { $taskEntries.Add($taskOldEntry) } }
function Save-Receipt { [IO.File]::WriteAllText($taskReceiptPath, (ConvertTo-Json -InputObject $taskEntries.ToArray() -Depth 12), (New-Object Text.UTF8Encoding($false))) }
function Strip-Secret([string]$text) {
  $text = [regex]::Replace($text, '(?i)("name"\s*:\s*"(?:authorization|cookie|set-cookie|x-csrf-token|x-workmesh-bootstrap-token|workmesh_session)"\s*,\s*"value"\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[REDACTED]"')
  $text = [regex]::Replace($text, '(?i)("(?:csrfToken|csrf_token|sessionToken|secretMaterial|webhookSecret|privateKey|accessToken|password)"\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[REDACTED]"')
  $text = [regex]::Replace($text, '(?i)workmesh_session=[A-Za-z0-9_.-]+', 'workmesh_session=[REDACTED]')
  return $text
}
foreach ($taskFile in $taskFiles) {
  if (@($taskEntries | Where-Object { $_.path -eq $taskFile.FullName }).Count) { continue }
  if ($taskFile.Extension -eq '.zip') {
    $record = [ordered]@{ path=$taskFile.FullName; originalSha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLower(); reason='Playwright trace 中认证材料脱敏，保留运行/请求/截图结构；此副本不冒原字节'; changedEntries=@(); result=$null }
    $taskEntries.Add($record); Save-Receipt
    $archive = [IO.Compression.ZipFile]::Open($taskFile.FullName, [IO.Compression.ZipArchiveMode]::Update)
    try {
      foreach ($entry in @($archive.Entries)) {
        if ($entry.FullName -match '\.(png|jpeg|webm)$' -or $entry.Length -gt 20MB) { continue }
        $reader = New-Object IO.StreamReader($entry.Open(), (New-Object Text.UTF8Encoding($false,$true)))
        try { $before = $reader.ReadToEnd() } catch { continue } finally { $reader.Dispose() }
        $after = Strip-Secret $before
        if ($after -ne $before) {
          $name = $entry.FullName; $entry.Delete(); $created = $archive.CreateEntry($name)
          $writer = New-Object IO.StreamWriter($created.Open(), (New-Object Text.UTF8Encoding($false)))
          try { $writer.Write($after) } finally { $writer.Dispose() }
          $record.changedEntries += $name
        }
      }
    } finally { $archive.Dispose() }
    $record.result = '已扫描并脱敏'; $record.finalSha256 = (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLower(); Save-Receipt
  }
  if ($taskFile.Name -eq 'admin.json' -and $taskFile.Directory.Name -eq '.auth') {
    $record = [ordered]@{ path=$taskFile.FullName; originalSha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLower(); reason='本任务已停止的浏览器认证状态；不提交 cookie'; activity='本 run 的 Docker 夹具已结束；没有仍引用此状态的浏览器'; result=$null }
    $taskEntries.Add($record); Save-Receipt
    Remove-Item -LiteralPath $taskFile.FullName
    $record.result = @{ exists=(Test-Path -LiteralPath $taskFile.FullName); completedAt=[DateTime]::UtcNow.ToString('o') }; Save-Receipt
  }
}
Save-Receipt
