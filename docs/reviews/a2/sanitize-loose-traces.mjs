import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

// 仅处理已结束、收尾已读回的本任务崩溃 run；不修改其他任务目录。
const root = resolve(import.meta.dirname, 'runs/a2-24d1b785')
const files = []
const walk = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) throw Error('证据树含链接')
    if (entry.isDirectory()) walk(path)
    else if (path.includes('.playwright-artifacts') && !/\.(png|jpeg|jpg|webm|zip|gz)$/.test(path)) files.push(path)
  }
}
walk(root)
const decode = new TextDecoder('utf-8', { fatal: true })
const texts = files.flatMap(path => { try { return [{ path, bytes: readFileSync(path), text: decode.decode(readFileSync(path)) }] } catch { return [] } })
const known = new Set()
for (const { text } of texts) {
  for (const pattern of [
    /"name"\s*:\s*"(?:x-csrf-token|x-workmesh-bootstrap-token)"\s*,\s*"value"\s*:\s*"([A-Za-z0-9_.-]{20,})"/gi,
    /"(?:csrfToken|csrf_token|sessionToken|bootstrapToken)"\s*:\s*"([A-Za-z0-9_.-]{20,})"/gi,
    /workmesh_session=([A-Za-z0-9_.-]{20,})/gi,
  ]) for (const match of text.matchAll(pattern)) known.add(match[1])
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const receipt = { policy: '本任务闲置未打包 trace 脱敏；原始秘密不归档，原字节摘要与脱敏后摘要分开', at: new Date().toISOString(), entries: [] }
const receiptPath = resolve(root, 'loose-trace-sanitization.json')
for (const { path, bytes, text } of texts) {
  let after = text
  for (const secret of known) after = after.replaceAll(secret, '[REDACTED]')
  after = after.replace(/("name"\s*:\s*"(?:authorization|cookie|set-cookie|x-csrf-token|x-workmesh-bootstrap-token|workmesh_session)"\s*,\s*"value"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|cookie|set-cookie|csrfToken|csrf_token|sessionToken|secretMaterial|webhookSecret|privateKey|accessToken|password|bootstrapToken)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[REDACTED]"')
    .replace(/(\\"(?:csrfToken|csrf_token|sessionToken|secretMaterial|webhookSecret|privateKey|accessToken|password|bootstrapToken)\\"\s*:\s*\\")[^"]*(\\")/gi, '$1[REDACTED]$2')
  const output = Buffer.from(after)
  const entry = { path: relative(root, path).replaceAll('\\', '/'), originalSha256: sha256(bytes), finalSha256: sha256(output), changed: !output.equals(bytes), result: null }
  receipt.entries.push(entry); writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
  if (entry.changed) writeFileSync(path, output)
  entry.result = '已核 UTF-8 文本、扫描并完成脱敏'; writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
}
console.log(JSON.stringify({ scanned: texts.length, changed: receipt.entries.filter(entry => entry.changed).length }))
