export const WORKFLOW_COLOR_PRESETS = [
  { id: 'neutral', value: '#73736f' },
  { id: 'blue', value: '#2563eb' },
  { id: 'green', value: '#15803d' },
  { id: 'amber', value: '#a16207' },
  { id: 'red', value: '#b42318' },
] as const

export type WorkflowColorPresetId = typeof WORKFLOW_COLOR_PRESETS[number]['id']

export const CUSTOM_WORKFLOW_COLOR = '#8b5cf6'

export function workflowColorValue(id: string): string | null {
  return WORKFLOW_COLOR_PRESETS.find(preset => preset.id === id)?.value ?? null
}
