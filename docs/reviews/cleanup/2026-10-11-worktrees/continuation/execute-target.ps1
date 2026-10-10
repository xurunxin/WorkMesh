# 一次只执行一个已先行提交的精确候选；失败/拒绝停止，不 Force、不递归清链接。
param([ValidateSet(54,55,56,57)][int]$Todo, [ValidatePattern('^[0-9a-f]{40}$')][string]$MainSha)
$ErrorActionPreference = 'Stop'
$outDir = $PSScriptRoot
$current = (Get-Location).Path
$workspaceRoot = 'C:\Users\xurx\.tds\workspaces'
$names = @{54='01a11ed4-1e73-7802-8bf8-4899c5405f61';55='01a12031-e9de-75c4-ab40-b44affcd71f6';56='01a121fb-781b-7b58-9bca-a596b92a8cbe';57='01a1246e-406c-7593-ada6-66996634434b'}
$target = Join-Path $workspaceRoot $names[$Todo]
$receipt = Join-Path $outDir "execution-$Todo.json"
if (Test-Path -LiteralPath $receipt) { throw '已有本轮执行回执，禁止重复发删除；先读回执' }
$calls = [Collections.Generic.List[object]]::new()
$journal = Join-Path $outDir "operation-journal-$Todo.jsonl"
$record = [ordered]@{todo=$Todo;target=$target;main=$MainSha;startedAt=[DateTime]::UtcNow.ToString('o');result='尚未执行';diskBefore=$null;diskAfter=$null;calls=$calls;error=$null;targetExistsAfter=$null;endedAt=$null}
function Save-Receipt { $record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receipt -Encoding utf8NoBOM }
function Append-Call($Call) { $calls.Add($Call); [IO.File]::AppendAllText($journal, ($Call | ConvertTo-Json -Depth 12 -Compress)+"`n", [Text.UTF8Encoding]::new($false)) }
function Disk { Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size }
function Process-Guard {
    $processes = @(Get-CimInstance Win32_Process)
    $hits = @($processes | Where-Object { $_.ProcessId -ne $PID -and (([string]$_.CommandLine + ' ' + [string]$_.ExecutablePath).IndexOf($names[$Todo], [StringComparison]::OrdinalIgnoreCase) -ge 0) } | Select-Object ProcessId,ParentProcessId,Name)
    if ($hits.Count) { throw ('活动进程引用: ' + ($hits | ConvertTo-Json -Compress)) }
}
function Native-Git([string[]]$Arguments) {
    $info = [Diagnostics.ProcessStartInfo]::new((Get-Command git).Source)
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($a in $Arguments) { $info.ArgumentList.Add($a) }
    $p = [Diagnostics.Process]::new(); $p.StartInfo = $info
    $start = [DateTime]::UtcNow.ToString('o')
    if (-not $p.Start()) { throw 'Git 无法启动' }
    $stdoutTask = $p.StandardOutput.ReadToEndAsync()
    $stderrTask = $p.StandardError.ReadToEndAsync()
    $p.WaitForExit()
    $stdout = $stdoutTask.GetAwaiter().GetResult(); $stderr = $stderrTask.GetAwaiter().GetResult()
    Append-Call ([pscustomobject]@{input=@('git')+$Arguments;start=$start;end=[DateTime]::UtcNow.ToString('o');stdout=$stdout;stderr=$stderr;exit=$p.ExitCode})
    Save-Receipt
    if ($p.ExitCode -ne 0) { throw "Git 失败，停止原目标，退出码 $($p.ExitCode)" }
    return $stdout
}
function Remove-One([string]$Literal, [string]$Kind) {
    $start = [DateTime]::UtcNow.ToString('o')
    $call = [ordered]@{input=@('Remove-Item','-LiteralPath',$Literal,'-ErrorAction','Stop');kind=$Kind;start=$start;end=$null;output='';exit=$null;recursive=$false;force=$false}
    try {
        Remove-Item -LiteralPath $Literal -ErrorAction Stop
        $call.exit=0
    } catch {
        $call.exit=1; $call.output=$_.ToString(); throw
    } finally {
        $call.end=[DateTime]::UtcNow.ToString('o');Append-Call ([pscustomobject]$call)
    }
}
try {
    if ((Split-Path -Parent $target) -ne $workspaceRoot -or $target -eq $current -or (Resolve-Path -LiteralPath $target).Path -ne $target) { throw '绝对目标范围校验失败' }
    $node=$target
    while ($node) {
        if ((Get-Item -LiteralPath $node -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '目标祖先是链接' }
        $parent=Split-Path -Parent $node;if ($parent -eq $node) { break };$node=$parent
    }
    $proof=Get-Content -LiteralPath (Join-Path $outDir 'preflight-commit-binding.json') -Raw | ConvertFrom-Json
    if (-not $proof.success) { throw '预检提交/归档 Git 字节尚未绑定' }
    Process-Guard
    $env:PYTHONUTF8='1'
    $start=[DateTime]::UtcNow.ToString('o')
    $verification = & python -B (Join-Path $outDir 'verify-target.py') $Todo $MainSha 2>&1 | Out-String
    $verificationExit=$LASTEXITCODE
    Append-Call ([pscustomobject]@{input=@('python','-B',(Join-Path $outDir 'verify-target.py'),[string]$Todo,$MainSha);start=$start;end=[DateTime]::UtcNow.ToString('o');output=$verification;exit=$verificationExit})
    Save-Receipt
    if ($verificationExit -ne 0) { throw '逐文件预检失败；未发删除命令' }
    Process-Guard
    $record.diskBefore=Disk
    Save-Receipt
    Native-Git -Arguments @('-C',$current,'worktree','remove',$target) | Out-Null
    $record.result='正式 Git 移除成功；核原 junction 残留'
    Save-Receipt
    if (Test-Path -LiteralPath $target) {
        $start=[DateTime]::UtcNow.ToString('o')
        $residual = & python -B (Join-Path $outDir 'residual-check.py') $Todo 2>&1 | Out-String
        $residualExit=$LASTEXITCODE
        Append-Call ([pscustomobject]@{input=@('python','-B',(Join-Path $outDir 'residual-check.py'),[string]$Todo);start=$start;end=[DateTime]::UtcNow.ToString('o');output=$residual;exit=$residualExit})
        Save-Receipt
        if ($residualExit -ne 0) { throw '出现预检外残留；停止目标，不换法递归删除' }
        Process-Guard
        $r=Get-Content -LiteralPath (Join-Path $outDir "residual-$Todo.json") -Raw | ConvertFrom-Json
        if (-not $r.safe -or $r.path -ne $target) { throw '残留边界证明失败' }
        foreach ($link in $r.links) {
            $literal=Join-Path $target $link.path
            $absolute=[IO.Path]::GetFullPath($literal)
            if (-not $absolute.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '链接本体超出精确目标' }
            $item=Get-Item -LiteralPath $absolute -Force
            $normalizedTarget=([string]$item.Target).Replace('\\?\','')
            $expectedTarget=([string]$link.target).Replace('\\?\','')
            if ($item.LinkType -ne 'Junction' -or -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $normalizedTarget -ne $expectedTarget -or -not $normalizedTarget.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '原 junction 本体核验失败' }
            Remove-One -Literal $absolute -Kind '先行声明的 Git 成功后原 junction 本体；不递归'
        }
        foreach ($directory in $r.directoriesDeepestFirst) {
            $absolute=[IO.Path]::GetFullPath($directory)
            if ($absolute -ne $target -and -not $absolute.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '空目录超出精确目标' }
            $item=Get-Item -LiteralPath $absolute -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '空目录是未清的链接' }
            if (@([IO.Directory]::EnumerateFileSystemEntries($absolute)).Count) { throw '空目录出现新内容，停止目标' }
            Remove-One -Literal $absolute -Kind '已证明普通空目录；不递归'
        }
    }
    $record.targetExistsAfter=Test-Path -LiteralPath $target
    if ($record.targetExistsAfter) { throw '目标仍存在' }
    $record.result='完整工作树已移除；原 junction 本体及普通空目录按先行预检收尾'
} catch {
    $record.error=$_.ToString()
    $record.result='停止该目标；不重试、不 Force、不换方式绕过'
} finally {
    $record.diskAfter=Disk
    $record.targetExistsAfter=Test-Path -LiteralPath $target
    $record.endedAt=[DateTime]::UtcNow.ToString('o')
    Save-Receipt
}
$record | Select-Object todo,target,result,error,targetExistsAfter,diskBefore,diskAfter | ConvertTo-Json -Depth 5
if ($record.error) { exit 1 }
