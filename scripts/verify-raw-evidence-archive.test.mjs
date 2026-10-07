import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRawEvidenceZip, digest, readRawEvidenceArchive, resolveEvidenceBytes, safePath } from './verify-raw-evidence-archive.mjs';

function fixture() {
  const raw = Buffer.from('现场原件\r\n含尾随空白  \r\n'), blob = Buffer.from('现场原件\n含尾随空白  \n');
  const sourceBlobId = createHash('sha1').update(Buffer.from(`blob ${blob.length}\0`)).update(blob).digest('hex');
  const entries = [raw, blob].map((bytes, i) => ({ logicalPath: 'docs/raw.log', version: 'snapshot-1', byteKind: i ? 'git-blob' : 'worktree', member: `bytes/${digest(bytes)}`, bytes: bytes.length, sha256: digest(bytes), sourceCommit: 'a'.repeat(40), sourceBlobId }));
  const zip = createRawEvidenceZip(entries.map((row, i) => ({ name: row.member, bytes: [raw, blob][i] })));
  return { raw, blob, zip, index: { schemaVersion: 1, archive: { bytes: zip.length, sha256: digest(zip) }, entries } };
}
const rehash = f => { f.index.archive = { bytes: f.zip.length, sha256: digest(f.zip) }; return f; };
test('无Git/网络依赖读取双字节，精确旧路径/版本映射', () => {
  const f = fixture(), archive = readRawEvidenceArchive(f.index, f.zip);
  for (const [byteKind, bytes] of [['worktree', f.raw], ['git-blob', f.blob]]) assert.deepEqual(resolveEvidenceBytes(archive, { logicalPath: 'docs/raw.log', version: 'snapshot-1', byteKind }), bytes);
  assert.throws(() => resolveEvidenceBytes(archive, { logicalPath: 'docs/raw.log', version: 'unknown', byteKind: 'worktree' }));
});
test('相同字节共用member，所有逻辑版本保留', () => {
  const f = fixture(); f.index.entries.push({ ...f.index.entries[0], version: 'snapshot-2' });
  const a = readRawEvidenceArchive(f.index, f.zip); assert.equal(a.memberCount, 2); assert.equal(a.tuples.size, 3);
});
test('拒绝规范化后重复逻辑元组', () => { const f = fixture(); f.index.entries.push({ ...f.index.entries[0], logicalPath: 'DOCS/raw.log' }); assert.throws(() => readRawEvidenceArchive(f.index, f.zip)); });
test('拒绝越界/盘符/UNC/反斜杠/保留名/尾点/控制字符', () => {
  for (const name of ['../x', '/x', 'C:/x', '//server/x', 'x\\y', 'x/../y', 'x//y', 'x/NUL.txt', 'x/y.', 'x/y ', 'x/\0y']) assert.throws(() => safePath(name), name);
  assert.equal(safePath('x/e\u0301'), safePath('X/é'));
});
test('拒绝规范化后重复ZIP member', () => { assert.throws(() => createRawEvidenceZip([{ name: 'x/A', bytes: Buffer.from('a') }, { name: 'X/a', bytes: Buffer.from('b') }])); });
test('拒绝索引缺项/多项', () => {
  const f = fixture(); f.index.entries.pop(); assert.throws(() => readRawEvidenceArchive(f.index, f.zip));
  const g = fixture(); g.index.entries.push({ ...g.index.entries[0], member: `bytes/${'c'.repeat(64)}`, sha256: 'c'.repeat(64), version: 'extra' }); assert.throws(() => readRawEvidenceArchive(g.index, g.zip));
});
test('拒绝索引重复元组', () => { const f = fixture(); f.index.entries.push({ ...f.index.entries[0] }); assert.throws(() => readRawEvidenceArchive(f.index, f.zip)); });
test('拒绝归档hash不符', () => { const f = fixture(); f.zip[35] ^= 1; assert.throws(() => readRawEvidenceArchive(f.index, f.zip)); });
test('拒绝伪造来源blob ID', () => { const f = fixture(); f.index.entries[1].sourceBlobId = 'b'.repeat(40); assert.throws(() => readRawEvidenceArchive(f.index, f.zip)); });
test('拒绝member bytes/hash不符', () => { const f = fixture(); f.index.entries[0].bytes++; assert.throws(() => readRawEvidenceArchive(f.index, f.zip)); });
for (const [label, mode] of [['软链接', 0o120777], ['目录', 0o040755], ['设备', 0o020600]]) test(`拒绝${label}`, () => {
  const f = fixture(), central = f.zip.readUInt32LE(f.zip.length - 6); f.zip.writeUInt32LE((mode << 16) >>> 0, central + 38); rehash(f); assert.throws(() => readRawEvidenceArchive(f.index, f.zip));
});
test('拒绝extra元数据/硬链接信息与加密flags', () => {
  const f = fixture(), at = f.zip.readUInt32LE(f.zip.length - 6); f.zip.writeUInt16LE(1, at + 30); rehash(f); assert.throws(() => readRawEvidenceArchive(f.index, f.zip));
  const g = fixture(), pos = g.zip.readUInt32LE(g.zip.length - 6); g.zip.writeUInt16LE(0x801, pos + 8); rehash(g); assert.throws(() => readRawEvidenceArchive(g.index, g.zip));
});
test('拒绝本地路径不一致、重叠与解压超额', () => {
  const f = fixture(); f.zip[30] = 97; rehash(f); assert.throws(() => readRawEvidenceArchive(f.index, f.zip));
  const g = fixture(), at = g.zip.readUInt32LE(g.zip.length - 6); g.zip.writeUInt32LE(1, at + 42); rehash(g); assert.throws(() => readRawEvidenceArchive(g.index, g.zip));
  const h = fixture(); h.index.entries[0].bytes = 128 * 1024 * 1024 + 1; assert.throws(() => readRawEvidenceArchive(h.index, h.zip));
});
