import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  privateEventAudienceForms,
  supportedEventAggregateTypes,
} from './event-resources.js'

const root = join(import.meta.dirname, '../../..')
const allowed = new Set([
  'packages/db/src/events.ts',
])
const productionRoots = [
  'apps/api/src',
  'apps/worker/src',
  'packages/db/src',
]

async function sourceFiles(directory: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  }))
  return nested.flat()
}

describe('durable domain-event writer inventory', () => {
  it('rejects production SQL writes outside the central persistence module', async () => {
    const offenders: string[] = []
    for (const sourceRoot of productionRoots)
      for (const file of await sourceFiles(join(root, sourceRoot))) {
        const normalized = relative(root, file).replaceAll('\\', '/')
        if (allowed.has(normalized) || normalized.endsWith('.test.ts')) continue
        const source = await readFile(file, 'utf8')
        if (/\bINSERT\s+INTO\s+domain_events\b/i.test(source))
          offenders.push(normalized)
      }
    expect(offenders).toEqual([])
  })

  it('requires every production aggregate literal to have a resolver', async () => {
    const supported = new Set<string>(supportedEventAggregateTypes)
    const unsupported = new Set<string>()
    const objectAggregate = (
      value: ts.Expression | undefined,
    ): string | undefined => {
      if (!value || !ts.isObjectLiteralExpression(value)) return undefined
      for (const property of value.properties)
        if (
          ts.isPropertyAssignment(property)
          && property.name.getText() === 'aggregateType'
          && ts.isStringLiteralLike(property.initializer)
        )
          return property.initializer.text
      return undefined
    }

    for (const sourceRoot of productionRoots)
      for (const file of await sourceFiles(join(root, sourceRoot))) {
        if (file.endsWith('.test.ts')) continue
        const sourceText = await readFile(file, 'utf8')
        const source = ts.createSourceFile(
          file,
          sourceText,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TS,
        )
        const visit = (node: ts.Node): void => {
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const name = node.expression.text
            let aggregate: string | undefined
            if (name === 'appendEvent' || name === 'appendOutboxEvent')
              aggregate = objectAggregate(node.arguments.at(-1))
            else if (
              (name === 'event' || name === 'emit')
              && node.arguments[3]
              && ts.isStringLiteralLike(node.arguments[3])
            )
              aggregate = node.arguments[3].text
            if (aggregate && !supported.has(aggregate))
              unsupported.add(
                `${relative(root, file).replaceAll('\\', '/')}:${aggregate}`,
              )
          }
          ts.forEachChild(node, visit)
        }
        visit(source)
      }

    expect([...unsupported].sort()).toEqual([])
  }, 15_000)

  it('inventories private forms and requires current producers to set an exact audience', async () => {
    expect(privateEventAudienceForms).toEqual([
      'aggregate:session',
      'aggregate:saved_view',
      'aggregate:notification',
      'aggregate:advanced_saved_view:private',
      'event:notification.preferences_updated',
    ])
    const server = await readFile(join(root, 'apps/api/src/server.ts'), 'utf8')
    const operations = await readFile(
      join(root, 'apps/api/src/operations/routes.ts'),
      'utf8',
    )
    const stage4 = await readFile(join(root, 'packages/db/src/stage4.ts'), 'utf8')
    const worker = await readFile(
      join(root, 'apps/worker/src/automation.ts'),
      'utf8',
    )
    expect(server).toMatch(
      /type: "auth\.session\.deleted"[\s\S]{0,300}audienceActorId: request\.actor!\.id/,
    )
    expect(server).toMatch(
      /type: "auth\.session\.created"[\s\S]{0,300}audienceActorId: actorId/,
    )
    expect(server).toMatch(
      /type: "saved_view\.created"[\s\S]{0,300}audienceActorId: c\.actor\.id/,
    )
    expect(operations).toMatch(
      /'view\.created'[\s\S]{0,300}body\.scope === 'private' \? meta\.actor\.id/,
    )
    expect(operations).toMatch(
      /'notification\.created'[\s\S]{0,400}body\.recipientActorId/,
    )
    expect(operations).toMatch(
      /'notification\.preferences_updated'[\s\S]{0,300}meta\.actor\.id/,
    )
    expect(stage4).toMatch(
      /type: 'notification\.created'[\s\S]{0,300}audienceActorId: recipientActorId/,
    )
    expect(worker).toMatch(
      /type: 'notification\.delivered'[\s\S]{0,300}audienceActorId: delivery\.recipientActorId/,
    )
  })
})
