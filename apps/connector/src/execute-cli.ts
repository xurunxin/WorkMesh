import { main, finishClientProcess, formatConnectionError, redactChildOutput } from './commands.js'
import { safeError } from './errors.js'

export function executeCli(): void {
  main().then(async () => {
    if (process.argv[2] === 'run') await finishClientProcess(Number(process.exitCode ?? 0))
  }).catch(error => {
    const output = redactChildOutput(text => process.stderr.write(text))
    output.push(formatConnectionError(safeError(error))); output.finish()
    process.exitCode = 1
  })
}
