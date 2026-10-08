import assert from 'node:assert/strict'
import * as pty from 'node-pty'
import { finishClientProcess } from '../src/cli.js'

// 原生终端在独立进程中测试，避免测试 runner 的 worker 与原生句柄生命周期互相干扰。
const program = `
if(!process.stdin.isTTY||!process.stdout.isTTY||!process.stderr.isTTY)process.exit(10);
if(process.env.WM_TEST_DIGEST&&require('node:crypto').createHash('sha256').update(process.env.WORKMESH_INSTALLATION_TOKEN).digest('hex')!==process.env.WM_TEST_DIGEST)process.exit(11);
process.stdout.write('SIZE:'+process.stdout.columns+':'+process.stdout.rows+'\\nConfirm? [y/N] ');
process.stdin.once('data',()=>{process.stdout.write('ANSWERED\\n');process.stdout.write(process.env.WORKMESH_INSTALLATION_TOKEN.slice(0,20));setTimeout(()=>process.stdout.write(process.env.WORKMESH_INSTALLATION_TOKEN.slice(20)+'\\n'),10)});
process.stdout.on('resize',()=>process.stdout.write('RESIZED:'+process.stdout.columns+':'+process.stdout.rows+'\\n'));
process.on('SIGINT',()=>{process.stdout.write('INTERRUPTED\\n');process.exit(0)});
process.stdin.setRawMode(true);
process.stdin.on('data',bytes=>{if(bytes.includes(3)){process.stdout.write('INTERRUPTED\\n');process.exit(0)}});
`
const args = process.env.WM_TEST_CONFIGURED_DIRECTORY
  ? ['--import', 'tsx', 'src/cli.ts', 'run', '--', process.execPath, '-e', program]
  : ['--import', 'tsx', 'test-support/client-worker.ts', program]
const child = pty.spawn(process.execPath, args, {
  cwd: process.cwd(), env: process.env, cols: 91, rows: 31, name: 'xterm-256color', useConptyDll: process.platform === 'win32',
})
console.log(JSON.stringify({ resource: 'testPtyProcess', pid: child.pid, state: 'created' }))
let output = '', replied = false, resized = false, interrupted = false, alive = true
const stream = child.onData(text => {
  output += text
  if (text.includes('\u001b[6n')) child.write('\u001b[1;1R')
  if (text.includes('\u001b[c')) child.write('\u001b[?1;2c')
  // ConPTY 将行尾空格表示为光标位置；检测可见提示后输入，不等待退出刷新。
  if (!replied && output.includes('Confirm? [y/N]')) { replied = true; child.write('y\r') }
  if (!resized && output.includes('[已隐藏]')) { resized = true; child.resize(103, 37) }
  if (!interrupted && output.includes('RESIZED:103:37')) { interrupted = true; child.write('\u0003') }
})
const timeout = setTimeout(() => child.kill(), 12_000)
let exitCode = 0
try {
  const result = await new Promise<{ exitCode: number }>(resolve => child.onExit(result => { alive = false; resolve(result) }))
  assert.equal(result.exitCode, 0)
  for (const text of ['SIZE:91:31', 'ANSWERED', 'RESIZED:103:37', 'INTERRUPTED']) assert.ok(output.includes(text), text)
  assert.equal(output.includes('wmi_' + 'z'.repeat(43)), false)
  assert.equal(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/.test(output), false)
  console.log(JSON.stringify({ tty: true, promptBeforeInput: replied, resized, interrupted, redacted: true, exitCode: result.exitCode }))
} catch {
  exitCode = 1
  console.error('终端验证失败：' + output.replace(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/g, '[已隐藏]'))
} finally {
  clearTimeout(timeout); stream.dispose(); if (alive) child.kill()
  console.log(JSON.stringify({ resource: 'testPtyProcess', pid: child.pid, state: 'closed' }))
}
await finishClientProcess(exitCode)
