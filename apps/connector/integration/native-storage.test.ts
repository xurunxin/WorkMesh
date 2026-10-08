import { randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SystemSecretStore } from '../src/secret-store.js'
import { withDirectoryLock, atomicWrite, verifyPrivate } from '../src/platform-security.js'
import { sha256 } from '../src/config.js'
import { temporaryDirectory, cleanupDirectory } from '../test-support/resources.js'

const execute = promisify(execFile)
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
    const parent = await temporaryDirectory('other-user', process.platform === 'win32' ? undefined : '/tmp'); const dir = join(parent, 'connector')
    try {
      await withDirectoryLock(dir, async () => { await atomicWrite(join(dir, 'pending.json'), '非秘密探针') })
      if (process.platform === 'win32') {
        const control = join(parent, 'public-probe.txt'); await writeFile(control, '非秘密对照探针')
        // CI 提供一次性第二用户；本机未提供则失败并明确留验收缺口。
        expect(Boolean(process.env.WM_CONNECTOR_OTHER_USER && process.env.WM_CONNECTOR_OTHER_PASSWORD)).toBe(true)
        const script = `
$ErrorActionPreference='Stop'
$secure=ConvertTo-SecureString $env:WM_CONNECTOR_OTHER_PASSWORD -AsPlainText -Force
$cred=New-Object Management.Automation.PSCredential($env:WM_CONNECTOR_OTHER_USER,$secure)
$p=$env:WM_TEST_PATH
$path64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p))
$control64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:WM_TEST_CONTROL))
$cmd="try { [IO.File]::ReadAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$control64'))) | Out-Null } catch { exit 24 }; try { [IO.File]::ReadAllText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$path64'))) | Out-Null; exit 0 } catch { exit 23 }"
$args=@('-NoProfile','-NonInteractive','-EncodedCommand',[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd)))
$process=Start-Process powershell.exe -Credential $cred -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 23) { exit 1 }
`
        const env: NodeJS.ProcessEnv = { ...process.env, WM_TEST_PATH: join(dir, 'pending.json'), WM_TEST_CONTROL: control }; delete env.PSModulePath
        await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { env, windowsHide: true })
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
  if (process.platform === 'linux') it('Secret Service 不可用必须失败，不退回 keyutils', async () => {
    const source = "import {SystemSecretStore} from './src/secret-store.ts'; try { await new SystemSecretStore().put(process.env.WM_TEST_REF,'wmi_'+'x'.repeat(43)); process.exit(1); } catch { process.exit(0); }"
    await execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], { env: { ...process.env, WM_TEST_REF: randomUUID(), DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/workmesh-connector-test' } })
  })
})
