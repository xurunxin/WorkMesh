import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { configurationSchema, defaultDirectory, expectationSchema, parseJson, sha256 } from './config.js'
import { connect, clientSnippet, abandonPending } from './connect.js'
import { recoverCommit } from './commit.js'
import { requireThat, safeError } from './errors.js'
import { readPrivate, withDirectoryLock } from './platform-security.js'
import { SystemSecretStore } from './secret-store.js'

async function pairingInput(): Promise<string> {
  if (!process.stdin.isTTY) {
    let input = ''
    for await (const bytes of process.stdin) { input += bytes.toString(); requireThat(input.length <= 100, 'CONNECTOR_INPUT_INVALID') }
    return input.trim()
  }
  process.stderr.write('输入完整配对码（隐藏输入，扫码设备可直接输入）：')
  process.stdin.setRawMode(true); process.stdin.resume()
  return new Promise((resolve, reject) => {
    let input = ''
    const done = (error?: Error) => {
      process.stdin.off('data', data); process.stdin.setRawMode(false); process.stdin.pause(); process.stderr.write('\n')
      if (error) reject(error); else resolve(input)
    }
    const data = (bytes: Buffer) => {
      for (const character of bytes.toString('utf8')) {
        if (character === '\u0003') { done(new Error('cancel')); return }
        if (character === '\r' || character === '\n') { done(); return }
        if (character === '\b' || character === '\u007f') input = input.slice(0, -1)
        else if (/^[A-Za-z0-9_-]$/.test(character)) input += character
        else { done(new Error('input')); return }
        if (input.length > 47) { done(new Error('input')); return }
      }
    }
    process.stdin.on('data', data)
  })
}
// 跨 chunk 暂存完整 token 长度，避免子进程意外 echo 令牌穿过输出边界。
export function redactChildOutput(write: (text: string) => void) {
  let pending = ''
  return {
    push(text: string) {
      pending += text
      pending = pending.replace(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/g, '[已隐藏]')
      if (pending.length > 64) { write(pending.slice(0, -64)); pending = pending.slice(-64) }
    },
    finish() { write(pending.replace(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/g, '[已隐藏]')); pending = '' },
  }
}
export async function runClient(directory: string, command: string, args: string[]): Promise<number> {
  const store = new SystemSecretStore()
  const token = await withDirectoryLock(directory, async () => {
    await recoverCommit(directory, store)
    const raw = await readPrivate(join(directory, 'config.json'))
    requireThat(raw, 'CONNECTOR_NOT_CONFIGURED')
    const config = parseJson(configurationSchema, raw.toString('utf8'))
    const secret = await store.get(config.secretReference)
    requireThat(secret && /^wmi_[A-Za-z0-9_-]{43}$/.test(secret)
      && sha256(secret).slice(0, 12) === config.fingerprint, 'CONNECTOR_SECRET_MISSING')
    return secret
  })
  const child = spawn(command, args, { env: { ...process.env, WORKMESH_INSTALLATION_TOKEN: token }, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true, shell: false })
  const stdout = redactChildOutput(text => process.stdout.write(text))
  const stderr = redactChildOutput(text => process.stderr.write(text))
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', (text: string) => stdout.push(text)); child.stderr.on('data', (text: string) => stderr.push(text))
  const stop = () => child.kill('SIGTERM')
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  try { const [code] = await once(child, 'close'); return typeof code === 'number' ? code : 1 }
  finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); stdout.finish(); stderr.finish() }
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  const directory = defaultDirectory()
  if (args[0] === 'connect' && args[1] === '--expect' && args.length === 3) {
    const expectation = parseJson(expectationSchema, await readFile(args[2]!, 'utf8'))
    const config = await connect({ directory, expectation, pairingCode: await pairingInput() })
    process.stdout.write(`连接已完整验证。历史重放截止：${config.replayableUntil}\n${clientSnippet(config)}\n使用连接器 run 入口启动客户端。\n`)
  } else if (args[0] === 'run' && args[1] === '--' && args[2]) {
    process.exitCode = await runClient(directory, args[2], args.slice(3))
  } else if (args[0] === 'abandon-pending' && args.length === 1) {
    await abandonPending(directory)
    process.stdout.write('已清理未决请求；旧配对码不能换 key 重试，请管理员签发新配对码。\n')
  } else throw new Error('usage')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(`${safeError(error).code}：连接未完成；保留旧配置。重试须使用原清单与原配对码，窗口外请管理员重新配对。\n`)
  process.exitCode = 1
})
