import { modelPresetCatalogSchema, type ModelPreset, type ModelPresetCatalog } from '@workmesh/contracts'
import { publicRequest } from './api'

export async function readModelPresets(): Promise<ModelPresetCatalog> {
  return modelPresetCatalogSchema.parse(await publicRequest<unknown>('/api/v1/workbench/model-presets'))
}

export function modelPresetDraft(preset: ModelPreset) {
  return { name: preset.provider, apiType: preset.apiType, baseUrl: preset.baseUrl, modelId: preset.modelId }
}
