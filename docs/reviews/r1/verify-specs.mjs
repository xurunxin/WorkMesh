import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { readRawEvidenceArchive, resolveEvidenceBytes } from '../../../scripts/verify-raw-evidence-archive.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const json = path => JSON.parse(read(path))
const hash = value => createHash('sha256').update(value).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const directory = 'docs/reviews/r1/'
const first = json(directory + 'execution-inputs.json')
const latest = json(directory + 'pre-review-inputs.json')
const index = json('docs/plan/activation-task-specs/index.json')
const coverage = json(directory + 'test-coverage.json')
const contracts = json(directory + 'task-contracts.json')

try {
  for (const snapshot of [first, latest]) {
    assert.equal(snapshot.atomicSnapshot, false)
    assert.equal(snapshot.cards.length, 29)
    assert.equal(new Set(snapshot.cards.map(c => c.id)).size, 29)
    assert.deepEqual(snapshot.cards.map(c => c.seqNum).sort((a, b) => a - b), Array.from({ length: 29 }, (_, i) => i + 1))
    for (const card of snapshot.cards) {
      assert.equal(card.completeSpec, true, `#${card.seqNum} 正文不完整`)
      assert.equal(hash(Buffer.from(card.spec, 'utf8')), card.specSha256)
      assert.equal(hash(Buffer.from(card.rawToolText, 'utf8')), card.rawToolTextSha256)
      assert.ok(card.rawToolText.includes('Updated: ' + card.updatedAt))
      assert.ok(card.rawToolText.includes('Phase: ' + card.phase))
      const spec = card.rawToolText.split('\nSpec:\n')[1]?.split('\nSaved plan:\n')[0]
      assert.equal(spec, card.spec, `#${card.seqNum} 工具正文与保存字符串不一致`)
      assert.ok(card.requestedAt && card.receivedAt)
    }
  }
  assert.equal(index.withPlan, true)
  assert.equal(index.tasks.length, 29)
  const bySeq = new Map(index.tasks.map(t => [t.seqNum, t]))
  const seen = new Set(), visiting = new Set()
  function visit(number) {
    assert.ok(!visiting.has(number), '实现/最终验收依赖形成环：' + number)
    if (seen.has(number)) return
    visiting.add(number)
    for (const dep of [...bySeq.get(number).requires, ...bySeq.get(number).acceptanceRequires]) {
      assert.ok(bySeq.has(dep))
      visit(dep)
    }
    visiting.delete(number); seen.add(number)
  }
  for (const task of index.tasks) {
    visit(task.seqNum)
    assert.equal(task.withPlan, true)
    assert.equal(hash(readFileSync(resolve(root, task.path))), task.specSha256)
    assert.equal(task.todoId, latest.cards.find(c => c.seqNum === task.seqNum).id)
    assert.deepEqual(task.requiresTodoIds, task.requires.map(n => bySeq.get(n).todoId))
    assert.deepEqual(task.acceptanceRequiresTodoIds, task.acceptanceRequires.map(n => bySeq.get(n).todoId))
    assert.deepEqual(task.blocksTodoIds, task.blocks.map(n => bySeq.get(n).todoId))
    for (const n of task.requires) assert.ok(bySeq.get(n).blocks.includes(task.seqNum), `#${n} 缺少blocks #${task.seqNum}`)
    if (!['done', 'closed'].includes(task.phase)) {
      assert.ok(read(task.path).includes('withPlan: true'))
      assert.ok(task.owner)
      for (const stage of task.stages ?? []) assert.ok(stage.owner && stage.input && stage.output && stage.acceptance)
    }
  }
  assert.ok(!bySeq.get(28).requires.includes(29))
  assert.ok(!bySeq.get(27).requires.includes(29))
  assert.ok(bySeq.get(29).requires.includes(28))
  assert.ok(bySeq.get(29).acceptanceRequires.includes(27))
  assert.ok(!Object.values(contracts.tasks).some(t => t.requires.includes(4)), 'S1不得作为实现前置')
  assert.equal(coverage.features.length, 29)
  let applicable = 0, historicalTests = 0
  for (const feature of coverage.features) {
    assert.deepEqual(feature.matrix.map(m => m.category), coverage.nineCategories)
    const assertions = feature.matrix.filter(m => m.applicable).map(m => m.assertion)
    assert.equal(new Set(assertions).size, assertions.length, `#${feature.seqNum} 复制整段代替类别断言`)
    for (const row of feature.matrix) {
      assert.ok(row.reason)
      if (row.applicable) {
        applicable++
        assert.ok(row.assertion?.length > 8 && row.file && row.owner && row.caseName)
        if (row.fileState.startsWith('现有')) assert.ok(existsSync(resolve(root, row.file)), row.file)
      } else assert.equal(row.assertion, null)
    }
    const source = first.cards.find(c => c.seqNum === feature.seqNum)
    const checks = [...source.spec.matchAll(/^\s*- \[([ xX])\] (.+)$/gm)]
    assert.equal(feature.originalTests.length, checks.length, `#${feature.seqNum} 原测试遗漏`)
    checks.forEach((check, i) => {
      const original = feature.originalTests[i]
      assert.equal(original.text, check[2]); assert.equal(original.originalChecked, check[1].toLowerCase() === 'x')
      assert.ok(bySeq.has(original.target)); assert.equal(original.targetTodoId, bySeq.get(original.target).todoId)
      assert.ok(original.owner && original.disposition)
      assert.ok(original.matrixCases?.length || original.coverageReason)
      historicalTests++
    })
    for (const dod of feature.originalDoD) {
      assert.equal(hash(dod.text), dod.sha256)
      assert.ok(source.spec.includes(dod.text)); assert.ok(dod.owner && dod.acceptance)
    }
  }
  for (const task of json(directory + 'legacy-requirements.json').tasks) {
    assert.equal(hash(task.originalSection), task.sha256)
    for (const clause of task.clauses) {
      assert.equal(hash(clause.text), clause.sha256)
      assert.ok(task.originalSection.includes(clause.text))
      assert.ok(clause.disposition && clause.targets.every(n => bySeq.has(n)))
    }
  }
  const frozen = json(directory + 'historical-plan-excerpts.json')
  const mainPlan = read(frozen.path).replaceAll('\r\n', '\n')
  for (const name of ['p1', 'd0']) {
    assert.equal(hash(frozen[name].text), frozen[name].sha256)
    assert.ok(mainPlan.includes(frozen[name].text), `冻结${name}段改变`)
  }
  const old37 = git('show', `${index.baseCommit}:docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md`)
  const historicalClaim = old37.match(/The one-time claim[\s\S]+?protocol and audit decision\./)?.[0]
  assert.ok(historicalClaim && read('docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md').replaceAll('\r\n', '\n').includes(historicalClaim))
  for (const state of json(directory + 'adr-states.json')) {
    const body = read(state.path)
    assert.equal(hash(body.replaceAll('\r\n', '\n')), state.sha256)
    assert.ok(body.match(new RegExp('Status(?:\\*\\*)?(?:\\s*:\\s*|\\s*\\n\\s*)' + state.status, 'i')))
  }
  const capabilities = [...read('packages/contracts/src/agent-response.ts').match(/capabilitySchema = z.enum\(\[([\s\S]+?)\]\)/)[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  assert.equal(capabilities.length, 17)
  const adr78 = read('docs/adr/0078-designated-coordinating-chief-over-an-agent-graph.md')
  for (const capability of capabilities) assert.ok(adr78.includes(capability), capability)
  assert.ok(!/授权绑定[^\n]*独立去重/.test(read('docs/plan/activation-task-specs/27.md')))
  const protectedPaths = ['apps', 'packages', 'scripts', '.github', 'turbo.json', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'CONTEXT.md', 'docs/evidence', 'docs/references']
  assert.equal(git('diff', '--name-only', index.baseCommit, '--', ...protectedPaths).trim(), '', '本R1不修改产品/CI/G1原件')
  const historicalPaths = ['plan.md', 'todo-inputs.json', 'r1-spec-source.md', 'r1-spec-source.json', 'main-inputs.json', 'plan-review-response.md', 'checks.md', 'handoff-manifest.json', 'verify-handoff.mjs'].map(p => directory + p)
  assert.equal(git('diff', '--name-only', '1e1659974a3ade1eedd46bdf0ffb0899a93ec715', '--', ...historicalPaths).trim(), '', '历史规划/截断来源被改写')
  const evidenceIndex = json(directory + 'execution-logs/raw-checks-index.json')
  const archive = readRawEvidenceArchive(evidenceIndex, readFileSync(resolve(root, directory + 'execution-logs/raw-checks.zip')))
  for (const display of evidenceIndex.displays) {
    const empty = evidenceIndex.emptyFiles.find(e => e.logicalPath === display.logicalPath && e.version === 'captured-before-display')
    const raw = empty ? Buffer.alloc(0) : resolveEvidenceBytes(archive, { logicalPath: display.logicalPath, version: 'captured-before-display', byteKind: 'worktree' })
    assert.equal(hash(raw), display.rawSha256)
    assert.equal(hash(readFileSync(resolve(root, display.logicalPath))), display.displaySha256)
  }
  console.log(JSON.stringify({ cards: '29/29', categories: '261/261', applicableAssertions: applicable, originalChecklistItems: historicalTests, dependencies: '实现及验收无环', historicalSource: '保留；#6合并前卡片全文缺口见source-gaps.md', result: '静态检查通过；非独审/产品新功能通过' }, null, 2))
} catch (error) {
  console.error('R1规格静态校验失败：', error.message)
  process.exitCode = 1
}
