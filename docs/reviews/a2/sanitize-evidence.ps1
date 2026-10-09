param([Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskEvidenceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runs'))
$taskRunRoot = [IO.Path]::GetFullPath($RunDirectory)
if (-not $taskRunRoot.StartsWith($taskEvidenceRoot + [IO.Path]::DirectorySeparatorChar) -or -not (Test-Path -LiteralPath $taskRunRoot -PathType Container)) { throw '证据目录越界' }
$taskFiles = @(Get-ChildItem -LiteralPath $taskRunRoot -Recurse -File)
if (@(Get-ChildItem -LiteralPath $taskRunRoot -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw '证据树含链接，停止' }
$taskRunReceipt = Get-Content -LiteralPath (Join-Path $taskRunRoot 'receipts.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($taskRunReceipt.resources | Where-Object { $_.type -eq 'container' -and $_.id -and $_.cleanup.code -ne 0 }).Count) { throw '本轮容器收尾未确认，不删除认证状态' }
$taskReceiptPath = Join-Path $taskRunRoot 'sanitization.json'
$taskEntries = New-Object Collections.Generic.List[object]
if (Test-Path -LiteralPath $taskReceiptPath) { foreach ($taskOldEntry in @(Get-Content -LiteralPath $taskReceiptPath -Raw -Encoding UTF8 | ConvertFrom-Json)) { $taskEntries.Add($taskOldEntry) } }
function Save-Receipt { [IO.File]::WriteAllText($taskReceiptPath, (ConvertTo-Json -InputObject $taskEntries.ToArray() -Depth 12), (New-Object Text.UTF8Encoding($false))) }
$taskKnownSecrets = New-Object 'Collections.Generic.HashSet[string]'
foreach ($taskSecretName in @('WORKMESH_BOOTSTRAP_TOKEN','SESSION_SECRET','WORKMESH_MASTER_KEY','WORKMESH_RUNNER_SERVICE_TOKEN','POSTGRES_PASSWORD','RUSTFS_SECRET_KEY','S3_SECRET_ACCESS_KEY')) {
  $taskSecretValue = [Environment]::GetEnvironmentVariable($taskSecretName)
  if ($taskSecretValue) { [void]$taskKnownSecrets.Add($taskSecretValue) }
}
function Find-Secret([string]$text) {
  foreach ($pattern in @('(?i)"name"\s*:\s*"(?:x-csrf-token|x-workmesh-bootstrap-token)"\s*,\s*"value"\s*:\s*"([A-Za-z0-9_.-]{20,})"', '(?i)"(?:csrfToken|csrf_token|sessionToken|bootstrapToken|x-csrf-token|x-workmesh-bootstrap-token)"\s*:\s*"([A-Za-z0-9_.-]{20,})"', '(?i)workmesh_session=([A-Za-z0-9_.-]{20,})')) {
    foreach ($match in [regex]::Matches($text, $pattern)) { [void]$taskKnownSecrets.Add($match.Groups[1].Value) }
  }
}
function Strip-Secret([string]$text) {
  foreach ($secret in $taskKnownSecrets) { $text = $text.Replace($secret, '[REDACTED]') }
  $text = [regex]::Replace($text, '(?i)("(?:authorization|cookie|set-cookie|x-csrf-token|x-workmesh-bootstrap-token|bootstrapToken)"\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[REDACTED]"')
  $text = [regex]::Replace($text, '(?i)("name"\s*:\s*"(?:authorization|cookie|set-cookie|x-csrf-token|x-workmesh-bootstrap-token|workmesh_session)"\s*,\s*"value"\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[REDACTED]"')
  $text = [regex]::Replace($text, '(?i)("(?:csrfToken|csrf_token|sessionToken|secretMaterial|webhookSecret|privateKey|accessToken|password)"\s*:\s*)"(?:\\.|[^"\\])*"', '$1"[REDACTED]"')
  $text = [regex]::Replace($text, '(?i)(\\"(?:csrfToken|csrf_token|sessionToken|secretMaterial|webhookSecret|privateKey|accessToken|password|bootstrapToken)\\"\s*:\s*\\")[^"]*(\\")', '$1[REDACTED]$2')
  $text = [regex]::Replace($text, '(?i)workmesh_session=[A-Za-z0-9_.-]+', 'workmesh_session=[REDACTED]')
  return $text
}
foreach ($taskFile in $taskFiles) {
  if (@($taskEntries | Where-Object { $_.path -eq $taskFile.FullName -and $_.policy -eq 'a2-secrets-3' }).Count) { continue }
  if ($taskFile.Extension -eq '.zip') {
    $record = [ordered]@{ path=$taskFile.FullName; policy='a2-secrets-3'; originalSha256=(Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash.ToLower(); reason='Playwright trace 中认证材料及其 DOM 副本脱敏，含嵌套转义的 JSON；保留前次脱敏记录，此副本不冒原字节'; changedEntries=@(); result=$null }
    $taskEntries.Add($record); Save-Receipt
    $archive = [IO.Compression.ZipFile]::Open($taskFile.FullName, [IO.Compression.ZipArchiveMode]::Update)
    try {
      foreach ($entry in @($archive.Entries)) {
        if ($entry.FullName -match '\.(png|jpeg|webm)$' -or $entry.Length -gt 20MB) { continue }
        $reader = New-Object IO.StreamReader($entry.Open(), (New-Object Text.UTF8Encoding($false,$true)))
        try { Find-Secret ($reader.ReadToEnd()) } catch { continue } finally { $reader.Dispose() }
      }
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
