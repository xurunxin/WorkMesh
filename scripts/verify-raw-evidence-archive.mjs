import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const archiveDirectory = 'docs/evidence/build-input-reachability.current';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const limit = 128 * 1024 * 1024;
const fail = message => { throw new Error(`RAW_EVIDENCE_INVALID: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const decoder = new TextDecoder('utf-8', { fatal: true });

export function safePath(name) {
  check(typeof name === 'string' && name.length > 0, '路径为空');
  const normalized = name.normalize('NFC').replaceAll('\\', '/');
  check(!name.includes('\\') && !/[\x00-\x1f\x7f:]/.test(normalized), '路径分隔符/控制字符/盘符非法');
  check(!normalized.startsWith('/'), '绝对路径');
  for (const part of normalized.split('/')) {
    check(part && part !== '.' && part !== '..' && !/[. ]$/.test(part), '路径组件越界或含糊');
    check(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), 'Windows保留路径');
  }
  return normalized.toLowerCase();
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 固定格式：UTF-8、普通文件、无链接/目录/extra/data descriptor/ZIP64。
export function createRawEvidenceZip(members) {
  const local = [], central = [], names = new Set();
  let offset = 0;
  check(members.length > 0 && members.length < 65535, 'member数量非法');
  for (const { name, bytes } of members) {
    const key = safePath(name); check(!names.has(key), '规范化后member重复'); names.add(key);
    check(Buffer.isBuffer(bytes) && bytes.length <= limit, 'member字节非法');
    const filename = Buffer.from(name), compressed = deflateRawSync(bytes), crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc, 14);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x314, 4);
    directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE((0o100644 << 16) >>> 0, 38); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

export function readRawEvidenceArchive(index, zip) {
  check(index?.schemaVersion === 1 && Array.isArray(index.entries) && index.entries.length > 0, '索引格式非法');
  check(Buffer.isBuffer(zip) && zip.length >= 22 && zip.length <= limit, 'ZIP大小非法');
  check(zip.length === index.archive.bytes && digest(zip) === index.archive.sha256, '归档bytes/hash不符');
  const members = new Map(), tuples = new Map(), normalizedTuples = new Set();
  let total = 0;
  for (const entry of index.entries) {
    const key = safePath(entry.logicalPath);
    check(typeof entry.version === 'string' && entry.version.length > 0 && !/[\x00-\x1f]/.test(entry.version), '版本非法');
    check(['worktree', 'git-blob'].includes(entry.byteKind), '字节类型非法');
    check(Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= limit && /^[a-f0-9]{64}$/.test(entry.sha256), '条目bytes/hash非法');
    check(entry.member === `bytes/${entry.sha256}`, 'member必须内容寻址'); safePath(entry.member);
    const tuple = JSON.stringify([entry.logicalPath, entry.version, entry.byteKind]);
    const normalized = JSON.stringify([key, entry.version.normalize('NFC').toLowerCase(), entry.byteKind]);
    check(!normalizedTuples.has(normalized), '规范化后逻辑元组重复'); normalizedTuples.add(normalized); tuples.set(tuple, entry);
    check(entry.sourceCommit === null || /^[a-f0-9]{40}$/.test(entry.sourceCommit), '来源提交非法');
    check(/^[a-f0-9]{40}$/.test(entry.sourceBlobId), '来源blob非法');
    if (members.has(entry.member)) check(members.get(entry.member).bytes === entry.bytes, '共用member大小不一致');
    else { members.set(entry.member, entry); total += entry.bytes; }
  }
  check(total <= limit && members.size <= 4096, '清单解压上界非法');
  const end = zip.length - 22;
  check(zip.readUInt32LE(end) === 0x06054b50 && zip.readUInt16LE(end + 20) === 0, 'ZIP结束记录非法');
  check(zip.readUInt16LE(end + 4) === 0 && zip.readUInt16LE(end + 6) === 0, '拒绝多卷ZIP');
  const count = zip.readUInt16LE(end + 10), centralStart = zip.readUInt32LE(end + 16), centralSize = zip.readUInt32LE(end + 12);
  check(count === members.size && zip.readUInt16LE(end + 8) === count, 'member缺项/多项');
  check(centralStart + centralSize === end, '中央目录边界非法');
  let cursor = centralStart, nextLocal = 0; const contents = new Map(), names = new Set();
  for (let i = 0; i < count; i++) {
    check(cursor + 46 <= end && zip.readUInt32LE(cursor) === 0x02014b50, '中央目录非法');
    const size = zip.readUInt32LE(cursor + 24), compressedSize = zip.readUInt32LE(cursor + 20);
    const nameSize = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32);
    check(extra === 0 && comment === 0 && zip.readUInt16LE(cursor + 34) === 0, '拒绝extra/注释/其他卷');
    check(zip.readUInt16LE(cursor + 8) === 0x800 && zip.readUInt16LE(cursor + 10) === 8, '拒绝加密/descriptor/非固定压缩');
    const attributes = zip.readUInt32LE(cursor + 38);
    check((zip.readUInt16LE(cursor + 4) >>> 8) === 3 && ((attributes >>> 16) & 0o170000) === 0o100000 && (attributes & 0x410) === 0, '拒绝链接/目录/非普通文件');
    check(cursor + 46 + nameSize <= end, '文件名越界');
    const name = decoder.decode(zip.subarray(cursor + 46, cursor + 46 + nameSize)), key = safePath(name);
    check(!names.has(key), '规范化后ZIP重复member'); names.add(key);
    const expected = members.get(name); check(expected && size === expected.bytes, 'member不在清单或大小不符');
    const at = zip.readUInt32LE(cursor + 42); check(at === nextLocal && at + 30 <= centralStart, 'member偏移/重叠非法');
    check(zip.readUInt32LE(at) === 0x04034b50 && zip.readUInt16LE(at + 6) === 0x800 && zip.readUInt16LE(at + 8) === 8, '本地header非法');
    check(zip.readUInt16LE(at + 26) === nameSize && zip.readUInt16LE(at + 28) === 0, '本地文件名/extra不一致');
    check(zip.readUInt32LE(at + 18) === compressedSize && zip.readUInt32LE(at + 22) === size && zip.readUInt32LE(at + 14) === zip.readUInt32LE(cursor + 16), '本地大小/CRC不一致');
    check(decoder.decode(zip.subarray(at + 30, at + 30 + nameSize)) === name, '中央/本地路径不一致');
    const start = at + 30 + nameSize; nextLocal = start + compressedSize; check(nextLocal <= centralStart, '压缩内容越界');
    const bytes = inflateRawSync(zip.subarray(start, nextLocal), { maxOutputLength: size });
    check(bytes.length === size && digest(bytes) === expected.sha256 && crc32(bytes) === zip.readUInt32LE(cursor + 16), 'member原字节hash/CRC不符');
    contents.set(name, bytes); cursor += 46 + nameSize;
  }
  check(cursor === end && nextLocal === centralStart && contents.size === members.size, '归档缺项/多项/剩余字节');
  return { index, tuples, contents, memberCount: contents.size, totalBytes: total };
}

export function resolveEvidenceBytes(archive, { logicalPath, version, byteKind }) {
  const entry = archive.tuples.get(JSON.stringify([logicalPath, version, byteKind]));
  check(entry, '旧路径/版本/字节类型无精确映射');
  return archive.contents.get(entry.member);
}

export function verifyRawEvidenceDirectory(root = '.') {
  const directory = path.resolve(root, archiveDirectory);
  const index = JSON.parse(readFileSync(path.join(directory, 'raw-evidence-index.json'), 'utf8'));
  return readRawEvidenceArchive(index, readFileSync(path.join(directory, 'raw-evidence.zip')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const archive = verifyRawEvidenceDirectory(process.argv[2] ?? '.');
    console.log(JSON.stringify({ entries: archive.index.entries.length, members: archive.memberCount, bytes: archive.totalBytes, errors: [] }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
