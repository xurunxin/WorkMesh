import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

export const hasEvidence = path => existsSync(path) || existsSync(`${path}.gz`)
export const readEvidence = path => existsSync(path) ? readFileSync(path) : gunzipSync(readFileSync(`${path}.gz`))
