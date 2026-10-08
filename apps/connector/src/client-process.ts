import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import * as pty from 'node-pty'
import { redactChildOutput } from './output-redaction.js'
export { redactChildOutput } from './output-redaction.js'

export async function launchClient(command: string, args: string[], token: string): Promise<number> {
  const env = { ...process.env, WORKMESH_INSTALLATION_TOKEN: token }
  if (process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY) {
    const child = pty.spawn(command, args, { env, cwd: process.cwd(), name: process.env.TERM ?? 'xterm-256color',
      cols: process.stdout.columns || 80, rows: process.stdout.rows || 24, useConptyDll: process.platform === 'win32' })
    const sink = redactChildOutput(text => process.stdout.write(text))
    const output = child.onData(text => sink.push(text))
    let alive = true
    const wasRaw = process.stdin.isRaw
    const input = (bytes: Buffer) => child.write(bytes.toString('utf8'))
    const resize = () => { if (alive) child.resize(process.stdout.columns || 80, process.stdout.rows || 24) }
    // 原始输入的 Ctrl-C 由终端转交；外部 SIGINT 同样交给终端前台进程。
    const interrupt = () => child.write('\u0003')
    const terminate = () => { if (process.platform === 'win32') child.kill(); else child.kill('SIGTERM') }
    try {
      const closed = new Promise<number>(resolve => child.onExit(({ exitCode, signal }) => {
        alive = false; resolve(signal ? 128 + signal : typeof exitCode === 'number' ? exitCode : 1)
      }))
      process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.on('data', input)
      process.stdout.on('resize', resize); process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
      return await closed
    } catch (error) {
      if (alive) terminate()
      throw error
    } finally {
      output.dispose(); sink.finish()
      process.stdin.off('data', input); process.stdin.setRawMode(wasRaw); process.stdin.pause()
      process.stdout.off('resize', resize); process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
    }
  }
  const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true, shell: false })
  const stdout = redactChildOutput(text => process.stdout.write(text)), stderr = redactChildOutput(text => process.stderr.write(text))
  const outDecoder = new StringDecoder('utf8'), errDecoder = new StringDecoder('utf8')
  child.stdout.on('data', (bytes: Buffer) => stdout.push(outDecoder.write(bytes)))
  child.stderr.on('data', (bytes: Buffer) => stderr.push(errDecoder.write(bytes)))
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM')
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate)
  try { const [code] = await once(child, 'close'); return typeof code === 'number' ? code : 1 }
  finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate)
    stdout.push(outDecoder.end()); stderr.push(errDecoder.end()); stdout.finish(); stderr.finish()
  }
}
