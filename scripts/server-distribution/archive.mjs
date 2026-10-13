import { hash, fail } from './manifest.mjs'

// Docker's classic image store addresses the config; its OCI store can address
// the archive's manifest. Bind both exact digests, never guess a replacement ID.
export class ArchiveIdentities {
  pending = Buffer.alloc(0)
  remaining = 0
  padding = 0
  captured = []
  capture = false
  name = ''
  manifests = new Map()
  index = undefined
  write(bytes) {
    this.pending = Buffer.concat([this.pending, bytes])
    while (this.pending.length) {
      if (this.remaining) {
        const length = Math.min(this.remaining, this.pending.length)
        if (this.capture) this.captured.push(this.pending.subarray(0, length))
        this.remaining -= length; this.pending = this.pending.subarray(length)
        if (!this.remaining && this.capture) {
          const raw = Buffer.concat(this.captured)
          let value
          try { value = JSON.parse(raw.toString('utf8')) } catch { /* Not an OCI manifest. */ }
          if (value?.schemaVersion === 2 && value.config?.digest && Array.isArray(value.layers)) {
            const id = `sha256:${hash(raw)}`
            if (this.name !== `blobs/sha256/${hash(raw)}`
              || (this.manifests.has(value.config.digest) && this.manifests.get(value.config.digest) !== id)) fail('BUILD_ARCHIVE_IDENTITY_INVALID')
            this.manifests.set(value.config.digest, id)
          }
          if (this.name === 'index.json' && value?.schemaVersion === 2 && Array.isArray(value.manifests))
            this.index = new Set(value.manifests.map(entry => entry.digest))
          this.captured = []
        }
      } else if (this.padding) {
        const length = Math.min(this.padding, this.pending.length)
        this.padding -= length; this.pending = this.pending.subarray(length)
      } else {
        if (this.pending.length < 512) break
        const header = this.pending.subarray(0, 512)
        this.pending = this.pending.subarray(512)
        if (header.every(byte => byte === 0)) continue
        const rawSize = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim()
        if (!/^[0-7]+$/.test(rawSize)) fail('BUILD_ARCHIVE_HEADER_INVALID')
        const size = Number.parseInt(rawSize, 8)
        this.remaining = size; this.padding = (512 - size % 512) % 512
        const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
        this.name = name
        this.capture = (name.startsWith('blobs/sha256/') || name === 'index.json') && size > 0 && size <= 1024 * 1024
      }
    }
  }
  id(configId) {
    if (this.remaining || this.padding || this.pending.some(byte => byte !== 0)) fail('BUILD_ARCHIVE_TRUNCATED')
    if (this.manifests.size && !this.manifests.has(configId)) fail('BUILD_SOURCE_ID_NOT_IN_ARCHIVE')
    if (this.manifests.has(configId) && !this.index?.has(this.manifests.get(configId))) fail('BUILD_ARCHIVE_INDEX_MISSING_IMAGE')
    // Classic docker save has no OCI index: its load identity stays the config.
    return this.manifests.get(configId) ?? configId
  }
}
