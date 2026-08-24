export type OperationsSectionId =
  | 'metrics'
  | 'cycles'
  | 'initiatives'
  | 'automation'
  | 'loops'
  | 'runs'
  | 'templates'

const operationsUi = 'WORKMESH_BETA_OPERATIONS_UI'

export function visibleOperationsSections(features: ReadonlySet<string>): OperationsSectionId[] {
  if (!features.has(operationsUi)) return []

  const sections: OperationsSectionId[] = []
  if (features.has('WORKMESH_BETA_COSTS')) sections.push('metrics')
  if (features.has('WORKMESH_BETA_PLANNING')) sections.push('cycles', 'initiatives')
  if (features.has('WORKMESH_EXPERIMENTAL_AUTOMATION')) sections.push('automation')
  if (features.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS')) sections.push('loops')
  if (features.has('WORKMESH_EXPERIMENTAL_AUTOMATION')) sections.push('runs')
  if (features.has('WORKMESH_BETA_TEMPLATES')) sections.push('templates')
  return sections
}
