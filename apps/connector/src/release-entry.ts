import { getAsset } from 'node:sea'
import { executeCli } from './execute-cli.js'

if (process.argv.length === 3 && process.argv[2] === '--version') {
  process.stdout.write(getAsset('release.json', 'utf8'))
} else executeCli()
