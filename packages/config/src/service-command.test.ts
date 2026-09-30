import { describe, expect, it } from 'vitest'
import {
  isLiteServiceRole,
  liteServiceCommands,
  liteServiceRoles,
  liteServiceRoot,
  resolveServiceCommand,
  UnknownServiceRoleError,
  unknownServiceRoleExitCode,
} from './service-command.js'

// The entry points are pinned rather than derived. `infra/docker/lite.Dockerfile`
// installs the runtime trees and nothing else validates that these paths still
// exist inside the image, so a layout change there has to fail here first.
const expected = {
  api: { role: 'api', entry: '/opt/workmesh/api/dist/server.js', cwd: '/opt/workmesh/api' },
  worker: {
    role: 'worker',
    entry: '/opt/workmesh/worker/dist/index.js',
    cwd: '/opt/workmesh/worker',
  },
  web: {
    role: 'web',
    entry: '/opt/workmesh/web/apps/web/server.js',
    cwd: '/opt/workmesh/web',
  },
  migrate: {
    role: 'migrate',
    entry: '/opt/workmesh/api/node_modules/@workmesh/db/dist/scripts/migrate.js',
    cwd: '/opt/workmesh/api',
  },
} as const

describe('lite service dispatch', () => {
  it('covers exactly the four roles the image installs', () => {
    expect([...liteServiceRoles].sort()).toEqual(['api', 'migrate', 'web', 'worker'])
    expect(Object.keys(liteServiceCommands).sort()).toEqual([...liteServiceRoles].sort())
  })

  for (const role of liteServiceRoles) {
    it(`resolves ${role} to its pinned entry point and working directory`, () => {
      expect(resolveServiceCommand({ WORKMESH_SERVICE: role })).toEqual(expected[role])
    })
  }

  it('fails closed when the service is unset', () => {
    expect(() => resolveServiceCommand({})).toThrow(UnknownServiceRoleError)
    expect(() => resolveServiceCommand({})).toThrow(/WORKMESH_SERVICE is required/)
  })

  it('fails closed on an unrecognised service instead of defaulting to a role', () => {
    expect(() => resolveServiceCommand({ WORKMESH_SERVICE: 'apiy' })).toThrow(
      /must be one of api, worker, web, migrate/,
    )
  })

  it('separates a typo from a role that this image does not carry', () => {
    const typo = new UnknownServiceRoleError('worker-typo')
    const elsewhere = new UnknownServiceRoleError('mcp')
    expect(typo.isRoleProvidedElsewhere).toBe(false)
    expect(elsewhere.isRoleProvidedElsewhere).toBe(true)
    expect(typo.code).toBe('WORKMESH_SERVICE_UNKNOWN')
  })

  it('exposes a distinct exit code so a bad role is diagnosable from a log', () => {
    expect(unknownServiceRoleExitCode).toBe(64)
  })

  it('keeps every entry point absolute and inside the runtime root', () => {
    for (const role of liteServiceRoles) {
      const command = liteServiceCommands[role]
      expect(command.entry.startsWith(`${liteServiceRoot}/`)).toBe(true)
      expect(command.cwd.startsWith(`${liteServiceRoot}/`)).toBe(true)
    }
  })

  it('runs the migration role from the API tree, so no fourth tree is installed', () => {
    // @workmesh/db is a workspace dependency of the API, which is why the
    // migration entry point lives inside the API tree.
    expect(liteServiceCommands.migrate.entry).toContain(
      `${liteServiceRoot}/api/node_modules/@workmesh/db/`,
    )
    expect(liteServiceCommands.migrate.cwd).toBe(liteServiceCommands.api.cwd)
  })

  it('starts the Web role from the standalone root, not the API tree', () => {
    // Next.js standalone resolves .next/static and public from the working
    // directory. A wrong cwd starts cleanly and then 404s every asset.
    expect(liteServiceCommands.web.cwd).toBe(`${liteServiceRoot}/web`)
    expect(liteServiceCommands.web.entry).toBe(
      `${liteServiceRoot}/web/apps/web/server.js`,
    )
  })

  it('recognises exactly the roles it can start', () => {
    for (const role of liteServiceRoles) expect(isLiteServiceRole(role)).toBe(true)
    for (const role of ['mcp', 'agent-runner', '', 'API', undefined]) {
      expect(isLiteServiceRole(role)).toBe(false)
    }
  })
})
