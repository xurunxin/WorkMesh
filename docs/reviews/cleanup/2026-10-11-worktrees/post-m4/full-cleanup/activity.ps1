# 只读刷新；进程不保存命令正文，容器不保存 Env。
param([ValidatePattern('^[a-z0-9-]+$')][string]$Phase)
$ErrorActionPreference='Stop'
$out=Join-Path $PSScriptRoot "activity-$Phase.json"
if (Test-Path -LiteralPath $out) { throw '已有采样，不覆盖' }
$roots=(Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\retained-directories.json') -Raw | ConvertFrom-Json).rows.path
$roots+=((Get-Location).Path)
$processes=@(Get-CimInstance Win32_Process)
$matches=@(foreach ($p in $processes) {
    foreach ($root in $roots) {
        if (([string]$p.CommandLine+' '+[string]$p.ExecutablePath).IndexOf((Split-Path -Leaf $root),[StringComparison]::OrdinalIgnoreCase) -ge 0) {
            [pscustomobject]@{root=$root;pid=$p.ProcessId;parentPid=$p.ParentProcessId;name=$p.Name;self=$p.ProcessId -eq $PID}
        }
    }
})
$calls=[Collections.Generic.List[object]]::new()
function Read-Docker([string[]]$ArgsList) {
    $start=[DateTime]::UtcNow.ToString('o')
    $executable=(Get-Command docker.exe -CommandType Application | Select-Object -First 1).Source
    $output=& $executable @ArgsList 2>&1 | Out-String
    $code=$LASTEXITCODE
    $calls.Add(@{input=@('docker')+$ArgsList;startedAt=$start;endedAt=[DateTime]::UtcNow.ToString('o');output=$output;exit=$code})
    if ($code -ne 0) { throw "Docker 只读调用失败 $code" }
    return $output
}
$ids=(Read-Docker @('ps','-aq')).Trim() -split '\s+'
$containers=@(foreach ($id in $ids) {
    if ($id) { (Read-Docker @('inspect','--format','{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State}},"mounts":{{json .Mounts}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"labels":{{json .Config.Labels}}}',$id)) | ConvertFrom-Json }
})
$volumeNames=(Read-Docker @('volume','ls','-q')).Trim() -split '\s+'
$volumes=@(foreach ($name in $volumeNames) { if ($name) { (Read-Docker @('volume','inspect',$name)) | ConvertFrom-Json } })
[ordered]@{phase=$Phase;recordedAt=[DateTime]::UtcNow.ToString('o');processMatches=$matches;containers=$containers;volumes=$volumes;calls=$calls;disk=(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object DeviceID,FreeSpace,Size)} | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $out -Encoding utf8NoBOM
[pscustomobject]@{processMatches=$matches;containers=@($containers | Select-Object name,@{n='state';e={$_.state.Status}});volumes=$volumes.Count} | ConvertTo-Json -Depth 5
