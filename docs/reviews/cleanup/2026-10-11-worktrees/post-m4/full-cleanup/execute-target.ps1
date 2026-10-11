# 每次只处理一个先行推送/精确映射的旧工作树；首败/拒绝停原目标。
param([ValidatePattern('^[0-9a-f-]{36}$')][string]$Key,[ValidatePattern('^[0-9a-f]{40}$')][string]$MainSha)
$ErrorActionPreference='Stop'
$out=$PSScriptRoot
$current=(Get-Location).Path
$workspaceRoot='C:\Users\xurx\.tds\workspaces'
$denied=@('01a115d0-87b0-78cd-921d-750713cdde51','01a116f7-1027-7c75-90df-32ebc5488752','01a11890-f4de-7106-b64d-e1b2c0d4608e','01a11acb-1a68-7fba-a359-7119603cde7d')
$target=[IO.Path]::GetFullPath((Join-Path $workspaceRoot $Key))
$receipt=Join-Path $out "execution-$Key.json"
if (Test-Path -LiteralPath $receipt) { throw '已有原执行回执，禁止重复删除' }
$calls=[Collections.Generic.List[object]]::new()
$record=[ordered]@{target=$target;main=$MainSha;startedAt=[DateTime]::UtcNow.ToString('o');calls=$calls;result='未执行';error=$null;existsAfter=$null;diskBefore=$null;diskAfter=$null}
function Save { $record | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $receipt -Encoding utf8NoBOM }
function Native([string]$Exe,[string[]]$Arguments) {
    $info=[Diagnostics.ProcessStartInfo]::new($Exe);$info.UseShellExecute=$false;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    foreach ($arg in $Arguments) { $info.ArgumentList.Add($arg) }
    $start=[DateTime]::UtcNow.ToString('o');$p=[Diagnostics.Process]::new();$p.StartInfo=$info
    if (-not $p.Start()) { throw '子进程未启动' }
    $stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync();$p.WaitForExit()
    $calls.Add(@{kind='native-subprocess';input=@($Exe)+$Arguments;startedAt=$start;endedAt=[DateTime]::UtcNow.ToString('o');stdout=$stdout.GetAwaiter().GetResult();stderr=$stderr.GetAwaiter().GetResult();exitCode=$p.ExitCode})
    Save
    if ($p.ExitCode -ne 0) { throw "子进程首败 $($p.ExitCode)，停止原目标" }
}
function Guard {
    $processes=@(Get-CimInstance Win32_Process)
    $ancestors=[Collections.Generic.HashSet[uint32]]::new();$node=[uint32]$PID
    while ($node -and $ancestors.Add($node)) { $parent=$processes | Where-Object ProcessId -eq $node | Select-Object -First 1;$node=[uint32]$parent.ParentProcessId }
    $hits=@($processes | Where-Object { -not $ancestors.Contains([uint32]$_.ProcessId) -and (([string]$_.CommandLine+' '+[string]$_.ExecutablePath).IndexOf($Key,[StringComparison]::OrdinalIgnoreCase) -ge 0) } | Select-Object ProcessId,ParentProcessId,Name)
    $calls.Add(@{kind='read-only-process-guard';observedAt=[DateTime]::UtcNow.ToString('o');hits=$hits;excludedOwnedAncestors=@($ancestors)})
    if ($hits.Count) { throw '发现其他活动消费者，不删除' }
    $docker=(Get-Command docker.exe -CommandType Application | Select-Object -First 1).Source
    $ids=@(& $docker ps -aq)
    if ($LASTEXITCODE -ne 0) { throw '容器枚举失败' }
    if ($ids.Count) {
        $mounts=& $docker inspect --format '{{json .Mounts}}' @ids 2>&1 | Out-String
        $code=$LASTEXITCODE
        $calls.Add(@{kind='native-subprocess';input=@($docker,'inspect','--format','{{json .Mounts}}')+$ids;output=$mounts;exitCode=$code;observedAt=[DateTime]::UtcNow.ToString('o')})
        if ($code -ne 0 -or $mounts.IndexOf($Key,[StringComparison]::OrdinalIgnoreCase) -ge 0) { throw '容器挂载查询失败或有目标引用' }
    }
    Save
}
function Remove-Literal([string]$Path,[string]$Kind) {
    $absolute=[IO.Path]::GetFullPath($Path)
    if ($absolute -ne $target -and -not $absolute.StartsWith($target+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '路径越界' }
    $call=[ordered]@{kind='powershell-cmdlet';input=@('Remove-Item','-LiteralPath',$absolute,'-ErrorAction','Stop');purpose=$Kind;startedAt=[DateTime]::UtcNow.ToString('o');endedAt=$null;normalizedOutcome=$null;nativeExitCode=$null;output='';recursive=$false}
    try { Remove-Item -LiteralPath $absolute -ErrorAction Stop;$call.normalizedOutcome='success' }
    catch { $call.normalizedOutcome='failure';$call.output=$_.ToString();throw }
    finally { $call.endedAt=[DateTime]::UtcNow.ToString('o');$calls.Add($call) }
}
try {
    if ($denied -contains $Key -or $target -eq $current -or (Split-Path -Parent $target) -ne $workspaceRoot -or (Resolve-Path -LiteralPath $target).Path -ne $target) { throw '候选或绝对根禁止' }
    $node=$target
    while ($node) { if ((Get-Item -LiteralPath $node -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '祖先是链接' };$parent=Split-Path -Parent $node;if ($parent -eq $node) { break };$node=$parent }
    Guard
    $python=(Get-Command python.exe -CommandType Application | Select-Object -First 1).Source
    Native $python @('-B',(Join-Path $out 'verify-target.py'),$Key,$MainSha)
    Guard
    $record.diskBefore=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size
    # 15:05 明确解除自设 readonly 门，仅这九个夹具文件；不改 ACL。
    if ($Key -eq '01a126be-7aba-7b1d-a57a-f58317f89a67') {
        $readonly=Get-Content -LiteralPath (Join-Path $out 'readonly-exception.json') -Raw | ConvertFrom-Json
        if ($readonly.files.Count -ne 9 -or $readonly.bytes -ne 696) { throw '精确只读例外清单不符' }
        foreach ($file in $readonly.files) {
            $literal=Join-Path $target $file.path;$item=Get-Item -LiteralPath $literal -Force
            if ([int]$item.Attributes -ne $file.attributes -or $item.Length -ne $file.bytes) { throw '只读对象属性/长度改变' }
            $start=[DateTime]::UtcNow.ToString('o')
            $new=[IO.FileAttributes]([int]$item.Attributes -band (-bnot [int][IO.FileAttributes]::ReadOnly))
            Set-ItemProperty -LiteralPath $literal -Name Attributes -Value $new -ErrorAction Stop
            $calls.Add(@{kind='powershell-cmdlet';input=@('Set-ItemProperty','-LiteralPath',$literal,'-Name','Attributes','-Value',[int]$new);startedAt=$start;endedAt=[DateTime]::UtcNow.ToString('o');normalizedOutcome='success';nativeExitCode=$null;before=$file.attributes;after=[int](Get-Item -LiteralPath $literal -Force).Attributes})
        }
    }
    $decision=Get-Content -LiteralPath (Join-Path $out 'execution-plan.json') -Raw | ConvertFrom-Json
    $entry=$decision.targets | Where-Object key -eq $Key | Select-Object -First 1
    if (-not $entry -or -not $entry.safe) { throw '缺先行精确执行声明' }
    $git=(Get-Command git.exe -CommandType Application | Select-Object -First 1).Source
    Native $git (@('-C',$current)+@($entry.arguments))
    $record.result='正式 Git 移除返回成功，核残留'
    Save
    if (Test-Path -LiteralPath $target) {
        Native $python @('-B',(Join-Path $out 'residual-check.py'),$Key)
        $residual=Get-Content -LiteralPath (Join-Path $out "residual-$Key.json") -Raw | ConvertFrom-Json
        if (-not $residual.safe -or $residual.path -ne $target) { throw '残留边界不符' }
        foreach ($link in $residual.links) {
            $literal=Join-Path $target $link.path;$item=Get-Item -LiteralPath $literal -Force
            if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ([string]$item.Target).Replace('\\?\','') -ne ([string]$link.target).Replace('\\?\','')) { throw '链接本体改变' }
            Remove-Literal $literal '预先声明的派生链接本体；非递归'
        }
        foreach ($dir in $residual.directoriesDeepestFirst) {
            if (@([IO.Directory]::EnumerateFileSystemEntries($dir)).Count -or ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '不是普通空目录' }
            Remove-Literal $dir '普通空目录；非递归'
        }
    }
    $record.existsAfter=Test-Path -LiteralPath $target
    if ($record.existsAfter) { throw '目标未完整移除' }
    Native $git @('-C',$current,'worktree','list','--porcelain')
    $record.result='完整旧工作树已回收，登记与目录不存在'
} catch { $record.error=$_.ToString();$record.result='该目标停止；不得重试/换法绕失败或拒绝' }
finally { $record.existsAfter=Test-Path -LiteralPath $target;$record.diskAfter=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size;$record.endedAt=[DateTime]::UtcNow.ToString('o');Save }
[pscustomobject]$record | Select-Object target,result,error,existsAfter | ConvertTo-Json
if ($record.error) { exit 1 }
