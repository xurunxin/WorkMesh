import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { routePolicyManifest, secretReplayOperationIds } from '@workmesh/contracts'

const agentSecretProperties = new Set([
  'exchangeToken',
  'installation_token',
  'secret',
  'sessionToken',
])
const authSecretProperties = new Set([
  ...agentSecretProperties,
  'cookie',
  'csrf_token',
  'csrfToken',
  'token',
])

type FunctionInventory = {
  callArgumentProperties: Map<string, Set<string>>
  name: string
  producesSecretResponse: boolean
  calls: Set<string>
  returnExpressions: ts.Expression[]
}

type AuthRouteInventory = {
  operation: string | undefined
  path: string
  producesSecretResponse: boolean
  calls: Set<string>
}

const parse = (source: string, fileName = 'fixture.ts'): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const propertyName = (name: ts.PropertyName | undefined): string | undefined => {
  if (!name) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))
    return name.text
  return undefined
}

const callName = (expression: ts.Expression): string | undefined => {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

const variableInitializers = (root: ts.Node): Map<string, ts.Expression> => {
  const found = new Map<string, ts.Expression>()
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      found.set(node.name.text, node.initializer)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

const ownReturnExpressions = (body: ts.ConciseBody): ts.Expression[] => {
  if (!ts.isBlock(body)) return [body]
  const returns: ts.Expression[] = []
  const visit = (node: ts.Node): void => {
    if (node !== body && ts.isFunctionLike(node)) return
    if (ts.isReturnStatement(node) && node.expression) {
      returns.push(node.expression)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return returns
}

function bodyProducesSecretResponse(
  body: ts.ConciseBody,
  secretProperties: ReadonlySet<string>,
): boolean {
  const variables = variableInitializers(body)
  return ownReturnExpressions(body).some(expression =>
    expressionHasSecretProperty(expression, secretProperties, variables))
}

function expressionHasSecretProperty(
  expression: ts.Expression,
  secretProperties: ReadonlySet<string>,
  variables: ReadonlyMap<string, ts.Expression>,
  seen = new Set<ts.Node>(),
): boolean {
  if (seen.has(expression)) return false
  seen.add(expression)
  if (ts.isIdentifier(expression)) {
    const initializer = variables.get(expression.text)
    return initializer
      ? expressionHasSecretProperty(initializer, secretProperties, variables, seen)
      : false
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    const initializer = variables.get(expression.expression.text)
    return initializer
      ? expressionHasSecretProperty(initializer, secretProperties, variables, seen)
      : false
  }
  if (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isAwaitExpression(expression)
  )
    return expressionHasSecretProperty(expression.expression, secretProperties, variables, seen)

  if (ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      const name = propertyName(property.name)
      if (name && secretProperties.has(name)) return true
      if (
        ts.isPropertyAssignment(property)
        && expressionHasSecretProperty(property.initializer, secretProperties, variables, seen)
      )
        return true
      if (ts.isShorthandPropertyAssignment(property)) {
        const initializer = variables.get(property.name.text)
        if (
          initializer
          && expressionHasSecretProperty(initializer, secretProperties, variables, seen)
        )
          return true
      }
      if (
        ts.isSpreadAssignment(property)
        && expressionHasSecretProperty(property.expression, secretProperties, variables, seen)
      )
        return true
    }
    return false
  }
  if (ts.isArrayLiteralExpression(expression))
    return expression.elements.some(element =>
      ts.isExpression(element)
      && expressionHasSecretProperty(element, secretProperties, variables, seen))
  if (ts.isConditionalExpression(expression))
    return expressionHasSecretProperty(expression.whenTrue, secretProperties, variables, seen)
      || expressionHasSecretProperty(expression.whenFalse, secretProperties, variables, seen)
  if (ts.isCallExpression(expression))
    return expression.arguments.some(argument => {
      if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
        return bodyProducesSecretResponse(argument.body, secretProperties)
      // Literal request/config objects are inputs, not evidence about a call's
      // returned value. Identifier/call arguments can carry an intermediate
      // replay envelope through response adapters such as applyAuthEnvelope.
      return !ts.isObjectLiteralExpression(argument)
        && expressionHasSecretProperty(argument, secretProperties, variables, seen)
    })
  return false
}

const inspectFunction = (
  name: string,
  body: ts.ConciseBody,
  secretProperties: ReadonlySet<string>,
): FunctionInventory => {
  const calls = new Set<string>()
  const callArgumentProperties = new Map<string, Set<string>>()
  const returnExpressions = ownReturnExpressions(body)
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression)
      if (name) {
        calls.add(name)
        const properties = callArgumentProperties.get(name) ?? new Set<string>()
        const findProperties = (argumentNode: ts.Node): void => {
          if (ts.isObjectLiteralExpression(argumentNode))
            for (const property of argumentNode.properties) {
              const name = propertyName(property.name)
              if (name) properties.add(name)
            }
          ts.forEachChild(argumentNode, findProperties)
        }
        for (const argument of node.arguments) findProperties(argument)
        callArgumentProperties.set(name, properties)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return {
    callArgumentProperties,
    name,
    producesSecretResponse: bodyProducesSecretResponse(body, secretProperties),
    calls,
    returnExpressions,
  }
}

const hasExportModifier = (node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean =>
  node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false

const exportedFunctions = (
  source: string,
  fileName = 'commands.ts',
): Map<string, FunctionInventory> => {
  const file = parse(source, fileName)
  const found = new Map<string, FunctionInventory>()
  for (const statement of file.statements) {
    if (
      ts.isFunctionDeclaration(statement)
      && statement.name
      && statement.body
      && hasExportModifier(statement)
    )
      found.set(
        statement.name.text,
        inspectFunction(statement.name.text, statement.body, agentSecretProperties),
      )
  }
  return found
}

const resolveObjectLiteral = (
  expression: ts.Expression | undefined,
  variables: ReadonlyMap<string, ts.Expression>,
): ts.ObjectLiteralExpression | undefined => {
  if (!expression) return undefined
  if (ts.isObjectLiteralExpression(expression)) return expression
  if (ts.isIdentifier(expression))
    return resolveObjectLiteral(variables.get(expression.text), variables)
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression))
    return resolveObjectLiteral(expression.expression, variables)
  return undefined
}

const stringProperty = (
  object: ts.ObjectLiteralExpression | undefined,
  expectedName: string,
): string | undefined => {
  const property = object?.properties.find(candidate =>
    ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === expectedName)
  if (!property || !ts.isPropertyAssignment(property)) return undefined
  return ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined
}

const authRoutes = (source: string, fileName = 'server.ts'): AuthRouteInventory[] => {
  const file = parse(source, fileName)
  const routes: AuthRouteInventory[] = []
  const visit = (node: ts.Node): void => {
    const routeArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'post'
      && routeArgument
      && ts.isStringLiteralLike(routeArgument)
      && routeArgument.text.startsWith('/api/v1/auth/')
    ) {
      const callback = [...node.arguments].reverse().find(argument =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const inspected = inspectFunction(routeArgument.text, callback.body, authSecretProperties)
        const variables = variableInitializers(callback.body)
        let operation: string | undefined
        const findOperation = (candidate: ts.Node): void => {
          if (
            operation === undefined
            && ts.isCallExpression(candidate)
            && callName(candidate.expression) === 'authIdempotentTransaction'
          )
            operation = stringProperty(resolveObjectLiteral(candidate.arguments[1], variables), 'operation')
          ts.forEachChild(candidate, findOperation)
        }
        findOperation(callback.body)
        routes.push({
          operation,
          path: routeArgument.text,
          producesSecretResponse:
            inspected.calls.has('createHumanSessionEnvelope')
            || inspected.producesSecretResponse,
          calls: inspected.calls,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return routes
}

describe('secret-aware auth mutation inventory analyzer', () => {
  it('discovers multiline and intermediate-variable secret returns', () => {
    const functions = exportedFunctions(`
      export async function multiline() {
        return {
          sessionToken: "issued-token",
        }
      }
      export async function intermediate() {
        const response = {
          secret: "issued-secret",
        }
        return response
      }
      export async function ordinary() {
        const secret = "internal-only"
        return { ok: true }
      }
    `)
    expect([...functions.values()]
      .filter(candidate => candidate.producesSecretResponse)
      .map(candidate => candidate.name)
      .sort()).toEqual(['intermediate', 'multiline'])
  })

  it('discovers formatted auth route calls and variable-backed replay metadata', () => {
    const routes = authRoutes(`
      app
        .post(
          "/api/v1/auth/fixture",
          async () => {
            const replay = {
              operation: "fixtureOperation",
            }
            return authIdempotentTransaction(
              db,
              replay,
              async () => {
                const response = {
                  cookie: {
                    action: "clear",
                  },
                }
                return response
              },
            )
          },
        )
      app.post(
        "/api/v1/auth/token-fixture",
        async () => {
          const result = await authIdempotentTransaction(
            db,
            { operation: "tokenFixtureOperation" },
            async () => {
              const body = {
                token: "issued-token",
              }
              return { status: 200, body }
            },
          )
          return result
        },
      )
    `)
    expect(routes).toEqual([
      expect.objectContaining({
        operation: 'fixtureOperation',
        path: '/api/v1/auth/fixture',
        producesSecretResponse: true,
      }),
      expect.objectContaining({
        operation: 'tokenFixtureOperation',
        path: '/api/v1/auth/token-fixture',
        producesSecretResponse: true,
      }),
    ])
    expect(routes[0]!.calls).toContain('authIdempotentTransaction')
    expect(routes[1]!.calls).toContain('authIdempotentTransaction')
  })
})

describe('secret-aware auth mutation inventory', () => {
  it('discovers every known secret-producing response and binds it to encrypted replay', async () => {
    const server = await readFile(new URL('./server.ts', import.meta.url), 'utf8')
    const agentConnections = await readFile(new URL('./agent-connections.ts', import.meta.url), 'utf8')
    const commands = await readFile(new URL('./agent/commands.ts', import.meta.url), 'utf8')
    const commandOperation = new Map([
      ['registerAgent', 'registerAgent'],
      ['rotateWebhookSecret', 'rotateAgentWebhookSecret'],
      ['claimWorkItem', 'claimWorkItem'],
      ['exchangeAgentToken', 'exchangeAgentSessionToken'],
      ['refreshAgentToken', 'refreshAgentSessionToken'],
    ])
    const functions = exportedFunctions(commands)
    const discoveredCommands = [...functions.values()]
      .filter(candidate => candidate.producesSecretResponse)
      .map(candidate => candidate.name)
      .sort()
    expect(discoveredCommands).toEqual([...commandOperation.keys()].sort())
    for (const name of discoveredCommands) {
      const command = functions.get(name)!
      expect(
        command.calls.has('secretAgentMutate')
          || command.calls.has('authIdempotentTransaction'),
        `${name} must use encrypted auth replay`,
      ).toBe(true)
      expect(command.calls, name).not.toContain('agentMutate')
    }

    const discoveredAuthRoutes = authRoutes(server)
      .filter(route => route.producesSecretResponse)
    expect(discoveredAuthRoutes.map(route => route.operation))
      .toEqual(['installWorkspace', 'login', 'logout'])
    for (const route of discoveredAuthRoutes) {
      expect(route.calls, route.path).toContain('authIdempotentTransaction')
      expect(route.calls, route.path).not.toContain('mutate')
    }

    const marked = routePolicyManifest
      .filter(route => route.secretReplay === 'encrypted_auth')
      .map(route => route.operationId)
      .sort()
    const discovered = [
      ...discoveredAuthRoutes.map(route => route.operation),
      ...discoveredCommands.map(name => commandOperation.get(name)),
      ...(agentConnections.includes("operation: 'redeemAgentConnection'")
        && agentConnections.includes('authIdempotentTransaction')
        ? ['redeemAgentConnection'] : []),
    ].filter((operation): operation is string => Boolean(operation)).sort()
    expect(marked).toEqual(discovered)
    expect([...secretReplayOperationIds].sort()).toEqual(discovered)
  })

  it('keeps the retry-session exchange code only at the intentional webhook boundary', async () => {
    const commands = await readFile(new URL('./agent/commands.ts', import.meta.url), 'utf8')
    const retry = exportedFunctions(commands).get('retrySession')
    expect(retry).toBeDefined()
    expect(retry!.calls).toContain('queueWebhookDeliveries')
    expect(retry!.producesSecretResponse).toBe(false)
    expect(retry!.callArgumentProperties.get('queueWebhookDeliveries'))
      .toContain('exchangeToken')
  })
})
