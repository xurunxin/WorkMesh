# 只读刷新进程与路径引用；不输出完整命令行或环境变量，不停止服务。
param([string]$ReceiptName = 'process-preflight.json')
$ErrorActionPreference = 'Stop'
$targets = @('01a11ed4-1e73-7802-8bf8-4899c5405f61','01a12031-e9de-75c4-ab40-b44affcd71f6','01a121fb-781b-7b58-9bca-a596b92a8cbe','01a1246e-406c-7593-ada6-66996634434b')
$processes = @(Get-CimInstance Win32_Process)
$rows = @($processes | ForEach-Object {
    $search = [string]$_.CommandLine + ' ' + [string]$_.ExecutablePath
    $refs = @([regex]::Matches($search, '01a[0-9a-f-]{33}|m5-[0-9a-z-]+|\.tmp[/\\]m5-runtime') | ForEach-Object Value | Sort-Object -Unique)
    [pscustomobject]@{ pid=$_.ProcessId; parent=$_.ParentProcessId; name=$_.Name; commandLineReadable=$null -ne $_.CommandLine; executableReadable=$null -ne $_.ExecutablePath; workspaceReferences=$refs; candidateReferences=@($targets | Where-Object { $search.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 }) }
})
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size
$result = [pscustomobject]@{ recordedAt=[DateTime]::UtcNow.ToString('o'); ownPid=$PID; processes=$rows; disk=$disk; limitations='只核可见命令行/可执行路径；不是全局 OS handles 或平台恢复登记；活动任务可正常变化' }
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $PSScriptRoot $ReceiptName) -Encoding utf8NoBOM
$rows | Where-Object { $_.candidateReferences.Count } | ConvertTo-Json -Depth 5
$disk | ConvertTo-Json
