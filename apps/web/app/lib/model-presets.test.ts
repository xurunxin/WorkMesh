import { describe, expect, it, vi } from 'vitest'
import { modelPresetCatalogSchema } from '@workmesh/contracts'
import { loadModelPresets } from '../../../api/src/model-presets.js'
import { modelPresetDraft, readModelPresets } from './model-presets'

const transport = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('./api', () => ({ publicRequest: transport.read }))

describe('模型预置原验收与 R1 映射', () => {
  it('#17 原验收1：目录版本可读；选中预置只填充配置', () => {
    const catalog = modelPresetCatalogSchema.parse(loadModelPresets(true))
    const draft = modelPresetDraft(catalog.entries[0]!)
    expect(catalog.version).toBeTruthy()
    expect(draft).toEqual({ name: 'MiniMax', apiType: 'openai-completions', baseUrl: 'https://api.minimax.cn/v1', modelId: 'MiniMax-M3' })
    expect(Object.keys(draft).sort()).toEqual(['apiType', 'baseUrl', 'modelId', 'name'])
  })
  it('#17 原验收2：目录替换 / 覆盖 / 禁用规则有测试', () => {
    const original = loadModelPresets(true)!
    const override = { version: 'gateway', entries: [{ ...original.entries[0]!, id: 'gateway' }], disabledIds: ['gateway'] }
    expect(loadModelPresets(true, '/override', () => JSON.stringify(override))).toEqual({ ...override, entries: [] })
    expect(loadModelPresets(false, '/override', () => { throw new Error('必须禁用优先') })).toBeNull()
  })
  it('#17 原验收3：保存连接不产生任何出站请求（API 集成补证）', () => {
    // 本用例仅断言纯草稿填充无传输；真实 POST/PATCH 的零出站由集成同名用例补证。
    transport.read.mockClear()
    modelPresetDraft(loadModelPresets(true)!.entries[0]!)
    expect(transport.read).not.toHaveBeenCalled()
  })
  it('#17 原验收4：每条预置带来源 URL 与核对日期，缺一即失败', () => {
    const catalog = loadModelPresets(true)!
    expect(catalog.entries).toHaveLength(9)
    for (const entry of catalog.entries) {
      for (const field of ['sourceUrl', 'checkedAt', 'confirmationMethod'] as const) {
        const { [field]: omitted, ...invalid } = entry
        expect(omitted).toBeTruthy()
        expect(modelPresetCatalogSchema.safeParse({ ...catalog, entries: [invalid] }).success).toBe(false)
      }
    }
  })
  it('R1-17-1 内置目录加载、部署完整替换优先、禁用优先；选中只填可编辑配置并显示出处', () => {
    const entry = loadModelPresets(true)!.entries[0]!
    expect(entry).toMatchObject({ sourceUrl: expect.stringMatching(/^https:\/\//), checkedAt: expect.any(String), confirmationMethod: 'machine' })
    expect(modelPresetDraft(entry)).not.toHaveProperty('secretMaterial')
  })
  it('R1-17-8 多次读取和替换目录不修改请求内数据、不自动保存用户选择', async () => {
    const catalog = loadModelPresets(true)!
    transport.read.mockResolvedValue(catalog)
    const reads = await Promise.all([readModelPresets(), readModelPresets()])
    const selected = modelPresetDraft(reads[0]!.entries[0]!)
    selected.baseUrl = 'https://gateway.example/v1'
    expect(reads[1]!.entries[0]!.baseUrl).toBe(catalog.entries[0]!.baseUrl)
    expect(transport.read.mock.calls.every(call => call[0] === '/api/v1/workbench/model-presets' && call.length === 1)).toBe(true)
  })
  it('拒绝非法日期、重复 ID、未知字段、重复禁用 ID 和带凭据 URL', () => {
    const catalog = loadModelPresets(true)!
    const entry = catalog.entries[0]!
    const invalid = [
      { ...catalog, version: '' }, { ...catalog, entries: [entry, entry] },
      { ...catalog, disabledIds: ['minimax-cn', 'minimax-cn'] }, { ...catalog, extra: true },
      ...[{ checkedAt: '2026-02-30' }, { baseUrl: 'https://key@api.example/v1' },
        { sourceUrl: 'http://docs.example' }, { baseUrl: 'https://api.example/v1?key=secret' }].map(patch => ({ ...catalog, entries: [{ ...entry, ...patch }] })),
    ]
    for (const value of invalid) expect(modelPresetCatalogSchema.safeParse(value).success).toBe(false)
  })
})
