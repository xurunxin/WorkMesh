$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Get-Location).Path)
$expectedRoot = 'C:\Users\xurx\.tds\workspaces\01a11a93-c093-7565-9084-724b6bedcade'
if ($taskRoot -ne $expectedRoot) { throw '工作树归属不匹配，拒绝清理' }
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$recordPath = Join-Path $taskRoot 'docs/reviews/d1b/board-resources.json'
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(3200, 3201, 57029) } | Select-Object LocalAddress, LocalPort, OwningProcess)
if ($listeners.Count -gt 0) { throw '本轮服务端口仍在监听，先核对归属及服务生命周期，拒绝清理缓存' }
$processes = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine })
$cleaned = @()
$paths = @()
$runRoot = Join-Path $taskRoot 'docs/reviews/d1b/evidence/board/runs'
foreach ($directory in Get-ChildItem -LiteralPath $runRoot -Directory) {
  if ($directory.Name -notmatch '^board-[a-z0-9-]+$') { throw '运行ID不合法' }
  $executionPath = Join-Path $directory.FullName 'execution.json'
  $run = Get-Content -LiteralPath $executionPath -Raw | ConvertFrom-Json
  if ($run.id -ne $directory.Name -or -not $run.finishedAt) { throw '运行尚未闭合' }
  foreach ($required in @('source-inputs-index.json', 'source-inputs.zip')) {
    if (-not (Test-Path -LiteralPath (Join-Path $directory.FullName $required))) { throw '必要源码归档缺失' }
  }
  $path = [IO.Path]::GetFullPath($run.environment.WORKMESH_PLAYWRIGHT_RUN_DIR)
  $expected = [IO.Path]::GetFullPath((Join-Path $temporaryRoot ('workmesh-d1b-' + $run.id)))
  if ($path -ne $expected -or -not $path.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase)) { throw '临时目标超出本轮指定目录' }
  if (@($processes | Where-Object { $_.CommandLine.Contains($path) }).Count -gt 0) { throw '临时目录仍被活动进程引用' }
  $existed = Test-Path -LiteralPath $path
  if ($existed) {
    $item = Get-Item -LiteralPath $path
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '不删除链接或未知挂载' }
    $output = Join-Path $path 'mocked-dev/output'
    if ((Test-Path -LiteralPath $output) -and -not (Test-Path -LiteralPath (Join-Path $directory.FullName 'playwright'))) { throw '测试输出尚未保全' }
    Remove-Item -LiteralPath $path -Recurse
  }
  $absent = -not (Test-Path -LiteralPath $path)
  if (-not $absent) { throw '临时路径未成功移除' }
  $result = [ordered]@{ id = $run.id; path = $path; existedBefore = $existed; action = $(if ($existed) { 'Remove-Item -LiteralPath -Recurse；无Force' } else { '未创建／已不存在，不删除' }); absentAfter = $absent; evidence = $directory.FullName }
  $paths += $result
  if ($existed) { $cleaned += $result }
}
# 当前构建保留；仅移除本轮闲置Next派生缓存，不删除源码、依赖或证据。
$nextPath = [IO.Path]::GetFullPath((Join-Path $taskRoot 'apps/web/.next'))
$nextExpected = $taskRoot.TrimEnd('\') + '\apps\web\.next'
if ($nextPath -ne $nextExpected) { throw 'Next缓存目标不匹配' }
if (Test-Path -LiteralPath $nextPath) {
  if ((Get-Item -LiteralPath $nextPath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '不删除Next缓存链接' }
  if (@($processes | Where-Object { $_.CommandLine.Contains($nextPath) }).Count -gt 0) { throw 'Next缓存仍被活动进程引用' }
  Remove-Item -LiteralPath $nextPath -Recurse
  $cleaned += [ordered]@{ path = $nextPath; action = 'Remove-Item -LiteralPath -Recurse；无Force'; absentAfter = (-not (Test-Path -LiteralPath $nextPath)); reason = '本轮独有服务已结束；失败及成功运行输出先保全，闲置派生缓存' }
}
$record | Add-Member -NotePropertyName temporaryPaths -NotePropertyValue $paths -Force
$record | Add-Member -NotePropertyName cleaned -NotePropertyValue $cleaned -Force
$record | Add-Member -NotePropertyName cleanedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
$record | Add-Member -NotePropertyName serviceListenerCheck -NotePropertyValue @{ ports = @(3200, 3201, 57029); listeners = $listeners; result = '均无监听；未终止不明进程' } -Force
$record | Add-Member -NotePropertyName retained -NotePropertyValue @(
  @{ path = $taskRoot; reason = '当前构建，保留供平台提交和人工评审' },
  @{ path = 'C:\Users\xurx\.tds\workspaces\01a1195f-55ab-7ee9-8baf-c115978d3aec'; reason = '旧工作树尚未actual main合入及确认无人使用，不移除、不Force抹dirty' },
  @{ path = (Join-Path $taskRoot 'node_modules'); reason = '当前审查需要的依赖；共享基础包不删除' },
  @{ path = (Join-Path $taskRoot 'packages'); reason = '本轮单测所需dist派生依赖保留；不删除源码包或共享依赖' },
  @{ path = (Join-Path $taskRoot 'docs/reviews/d1b/evidence'); reason = '必要脱敏证据已归档，不作为垃圾清理' }
) -Force
[IO.File]::WriteAllText($recordPath, ($record | ConvertTo-Json -Depth 30) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output ('已清理本轮路径数：' + $cleaned.Count + '；登记运行路径数：' + $paths.Count + '；当前及旧工作树保留')
