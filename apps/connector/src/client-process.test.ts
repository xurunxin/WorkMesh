import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { redactChildOutput } from './client-process.js'

it('安全提示立即输出，每个秘密切分位置均脱敏', () => {
  for (const prefix of ['wmi_', 'wmp_']) {
    const token = prefix + 'q'.repeat(43)
    for (let split = 1; split < token.length; split++) {
      let output = ''; const sink = redactChildOutput(text => { output += text })
      sink.push('Confirm? [y/N] '); expect(output).toBe('Confirm? [y/N] ')
      sink.push(token.slice(0, split)); expect(output).toBe('Confirm? [y/N] ')
      sink.push(token.slice(split) + ' done'); expect(output).toBe('Confirm? [y/N] [已隐藏] done')
      sink.finish()
    }
  }
})

it('管道子进程看到提示后才发送输入并正常退出', async () => {
  const program = "process.stdout.write('Confirm? [y/N] ');process.stdin.once('data',()=>{process.stdout.write(process.env.WORKMESH_INSTALLATION_TOKEN);process.exitCode=0;process.stdin.pause()})"
  const child = spawn(process.execPath, ['--import', 'tsx', 'test-support/client-worker.ts', program], { stdio: 'pipe', windowsHide: true })
  console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'created' }))
  let output = ''; let replied = false
  child.stdout.on('data', bytes => {
    output += bytes.toString()
    if (!replied && output.includes('Confirm? [y/N] ')) { replied = true; child.stdin.end('y\n') }
  })
  const timeout = setTimeout(() => child.kill(), 10_000)
  try {
    const [code] = await once(child, 'close')
    expect(replied).toBe(true); expect(code).toBe(0)
    expect(output).toContain('[已隐藏]'); expect(output.includes('wmi_' + 'z'.repeat(43))).toBe(false)
  } finally { clearTimeout(timeout); child.kill(); console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'closed' })) }
}, 15_000)

it('真实嵌套终端保留 TTY、交互、尺寸变化及 Ctrl-C，输出仍脱敏', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'test-support/terminal-driver.ts'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'created' }))
  let output = ''
  child.stdout.on('data', bytes => { output += bytes.toString(); console.log(bytes.toString().trim()) })
  child.stderr.on('data', bytes => { output += bytes.toString() })
  const timeout = setTimeout(() => child.kill(), 18_000)
  try {
    const [code] = await once(child, 'close')
    expect(code, output).toBe(0)
    expect(output).toContain('"tty":true'); expect(output).toContain('"resized":true'); expect(output).toContain('"interrupted":true')
  } finally {
    clearTimeout(timeout); child.kill()
    console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'closed' }))
  }
}, 25_000)
