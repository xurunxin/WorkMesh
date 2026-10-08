// 仅核验文档交付：复用 G1 ZIP 格式；不启动产品或提供方请求。
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { digest, readRawEvidenceArchive } from '../../../scripts/verify-raw-evidence-archive.mjs';

const base = 'docs/plan/c2-wecom';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const index = json(`${base}/raw-evidence-index.json`);
const archive = readRawEvidenceArchive(index, readFileSync(`${base}/raw-evidence.zip`));
assert.deepEqual(git(['show', `:${base}/raw-evidence.zip`]), readFileSync(`${base}/raw-evidence.zip`));
const original = path => {
  const entry = index.entries.find(row => row.logicalPath === path && row.byteKind === 'worktree');
  assert.ok(entry, path);
  return archive.contents.get(entry.member);
};
const normalized = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/\t/g, '    ')
  .split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n').replace(/\n+$/, '') + '\n';

for (const id of ['G27jedfwL5ikAj9GiLO1R', 'vYxCwh0TMRC3mOrr6cU1K', '8K46xBWutJwsqCy89K5Oq']) {
  const path = `${base}/savedplan-${id}.md`, plan = json(path.replace('.md', '.json'));
  assert.deepEqual(original(path), Buffer.from(plan.body));
  assert.equal(digest(original(path)), plan.sha256);
  assert.equal(original(path).length, plan.bytes);
  assert.equal(plan.id, id);
  assert.equal(plan.version, null);
  assert.equal(plan.generatedAt, null);
  assert.equal(readFileSync(path, 'utf8'), normalized(original(path)));
  assert.equal(digest(readFileSync(path)), plan.readableCopy.sha256);
}
for (const page of json(`${base}/official/retrieval.json`)) {
  for (const ext of ['response.bin', 'body-source.txt', 'body.txt']) {
    const bytes = original(`${base}/official/${page.id}.${ext}`);
    assert.equal(bytes.length, page[ext].bytes);
    assert.equal(digest(bytes), page[ext].sha256);
  }
  const response = original(`${base}/${page.rawPath}`).toString('utf8');
  const extraction = page.bodyExtraction;
  assert.equal(response.slice(extraction.beginCharacter, extraction.endCharacterExclusive),
    original(`${base}/${extraction.source}`).toString('utf8'));
  assert.equal(readFileSync(`${base}/${extraction.text}`, 'utf8'), normalized(original(`${base}/${extraction.text}`)));
  assert.equal(page.status, 200);
}
for (const fact of json(`${base}/official/protocol-evidence.json`).facts) {
  assert.equal(readFileSync(`${base}/${fact.bodyPath}`, 'utf8').slice(fact.characterOffset, fact.characterOffset + fact.needle.length), fact.needle);
  const old = fact.originalLocation;
  assert.equal(original(`${base}/${old.bodyPath}`).toString('utf8').slice(old.characterOffset, old.characterOffset + fact.needle.length), fact.needle);
}
const attrs = readFileSync(`${base}/.gitattributes`, 'utf8');
assert.ok(!/whitespace|(?:^|\s)-diff(?:\s|$)/m.test(attrs));
const mapping = json(`${base}/test-coverage.json`);
assert.equal(mapping.matrix.length, 9);
assert.equal(mapping.originalTests.length, 6);
for (const row of mapping.matrix) assert.equal(row.status, '未实施/未运行');
for (const test of mapping.originalTests) assert.deepEqual(test.currentMapping.cases,
  test.currentMapping.matrixIds.flatMap(id => mapping.matrix.find(row => row.id === id).cases));
const r1 = json('docs/reviews/r1/test-coverage.json');
const before = JSON.parse(git(['show', `${index.sourceHead}:docs/reviews/r1/test-coverage.json`]));
const c2 = r1.features.find(row => row.seqNum === 16);
for (let i = 0; i < 9; i++) assert.deepEqual(c2.matrix[i].currentCases, mapping.matrix[i].cases);
const historical = value => JSON.parse(JSON.stringify(value, (key, entry) => key.startsWith('current') ? undefined : entry));
assert.deepEqual(historical(r1), historical(before));

let links = 0;
const manifest = json(`${base}/MANIFEST.json`);
for (const file of manifest.files) {
  const worktree = readFileSync(file.path);
  assert.equal(worktree.length, file.worktree.bytes, file.path);
  assert.equal(digest(worktree), file.worktree.sha256, file.path);
  const oid = git(['hash-object', `--path=${file.path}`, file.path]).toString().trim();
  assert.equal(oid, file.gitBlob.oid, file.path);
  const blob = git(['cat-file', 'blob', oid]);
  assert.equal(blob.length, file.gitBlob.bytes, file.path);
  assert.equal(digest(blob), file.gitBlob.sha256, file.path);
  assert.equal(createHash('sha1').update(Buffer.from(`blob ${blob.length}\0`)).update(blob).digest('hex'), oid);
  if (file.path.endsWith('.md')) {
    for (const match of worktree.toString('utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
      assert.ok(existsSync(resolve(dirname(file.path), decodeURIComponent(target))), `${file.path}: ${target}`);
      links++;
    }
  }
}
console.log(JSON.stringify({结果: '通过', 原始映射: index.entries.length, ZIP成员: archive.memberCount,
  清单文件: manifest.files.length, 本地链接: links, 六原测试: 6, 九类: 9,
  历史规划矩阵: '未实施/未运行；保持冻结来源', 当前产品结果: '另见 docs/reviews/c2/product-review.md，不由本归档检查判定' }));
