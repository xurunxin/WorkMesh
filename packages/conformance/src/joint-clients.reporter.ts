import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const jointEvidenceRoot = () => resolve(process.env.M5_EVIDENCE_ROOT ?? resolve(import.meta.dirname, '../../../ci-logs/joint-clients'))
export const fingerprint = (body: string | Buffer) => createHash('sha256').update(body).digest('hex')
export function saveJointEvidence(name: string, value: unknown): void {
  const root = jointEvidenceRoot(); mkdirSync(root, { recursive: true })
  const text = JSON.stringify(value, (key, entry: unknown) => {
    if (/^(reasoning|reasoning_content|thinking|signature|apiKey|sessionToken|installation_token|exchangeToken|cookie|csrfToken|authorization)$/i.test(key)) return '[redacted]'
    return entry
  }, 2).replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')
  writeFileSync(resolve(root, name), text + '\n')
}
