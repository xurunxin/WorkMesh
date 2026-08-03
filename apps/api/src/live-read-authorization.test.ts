import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createRoutePolicyManifest } from '@workmesh/contracts'
import ts from 'typescript'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from './live-read-authorization.js'
import type { ApiActor } from './agent/types.js'

const actor: ApiActor = {
  id: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Live reader',
  workspaceRole: 'member',
  csrfToken: '',
  kind: 'human',
  humanSessionId: '00000000-0000-4000-8000-000000000003',
  credentialHash: 'credential-hash',
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, `missing section start: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `missing section end: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

function routeSection(source: string, path: string): string {
  const single = `app.get('${path}'`
  const double = `app.get("${path}"`
  const startIndex = Math.max(source.indexOf(single), source.indexOf(double))
  expect(startIndex, `missing GET route: ${path}`).toBeGreaterThanOrEqual(0)
  const nextRoute = source.indexOf('\n  app.', startIndex + 1)
  return source.slice(startIndex, nextRoute < 0 ? undefined : nextRoute)
}

function canonicalRoutePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

type AuthorizationSource = {
  calls?: readonly string[]
  fragments?: readonly string[]
}

type FinalSqlAudit = {
  fileName: string
  source: string
  authorization: AuthorizationSource
  query: 'paginator' | 'manual-prepared' | 'manual-inline'
}

type ReachableRoot = {
  node: ts.Node
  functionName?: string
}

function parseSource(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
}

function propertyCallName(call: ts.CallExpression): string | undefined {
  return ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : undefined
}

function calledIdentifier(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined
}

function localFunctions(sourceFile: ts.SourceFile): Map<string, ts.FunctionDeclaration> {
  const functions = new Map<string, ts.FunctionDeclaration>()
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement)
    }
  }
  return functions
}

function routeHandler(
  sourceFile: ts.SourceFile,
  path: string,
): ts.ArrowFunction | ts.FunctionExpression {
  const matches: Array<ts.ArrowFunction | ts.FunctionExpression> = []
  const visit = (node: ts.Node): void => {
    const route = ts.isCallExpression(node) ? node.arguments[0] : undefined
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'get'
      && route
      && ts.isStringLiteralLike(route)
      && route.text === path
    ) {
      const handler = node.arguments[1]
      if (handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) {
        matches.push(handler)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  expect(matches, `expected one GET handler for ${path}`).toHaveLength(1)
  return matches[0]!
}

function reachableFunctions(
  handler: ts.ArrowFunction | ts.FunctionExpression,
  functions: ReadonlyMap<string, ts.FunctionDeclaration>,
): ReachableRoot[] {
  const reachable: ReachableRoot[] = [{ node: handler }]
  const visited = new Set<string>()
  const inspect = (root: ts.Node): void => {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const name = calledIdentifier(node)
        const declaration = name ? functions.get(name) : undefined
        if (name && declaration && !visited.has(name)) {
          visited.add(name)
          reachable.push({ node: declaration, functionName: name })
          inspect(declaration)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(root)
  }
  inspect(handler)
  return reachable
}

function addDefinition(
  definitions: Map<string, ts.Expression[]>,
  name: string,
  expression: ts.Expression | undefined,
): void {
  if (!expression) return
  const entries = definitions.get(name) ?? []
  entries.push(expression)
  definitions.set(name, entries)
}

function collectDefinitions(root: ts.Node): Map<string, ts.Expression[]> {
  const definitions = new Map<string, ts.Expression[]>()
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      addDefinition(definitions, node.name.text, node.initializer)
    }
    if (
      ts.isBinaryExpression(node)
      && ts.isIdentifier(node.left)
      && (
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        || node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken
      )
    ) {
      addDefinition(definitions, node.left.text, node.right)
    }
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'push'
      && ts.isIdentifier(node.expression.expression)
    ) {
      for (const argument of node.arguments) {
        addDefinition(definitions, node.expression.expression.text, argument)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return definitions
}

function literalCarriesAuthorization(
  expression: ts.Expression,
  fragments: readonly string[],
): boolean {
  if (ts.isStringLiteralLike(expression)) {
    return fragments.some(fragment => expression.text.includes(fragment))
  }
  if (ts.isTemplateExpression(expression)) {
    return fragments.some(fragment =>
      expression.head.text.includes(fragment)
      || expression.templateSpans.some(span => span.literal.text.includes(fragment)),
    )
  }
  return false
}

function expressionCarriesAuthorization(
  expression: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  authorization: AuthorizationSource,
  seen = new Set<string>(),
): boolean {
  if (
    ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && authorization.calls?.includes(expression.expression.text)
  ) {
    return true
  }
  if (literalCarriesAuthorization(expression, authorization.fragments ?? [])) {
    return true
  }
  if (
    ts.isTemplateExpression(expression)
    && expression.templateSpans.some(span =>
      expressionCarriesAuthorization(
        span.expression,
        definitions,
        authorization,
        new Set(seen),
      ),
    )
  ) {
    return true
  }
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return false
    const nextSeen = new Set(seen)
    nextSeen.add(expression.text)
    return definitions.get(expression.text)?.some(candidate =>
      expressionCarriesAuthorization(candidate, definitions, authorization, nextSeen),
    ) ?? false
  }
  let carries = false
  ts.forEachChild(expression, child => {
    if (
      !carries
      && ts.isExpression(child)
      && expressionCarriesAuthorization(child, definitions, authorization, new Set(seen))
    ) {
      carries = true
    }
  })
  return carries
}

const liveAuthorizationMarker = 'LIVE_AUTHORIZATION'

function renderSqlExpression(
  expression: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  seen = new Set<string>(),
): string {
  if (
    ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'liveSessionReadPredicate'
  ) {
    return liveAuthorizationMarker
  }
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  if (ts.isTemplateExpression(expression)) {
    return expression.head.text + expression.templateSpans
      .map(span =>
        renderSqlExpression(span.expression, definitions, new Set(seen))
        + span.literal.text,
      )
      .join('')
  }
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return ''
    const nextSeen = new Set(seen)
    nextSeen.add(expression.text)
    return definitions.get(expression.text)
      ?.map(candidate => renderSqlExpression(candidate, definitions, nextSeen))
      .join(' ') ?? ''
  }
  if (
    ts.isCallExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && expression.expression.name.text === 'join'
  ) {
    return renderSqlExpression(expression.expression.expression, definitions, new Set(seen))
  }
  let rendered = ''
  ts.forEachChild(expression, child => {
    if (ts.isExpression(child)) {
      rendered += ` ${renderSqlExpression(child, definitions, new Set(seen))}`
    }
  })
  return rendered
}

type SqlToken = {
  word: string
  depth: number
}

function sqlTokens(sql: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let depth = 0
  let quote: "'" | '"' | undefined
  for (let index = 0; index < sql.length;) {
    const character = sql[index]!
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) {
          index += 2
          continue
        }
        quote = undefined
      }
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      index += 1
      continue
    }
    if (character === '(') {
      depth += 1
      index += 1
      continue
    }
    if (character === ')') {
      depth = Math.max(0, depth - 1)
      index += 1
      continue
    }
    if (/[A-Za-z_]/.test(character)) {
      let end = index + 1
      while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end]!)) end += 1
      tokens.push({ word: sql.slice(index, end).toUpperCase(), depth })
      index = end
      continue
    }
    index += 1
  }
  return tokens
}

function liveAuthorizationDominates(sql: string): boolean {
  const tokens = sqlTokens(sql)
  const liveIndexes = tokens
    .map((token, index) => token.word === liveAuthorizationMarker ? index : -1)
    .filter(index => index >= 0)
  if (liveIndexes.length !== 1) return false
  const liveIndex = liveIndexes[0]!
  const liveDepth = tokens[liveIndex]!.depth
  const guardedByWhere = tokens
    .slice(0, liveIndex)
    .some(token => token.word === 'WHERE' && token.depth === liveDepth)
  if (!guardedByWhere) return false
  return tokens.every(token =>
    (token.word !== 'OR' && token.word !== 'UNION')
    || token.depth > liveDepth,
  )
}

function propertyPosition(
  root: ts.Node,
  objectName: string,
  propertyName: string,
): number | undefined {
  let position: number | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === objectName
      && node.name.text === propertyName
    ) {
      position = Math.min(position ?? node.getStart(), node.getStart())
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return position
}

function preparedPageBinding(
  handler: ts.ArrowFunction | ts.FunctionExpression,
): { name: string; position: number } | undefined {
  let binding: { name: string; position: number } | undefined
  const visit = (node: ts.Node): void => {
    if (
      !binding
      && ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isPropertyAccessExpression(node.initializer.expression)
      && node.initializer.expression.name.text === 'prepare'
      && node.initializer.expression.expression.getText().endsWith('paginator')
    ) {
      binding = { name: node.name.text, position: node.initializer.getStart() }
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)
  return binding
}

function awaitedPropertyCallPositions(
  root: ts.Node,
  receiverName: string,
  propertyName: string,
): number[] {
  const positions: number[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === receiverName
      && node.expression.name.text === propertyName
      && ts.isAwaitExpression(node.parent)
    ) {
      positions.push(node.getStart())
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return positions
}

function preparedPageInvocationPositions(
  handler: ts.ArrowFunction | ts.FunctionExpression,
  functionName: string,
  pageArgumentIndex: number,
  pageName: string,
): number[] {
  const positions: number[] = []
  const visit = (node: ts.Node): void => {
    const pageArgument = ts.isCallExpression(node)
      ? node.arguments[pageArgumentIndex]
      : undefined
    if (
      ts.isCallExpression(node)
      && calledIdentifier(node) === functionName
      && pageArgument
      && ts.isIdentifier(pageArgument)
      && pageArgument.text === pageName
    ) {
      positions.push(node.getStart())
    }
    ts.forEachChild(node, visit)
  }
  visit(handler)
  return positions
}

function authorizationPosition(
  root: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  authorization: AuthorizationSource,
): number | undefined {
  let position: number | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isExpression(node)
      && (
        (
          ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && authorization.calls?.includes(node.expression.text)
        )
        || (
          ts.isIdentifier(node)
          && expressionCarriesAuthorization(node, definitions, authorization)
        )
        || literalCarriesAuthorization(node, authorization.fragments ?? [])
      )
    ) {
      position = Math.min(position ?? node.getStart(), node.getStart())
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return position
}

function manualPreparedPageParameterIndex(
  sql: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  authorization: AuthorizationSource,
  declaration: ts.FunctionDeclaration,
): number | undefined {
  if (!expressionCarriesAuthorization(sql, definitions, authorization)) return undefined
  const authorizationAt = authorizationPosition(sql, definitions, authorization)
  if (authorizationAt === undefined || !sql.getText().includes('LIMIT')) return undefined
  for (const [index, parameter] of declaration.parameters.entries()) {
    if (!ts.isIdentifier(parameter.name)) continue
    const pageName = parameter.name.text
    const predicateAt = propertyPosition(sql, pageName, 'predicate')
    const orderAt = propertyPosition(sql, pageName, 'orderBy')
    const valuesAt = propertyPosition(sql, pageName, 'values')
    if (
      predicateAt !== undefined
      && orderAt !== undefined
      && valuesAt !== undefined
      && authorizationAt < predicateAt
      && predicateAt < orderAt
      && orderAt < valuesAt
    ) {
      return index
    }
  }
  return undefined
}

function namedCallPosition(root: ts.Node, name: string): number | undefined {
  let position: number | undefined
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === name
    ) {
      position = Math.min(position ?? node.getStart(), node.getStart())
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return position
}

type SqlMutation = {
  kind: 'replace' | 'append'
  expression: ts.Expression
  position: number
}

function sqlMutationsBefore(
  root: ts.Node,
  name: string,
  before: number,
): SqlMutation[] {
  const mutations: SqlMutation[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && node.initializer
      && node.initializer.getStart() < before
    ) {
      mutations.push({
        kind: 'replace',
        expression: node.initializer,
        position: node.initializer.getStart(),
      })
    }
    if (
      ts.isBinaryExpression(node)
      && ts.isIdentifier(node.left)
      && node.left.text === name
      && node.right.getStart() < before
      && (
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        || node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken
      )
    ) {
      mutations.push({
        kind: node.operatorToken.kind === ts.SyntaxKind.EqualsToken ? 'replace' : 'append',
        expression: node.right,
        position: node.right.getStart(),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return mutations.sort((left, right) => left.position - right.position)
}

function finalMutableSqlDominates(
  handler: ts.ArrowFunction | ts.FunctionExpression,
  query: ts.CallExpression,
  sql: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  authorization: AuthorizationSource,
): boolean {
  const identifiers = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node)
      && expressionCarriesAuthorization(node, definitions, authorization)
    ) {
      identifiers.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sql)
  for (const name of identifiers) {
    const mutations = sqlMutationsBefore(handler, name, query.getStart())
    let lastReplacementIndex = -1
    for (const [index, mutation] of mutations.entries()) {
      if (mutation.kind === 'replace') lastReplacementIndex = index
    }
    if (lastReplacementIndex < 0) continue
    const relevant = mutations.slice(lastReplacementIndex)
    if (
      !expressionCarriesAuthorization(
        relevant[0]!.expression,
        definitions,
        authorization,
      )
    ) continue
    const rendered = relevant
      .map(mutation =>
        renderSqlExpression(
          mutation.expression,
          definitions,
          new Set([name]),
        ),
      )
      .join(' ')
    if (liveAuthorizationDominates(rendered)) return true
  }
  return false
}

function inlineManualFinalSql(
  handler: ts.ArrowFunction | ts.FunctionExpression,
  query: ts.CallExpression,
  sql: ts.Expression,
  definitions: ReadonlyMap<string, ts.Expression[]>,
  authorization: AuthorizationSource,
  preparedPage: { name: string; position: number },
  beforeQueryAt: number,
): boolean {
  if (!expressionCarriesAuthorization(sql, definitions, authorization)) return false
  if (
    authorization.calls?.includes('liveSessionReadPredicate')
    && !finalMutableSqlDominates(
      handler,
      query,
      sql,
      definitions,
      authorization,
    )
  ) return false
  const authorizationAt = namedCallPosition(handler, 'liveSessionReadPredicate')
  const predicateAt = propertyPosition(handler, preparedPage.name, 'predicate')
  const valuesAt = propertyPosition(handler, preparedPage.name, 'values')
  const orderAt = propertyPosition(sql, preparedPage.name, 'orderBy')
  return authorizationAt !== undefined
    && predicateAt !== undefined
    && valuesAt !== undefined
    && orderAt !== undefined
    && sql.getText().includes('ORDER BY')
    && sql.getText().includes('LIMIT')
    && authorizationAt < preparedPage.position
    && preparedPage.position < predicateAt
    && predicateAt < valuesAt
    && valuesAt < beforeQueryAt
    && beforeQueryAt < query.getStart()
}

function finalSqlConsumesAuthorization(
  audit: FinalSqlAudit,
  path: string,
): boolean {
  const sourceFile = parseSource(audit.fileName, audit.source)
  const handler = routeHandler(sourceFile, path)
  const roots = reachableFunctions(handler, localFunctions(sourceFile))
  const preparedPage = audit.query !== 'paginator'
    ? preparedPageBinding(handler)
    : undefined
  const beforeQueryPositions = preparedPage
    ? awaitedPropertyCallPositions(handler, preparedPage.name, 'beforeQuery')
    : []
  if (
    audit.query !== 'paginator'
    && (
      !preparedPage
      || beforeQueryPositions.length !== 1
      || preparedPage.position >= beforeQueryPositions[0]!
    )
  ) return false
  for (const root of roots) {
    const definitions = collectDefinitions(root.node)
    let found = false
    let manualPageArgumentIndex: number | undefined
    const visit = (node: ts.Node): void => {
      if (found || !ts.isCallExpression(node)) {
        if (!found) ts.forEachChild(node, visit)
        return
      }
      const callName = propertyCallName(node)
      if (callName !== 'query') {
        ts.forEachChild(node, visit)
        return
      }
      const receiver = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.expression.getText(sourceFile)
        : ''
      const paginatorQuery = receiver.endsWith('paginator')
      const sql = node.arguments[paginatorQuery ? 4 : 0]
      if (!sql) {
        ts.forEachChild(node, visit)
        return
      }
      found = audit.query === 'paginator'
        ? paginatorQuery
          && expressionCarriesAuthorization(sql, definitions, audit.authorization)
          && (
            !audit.authorization.calls?.includes('liveSessionReadPredicate')
            || liveAuthorizationDominates(renderSqlExpression(sql, definitions))
          )
        : audit.query === 'manual-prepared'
          ? !paginatorQuery
          && root.functionName !== undefined
          && ts.isFunctionDeclaration(root.node)
          && (
            manualPageArgumentIndex = manualPreparedPageParameterIndex(
              sql,
              definitions,
              audit.authorization,
              root.node,
            )
          ) !== undefined
          : !paginatorQuery
            && root.functionName === undefined
            && preparedPage !== undefined
            && inlineManualFinalSql(
              handler,
              node,
              sql,
              definitions,
              audit.authorization,
              preparedPage,
              beforeQueryPositions[0]!,
            )
      if (!found) ts.forEachChild(node, visit)
    }
    visit(root.node)
    if (found && audit.query !== 'manual-prepared') return true
    if (
      found
      && preparedPage
      && root.functionName
      && manualPageArgumentIndex !== undefined
    ) {
      const invocations = preparedPageInvocationPositions(
        handler,
        root.functionName,
        manualPageArgumentIndex,
        preparedPage.name,
      )
      if (
        invocations.length > 0
        && invocations.every(position => beforeQueryPositions[0]! < position)
      ) {
        return true
      }
    }
  }
  return false
}

describe('live paged-read authorization', () => {
  it('binds credential, membership, delegation, capability, and resource scope facts', () => {
    const teamValues: unknown[] = []
    const team = liveHumanTeamReadPredicate(
      actor,
      'protected.workspace_id',
      'protected.team_id',
      teamValues,
    )
    expect(team).toContain('JOIN sessions live_credential')
    expect(team).toContain('live_credential.revoked_at IS NULL')
    expect(team).toContain('FROM memberships live_membership')
    expect(team).toContain("live_reader.workspace_role='admin'")
    expect(teamValues).toEqual([
      actor.id,
      actor.humanSessionId,
      actor.credentialHash,
    ])

    const sessionValues: unknown[] = []
    const session = liveSessionReadPredicate(
      { ...actor, kind: 'agent', humanSessionId: undefined, agentSessionId: actor.humanSessionId },
      'protected.session_id',
      'protected.workspace_id',
      sessionValues,
    )
    expect(session).toContain('FROM agent_session_tokens live_credential')
    expect(session).toContain('FROM delegations live_delegation')
    expect(session).toContain('JOIN agent_team_access live_team_access')
    expect(session).toContain("'work:read'=ANY(live_delegation.permissions_snapshot)")
    expect(session).toContain("live_delegation.capability_scope->'teamIds'")
    expect(session).toContain("live_delegation.capability_scope->'workItemIds'")
    expect(session).toContain("live_delegation.capability_scope->'projectIds'")
    expect(session).toContain('LEFT JOIN work_items live_scope_item')
    expect(session).toContain('live_scope_item.deleted_at IS NULL')
    expect(session).toContain('LEFT JOIN projects live_session_project')
    expect(session).toContain('live_session_project.workspace_id=live_session.workspace_id')
    expect(session).toContain('live_session_project.deleted_at IS NULL')
    expect(session).toContain('live_session.work_item_id IS NOT NULL')
    expect(session).toContain('live_session.work_item_id IS NULL')
    expect(session).toContain('live_scope_item.id IS NOT NULL')
    expect(session).toContain('live_session_project.id IS NOT NULL')

    const repository = liveSessionReadPredicate(
      { ...actor, kind: 'agent', humanSessionId: undefined, agentSessionId: actor.humanSessionId },
      'protected.session_id',
      'protected.workspace_id',
      [],
      'repo:read',
    )
    expect(repository).toContain("'repo:read'=ANY(live_delegation.permissions_snapshot)")
    expect(repository).toContain("'repo:read'=ANY(live_definition.approved_capabilities)")
    expect(repository).toContain("'repo:read'=ANY(live_team_access.approved_capabilities)")
  })

  it('uses the standard live Human predicate in both final Inbox reads', async () => {
    const inbox = await readFile(new URL('./inbox/routes.ts', import.meta.url), 'utf8')
    const humanInboxReads = section(
      inbox,
      'app.get("/api/v1/inbox"',
      'app.post("/api/v1/inbox/:id/claim"',
    )
    expect(humanInboxReads.match(/liveHumanTeamReadPredicate\(/g)).toHaveLength(2)
    expect(humanInboxReads).toContain('"i.workspace_id"')
    expect(humanInboxReads).toContain('"i.team_id"')
    expect(humanInboxReads).not.toContain('FROM memberships recipient_membership')
  })

  it('keeps every flagged final paged SQL statement bound to a live predicate', async () => {
    const [server, agents, collaboration, inbox, delivery, operations] = await Promise.all([
      readFile(new URL('./server.ts', import.meta.url), 'utf8'),
      readFile(new URL('./agent/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./collaboration/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./inbox/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./delivery/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./operations/routes.ts', import.meta.url), 'utf8'),
    ])
    const protectedSections = [
      section(server,
        'app.get("/api/v1/teams/:id/states"',
        'app.post("/api/v1/teams/:id/states"'),
      section(server,
        'app.get("/api/v1/work-items/:id/comments"',
        'app.post("/api/v1/work-items/:id/comments"'),
      section(server, 'async function listHumans', 'async function listWorkItems'),
      section(
        server,
        'async function listWorkItems',
        'if (process.env.NODE_ENV !== "test")',
      ),
      section(agents,
        'app.get("/api/v1/agent-sessions/:id/activities"',
        'app.get("/api/v1/agent-sessions/:id/plan"'),
      section(agents,
        'app.get("/api/v1/agent-sessions/:id/plans"',
        'app.get("/api/v1/agent-sessions/:id/context"'),
      section(agents,
        'app.get("/api/v1/artifacts"',
        'app.post("/api/v1/approvals"'),
      section(agents,
        'app.get("/api/v1/approvals"',
        'app.get("/api/v1/approvals/:id"'),
      section(collaboration,
        "app.get('/api/v1/rooms/:id/timeline'",
        "app.post('/api/v1/rooms/:id/messages'"),
      section(inbox,
        'function listAgentInbox',
        'export function registerInboxRoutes'),
      section(delivery,
        'function applicableAgentRepositoryContexts',
        'async function assertAgentRepositoryWrite'),
      section(operations,
        "app.get('/api/v1/projects/:id/health'",
        "app.get('/api/v1/automation-rules'"),
    ]
    for (const protectedSection of protectedSections) {
      expect(protectedSection).toMatch(
        /live(HumanTeam|Session)ReadPredicate/,
      )
      expect(protectedSection).toMatch(
        /paginator\.(query|prepare)|page\?\.predicate/,
      )
    }
    const repositoryList = section(delivery,
      "app.get('/api/v1/repositories'",
      "app.post('/api/v1/repositories'")
    expect(repositoryList).toContain('paginator.prepare')
    expect(repositoryList).toContain('page.beforeQuery')
    expect(repositoryList).toContain('applicableAgentRepositoryContexts')
  })

  it('audits all 24 Agent-readable routes derived from the 27-route pagination inventory', async () => {
    const [server, agents, collaboration, inbox, delivery, operations, inventory] = await Promise.all([
      readFile(new URL('./server.ts', import.meta.url), 'utf8'),
      readFile(new URL('./agent/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./collaboration/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./inbox/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./delivery/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./operations/routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('./pagination-inventory.test.ts', import.meta.url), 'utf8'),
    ])
    const pagedRoutes = [...inventory.matchAll(/^\s+'(\/api\/v1\/[^']+)',\s*$/gm)]
      .map(match => match[1]!)
    expect(pagedRoutes).toHaveLength(27)
    const canonicalPagedRoutes = new Set(pagedRoutes.map(canonicalRoutePath))
    expect(canonicalPagedRoutes.size).toBe(27)
    const agentRoutes = createRoutePolicyManifest()
      .filter(policy =>
        policy.method === 'GET'
        && canonicalPagedRoutes.has(canonicalRoutePath(policy.path))
        && policy.actorKinds.includes('agent'),
      )
      .map(policy => canonicalRoutePath(policy.path))
      .sort()
    expect(agentRoutes).toHaveLength(24)

    const evidence = new Map<string, FinalSqlAudit>([
      ['/api/v1/teams', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/teams/:id/states', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/projects', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/work-items', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/work-items/:id/comments', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/views', {
        fileName: 'server.ts',
        source: server,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/agent-sessions', {
        fileName: 'agent/routes.ts',
        source: agents,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/agent-sessions/:id/activities', {
        fileName: 'agent/routes.ts',
        source: agents,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/agent-sessions/:id/plans', {
        fileName: 'agent/routes.ts',
        source: agents,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/artifacts', {
        fileName: 'agent/routes.ts',
        source: agents,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/approvals', {
        fileName: 'agent/routes.ts',
        source: agents,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/inbox', {
        fileName: 'inbox/routes.ts',
        source: inbox,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/leases', {
        fileName: 'collaboration/routes.ts',
        source: collaboration,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/handoffs', {
        fileName: 'collaboration/routes.ts',
        source: collaboration,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/repositories', {
        fileName: 'delivery/routes.ts',
        source: delivery,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'manual-prepared',
      }],
      ['/api/v1/cycles', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/initiatives', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/advanced-views', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/advanced-views/:id/results', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'manual-inline',
      }],
      ['/api/v1/projects/:id/health', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/automation-rules', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/automation-runs', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/loops', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
      ['/api/v1/templates', {
        fileName: 'operations/routes.ts',
        source: operations,
        authorization: { calls: ['liveSessionReadPredicate'] },
        query: 'paginator',
      }],
    ])

    expect(evidence.size).toBe(24)
    const canonicalEvidence = new Map(
      [...evidence.entries()].map(([sourcePath, audit]) => [
        canonicalRoutePath(sourcePath),
        { sourcePath, audit },
      ]),
    )
    expect(canonicalEvidence.size).toBe(evidence.size)
    expect([...canonicalEvidence.keys()].sort()).toEqual(agentRoutes)
    for (const path of agentRoutes) {
      const entry = canonicalEvidence.get(path)!
      expect(
        finalSqlConsumesAuthorization(entry.audit, entry.sourcePath),
        `${path} must carry its authorization predicate into final paged SQL`,
      ).toBe(true)
    }
  })

  it('canonicalizes Fastify and OpenAPI route parameters without changing static paths', () => {
    expect(canonicalRoutePath('/api/v1/teams/:id/states'))
      .toBe('/api/v1/teams/{id}/states')
    expect(canonicalRoutePath('/api/v1/agent-sessions/{id}/plans'))
      .toBe('/api/v1/agent-sessions/{id}/plans')
    expect(canonicalRoutePath('/api/v1/work-items'))
      .toBe('/api/v1/work-items')
  })

  it('rejects dead or omitted live-predicate data flow', () => {
    const prefix = [
      'function register(app: any, paginator: any, db: any) {',
      "  app.get('/api/v1/example', async (request: any) => {",
      '    const values: unknown[] = []',
    ]
    const suffix = [
      '  })',
      '}',
    ]
    const audit = (body: string[]): FinalSqlAudit => ({
      fileName: 'fixture.ts',
      source: [...prefix, ...body, ...suffix].join('\n'),
      authorization: { calls: ['liveSessionReadPredicate'] },
      query: 'paginator',
    })
    const deadVariable = audit([
      '    const liveAuthorization = liveSessionReadPredicate(request.actor, "r.session_id", "r.workspace_id", values)',
      '    return paginator.query(db, request, request.query, {}, `SELECT * FROM records r`, values)',
    ])
    const omittedFinalWhere = audit([
      '    const where = ["r.workspace_id=$1"]',
      '    where.push(liveSessionReadPredicate(request.actor, "r.session_id", "r.workspace_id", values))',
      '    const authorizedSql = `SELECT * FROM records r WHERE ${where.join(" AND ")}`',
      '    return paginator.query(db, request, request.query, {}, `SELECT * FROM records r`, values)',
    ])
    const connected = audit([
      '    const where = ["r.workspace_id=$1"]',
      '    where.push(liveSessionReadPredicate(request.actor, "r.session_id", "r.workspace_id", values))',
      '    return paginator.query(db, request, request.query, {}, `SELECT * FROM records r WHERE ${where.join(" AND ")}`, values)',
    ])

    expect(finalSqlConsumesAuthorization(deadVariable, '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(omittedFinalWhere, '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(connected, '/api/v1/example')).toBe(true)
  })

  it('rejects membership-only, unprotected OR, and unprotected UNION SQL', () => {
    const fixture = (sql: string): FinalSqlAudit => ({
      fileName: 'dominance-fixture.ts',
      source: [
        'function register(app: any, paginator: any, db: any) {',
        "  app.get('/api/v1/example', async (request: any) => {",
        '    const values: unknown[] = []',
        '    const liveAuthorization = liveSessionReadPredicate(request.actor, "r.session_id", "r.workspace_id", values)',
        `    return paginator.query(db, request, request.query, {}, ${sql}, values)`,
        '  })',
        '}',
      ].join('\n'),
      authorization: { calls: ['liveSessionReadPredicate'] },
      query: 'paginator',
    })

    const membershipOnly = fixture(
      '`SELECT * FROM records r WHERE EXISTS (SELECT 1 FROM memberships m WHERE m.team_id=r.team_id)`',
    )
    const unprotectedOr = fixture(
      '`SELECT * FROM records r WHERE ${liveAuthorization} OR r.visibility=\\\'workspace\\\'`',
    )
    const unprotectedUnion = fixture(
      '`SELECT * FROM records r WHERE ${liveAuthorization} UNION ALL SELECT * FROM records r`',
    )
    const protectedOr = fixture(
      '`SELECT * FROM records r WHERE ${liveAuthorization} AND (r.owner_id=$1 OR r.visibility=\\\'workspace\\\')`',
    )
    const protectedUnion = fixture(
      '`WITH visible AS (SELECT * FROM records UNION ALL SELECT * FROM records) SELECT * FROM visible r WHERE ${liveAuthorization}`',
    )

    expect(finalSqlConsumesAuthorization(membershipOnly, '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(unprotectedOr, '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(unprotectedUnion, '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(protectedOr, '/api/v1/example')).toBe(true)
    expect(finalSqlConsumesAuthorization(protectedUnion, '/api/v1/example')).toBe(true)
  })

  it('rejects a manual prepared-page query invoked before beforeQuery', () => {
    const helper = [
      'function loadContexts(db: any, current: any, page: any) {',
      '  const values = page.values',
      '  const liveAuthorization = liveSessionReadPredicate(current, "r.session_id", "r.workspace_id", values)',
      '  values.push(page.limit + 1)',
      '  return db.query(`SELECT * FROM repositories r WHERE ${liveAuthorization}${page.predicate ? ` AND ${page.predicate}` : ""} ORDER BY ${page.orderBy} LIMIT $${page.values.length}`, values)',
      '}',
    ]
    const fixture = (queryBeforeHook: boolean): FinalSqlAudit => ({
      fileName: 'manual-fixture.ts',
      source: [
        ...helper,
        'function register(app: any, paginator: any, db: any) {',
        "  app.get('/api/v1/example', async (request: any) => {",
        '    const page = paginator.prepare(request, request.query, {}, [])',
        ...(queryBeforeHook
          ? [
              '    const contexts = await loadContexts(db, request.actor, page)',
              '    await page.beforeQuery()',
            ]
          : [
              '    await page.beforeQuery()',
              '    const contexts = await loadContexts(db, request.actor, page)',
            ]),
        '    return page.finish(contexts.rows)',
        '  })',
        '}',
      ].join('\n'),
      authorization: { calls: ['liveSessionReadPredicate'] },
      query: 'manual-prepared',
    })

    expect(finalSqlConsumesAuthorization(fixture(true), '/api/v1/example')).toBe(false)
    expect(finalSqlConsumesAuthorization(fixture(false), '/api/v1/example')).toBe(true)
  })
})
