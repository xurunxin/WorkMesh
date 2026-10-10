# 使用隔离的小型仓库证明本机 Git/PowerShell 的 junction 与 hardlink 边界。
# 不触碰候选旧工作树、共享 store 或任何历史拒绝目标。
$ErrorActionPreference = 'Stop'
$outDir = $PSScriptRoot
$workspace = (Get-Location).Path
$fixtureRoot = Join-Path $workspace '.tmp\cleanup-link-proof-20261011-3'
if (Test-Path -LiteralPath $fixtureRoot) { throw '夹具目录已存在，不能复用未知状态' }
$repo = Join-Path $fixtureRoot 'repo.git'
$wt = Join-Path $fixtureRoot 'worktree'
$store = Join-Path $fixtureRoot 'sentinel-store'
New-Item -ItemType Directory -Path $store | Out-Null
$sentinel = Join-Path $store 'sentinel.bin'
[IO.File]::WriteAllBytes($sentinel, [Text.Encoding]::UTF8.GetBytes('cleanup-boundary-sentinel-20261011'))
$shaBefore = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
$calls = @()
function Run-Git([string[]]$Arguments) {
    $start = [DateTime]::UtcNow.ToString('o')
    $output = (& git @Arguments 2>&1 | Out-String)
    $code = $LASTEXITCODE
    $script:calls += [pscustomobject]@{ input = @('git') + $Arguments; start = $start; end = [DateTime]::UtcNow.ToString('o'); output = $output; exit = $code }
    if ($code -ne 0) { throw "Git 夹具操作失败: $output" }
    return $output.Trim()
}
function Run-GitInput([string[]]$Arguments, [string]$InputText) {
    $info = [Diagnostics.ProcessStartInfo]::new((Get-Command git).Source)
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $start = [DateTime]::UtcNow.ToString('o')
    if (-not $process.Start()) { throw '无法启动夹具 Git' }
    $process.StandardInput.Write($InputText)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    $script:calls += [pscustomobject]@{ input = @('git') + $Arguments; stdin = $InputText; start = $start; end = [DateTime]::UtcNow.ToString('o'); stdout = $stdout; stderr = $stderr; exit = $process.ExitCode }
    if ($process.ExitCode -ne 0) { throw $stderr }
    return $stdout.Trim()
}
Run-Git -Arguments @('init','--bare',$repo) | Out-Null
$blob = Run-GitInput -Arguments @("--git-dir=$repo",'hash-object','-w','--stdin') -InputText "fixture-tracked`n"
$tree = Run-GitInput -Arguments @("--git-dir=$repo",'mktree') -InputText "100644 blob $blob`ttracked.txt`n"
$commit = Run-GitInput -Arguments @("--git-dir=$repo",'-c','user.name=cleanup-fixture','-c','user.email=cleanup-fixture@example.invalid','commit-tree',$tree) -InputText "junction boundary fixture`n"
Run-Git -Arguments @("--git-dir=$repo",'worktree','add','--detach',$wt,$commit) | Out-Null
$ignore = Join-Path $repo 'info\exclude'
Add-Content -LiteralPath $ignore -Value 'node_modules/'
$nm = Join-Path $wt 'node_modules'
New-Item -ItemType Directory -Path $nm | Out-Null
$junction = Join-Path $nm 'sentinel-junction'
New-Item -ItemType Junction -Path $junction -Target $store | Out-Null
$hardlink = Join-Path $nm 'sentinel-hardlink.bin'
New-Item -ItemType HardLink -Path $hardlink -Target $sentinel | Out-Null
$proof = [pscustomobject]@{ fixtureRoot = $fixtureRoot; version = (& git --version | Out-String).Trim(); powershell = $PSVersionTable.PSVersion.ToString(); gitExe = (Get-Command git).Source; gitExeSha256 = (Get-FileHash -LiteralPath (Get-Command git).Source -Algorithm SHA256).Hash; nativeGitSha256 = (Get-FileHash -LiteralPath 'C:\Program Files\Git\mingw64\bin\git.exe' -Algorithm SHA256).Hash; target = $wt; sentinel = $sentinel; sentinelSha256Before = $shaBefore; calls = $null; gitRemoveExit = $null; junctionRetainedByGit = $null; hardlinkRemovedByGit = $null; sentinelSha256AfterGit = $null; nativeLinkRemoval = $null; sentinelSha256AfterLinkRemoval = $null; fixtureWorktreeExistsAfter = $null }
Run-Git -Arguments @("--git-dir=$repo",'worktree','remove',$wt) | Out-Null
$proof.gitRemoveExit = 0
$proof.junctionRetainedByGit = Test-Path -LiteralPath $junction
$proof.hardlinkRemovedByGit = -not (Test-Path -LiteralPath $hardlink)
$proof.sentinelSha256AfterGit = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
if ($proof.sentinelSha256AfterGit -ne $shaBefore) { throw 'Git 改变了链接目标' }
if ($proof.junctionRetainedByGit) {
    $item = Get-Item -LiteralPath $junction -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $item.LinkType -ne 'Junction' -or $item.Target -ne $store) { throw '夹具链接本体不符合预期' }
    if ((Split-Path -Parent (Split-Path -Parent $junction)) -ne $wt -or -not $wt.StartsWith($workspace + '\')) { throw '夹具范围失败' }
    $start = [DateTime]::UtcNow.ToString('o')
    Remove-Item -LiteralPath $junction -ErrorAction Stop
    $proof.nativeLinkRemoval = [pscustomobject]@{ input = @('Remove-Item','-LiteralPath',$junction,'-ErrorAction','Stop'); start = $start; end = [DateTime]::UtcNow.ToString('o'); exit = 0; output = ''; recursive = $false; force = $false; linkExistsAfter = (Test-Path -LiteralPath $junction) }
    $proof.sentinelSha256AfterLinkRemoval = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
    if ($proof.sentinelSha256AfterLinkRemoval -ne $shaBefore) { throw '本机链接本体删除改变 sentinel' }
    Remove-Item -LiteralPath $nm -ErrorAction Stop
    Remove-Item -LiteralPath $wt -ErrorAction Stop
}
$proof.fixtureWorktreeExistsAfter = Test-Path -LiteralPath $wt
$proof.calls = $calls
$proof | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outDir 'link-proof.json') -Encoding utf8NoBOM
$proof | Select-Object version,powershell,gitRemoveExit,junctionRetainedByGit,hardlinkRemovedByGit,fixtureWorktreeExistsAfter | ConvertTo-Json
# 仅保留少量夹具仓库和 sentinel 作为可核证据；不扩清当前构建目录。
