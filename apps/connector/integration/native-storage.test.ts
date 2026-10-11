import { randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SystemSecretStore } from '../src/secret-store.js'
import { withDirectoryLock, atomicWrite, verifyPrivate, prepareDirectory } from '../src/platform-security.js'
import { sha256 } from '../src/config.js'
import { temporaryDirectory, cleanupDirectory } from '../test-support/resources.js'

const execute = promisify(execFile)
// CI 从 PowerShell 7 经 Node 启动 5.1；只让探针解析该 5.1 安装自身的内置模块。
const windowsProbePrelude = `
$ErrorActionPreference='Stop'
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Security','Microsoft.PowerShell.Security.psd1'))
Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Management','Microsoft.PowerShell.Management.psd1'))
`
async function runWindowsProbe(parent: string, filename: string, source: string, expectedExitCode: number): Promise<void> {
  const path = join(parent, filename)
  // 文件仅含非秘密探针和路径；凭据只留父进程环境，不写入脚本/命令行。
  await writeFile(path, source)
  const script = `${windowsProbePrelude}
$cred=New-Object Management.Automation.PSCredential($env:WM_CONNECTOR_OTHER_USER,(ConvertTo-SecureString $env:WM_CONNECTOR_OTHER_PASSWORD -AsPlainText -Force))
$exe=[IO.Path]::Combine($PSHOME,'powershell.exe')
$probeArguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$env:WM_TEST_PROBE_PATH+'"'))
if (('"'+$exe+'" '+($probeArguments -join ' ')).Length -ge 1024) {throw 'probe command exceeds native logon limit'}
$probe=Start-Process $exe -Credential $cred -WorkingDirectory $env:PUBLIC -ArgumentList $probeArguments -WindowStyle Hidden -Wait -PassThru
if ($probe.ExitCode -ne ${expectedExitCode}) {throw ('unexpected probe exit: '+$probe.ExitCode)}
`
  const env: NodeJS.ProcessEnv = { ...process.env, WM_TEST_PROBE_PATH: path }
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key]
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true })
}
describe('实际系统后端与权限（不可跳过）', () => {
  it('系统秘密存储写入、跨进程读回和删除', async () => {
    const store = new SystemSecretStore(); const ref = randomUUID()
    console.log(JSON.stringify({ resource: 'systemSecret', reference: ref, state: 'reserved' }))
    const token = 'wmi_' + randomBytes(32).toString('base64url')
    try {
      await store.put(ref, token)
      expect(await store.get(ref) === token).toBe(true)
      const source = "import {SystemSecretStore} from './src/secret-store.ts'; import {sha256} from './src/config.ts'; const token=await new SystemSecretStore().get(process.env.WM_TEST_REF); if (!token || sha256(token)!==process.env.WM_TEST_DIGEST) process.exit(1);"
      // 模块模式入口使用动态 import，秘密不经过 stdout/stderr/文件。
      await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: { ...process.env, WM_TEST_REF: ref, WM_TEST_DIGEST: sha256(token) }, windowsHide: true })
    } finally { await store.delete(ref); console.log(JSON.stringify({ resource: 'systemSecret', reference: ref, state: 'removed' })) }
    expect(await store.get(ref)).toBeNull()
  })
  it('实际 ACL 或 0700/0600、原子替换、拒绝不安全路径', async () => {
    const parent = await temporaryDirectory('platform'); const dir = join(parent, 'connector')
    try {
      await withDirectoryLock(dir, async () => {
        const path = join(dir, 'pending.json')
        await atomicWrite(path, '非秘密探针')
        await verifyPrivate(dir, true); await verifyPrivate(path)
        await atomicWrite(path, '已替换')
        if (process.platform !== 'win32') {
          expect((await stat(dir)).mode & 0o777).toBe(0o700)
          expect((await stat(path)).mode & 0o777).toBe(0o600)
          await execute('chmod', ['0644', path])
        } else {
          await execute('icacls.exe', [path, '/grant', '*S-1-1-0:R'], { windowsHide: true })
        }
        await expect(verifyPrivate(path)).rejects.toThrow()
      })
    } finally { await cleanupDirectory(parent) }
  })
  it('不同用户实际读取被拒绝', async () => {
    // macOS 用户 TMPDIR 的祖先可能是 0700，不能把祖先拒绝冒作连接器权限证明。
    const parent = await temporaryDirectory('other-user', process.platform === 'win32' ? process.env.WM_CONNECTOR_PUBLIC_ROOT : '/tmp'); const dir = join(parent, 'connector')
    try {
      await withDirectoryLock(dir, async () => { await atomicWrite(join(dir, 'pending.json'), '非秘密探针') })
      if (process.platform === 'win32') {
        const control = join(parent, 'public-probe.txt'); await writeFile(control, '非秘密对照探针')
        // CI 提供一次性第二用户；本机未提供则失败并明确留验收缺口。
        expect(Boolean(process.env.WM_CONNECTOR_OTHER_USER && process.env.WM_CONNECTOR_OTHER_PASSWORD)).toBe(true)
        const script = `
try { [IO.File]::ReadAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(control, 'utf8').toString('base64')}'))) | Out-Null } catch { exit 24 }
try { [IO.File]::ReadAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(join(dir, 'pending.json'), 'utf8').toString('base64')}'))) | Out-Null; exit 0 } catch { exit 23 }
`
        await runWindowsProbe(parent, 'read-probe.ps1', script, 23)
      } else {
        // 仅临时改变父目录遍历权限，以使拒绝来自连接器的目录/文件权限。
        await execute('chmod', ['0755', parent])
        const probe = await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c', 'if cat "$1" >/dev/null 2>&1; then exit 1; fi', 'probe', join(dir, 'pending.json')])
        expect(probe.stdout).toBe('')
        await execute('chmod', ['0755', dir])
        await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c', 'if cat "$1" >/dev/null 2>&1; then exit 1; fi', 'probe', join(dir, 'pending.json')])
        await execute('chmod', ['0644', join(dir, 'pending.json')])
        // 放开权限后的正对照必须可读，排除账户/父路径/探针自身故障造成的假拒绝。
        await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c', 'cat "$1" >/dev/null', 'probe', join(dir, 'pending.json')])
      }
    } finally { await cleanupDirectory(parent) }
  })
  it('不同用户不能重命名或替换安全祖先/连接器；不安全祖先拒绝且攻击正对照成功', async () => {
    const parent = await temporaryDirectory('rename', process.platform === 'win32' ? process.env.WM_CONNECTOR_PUBLIC_ROOT : '/tmp')
    const dir = join(parent, 'connector'), unsafe = join(parent, 'unsafe'), victim = join(unsafe, 'connector')
    try {
      await withDirectoryLock(dir, () => atomicWrite(join(dir, 'pending.json'), '稳定身份非秘密探针'))
      await prepareDirectory(victim)
      if (process.platform === 'win32') {
        expect(Boolean(process.env.WM_CONNECTOR_OTHER_USER && process.env.WM_CONNECTOR_OTHER_PASSWORD && process.env.WM_CONNECTOR_PUBLIC_ROOT)).toBe(true)
        // DC 授删除子项，WD 授 rename 的目标条目，AD 授同名替换目录创建。
        // 均仅用于一次性不安全父夹具；受保护子项没有授该用户 DELETE。
        await execute('icacls.exe', [unsafe, '/grant', '*S-1-1-0:(RX,DC,AD,WD)'], { windowsHide: true })
        const fixtureAcl = await execute('icacls.exe', [unsafe], { windowsHide: true })
        console.log(JSON.stringify({ resource: 'aclFixture', path: unsafe, acl: fixtureAcl.stdout }))
        await expect(withDirectoryLock(victim, async () => { throw new Error('must not acquire lock') })).rejects.toThrow('CONNECTOR_UNSAFE_ANCESTOR')
        const script = `
$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(parent, 'utf8').toString('base64')}'))
try { [IO.File]::ReadAllText([IO.Path]::Combine($p,'control.txt'))|Out-Null } catch {exit 24}
foreach($target in @($p,[IO.Path]::Combine($p,'connector'))) { try { [IO.Directory]::Move($target,$target+'-moved'); exit 25 } catch {} }
$v=[IO.Path]::Combine($p,'unsafe','connector')
try { [IO.Directory]::Move($v,$v+'-moved') } catch {exit (1000+($_.Exception.GetBaseException().HResult -band 65535))}
try { [IO.Directory]::CreateDirectory($v)|Out-Null } catch {exit (2000+($_.Exception.GetBaseException().HResult -band 65535))}
# 必需攻击已完成；其他用户不需要拥有新目录的删除权限，由夹具 owner 收尾。
exit 0
`
        await writeFile(join(parent, 'control.txt'), '非秘密可读对照')
        await runWindowsProbe(parent, 'rename-probe.ps1', script, 0)
      } else {
        await execute('chmod', ['0755', parent]); await execute('chmod', ['0777', unsafe])
        await expect(withDirectoryLock(victim, async () => { throw new Error('must not acquire lock') })).rejects.toThrow('CONNECTOR_UNSAFE_ANCESTOR')
        await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c',
          'set -eu; test -d "$1"; if mv "$1/connector" "$1/connector-moved" 2>/dev/null; then exit 25; fi; if mv "$1" "$1-moved" 2>/dev/null; then exit 26; fi; v="$1/unsafe/connector"; mv "$v" "$v-moved"; mkdir "$v"; rmdir "$v"; mv "$v-moved" "$v"', 'probe', parent])
        // sticky 公共祖先通过且确实阻止同一攻击者替换可信 owner 的子项。
        await execute('chmod', ['1777', unsafe]); await prepareDirectory(victim)
        await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c', 'if mv "$1" "$1-moved" 2>/dev/null; then exit 1; fi', 'probe', victim])
      }
      await prepareDirectory(dir)
    } finally { await cleanupDirectory(parent) }
  })
  if (process.platform === 'linux') it('Secret Service 不可用必须失败，不退回 keyutils', async () => {
    const source = "import {SystemSecretStore} from './src/secret-store.ts'; try { await new SystemSecretStore().put(process.env.WM_TEST_REF,'wmi_'+'x'.repeat(43)); process.exit(1); } catch { process.exit(0); }"
    await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: { ...process.env, WM_TEST_REF: randomUUID(), DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/workmesh-connector-test' } })
  })
  if (process.platform === 'darwin') it('继承读取 ACL 可越过 BSD mode，私有对象必须拒绝', async () => {
    const parent = await temporaryDirectory('mac-read-acl', '/tmp'), dir = join(parent, 'connector'), path = join(dir, 'probe.txt')
    try {
      await execute('chmod', ['0755', parent])
      await execute('chmod', ['+a', 'user:nobody allow read,execute,file_inherit,directory_inherit', parent])
      await mkdir(dir, { mode: 0o700 }); await writeFile(path, '非秘密 ACL 正对照', { mode: 0o600 })
      expect((await stat(dir)).mode & 0o777).toBe(0o700); expect((await stat(path)).mode & 0o777).toBe(0o600)
      await execute('sudo', ['-n', '-u', 'nobody', 'sh', '-c', 'cat "$1" >/dev/null', 'probe', path])
      await expect(prepareDirectory(dir)).rejects.toThrow('CONNECTOR_UNSAFE_ACL')
      await expect(verifyPrivate(path)).rejects.toThrow('CONNECTOR_UNSAFE_ACL')
      for (const ownedPath of [parent, dir, path]) await execute('chmod', ['-N', ownedPath])
      await prepareDirectory(dir); await verifyPrivate(path)
    } finally { await cleanupDirectory(parent) }
  })
  if (process.platform === 'darwin') it('同用户并发准备目录时仍完整核验无扩展 ACL', async () => {
    const parent = await temporaryDirectory('mac-concurrent-acl', '/tmp')
    try {
      await execute('chmod', ['-N', parent])
      const results = await Promise.allSettled(Array.from({ length: 32 }, (_, i) => prepareDirectory(join(parent, `connector-${i}`))))
      expect(results.filter(result => result.status === 'rejected').map(result => String(result.reason))).toEqual([])
    } finally { await cleanupDirectory(parent) }
  })
  if (process.platform === 'darwin') it('没有扩展 ACL 的目录可用，修改型 allow ACL 仍拒绝', async () => {
    const parent = await temporaryDirectory('mac-acl', '/tmp'); const dir = join(parent, 'connector')
    try {
      await execute('chmod', ['-N', parent])
      await prepareDirectory(dir)
      await execute('chmod', ['+a', 'user:nobody allow delete_child', parent])
      await expect(prepareDirectory(dir)).rejects.toThrow('CONNECTOR_UNSAFE_ANCESTOR')
      await execute('chmod', ['-N', parent])
      await prepareDirectory(dir)
    } finally { await cleanupDirectory(parent) }
  })
})
