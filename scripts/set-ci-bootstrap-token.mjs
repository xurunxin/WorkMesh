import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'

const allowedScopes = new Set([
  'source-gates',
  'db-integration',
  'api-integration',
  'worker-integration',
  'e2e',
])
const scope = process.argv[2]
const commit = process.env.GITHUB_SHA
const environmentFile = process.env.GITHUB_ENV

if (process.argv.length !== 3 || !scope || !allowedScopes.has(scope))
  throw new Error('The CI bootstrap scope is not allowed')
if (!commit || !/^[0-9a-f]{40}$/i.test(commit))
  throw new Error('GITHUB_SHA must contain the checked-out commit')
if (!environmentFile)
  throw new Error('GITHUB_ENV is required')

const token = createHash('sha256')
  .update('workmesh:ci-bootstrap-test-only:v1\0')
  .update(scope)
  .update('\0')
  .update(commit)
  .digest('base64url')

const paginationKey = createHash('sha256')
  .update('workmesh:ci-pagination-test-only:v1\0')
  .update(scope)
  .update('\0')
  .update(commit)
  .digest('base64url')

appendFileSync(
  environmentFile,
  [
    `WORKMESH_BOOTSTRAP_TOKEN=${token}`,
    `PAGINATION_CURSOR_KEYS=ci:${paginationKey}`,
    'PAGINATION_CURSOR_ACTIVE_KID=ci',
    '',
  ].join('\n'),
  'utf8',
)
