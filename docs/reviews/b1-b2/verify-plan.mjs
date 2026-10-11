import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const directory = 'docs/reviews/b1-b2/'
const read = path => readFileSync(resolve(root, path))
const json = path => JSON.parse(read(path).toString('utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })

try {
  const provenance = json(directory + 'plan-source.json')
  const snapshot = json(directory + 'source-snapshot.json')
  const coverage = json(directory + 'test-coverage.json')
  const inputs = json(directory + 'todo-inputs.json')
  const original = json('docs/reviews/r1/test-coverage.json')
  const legacy = json('docs/reviews/r1/legacy-requirements.json')
  const index = json('docs/plan/activation-task-specs/index.json')
  const current = provenance.currentPlan
  const task = index.tasks.find(row => row.seqNum === 5)
  const feature = original.features.find(row => row.seqNum === 5)
  assert.equal(provenance.todoId, 'ti53hOGbvnBNrvjXXveGO')
  assert.equal(current.id, 'm7WeSHWZt1Bv3FZwYlnlv')
  assert.equal(current.reference, 'doc:' + current.id)
  assert.equal(current.version, null)
  assert.equal(current.createdAt, null)
  assert.equal(current.updatedAt, null)
  assert.equal(current.newIdCreated, false)
  assert.equal(snapshot.source.docId, current.id)
  assert.equal(snapshot.source.docReference, current.reference)
  assert.equal(snapshot.source.version, null)
  assert.equal(snapshot.source.newPlanIdCreated, false)
  assert.equal(snapshot.source.kind, 'platform_full_plan_injection')
  assert.equal(current.toolFullReadback, false)
  assert.equal(snapshot.source.originToolFullReadback, false)
  assert.equal(hash(Buffer.from(snapshot.planBody, 'utf8')), current.sourceBodySha256)
  assert.equal(Buffer.byteLength(snapshot.planBody, 'utf8'), current.sourceBodyUtf8Bytes)
  const visiblePrefix = snapshot.todoReadback.split('\nSaved plan:\n')[1]?.split('\n…(truncated)')[0]
  assert.ok(visiblePrefix?.length)
  assert.ok(snapshot.todoReadback.endsWith('…(truncated)'))
  assert.ok(snapshot.planBody.startsWith(visiblePrefix))
  assert.equal(hash(Buffer.from(visiblePrefix, 'utf8')), current.toolVisiblePrefixSha256)
  assert.equal(Buffer.byteLength(visiblePrefix, 'utf8'), current.toolVisiblePrefixUtf8Bytes)
  assert.equal(current.toolVisiblePrefixMatches, true)
  const plan = read(current.readableFile)
  assert.equal(plan.toString('utf8'), snapshot.planBody.replace(/^[ \t]+$/gm, '') + '\n')
  assert.equal(hash(plan), current.readableFileSha256)
  assert.equal(plan.length, current.readableFileUtf8Bytes)
  assert.equal(snapshot.planBody.split('\n').filter(line => line !== '' && line.trim() === '').length, current.displayWhitespaceOnlyLines)
  assert.deepEqual(coverage.frozenSourceFeatures, original.features.filter(row => [5, 6, 20].includes(row.seqNum)))
  assert.deepEqual(coverage.legacySourceTasks, legacy.tasks.filter(row => ['B1', 'B2', 'B4'].includes(row.task)))
  assert.deepEqual(coverage.nineCategories, original.nineCategories)
  assert.deepEqual(coverage.dod.source, feature.originalDoD)
  assert.equal(feature.originalTests.length, 10)
  assert.equal(feature.matrix.length, 9)
  assert.equal(coverage.originalTestMappings.length, 10)
  assert.equal(coverage.categoryMappings.length, 9)
  for (const row of feature.originalTests) {
    const mapped = coverage.originalTestMappings.filter(mapping => mapping.sourceId === row.id)
    assert.equal(mapped.length, 1)
    assert.equal(mapped[0].sourceText, row.text)
    assert.equal(mapped[0].originalCaseName, row.caseName)
    assert.equal(mapped[0].result, '未运行')
    assert.ok(mapped[0].tests.length > 0)
    assert.ok(coverage.implementationMappings.some(checkpoint => checkpoint.originalTestIds.includes(row.id)))
  }
  for (const row of feature.matrix) {
    const mapped = coverage.categoryMappings.filter(mapping => mapping.category === row.category)
    assert.equal(mapped.length, 1)
    assert.equal(mapped[0].applicable, row.applicable)
    assert.equal(mapped[0].reason, row.reason)
    assert.equal(mapped[0].assertion, row.assertion)
    assert.equal(mapped[0].originalCaseName, row.caseName)
    assert.equal(mapped[0].result, row.applicable ? '未运行' : '不适用')
  }
  assert.equal(feature.matrix.filter(row => row.applicable).length, 7)
  for (const field of ['requires', 'requiresTodoIds', 'acceptanceRequires', 'blocks', 'blocksTodoIds']) {
    assert.deepEqual(coverage[field], task[field])
  }
  assert.equal(coverage.functionalResult, '未运行')
  assert.equal(coverage.dod.result, '未运行')
  assert.equal(coverage.dod.independentReview, '待审')
  assert.equal(coverage.dod.chiefConfirmation, null)
  assert.equal(provenance.authorization.implementationConfirmedByUser, true)
  assert.deepEqual(provenance.authorization.productChanges, [])
  assert.equal(provenance.authorization.independentPlanReview, '待审')
  assert.equal(provenance.authorization.chiefRelease, null)
  for (const status of Object.values(coverage.dod.platformAcceptance)) assert.equal(status, '未运行')
  assert.equal(inputs.atomicSnapshot, false)
  assert.equal(inputs.entries.length, 6)
  assert.equal(new Set(inputs.entries.map(row => row.id)).size, 6)
  for (const entry of inputs.entries) {
    const saved = provenance.taskSource.entries.find(row => row.id === entry.id)
    assert.ok(saved)
    assert.equal(saved.phase, entry.phase)
    assert.equal(saved.updatedAt, entry.updatedAt)
    assert.equal(saved.toolTruncated, entry.rawToolText.includes('…(truncated)'))
    assert.equal(saved.rawToolTextUtf8Sha256, hash(Buffer.from(entry.rawToolText, 'utf8')))
  }
  assert.equal(inputs.entries.find(row => row.id === provenance.todoId).rawToolText, snapshot.todoReadback)
  assert.equal(provenance.repository.branch, git('branch', '--show-current').toString().trim())
  const baseline = provenance.repository.worktreeHead
  assert.ok(/^[a-f0-9]{40}$/.test(baseline))
  const scope = new Set([...provenance.files.map(row => row.path), directory + 'plan-source.json', directory + 'checks.json'])
  const changed = git('diff', '--name-only', '-z', baseline).toString().split('\0').filter(Boolean)
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)
  assert.ok([...changed, ...untracked].every(path => scope.has(path)), '改动必须限定于此次文档交接文件')
  const staged = process.argv.includes('--staged')
  const committed = process.argv.includes('--committed')
  assert.ok(!(staged && committed))
  const blobChecks = []
  for (const row of provenance.files) {
    const bytes = read(row.path)
    assert.equal(bytes.length, row.bytes)
    assert.equal(hash(bytes), row.sha256)
    assert.ok(!/(?:wmp_|wmi_)[A-Za-z0-9_-]{43}/.test(bytes.toString('utf8')), '交接材料不得包含配对码或安装令牌')
    if (staged || committed) {
      const ref = staged ? ':' + row.path : 'HEAD:' + row.path
      const blob = git('show', ref)
      assert.equal(blob.length, row.bytes)
      assert.equal(hash(blob), row.sha256)
      blobChecks.push({ path: row.path, blobId: git('rev-parse', ref).toString().trim(), bytes: blob.length, sha256: hash(blob) })
    }
  }
  for (const row of provenance.frozenInputHashes) {
    assert.equal(read(row.path).length, row.worktreeBytes)
    assert.equal(hash(read(row.path)), row.worktreeSha256)
    const blob = git('show', baseline + ':' + row.path)
    assert.equal(blob.length, row.baseBlobBytes)
    assert.equal(hash(blob), row.baseBlobSha256)
    assert.equal(git('rev-parse', baseline + ':' + row.path).toString().trim(), row.baseBlobId)
    assert.equal(git('diff', '--name-only', baseline, '--', row.path).toString().trim(), '')
  }
  console.log(JSON.stringify({
    result: '交接材料静态校验通过；非功能验收、独审或Chief确认',
    currentPlanReference: current.reference,
    sourceBodySha256: current.sourceBodySha256,
    readableFileSha256: current.readableFileSha256,
    toolVisiblePrefix: '逐字符一致；工具尾部截断已记录',
    originalTests: '10/10完整保留并映射',
    categories: '9/9保留；7适用、2不适用',
    legacy: 'B1/B2/B4条款与任务5/6/20来源完整保留',
    productChanges: '无',
    functionalChecks: '未运行',
    gitBytes: staged ? '已核验实际index blob' : committed ? '已核验实际HEAD blob' : '本次核验工作树；可用--staged或--committed再核Git字节',
    blobChecks,
  }, null, 2))
} catch (error) {
  console.error('连接器方案交接校验失败：', error.message)
  process.exitCode = 1
}
