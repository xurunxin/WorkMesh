# 只读可见进程与卷；不输出完整命令行、环境或秘密。
param([ValidatePattern('^[a-z0-9-]+$')][string]$Phase)
$ErrorActionPreference='Stop'
$dest=Join-Path $PSScriptRoot "process-$Phase.json"
if (Test-Path -LiteralPath $dest) { throw '原件已存在，禁止覆盖' }
$started=[DateTime]::UtcNow.ToString('o')
$names=@('01a12766-4132-7d8c-a542-dcbfb2008b49','01a126be-7aba-7b1d-a57a-f58317f89a67','01a1264e-bd35-76d4-b328-03e9b91301f3','01a127d4-e047-7e57-81c2-3d054851fc88')
$processes=@(Get-CimInstance Win32_Process)
$rows=@($processes | ForEach-Object {
    $search=[string]$_.CommandLine+' '+[string]$_.ExecutablePath
    [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;commandLineReadable=$null -ne $_.CommandLine;executableReadable=$null -ne $_.ExecutablePath;
        workspaceReferences=@([regex]::Matches($search,'01a[0-9a-f-]{33}|m[45]-[0-9a-z-]+') | ForEach-Object Value | Sort-Object -Unique);
        inspectedReferences=@($names | Where-Object { $search.IndexOf($_,[StringComparison]::OrdinalIgnoreCase) -ge 0 })}
})
$record=[pscustomobject]@{startedAt=$started;endedAt=[DateTime]::UtcNow.ToString('o');ownPid=$PID;processes=$rows;
    disk=(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size);
    limitations='可见命令行/执行路径，不等于所有 OS handles 或隐藏 cwd；不停止进程。'}
$record | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $dest -Encoding utf8NoBOM
[pscustomobject]@{phase=$Phase;references=@($rows | Where-Object {$_.inspectedReferences.Count});processCount=$rows.Count;disk=$record.disk} | ConvertTo-Json -Depth 5
