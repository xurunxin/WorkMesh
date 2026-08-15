import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const candidateRoot = resolve('G:/Projects/MetronX/WorkMesh-human-experience-v31')
const webRoot = join(candidateRoot, 'apps/web')
const standaloneRoot = join(webRoot, '.next/standalone')
const sha = value => createHash('sha256').update(value).digest('hex')
const rel = (root, path) => relative(root, path).split(sep).join('/')
const fileSha = path => sha(readFileSync(path))
const excluded = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo', 'coverage', 'reports', '.cache', '.tmp'])
function walk(root, skip = new Set()) {
  const files = []
  const visit = dir => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue
      const absolute = join(dir, name)
      const stat = lstatSync(absolute)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) visit(absolute)
      else if (stat.isFile() && !name.endsWith('.log')) files.push({ path: rel(root, absolute), absolute })
    }
  }
  visit(root)
  return files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
}
const canonical = (files, transform = value => value) => sha(files.map(file => `${file.path}\t${sha(transform(readFileSync(file.absolute)))}\n`).join(''))
const preview = Buffer.from('http://127.0.0.1:34601')
const active = Buffer.from('http://127.0.0.1:3301')
const countBytes = (value, needle) => {
  let total = 0
  let offset = 0
  while ((offset = value.indexOf(needle, offset)) !== -1) {
    total++
    offset += needle.length
  }
  return total
}
const transform = value => {
  const chunks = []
  let start = 0
  let match = value.indexOf(preview, start)
  while (match !== -1) {
    chunks.push(value.subarray(start, match), active)
    start = match + preview.length
    match = value.indexOf(preview, start)
  }
  chunks.push(value.subarray(start))
  return Buffer.concat(chunks)
}
const count = (files, needle) => files.reduce((total, file) => total + countBytes(readFileSync(file.absolute), needle), 0)
const source = walk(candidateRoot, excluded)
const all = walk(candidateRoot, new Set(['.git', 'node_modules']))
const build = all.filter(file => file.path === 'apps/web/.next/BUILD_ID' || /^apps\/web\/\.next\/(server|static)\//.test(file.path))
const standalone = walk(standaloneRoot)
const packagePaths = ['package.json', 'pnpm-lock.yaml', 'apps/web/package.json', 'apps/mcp/package.json', 'packages/contracts/package.json', 'packages/ui/package.json']
const result = {
  artifactVersion: 1,
  kind: 'DogfoodV31ActivationCandidateVerification',
  result: 'PASS',
  source: { fileCount: source.length, canonicalSha256: canonical(source) },
  build: { fileCount: build.length, canonicalSha256: canonical(build), buildId: readFileSync(join(webRoot, '.next/BUILD_ID'), 'utf8').trim() },
  standalone: {
    fileCount: standalone.length,
    canonicalSha256: canonical(standalone),
    preparedCanonicalSha256: canonical(standalone, transform),
    previewOriginCount: count(standalone, preview),
    activeOriginCountAfterTransform: standalone.reduce((total, file) => total + countBytes(transform(readFileSync(file.absolute)), active), 0)
  },
  packages: Object.fromEntries(packagePaths.map(path => [path, fileSha(join(candidateRoot, path))]))
}
if (result.source.fileCount !== 583 || result.source.canonicalSha256 !== 'dcbce0e8010f065482bff53208bf220192ae8f1ea2588964623470444a72f5a8') result.result = 'BLOCK'
if (result.build.fileCount !== 118 || result.build.canonicalSha256 !== 'b1c614df34a603149ebe9a343190bc21d143fc4a305fd0ae845821db2a29ad05' || result.build.buildId !== 'Yj0IS_0CtW-lStIuWIemm') result.result = 'BLOCK'
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result.result !== 'PASS') process.exitCode = 2
