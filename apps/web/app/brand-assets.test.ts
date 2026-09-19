import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const file = (relative: string): Buffer => readFileSync(fileURLToPath(new URL(relative, import.meta.url)))

function pngInfo(relative: string): { width: number; height: number; colorType: number } {
  const value = file(relative)
  expect(value.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return { width: value.readUInt32BE(16), height: value.readUInt32BE(20), colorType: value[25]! }
}

describe('WorkMesh brand assets', () => {
  it('keeps transparent PNG assets at their declared sizes', () => {
    expect(pngInfo('./icon.png')).toEqual({ width: 512, height: 512, colorType: 6 })
    expect(pngInfo('./apple-icon.png')).toEqual({ width: 180, height: 180, colorType: 6 })
    expect(pngInfo('../public/brand/workmesh-mark-64.png')).toEqual({ width: 64, height: 64, colorType: 6 })
  })

  it('publishes 16, 32, and 48 pixel favicon frames', () => {
    const value = file('./favicon.ico')
    expect(value.readUInt16LE(0)).toBe(0)
    expect(value.readUInt16LE(2)).toBe(1)
    expect(value.readUInt16LE(4)).toBe(3)
    expect([0, 1, 2].map(index => value[6 + index * 16])).toEqual([16, 32, 48])
  })

  it('declares the generated icons in root Metadata', () => {
    const layout = file('./layout.tsx').toString('utf8')
    expect(layout).toContain("title: { default: 'WorkMesh', template: '%s · WorkMesh' }")
    expect(layout).toContain("url: '/favicon.ico'")
    expect(layout).toContain("url: '/apple-icon.png'")
  })
})
