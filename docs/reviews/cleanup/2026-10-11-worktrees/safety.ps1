# 本轮只读安全核验；不写旧工作树、不执行删除。
param([string]$ReceiptName = 'safety-before.json')
$ErrorActionPreference = 'Stop'
$outDir = $PSScriptRoot
$record = Get-Content -LiteralPath (Join-Path $outDir 'preservation-53.json') -Raw | ConvertFrom-Json
$root = 'C:\Users\xurx\.tds\workspaces'
$target = $record.target
$resolved = (Resolve-Path -LiteralPath $target).Path
if ($resolved -ne $target -or (Split-Path -Parent $resolved) -ne $root -or $resolved -eq (Get-Location).Path) { throw '目标边界校验失败' }
$components = @()
$node = $resolved
while ($node) {
    $item = Get-Item -LiteralPath $node -Force
    $components += [pscustomobject]@{ path = $node; attributes = [int]$item.Attributes; reparse = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint) }
    $parent = Split-Path -Parent $node
    if ($parent -eq $node) { break }
    $node = $parent
}
if (@($components | Where-Object reparse).Count) { throw '祖先有 reparse point' }
$processes = @(Get-CimInstance Win32_Process)
$processSnapshot = @($processes | ForEach-Object {
    $refs = @([regex]::Matches([string]$_.CommandLine, '01a[0-9a-f-]{33}|m5-[0-9a-z-]+|\.tmp[/\\]m5-runtime') | ForEach-Object Value | Sort-Object -Unique)
    [pscustomobject]@{ pid = $_.ProcessId; parent = $_.ParentProcessId; name = $_.Name; commandLineReadable = $null -ne $_.CommandLine; workspaceReferences = $refs }
})
$references = @($processes | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.IndexOf((Split-Path -Leaf $target), [StringComparison]::OrdinalIgnoreCase) -ge 0 } | Select-Object ProcessId,ParentProcessId,Name)
if ($references.Count) { throw '目标存在活动命令行引用' }
$exclusive = 0
foreach ($mapping in $record.files) {
    $path = Join-Path $target $mapping.path
    $item = Get-Item -LiteralPath $path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '文件为链接' }
    if ($item.Length -ne $mapping.windowsBytes -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $mapping.windowsSha256) { throw "字节变化: $($mapping.path)" }
    $stream = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
    $stream.Dispose()
    $exclusive++
}
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size
$daemon = & tds status 2>&1 | Out-String
$daemonExit = $LASTEXITCODE
$result = [pscustomobject]@{ recordedAt = [DateTime]::UtcNow.ToString('o'); target = $target; resolved = $resolved; components = $components; targetReferences = $references; processSnapshot = $processSnapshot; exclusiveReadCount = $exclusive; disk = $disk; daemon = $daemon; daemonExit = $daemonExit; limitations = '命令行与可读任务对话引用检查及逐文件独占打开；没有全局 build registry／所有 OS handles 权限；独占打开只证明采样瞬间。进程完整命令行不入库，避免泄漏秘密。' }
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outDir $ReceiptName) -Encoding utf8NoBOM
$result | Select-Object recordedAt,target,exclusiveReadCount,disk,daemonExit | ConvertTo-Json -Depth 4
