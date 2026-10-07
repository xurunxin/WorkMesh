#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRawEvidenceArchive } from './verify-raw-evidence-archive.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function isReadable(bytes, type) {
  if (type === 'zip') return bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (type === 'png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  const body = bytes.toString('utf8');
  return bytes.length > 0 && !body.includes('\uFFFD') && body.trim().length > 0;
}

export function checkWorktreeEntry({
  file,
  type = 'text',
  worktreeBytes,
  worktreeGitBlobId,
  committedBlobId,
  expectedSha256,
  expectedBytes,
}) {
  const errors = [];
  if (!worktreeBytes) {
    errors.push(`${file}: 工作树缺少文件正文`);
    return { errors, readable: false, worktreeSha256: null, worktreeGitBlobId: null };
  }

  const readable = isReadable(worktreeBytes, type);
  if (!readable) errors.push(`${file}: 工作树正文为空、编码无效或文件类型不符`);
  const worktreeSha256 = sha256(worktreeBytes);
  if (worktreeGitBlobId !== committedBlobId) errors.push(`${file}: 工作树版本与 base 提交不一致`);
  if (expectedSha256 && worktreeSha256 !== expectedSha256) errors.push(`${file}: 工作树 SHA-256 与来源清单不一致`);
  if (expectedBytes !== undefined && worktreeBytes.length !== expectedBytes) errors.push(`${file}: 工作树字节数与来源清单不一致`);
  return { errors, readable, worktreeSha256, worktreeGitBlobId };
}

const runGit = (args) => execFileSync('git', args, {
  maxBuffer: 32 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});

function readJson(bytes, label) {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON: ${error.message}`);
  }
}

function inspectCommittedFile(commit, file, expectedSha256, expectedBytes, type, results, errors) {
  try {
    const blobId = runGit(['rev-parse', `${commit}:${file}`]).toString('utf8').trim();
    const blob = runGit(['cat-file', 'blob', `${commit}:${file}`]);
    const committedSha256 = sha256(blob);
    if (expectedSha256 && committedSha256 !== expectedSha256) errors.push(`${file}: 提交 blob SHA-256 与来源清单不一致`);
    if (expectedBytes !== undefined && blob.length !== expectedBytes) errors.push(`${file}: 提交 blob 字节数与来源清单不一致`);
    if (!isReadable(blob, type)) errors.push(`${file}: 提交正文为空、编码无效或文件类型不符`);

    const worktreePath = path.resolve(file);
    const worktreeExists = existsSync(worktreePath);
    const worktreeBytes = worktreeExists ? readFileSync(worktreePath) : null;
    const worktreeGitBlobId = worktreeExists
      ? runGit(['hash-object', `--path=${file}`, file]).toString('utf8').trim()
      : null;
    const worktree = checkWorktreeEntry({
      file,
      type,
      worktreeBytes,
      worktreeGitBlobId,
      committedBlobId: blobId,
      expectedSha256,
      expectedBytes,
    });
    errors.push(...worktree.errors);
    results.push({
      file,
      blobId,
      committedBytes: blob.length,
      committedSha256,
      worktreeGitBlobId: worktree.worktreeGitBlobId,
      worktreeBytes: worktreeBytes?.length ?? null,
      worktreeSha256: worktree.worktreeSha256,
      committedReadable: isReadable(blob, type),
      worktreeReadable: worktree.readable,
    });
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

function main() {
  const commitArg = process.argv[2];
  if (!commitArg) {
    console.error('用法: node scripts/verify-build-input-reachability.mjs <base-commit>');
    process.exit(2);
  }

  let commit;
  try {
    commit = runGit(['rev-parse', '--verify', `${commitArg}^{commit}`]).toString('utf8').trim();
  } catch (error) {
    console.error(`无效的 base commit: ${error.message}`);
    process.exit(2);
  }

  const sourceManifestPath = 'docs/references/todos-analysis/SOURCE-MANIFEST.json';
  let sourceManifest;
  try {
    sourceManifest = readJson(runGit(['cat-file', 'blob', `${commit}:${sourceManifestPath}`]), sourceManifestPath);
  } catch (error) {
    console.error(JSON.stringify({ commit, errors: [`base 中缺少可读的 ${sourceManifestPath}: ${error.message}`] }, null, 2));
    process.exit(1);
  }

  const requiredDocuments = [
    'docs/adr/0074-workspace-configuration-readiness-check-and-first-run-surface.md',
    'docs/adr/0075-verifiable-and-simplified-agent-connection-onboarding.md',
    'docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md',
    'docs/adr/0077-reference-derived-visual-system-and-workbench-layout.md',
    'docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md',
    sourceManifestPath,
  ];
  const results = [];
  const errors = [];
  for (const file of requiredDocuments) inspectCommittedFile(commit, file, undefined, undefined, 'text', results, errors);
  for (const item of sourceManifest.files) {
    const type = item.repository_path.endsWith('.png') ? 'png' : 'text';
    inspectCommittedFile(commit, item.repository_path, item.sha256, item.bytes, type, results, errors);
  }

  const planPath = 'docs/plan/2026-10-07-activation-onboarding-and-china-ecosystem.md';
  try {
    const plan = runGit(['cat-file', 'blob', `${commit}:${planPath}`]).toString('utf8');
    const heading = '## P1：16 条代码事实断言核实台账';
    const start = plan.indexOf(heading);
    const tail = start < 0 ? '' : plan.slice(start + heading.length).split(/^## /m, 1)[0];
    const assertions = tail.match(/^\|\s*\d+\s*\|/gm) ?? [];
    if (assertions.length !== 16) errors.push(`${planPath}: 实际 base 未包含完整 P1 16 条断言表（检测到 ${assertions.length}/16）`);
  } catch (error) {
    errors.push(`P1 台账核验失败: ${error.message}`);
  }

  const archiveInputs = [];
  let archiveVerification = null;
  const archivePath = 'docs/evidence/build-input-reachability.current/raw-evidence.zip';
  const indexPath = 'docs/evidence/build-input-reachability.current/raw-evidence-index.json';
  // 是否要求归档由精确base的树决定，不拿当前HEAD补旧base。
  const hasArchive = runGit(['ls-tree', '--name-only', commit, archivePath, indexPath]).toString().trim();
  if (hasArchive) {
    for (const [file, type] of [[archivePath, 'zip'], [indexPath, 'text'], ['scripts/verify-raw-evidence-archive.mjs', 'text']])
      inspectCommittedFile(commit, file, undefined, undefined, type, archiveInputs, errors);
    try {
      const archive = readRawEvidenceArchive(readJson(runGit(['cat-file', 'blob', `${commit}:${indexPath}`]), indexPath), runGit(['cat-file', 'blob', `${commit}:${archivePath}`]));
      archiveVerification = { entries: archive.index.entries.length, members: archive.memberCount, bytes: archive.totalBytes, selfContained: true };
    } catch (error) { errors.push(`归档读取失败: ${error.message}`); }
  }
  const report = { commit, sourceManifest: sourceManifestPath, checkedFiles: results.length, p1Assertions: 16, errors, results, archiveInputs, archiveVerification };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outputIndex = process.argv.indexOf('--json-out');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) {
      console.error('--json-out 后必须提供仓库相对输出路径');
      process.exit(2);
    }
    writeFileSync(outputPath, json, 'utf8');
  }
  process.stdout.write(json);
  if (errors.length > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
