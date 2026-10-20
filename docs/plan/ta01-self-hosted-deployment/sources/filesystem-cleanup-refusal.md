# 临时文件收尾策略拒绝

本轮仅一次派发以下文件收尾请求。工具在创建进程前拒绝，原因是 `blocked by policy`；不是操作系统删除失败。两个目标仍存在，没有执行下面的预检或删除，没有拆批、改属性、改 ACL、换工具或再次尝试删除。

目标为本任务新临时目录和本工作树安装的 YAML 依赖。旧 Node／pnpm 工具目录不在请求中。具体目标路径、参数和原工具返回如下，**禁止作为重试命令**。

## 原请求

```json
{
  "cmd": "$taskTempRoot='D:\\Cache\\TEMP\\workmesh-ta01-pui_xhb6'; $taskWorkspaceRoot=[IO.Path]::GetFullPath((Get-Location).Path); $taskYamlRoot=Join-Path $taskWorkspaceRoot 'scripts\\ci-bootstrap\\node_modules'; $taskTargets=@($taskTempRoot,$taskYamlRoot); $taskPreflight=@(); foreach ($taskTarget in $taskTargets) { $taskResolved=(Resolve-Path -LiteralPath $taskTarget -ErrorAction Stop).Path; if ([IO.Path]::GetFullPath($taskResolved) -ne [IO.Path]::GetFullPath($taskTarget)) { throw 'OWNER_PATH_MISMATCH' }; if ($taskTarget -eq $taskYamlRoot -and -not $taskResolved.StartsWith($taskWorkspaceRoot+'\\',[StringComparison]::OrdinalIgnoreCase)) { throw 'WORKSPACE_BOUNDARY' }; $taskEntries=@(Get-Item -LiteralPath $taskResolved -Force -ErrorAction Stop)+@(Get-ChildItem -LiteralPath $taskResolved -Recurse -Force -ErrorAction Stop); if (@($taskEntries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'REPARSE_REFUSED' }; $taskConsumers=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('python.exe','node.exe') -and $_.CommandLine -and $_.CommandLine.Replace('/','\\').Contains($taskResolved) }); if ($taskConsumers.Count) { throw 'ACTIVE_CONSUMER_REFUSED' }; $taskPreflight+=@{target=$taskResolved;entries=$taskEntries.Count;reparse=0;consumers=0} }; $taskPreflight | ConvertTo-Json -Compress; foreach ($taskTarget in $taskTargets) { try { Remove-Item -LiteralPath $taskTarget -Recurse -Force -ErrorAction Stop; [pscustomobject]@{target=$taskTarget;absent=(-not (Test-Path -LiteralPath $taskTarget))} | ConvertTo-Json -Compress } catch { [pscustomobject]@{target=$taskTarget;error=$_.Exception.Message;stopped=$true} | ConvertTo-Json -Compress; break } }",
  "login": false,
  "max_output_tokens": 750
}
```

## 实际可见返回抄录

来源为本卡对话的 `functions.exec` 拒绝块。下面仅抄录工具展示；不是未截断的底层结构化原件，没有重新调用被拒动作。

```text
exec_command failed: CreateProcess { message: "Rejected(\"`\\\"C:\\\\\\\\Program Files\\\\\\\\PowerShell\\\\\\\\7\\\\\\\\pwsh.exe\\\" -NoProfile -Command '$taskTempRoot='\\\"'D:\\\\\\\\Cache\\\\\\\\TEMP\\\\\\\\workmesh-ta01-pui_xhb6'; \\\"'$taskWorkspaceRoot=[IO.Path]::GetFullPath((Get-Location).Path); $taskYamlRoot=Join-Path $taskWorkspaceRoot '\\\"'scripts\\\\\\\\ci-bootstrap\\\\\\\\node_modules'; \\\"'$taskTargets=@($taskTempRoot,$taskYamlRoot…1112 chars truncated…mers=0} }; $taskPreflight | ConvertTo-Json -Compress; foreach ($taskTarget in $taskTargets) { try { Remove-Item -LiteralPath $taskTarget -Recurse -Force -ErrorAction Stop; [pscustomobject]@{target=$taskTarget;absent=(-not (Test-Path -LiteralPath $taskTarget))} | ConvertTo-Json -Compress } catch { [pscustomobject]@{target=$taskTarget;error=$_.Exception.Message;stopped=$true} | ConvertTo-Json -Compress; break } }'` rejected: blocked by policy\")" }
```

返回的命令展示自身含截断，缺失中段保持未知，不拿完整原请求补造其返回。可见理由只有 `blocked by policy`，不推断更细的拒绝原因。只读 `Test-Path` 确认临时目录与依赖目录均仍存在，不能报告任务资源已全部清空。
