import { createCipheriv, createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { EncryptedPayload } from './types.js'

const sha256Pattern = /^[a-f0-9]{64}$/

export const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex')
export const hmacSha256 = (key: Buffer, value: Buffer | string): string => createHmac('sha256', key).update(value).digest('hex')
export const equalHex = (left: string, right: string): boolean => {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export const parse32ByteKey = (value: string | undefined, name: string): Buffer => {
  if (!value) throw new Error(`${name}_REQUIRED`)
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex')
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error(`${name}_INVALID`)
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) throw new Error(`${name}_INVALID`)
  return decoded
}

export const canonicalJson = (value: unknown): string => {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize)
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      )
    }
    return current
  }
  return `${JSON.stringify(normalize(value), null, 2)}\n`
}

const countingHash = (hash: ReturnType<typeof createHash>, count: { value: number }): Transform => new Transform({
  transform(chunk: Buffer, _encoding, callback) {
    hash.update(chunk)
    count.value += chunk.length
    callback(null, chunk)
  },
})

export const encryptReadable = async (
  input: Readable,
  destination: string,
  key: Buffer,
  iv: Buffer,
): Promise<EncryptedPayload> => {
  await mkdir(dirname(destination), { recursive: true })
  const plaintextHash = createHash('sha256')
  const ciphertextHash = createHash('sha256')
  const plaintextBytes = { value: 0 }
  const ciphertextBytes = { value: 0 }
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  await pipeline(
    input,
    countingHash(plaintextHash, plaintextBytes),
    cipher,
    countingHash(ciphertextHash, ciphertextBytes),
    createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
  )
  return {
    path: '',
    plaintextSha256: plaintextHash.digest('hex'),
    ciphertextSha256: ciphertextHash.digest('hex'),
    plaintextBytes: plaintextBytes.value,
    ciphertextBytes: ciphertextBytes.value,
    ivBase64: iv.toString('base64'),
    authTagBase64: cipher.getAuthTag().toString('base64'),
  }
}

export const encryptFile = async (
  source: string,
  destination: string,
  key: Buffer,
  iv: Buffer,
): Promise<EncryptedPayload> => encryptReadable(createReadStream(source), destination, key, iv)

export const verifyEncryptedPayload = async (bundleDirectory: string, payload: EncryptedPayload): Promise<void> => {
  if (!sha256Pattern.test(payload.plaintextSha256) || !sha256Pattern.test(payload.ciphertextSha256)) {
    throw new Error('RECOVERY_PAYLOAD_DIGEST_INVALID')
  }
  const hash = createHash('sha256')
  let ciphertextBytes = 0
  try {
    for await (const chunk of createReadStream(`${bundleDirectory}/${payload.path}`)) {
      const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
      ciphertextBytes += body.length
      hash.update(body)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`RECOVERY_PAYLOAD_MISSING:${payload.path}`)
    }
    throw error
  }
  if (ciphertextBytes !== payload.ciphertextBytes || hash.digest('hex') !== payload.ciphertextSha256) {
    throw new Error(`RECOVERY_PAYLOAD_CIPHERTEXT_MISMATCH:${payload.path}`)
  }
}

export const decryptPayloadToFile = async (
  bundleDirectory: string,
  payload: EncryptedPayload,
  destination: string,
  key: Buffer,
): Promise<void> => {
  await verifyEncryptedPayload(bundleDirectory, payload)
  await mkdir(dirname(destination), { recursive: true })
  const plaintextHash = createHash('sha256')
  const plaintextBytes = { value: 0 }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.ivBase64, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(payload.authTagBase64, 'base64'))
  try {
    await pipeline(
      createReadStream(`${bundleDirectory}/${payload.path}`),
      decipher,
      countingHash(plaintextHash, plaintextBytes),
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    )
    if (plaintextBytes.value !== payload.plaintextBytes || plaintextHash.digest('hex') !== payload.plaintextSha256) {
      throw new Error(`RECOVERY_PAYLOAD_PLAINTEXT_MISMATCH:${payload.path}`)
    }
  } catch (error) {
    await rm(destination, { force: true })
    throw error
  }
}

export const readableFromSdkBody = (body: unknown): Readable => {
  if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== 'function') {
    throw new Error('RECOVERY_OBJECT_BODY_MISSING')
  }
  return Readable.from(body as AsyncIterable<Uint8Array>)
}
