import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const readJson = name => JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
const manifest = readJson('handoff-manifest.json');
const todos = readJson('todo-inputs.json');
const main = readJson('main-inputs.json');

try {
  assert.equal(manifest.plan.exactComparedWithSavedCopy, true);
  assert.equal(digest(readFileSync(path.join(directory, 'plan.md'))), manifest.plan.sha256);
  assert.equal(manifest.manifestSelfExcluded, true);
  assert.equal(todos.atomicSnapshot, false);
  assert.equal(todos.inputs.length, 29);
  assert.equal(new Set(todos.inputs.map(card => card.id)).size, 29);
  assert.deepEqual(todos.inputs.map(card => card.seqNum).sort((a, b) => a - b),
    Array.from({ length: 29 }, (_, index) => index + 1));
  let complete = 0;
  for (const card of todos.inputs) {
    for (const field of ['id', 'title', 'phase', 'updatedAt', 'requestedAt', 'receivedAt']) {
      assert.ok(typeof card[field] === 'string' && card[field].length > 0, '缺少字段：' + field);
    }
    assert.equal(card.source.tool, 'mcp__tds__todos');
    assert.equal(card.source.arguments.id, card.id);
    assert.equal(digest(Buffer.from(card.rawToolText, 'utf8')), card.rawToolTextSha256);
    assert.ok(card.rawToolText.includes('Updated: ' + card.updatedAt));
    assert.ok(card.rawToolText.includes('Phase: ' + card.phase));
    const match = card.rawToolText.indexOf('\nSpec:\n');
    assert.ok(match >= 0);
    const captured = card.rawToolText.slice(match + 7).split('\nSaved plan:\n')[0];
    if (card.completeSpec) {
      assert.equal(card.spec, captured);
      assert.ok(!captured.includes('…(truncated)'));
      assert.equal(digest(Buffer.from(card.spec, 'utf8')), card.specSha256);
      assert.equal(Buffer.byteLength(card.spec, 'utf8'), card.specUtf8Bytes);
      assert.equal(card.specPrefix, null);
      complete += 1;
    } else {
      assert.equal(card.spec, null);
      assert.equal(card.specSha256, null);
      assert.equal(card.specPrefix, captured.replace(/\n…\(truncated\)$/, ''));
      assert.equal(digest(Buffer.from(card.specPrefix, 'utf8')), card.specPrefixSha256);
      assert.equal(Buffer.byteLength(card.specPrefix, 'utf8'), card.specPrefixUtf8Bytes);
      assert.ok(card.rawToolText.includes(card.truncationMarker));
    }
  }
  assert.equal(todos.coverage.completeSpecs, complete);
  assert.equal(todos.coverage.metadataCards, todos.inputs.length);
  assert.deepEqual(todos.coverage.incompleteSpecs, todos.inputs.filter(card => !card.completeSpec).map(card => card.id));
  assert.equal(todos.inputs.find(card => card.seqNum === 6).phase, 'closed');
  assert.equal(main.sourceCommit, manifest.fetchedMainCommit);
  for (const capture of main.captures) {
    const bytes = Buffer.from(capture.body, 'utf8');
    assert.equal(bytes.length, capture.bytes);
    assert.equal(digest(bytes), capture.sha256);
    assert.equal(createHash('sha1').update(Buffer.concat([
      Buffer.from('blob ' + bytes.length + '\0'), bytes
    ])).digest('hex'), capture.gitBlob);
  }
  assert.equal(manifest.plan.platformDocReadback, false);
  for (const file of manifest.files) {
    assert.ok(file.path.startsWith('docs/reviews/r1/') && !file.path.includes('..'));
    assert.ok(!file.path.endsWith('handoff-manifest.json'));
    const bytes = readFileSync(path.join(directory, path.basename(file.path)));
    assert.equal(bytes.length, file.bytes);
    assert.equal(digest(bytes), file.sha256);
  }
  console.log('已采集工件的字节、哈希、计划副本一致性和卡片元数据校验通过；正文覆盖 ' + complete + '/29。');
  if (!process.argv.includes('--integrity-only')) {
    assert.equal(complete, 29, '输入不完整：#3 正文被平台工具截断，三项 blocking 仍待独立复核。');
  } else {
    console.log('本模式不证明输入完整或门禁通过，不能用于关闭 blocking。');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
