import assert from 'node:assert/strict'
import { open, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import * as pty from 'node-pty'
import { temporaryDirectory, cleanupDirectory } from './resources.js'
import { finishClientProcess } from '../src/cli.js'

// 外层真实 TTY 中仅将实际 CLI 的 stderr 重定向到文件，与 shell 2>errors.log 等价。
const parent = await temporaryDirectory('stderr'), log = join(parent, 'errors.log')
const descriptor = await open(log, 'wx', 0o600)
const program = `const t=process.env.WORKMESH_INSTALLATION_TOKEN;
if(!process.stdin.isTTY||process.stdout.isTTY||process.stderr.isTTY)process.exit(12);
process.stdout.write('STDOUT_ONLY\\n');process.stderr.write('ERROR_ONLY:'+t.slice(0,20)+'\\x1b[');
setTimeout(()=>{process.stderr.write('31m'+t.slice(20)+'\\x1b[0m\\n');process.exit(7)},10);`
const wrapper = `const fs=require('node:fs');const {spawn}=require('node:child_process');
const fd=fs.openSync(process.env.WM_TEST_ERROR_LOG,'a');
const child=spawn(process.execPath,['--import','tsx','src/cli.ts','run','--',process.execPath,'-e',${JSON.stringify(program)}],{stdio:['inherit','inherit',fd],env:process.env});
child.on('error',()=>process.exit(13));child.on('close',code=>{fs.closeSync(fd);process.exit(code??14)});`
let child: pty.IPty | undefined, alive = false, output = '', exitCode = 0
let timer: ReturnType<typeof setTimeout> | undefined
try {
  child = pty.spawn(process.execPath, ['-e', wrapper], { cwd: process.cwd(),
    env: { ...process.env, WM_TEST_ERROR_LOG: log }, cols: 91, rows: 31, name: 'xterm-256color', useConptyDll: process.platform === 'win32' })
  alive = true
  console.log(JSON.stringify({ resource: 'testPtyProcess', pid: child.pid, state: 'created' }))
  child.onData(text => { output += text; if (text.includes('\x1b[6n')) child!.write('\x1b[1;1R'); if (text.includes('\x1b[c')) child!.write('\x1b[?1;2c') })
  timer = setTimeout(() => { if (alive) child!.kill() }, 12_000)
  const result = await new Promise<{ exitCode: number }>(resolve => child!.onExit(result => { alive = false; resolve(result) }))
  assert.equal(result.exitCode, 7)
  assert.ok(output.includes('STDOUT_ONLY')); assert.equal(output.includes('ERROR_ONLY'), false)
  const errors = await readFile(log, 'utf8')
  assert.equal(stripVTControlCharacters(errors), 'ERROR_ONLY:[已隐藏]\n')
  assert.equal(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/.test(stripVTControlCharacters(output + errors)), false)
  console.log(JSON.stringify({ stderrRedirected: true, ownership: true, redacted: true, exitCode: result.exitCode }))
} catch {
  exitCode = 1; console.error('stderr 重定向验证失败；未归档原客户端输出')
} finally {
  if (timer) clearTimeout(timer)
  if (alive) child!.kill()
  if (child) console.log(JSON.stringify({ resource: 'testPtyProcess', pid: child.pid, state: 'closed' }))
  await descriptor.close(); await cleanupDirectory(parent)
}
await finishClientProcess(exitCode)
