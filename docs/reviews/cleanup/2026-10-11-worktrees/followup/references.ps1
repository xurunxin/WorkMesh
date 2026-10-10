# 仅刷新可见进程、执行路径与 C 卷；不输出完整命令行或环境。
param([ValidatePattern('^[a-z0-9-]+$')][string]$Phase)
$ErrorActionPreference='Stop'
$names=@('01a115ed-0894-7af5-b31f-4ffe208e198a','01a11661-dbed-70ca-85d6-05851a0213e1','01a11a0e-d8a0-7474-ad05-791c239b82fe','01a11a77-e1c5-763d-ad86-a1bcf4d672e6','01a126be-7aba-7b1d-a57a-f58317f89a67')
$dest=Join-Path $PSScriptRoot "process-$Phase.json"
if (Test-Path -LiteralPath $dest) { throw '原件已存在，禁止覆盖' }
$started=[DateTime]::UtcNow.ToString('o')
$processes=@(Get-CimInstance Win32_Process)
$rows=@($processes | ForEach-Object {
    $search=[string]$_.CommandLine+' '+[string]$_.ExecutablePath
    [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;commandLineReadable=$null -ne $_.CommandLine;executableReadable=$null -ne $_.ExecutablePath;
        workspaceReferences=@([regex]::Matches($search,'01a[0-9a-f-]{33}|m5-[0-9a-z-]+|\.tmp[/\\]m5-runtime') | ForEach-Object Value | Sort-Object -Unique);
        candidateReferences=@($names | Where-Object { $search.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 })}
})
$record=[pscustomobject]@{startedAt=$started;endedAt=[DateTime]::UtcNow.ToString('o');ownPid=$PID;processes=$rows;
    disk=(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size);
    limitations='可见命令行/执行路径，不等于全局 OS handles/隐藏 cwd；结合任务、恢复对话和逐文件独占读取。不停止进程。'}
$record | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $dest -Encoding utf8NoBOM
[pscustomobject]@{phase=$Phase;candidateHits=@($rows | Where-Object {$_.candidateReferences.Count}).Count;processCount=$rows.Count;disk=$record.disk} | ConvertTo-Json -Depth 5
