const normalize = (value: string): string => value
  .trim()
  .normalize('NFKC')
  .toLocaleLowerCase()

const visibleScalar = (value: unknown): string | null => {
  if (typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'bigint'
    || typeof value === 'boolean')
    return String(value)
  return null
}

export function matchesOperationsQuery(query: string, values: readonly unknown[]): boolean {
  const needle = normalize(query)
  if (!needle) return true
  return values.some(value => {
    const visible = visibleScalar(value)
    return visible !== null && normalize(visible).includes(needle)
  })
}

export function readOperationsQuery(search: string): string {
  return new URLSearchParams(search).get('opsQuery')?.trim() ?? ''
}
