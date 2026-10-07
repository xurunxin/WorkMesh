import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWorktreeEntry, sha256 } from './verify-build-input-reachability.mjs';

test('base 提交中的必读文件在工作树缺失时失败', () => {
  const result = checkWorktreeEntry({
    file: 'docs/adr/0074.md',
    committedBlobId: 'committed-blob',
    worktreeBytes: null,
    worktreeGitBlobId: null,
  });

  assert.equal(result.readable, false);
  assert.match(result.errors.join('\n'), /工作树缺少文件正文/);
});

test('工作树正文与 base 版本不一致时失败', () => {
  const result = checkWorktreeEntry({
    file: 'docs/adr/0074.md',
    committedBlobId: 'committed-blob',
    worktreeBytes: Buffer.from('旧版本正文'),
    worktreeGitBlobId: 'stale-blob',
  });

  assert.equal(result.readable, true);
  assert.match(result.errors.join('\n'), /工作树版本与 base 提交不一致/);
});

test('工作树 CRLF 经 Git 行尾规范化后与 LF base blob 一致时通过', () => {
  const committedBytes = Buffer.from('正文第一行\n正文第二行\n');
  const worktreeBytes = Buffer.from('正文第一行\r\n正文第二行\r\n');
  const result = checkWorktreeEntry({
    file: 'docs/adr/0074.md',
    committedBlobId: 'normalized-blob',
    worktreeBytes,
    worktreeGitBlobId: 'normalized-blob',
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.readable, true);
  assert.notEqual(result.worktreeSha256, sha256(committedBytes));
});
