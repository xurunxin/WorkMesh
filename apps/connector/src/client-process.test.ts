import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { stripVTControlCharacters } from 'node:util'
import { expect, it } from 'vitest'
import { redactChildOutput } from './client-process.js'
import { rawOutputCases } from '../test-support/raw-output-cases.js'

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

it('ANSI 不打断凭据：每个插入位置、每个 chunk 边界、C1 与控制载荷均脱敏', () => {
  for (const prefix of ['wmi_', 'wmp_']) {
    const token = prefix + 'q'.repeat(43)
    for (const ansi of ['\x1b[31m', '\x9b31m', '\x1b]0;safe title\x07', '\x1bPpayload\x1b\\', '\x1b\\', '\x9c', '\x07']) {
      for (let at = 0; at <= token.length; at++) {
        const decorated = token.slice(0, at) + ansi + token.slice(at)
        for (let split = 1; split < decorated.length; split++) {
          let output = ''; const sink = redactChildOutput(text => { output += text })
          sink.push('\x1b[32mConfirm? [y/N] '); expect(output).toBe('\x1b[32mConfirm? [y/N] ')
          sink.push(decorated.slice(0, split)); sink.push(decorated.slice(split)); sink.push(' done\x1b[0m'); sink.finish()
          expect(output).toContain(ansi)
          expect(stripVTControlCharacters(output.replaceAll(ansi, ''))).toBe('Confirm? [y/N] [已隐藏] done')
          expect(output.includes(token)).toBe(false)
        }
      }
    }
    let output = ''; const sink = redactChildOutput(text => { output += text })
    sink.push('\x1b]0;' + token.slice(0, 20) + '\x1b[31m' + token.slice(20) + '\x07'); sink.finish()
    expect(output.includes(token)).toBe(false); expect(output).toContain('[已隐藏]')
  }
})

it('管道子进程看到提示后才发送输入并正常退出', async () => {
  const program = rawOutputCases('stdout') + "process.stdout.write('Confirm? [y/N] ');process.stdin.once('data',()=>{const t=process.env.WORKMESH_INSTALLATION_TOKEN;process.stdout.write(t.slice(0,20)+'\\x1b[');setTimeout(()=>{process.stdout.write('31m'+t.slice(20)+'\\x1b[0m');process.stderr.write(t.slice(0,12)+'\\x1b[32m'+t.slice(12)+'\\x1b[0m');emitRawCases(()=>{process.exitCode=0;process.stdin.pause()})},10)})"
  const child = spawn(process.execPath, ['--import', 'tsx', 'test-support/client-worker.ts', program], { stdio: 'pipe', windowsHide: true })
  console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'created' }))
  let output = '', errors = ''; let replied = false
  child.stderr.on('data', bytes => { errors += bytes.toString() })
  child.stdout.on('data', bytes => {
    output += bytes.toString()
    if (!replied && output.includes('Confirm? [y/N] ')) { replied = true; child.stdin.end('y\n') }
  })
  const timeout = setTimeout(() => child.kill(), 10_000)
  try {
    const [code] = await once(child, 'close')
    expect(replied).toBe(true); expect(code).toBe(0)
    expect(stripVTControlCharacters(output)).toContain('[已隐藏]'); expect(stripVTControlCharacters(errors)).toBe('[已隐藏]')
    expect((stripVTControlCharacters(output + errors)).includes('wmi_' + 'z'.repeat(43))).toBe(false)
    expect(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/.test(output + errors)).toBe(false)
    expect(output).toContain('RAW_END')
  } finally { clearTimeout(timeout); child.kill(); console.log(JSON.stringify({ resource: 'testProcess', pid: child.pid, state: 'closed' })) }
}, 15_000)

it('ANSI 结束字节不能吞掉凭据前缀：原字节与可见路径、全部 chunk 边界及 OSC 载荷', () => {
  for (const kind of ['wmi_', 'wmp_']) {
    const token = kind + 'q'.repeat(43)
    for (const prelude of ['\x1b', '\x1b[', '\x9b', '\x1b]0;\x1b', '\x1b]0;\x1b[', '\x1b]0;\x9b']) {
      for (const credential of [token, token.slice(0, 20) + '\x1b[31m' + token.slice(20)]) {
      const wire = prelude + credential + '\x07\x1b[0m SAFE_END'
      for (let split = 0; split <= wire.length; split++) {
        let output = ''; const sink = redactChildOutput(text => { output += text })
        sink.push('SAFE_BEGIN Confirm? [y/N] '); expect(output).toBe('SAFE_BEGIN Confirm? [y/N] ')
        sink.push(wire.slice(0, split)); sink.push(wire.slice(split)); sink.finish()
        expect(output.includes(token)).toBe(false)
        expect(stripVTControlCharacters(output).includes(token)).toBe(false)
        expect(output).toContain('[已隐藏]')
        expect(output).toContain('SAFE_END')
      }
      let output = ''; const sink = redactChildOutput(text => { output += text })
      for (const byte of wire) sink.push(byte)
      sink.finish(); expect(output.includes(token)).toBe(false)
      }
    }
  }
})

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
