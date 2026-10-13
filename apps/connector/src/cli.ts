import { fileURLToPath } from 'node:url'
import { executeCli } from './execute-cli.js'
export { main, runClient, finishClientProcess, formatConnectionError, redactChildOutput } from './commands.js'

if (process.argv[1] === fileURLToPath(import.meta.url)) executeCli()
