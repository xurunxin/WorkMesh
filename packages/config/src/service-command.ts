/** Lite dispatch starts backend roles from their separate runtime trees. */

/** Roles this image can start. MCP and the Agent Runner are deliberately absent. */
export const liteServiceRoles = ['api', 'worker', 'migrate'] as const

export type LiteServiceRole = (typeof liteServiceRoles)[number]

export type LiteServiceCommand = Readonly<{
  role: LiteServiceRole
  entry: string
  cwd: string
}>

/** Root of the runtime trees installed by `infra/docker/lite.Dockerfile`. */
export const liteServiceRoot = '/opt/workmesh'

export const liteServiceCommands: Readonly<Record<LiteServiceRole, LiteServiceCommand>> =
  Object.freeze({
    // The API tree carries @workmesh/db as a workspace dependency, so the
    // migration role reuses it instead of adding a fourth deploy tree.
    migrate: Object.freeze({
      role: 'migrate',
      entry: `${liteServiceRoot}/api/node_modules/@workmesh/db/dist/scripts/migrate.js`,
      cwd: `${liteServiceRoot}/api`,
    }),
    api: Object.freeze({
      role: 'api',
      entry: `${liteServiceRoot}/api/dist/server.js`,
      cwd: `${liteServiceRoot}/api`,
    }),
    worker: Object.freeze({
      role: 'worker',
      entry: `${liteServiceRoot}/worker/dist/index.js`,
      cwd: `${liteServiceRoot}/worker`,
    }),
  })

/** Roles that exist in WorkMesh but are not part of the Lite image. */
const rolesProvidedElsewhere = ['mcp', 'agent-runner'] as const

export const unknownServiceRoleExitCode = 64

export class UnknownServiceRoleError extends Error {
  readonly code = 'WORKMESH_SERVICE_UNKNOWN'

  constructor(readonly service: string | undefined) {
    super(
      service
        ? `WORKMESH_SERVICE must be one of ${liteServiceRoles.join(', ')}; received ${service}`
        : `WORKMESH_SERVICE is required and must be one of ${liteServiceRoles.join(', ')}`,
    )
    this.name = 'UnknownServiceRoleError'
  }

  /**
   * A role that exists in the product but not in this image is a different
   * mistake from a typo, and pointing an operator at the image that does carry
   * it is more useful than listing valid values again.
   */
  get isRoleProvidedElsewhere(): boolean {
    return rolesProvidedElsewhere.some((role) => role === this.service)
  }
}

export const isLiteServiceRole = (service: string | undefined): service is LiteServiceRole =>
  liteServiceRoles.some((role) => role === service)

/**
 * Resolves the role to run. Fails closed: an unset or unrecognised
 * `WORKMESH_SERVICE` throws rather than falling back to a default role, because
 * silently starting the API where an operator expected the Worker is worse than
 * not starting.
 */
export const resolveServiceCommand = (
  environment: Readonly<{ WORKMESH_SERVICE?: string | undefined }> = {},
): LiteServiceCommand => {
  const service = environment.WORKMESH_SERVICE
  const command = isLiteServiceRole(service) ? liteServiceCommands[service] : undefined
  if (!command) throw new UnknownServiceRoleError(service)
  return command
}
