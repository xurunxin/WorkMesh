# 仅一个先行保全并推送的 linked worktree；无 Force、属性修改或备用删除。
param([ValidatePattern('^[0-9a-f]{40}$')][string]$MainSha)
$ErrorActionPreference='Stop'
$root='C:\Users\xurx\.tds\workspaces'
$name='01a12766-4132-7d8c-a542-dcbfb2008b49'
$target=Join-Path $root $name
$current=(Get-Location).Path
$receipt=Join-Path $PSScriptRoot 'execution-cleanup-pr217.json'
if (Test-Path -LiteralPath $receipt) { throw '已有执行回执，禁止重复发删除' }
$calls=[Collections.Generic.List[object]]::new()
$record=[ordered]@{target=$target;main=$MainSha;startedAt=[DateTime]::UtcNow.ToString('o');calls=$calls;result='尚未执行';error=$null;diskBefore=$null;diskAfter=$null;targetExistsAfter=$null;endedAt=$null}
function Save { $record | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath $receipt -Encoding utf8NoBOM }
function Disk { Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size }
function Guard {
    $hits=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and (([string]$_.CommandLine+' '+[string]$_.ExecutablePath).IndexOf($name,[StringComparison]::OrdinalIgnoreCase) -ge 0) } | Select-Object ProcessId,ParentProcessId,Name)
    if ($hits.Count) { throw ('仍有进程引用: '+($hits | ConvertTo-Json -Compress)) }
}
function Native([string]$Program,[string[]]$Arguments) {
    $info=[Diagnostics.ProcessStartInfo]::new((Get-Command $Program).Source)
    $info.UseShellExecute=$false;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info
    $start=[DateTime]::UtcNow.ToString('o')
    if (-not $process.Start()) { throw '子进程未启动' }
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $call=[pscustomobject]@{input=@($Program)+$Arguments;startedAt=$start;endedAt=[DateTime]::UtcNow.ToString('o');stdout=$stdout.GetAwaiter().GetResult();stderr=$stderr.GetAwaiter().GetResult();exit=$process.ExitCode}
    $calls.Add($call);Save
    if ($process.ExitCode -ne 0) { throw "子进程失败，停止原目标，exit=$($process.ExitCode)" }
}
try {
    if ((Split-Path -Parent $target) -ne $root -or $target -eq $current -or (Resolve-Path -LiteralPath $target).Path -ne $target) { throw '精确绝对路径校验失败' }
    $node=$target
    while ($node) {
        if ((Get-Item -LiteralPath $node -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '目标/祖先为链接，停止' }
        $parent=Split-Path -Parent $node;if ($parent -eq $node) { break };$node=$parent
    }
    $binding=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'preflight-binding.json') -Raw | ConvertFrom-Json
    if (-not $binding.success) { throw '尚未验证预检推送/源码绑定' }
    Guard
    $env:PYTHONUTF8='1'
    Native -Program python -Arguments @('-B',(Join-Path $PSScriptRoot 'verify.py'),$MainSha)
    Guard
    $record.diskBefore=Disk;Save
    Native -Program git -Arguments @('-C',$current,'worktree','remove',$target)
    $record.targetExistsAfter=Test-Path -LiteralPath $target
    if ($record.targetExistsAfter) { throw 'Git 后目录仍存在；本候选预检无链接，不使用备用收尾' }
    $record.result='正式 Git 完整移除成功；未使用子路径删除或备用工具'
} catch {
    $record.error=$_.ToString();$record.result='停止原目标；不重试、不换工具、不改属性/ACL'
} finally {
    $record.diskAfter=Disk;$record.targetExistsAfter=Test-Path -LiteralPath $target
    $record.endedAt=[DateTime]::UtcNow.ToString('o');Save
}
$record | ConvertTo-Json -Depth 15
if ($record.error) { exit 1 }
