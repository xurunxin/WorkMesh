$ErrorActionPreference = 'Stop'
$name = 'wmct' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$password = [Guid]::NewGuid().ToString('N') + '!aA9'
$parent = Join-Path $env:PUBLIC ('workmesh-connector-' + [Guid]::NewGuid().ToString('N'))
$priorTemp = $env:TEMP
$priorTmp = $env:TMP
$priorOtherUser = $env:WM_CONNECTOR_OTHER_USER
$priorOtherPassword = $env:WM_CONNECTOR_OTHER_PASSWORD
$createdUser = $null
$directoryCreated = $false
try {
  $createdUser = New-LocalUser -Name $name -Password (ConvertTo-SecureString $password -AsPlainText -Force)
  New-Item -ItemType Directory -Path $parent | Out-Null
  $directoryCreated = $true
  $env:WM_CONNECTOR_OTHER_USER = $env:COMPUTERNAME + '\' + $name
  $env:WM_CONNECTOR_OTHER_PASSWORD = $password
  $env:TEMP = $parent
  $env:TMP = $parent
  & pnpm.cmd --filter @workmesh/connector test:platform 2>&1 | Tee-Object ci-logs/connector-platform.log
  if ($LASTEXITCODE -ne 0) { throw 'connector platform failed' }
  & pnpm.cmd --filter @workmesh/connector test 2>&1 | Tee-Object ci-logs/connector-unit.log
  if ($LASTEXITCODE -ne 0) { throw 'connector unit failed' }
} finally {
  $env:TEMP = $priorTemp
  $env:TMP = $priorTmp
  if ($null -eq $priorOtherUser) { Remove-Item Env:WM_CONNECTOR_OTHER_USER -ErrorAction SilentlyContinue } else { $env:WM_CONNECTOR_OTHER_USER = $priorOtherUser }
  if ($null -eq $priorOtherPassword) { Remove-Item Env:WM_CONNECTOR_OTHER_PASSWORD -ErrorAction SilentlyContinue } else { $env:WM_CONNECTOR_OTHER_PASSWORD = $priorOtherPassword }
  $cleanupErrors = @()
  $userRemoved = $null -eq $createdUser
  try {
    if ($null -ne $createdUser) {
      $remaining = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
      if ($remaining -and $remaining.SID.Value -ne $createdUser.SID.Value) { throw 'user identity changed' }
      if ($remaining) { Remove-LocalUser -Name $name }
      $userRemoved = $true
    }
  } catch { $cleanupErrors += 'temporary user cleanup failed' }
  $resolved = [IO.Path]::GetFullPath($parent)
  $publicRoot = [IO.Path]::GetFullPath($env:PUBLIC).TrimEnd('\') + '\'
  $directoryRemoved = !$directoryCreated
  try {
    if (!$resolved.StartsWith($publicRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid cleanup boundary' }
    if ($directoryCreated -and (Test-Path -LiteralPath $resolved)) { Remove-Item -LiteralPath $resolved -Recurse }
    $directoryRemoved = $true
  } catch { $cleanupErrors += 'temporary directory cleanup failed' }
  @{ user = $name; sid = $(if ($createdUser) { $createdUser.SID.Value } else { $null }); temporaryPath = $resolved; userRemoved = $userRemoved; directoryRemoved = $directoryRemoved; errors = $cleanupErrors } | ConvertTo-Json | Set-Content ci-logs/connector-cleanup.json
  if ($cleanupErrors.Count -gt 0) { throw 'connector cleanup failed; see connector-cleanup.json' }
}
