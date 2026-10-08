import { z } from 'zod'
import { llmApiTypeSchema } from './pi-workbench-contracts.js'

const nonempty = z.string().trim().min(1).max(500)
const safeUrl = z.string().url().max(2048).superRefine((value, context) => {
  let url: URL
  try { url = new URL(value) } catch { return }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'URL 必须使用 HTTPS，且不含凭据、查询或片段' })
  }
})
const checkedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, '核对日期必须是有效日期')

export const modelPresetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
  provider: nonempty,
  region: nonempty,
  apiType: llmApiTypeSchema,
  baseUrl: safeUrl,
  modelId: nonempty,
  sourceUrl: safeUrl,
  checkedAt: checkedDate,
  confirmationMethod: z.enum(['machine', 'human']),
  notes: z.string().trim().min(1).max(2000),
}).strict()

export const modelPresetCatalogSchema = z.object({
  version: nonempty,
  entries: z.array(modelPresetSchema).max(1000),
  disabledIds: z.array(modelPresetSchema.shape.id).max(1000).default([]),
}).strict().superRefine((catalog, context) => {
  const ids = new Set<string>()
  for (const entry of catalog.entries) {
    if (ids.has(entry.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: '预置 ID 重复' })
    ids.add(entry.id)
  }
  if (new Set(catalog.disabledIds).size !== catalog.disabledIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: '禁用 ID 必须唯一' })
  }
})

export type ModelPreset = z.infer<typeof modelPresetSchema>
export type ModelPresetCatalog = z.infer<typeof modelPresetCatalogSchema>
