import { spawn } from 'node:child_process'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Lite image entrypoint.
//
// `WORKMESH_SERVICE` decides what starts, because one image carries four roles.
// An explicit command still wins, so a one-off task in the same container (a
// migration with a flag, a shell) does not need a second image.
//
// This file lives inside the API tree and imports the dispatch table through the
// package entry point the deploy tree provides. There is deliberately no source
// fallback: workspace packages ship NodeNext-style `.js` specifiers that point at
// TypeScript files, so loading them outside a built tree fails in a way that says
// nothing useful. The table itself is covered by unit tests, and this file is
// covered by running the image.

const importDispatch = async () => {
  try {
    return await import('@workmesh/config')
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    throw new Error(
      `the dispatch table is unreachable (${error.message}); this file must run inside the Lite image`,
    )
  }
}

const forwardedSignals = ['SIGTERM', 'SIGINT', 'SIGQUIT']

const run = (file, args, options) =>
  new Promise((resolve) => {
    const child = spawn(file, args, { stdio: 'inherit', ...options })
    for (const signal of forwardedSignals) {
      process.on(signal, () => {
        if (!child.killed) child.kill(signal)
      })
    }
    child.on('error', (error) => {
      process.stderr.write(`[workmesh-lite] failed to start ${file}: ${error.message}\n`)
      process.exit(70)
    })
    child.on('exit', (code, signal) => {
      if (signal) {
        // Re-raise so the container records the signal rather than a bare code.
        process.kill(process.pid, signal)
        return
      }
      resolve(code ?? 0)
    })
  })

const explicit = process.argv.slice(2)
if (explicit.length > 0) {
  process.exit(await run(explicit[0], explicit.slice(1), {}))
}

const { resolveServiceCommand, unknownServiceRoleExitCode } = await importDispatch()
let command
try {
  command = resolveServiceCommand(process.env)
} catch (error) {
  process.stderr.write(`[workmesh-lite] ${error.message}\n`)
  if (error?.isRoleProvidedElsewhere)
    process.stderr.write(
      '[workmesh-lite] that role runs from its own image, not from the Lite image\n',
    )
  process.exit(unknownServiceRoleExitCode)
}

process.stderr.write(
  `[workmesh-lite] role=${command.role} entry=${command.entry} cwd=${command.cwd}\n`,
)
process.exit(await run(process.execPath, [command.entry], { cwd: command.cwd }))
