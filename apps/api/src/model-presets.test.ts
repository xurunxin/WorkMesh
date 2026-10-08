import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { loadModelPresets, registerModelPresetRoutes } from './model-presets.js'

describe('只读部署模型目录', () => {
  it('禁用优先且不读取指定文件', () => {
    const read = vi.fn(() => { throw new Error('不应读取') })
    expect(loadModelPresets(false, '/missing.json', read)).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
  it('完整替换不残留内置条目', () => {
    const entry = { ...loadModelPresets(true)!.entries[0]!, id: 'gateway', baseUrl: 'https://gateway.example/v1' }
    const replacement = { version: 'deployment', entries: [entry], disabledIds: [] }
    const read = vi.fn(() => JSON.stringify(replacement))
    expect(loadModelPresets(true, '/catalog.json', read)).toEqual(replacement)
    expect(loadModelPresets(true, '/catalog.json', () => JSON.stringify({ ...replacement, disabledIds: ['gateway'] }))!.entries).toEqual([])
  })
  it('坏文件拒绝启动', () => {
    expect(() => loadModelPresets(true, '/missing.json')).toThrow()
    for (const bad of ['not-json', '{}', '{"version":"x","entries":[],"disabledIds":["missing"]}']) {
      expect(() => loadModelPresets(true, '/catalog.json', () => bad)).toThrow()
    }
  })
  it('并发读取不改变冻结目录', async () => {
    const catalog = loadModelPresets(true)!
    const app = Fastify()
    registerModelPresetRoutes(app, catalog)
    try {
      const responses = await Promise.all(Array.from({ length: 10 }, () => app.inject('/api/v1/workbench/model-presets')))
      expect(responses.every(response => response.statusCode === 200 && JSON.stringify(response.json()) === JSON.stringify(catalog))).toBe(true)
      expect(Object.isFrozen(catalog)).toBe(true)
      expect(Object.isFrozen(catalog.entries)).toBe(true)
      expect(Object.isFrozen(catalog.entries[0])).toBe(true)
      expect(() => { catalog.entries[0]!.modelId = 'changed' }).toThrow()
    } finally { await app.close() }
  })
  it('文件更改仅在下次启动加载生效且从不写回', () => {
    const directory = mkdtempSync(join(tmpdir(), 'c3-presets-'))
    const file = join(directory, 'catalog.json')
    try {
      const original = { ...loadModelPresets(true)!, version: 'first' }
      writeFileSync(file, JSON.stringify(original))
      const loaded = loadModelPresets(true, file)!
      const changed = JSON.stringify({ ...original, version: 'next', disabledIds: original.entries.map(entry => entry.id) })
      writeFileSync(file, changed)
      expect(loaded.version).toBe('first')
      expect(loadModelPresets(true, file)).toMatchObject({ version: 'next', entries: [] })
      expect(readFileSync(file, 'utf8')).toBe(changed)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
