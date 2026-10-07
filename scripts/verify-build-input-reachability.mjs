#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const commitArg = process.argv[2];
if (!commitArg) {
  console.error('用法: node scripts/verify-build-input-reachability.mjs <base-commit>');
  process.exit(2);
}

const runGit = (args, options = {}) => execFileSync('git', args, {
  maxBuffer: 32 * 1024 * 1024,
  ...options,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (bytes, label) => {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON: ${error.message}`);
  }
};

const commit = runGit(['rev-parse', '--verify', `${commitArg}^{commit}`]).toString('utf8').trim();
const sourceManifestPath = 'docs/references/todos-analysis/SOURCE-MANIFEST.json';
let sourceManifest;
try {
  const manifestBytes = runGit(['cat-file', 'blob', `${commit}:${sourceManifestPath}`]);
  sourceManifest = readJson(manifestBytes, sourceManifestPath);
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

function inspectCommittedFile(file, expectedSha256, expectedBytes, type = 'text') {
  try {
    const blobId = runGit(['rev-parse', `${commit}:${file}`]).toString('utf8').trim();
    const blob = runGit(['cat-file', 'blob', `${commit}:${file}`]);
    const blobSha256 = sha256(blob);
    if (expectedSha256 && blobSha256 !== expectedSha256) errors.push(`${file}: 提交 blob SHA-256 与来源清单不一致`);
    if (expectedBytes !== undefined && blob.length !== expectedBytes) errors.push(`${file}: 提交 blob 字节数与来源清单不一致`);

    let readable = false;
    if (type === 'png') {
      readable = blob.length >= 8 && blob.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!readable) errors.push(`${file}: 提交内容不是可读 PNG`);
    } else {
      const body = blob.toString('utf8');
      readable = blob.length > 0 && !body.includes('\uFFFD') && body.trim().length > 0;
      if (!readable) errors.push(`${file}: 提交正文为空或不是有效 UTF-8`);
    }

    const worktreePath = path.resolve(file);
    const worktreeSha256 = existsSync(worktreePath) ? sha256(readFileSync(worktreePath)) : null;
    const worktreeGitBlobId = existsSync(worktreePath)
      ? runGit(['hash-object', '--', file]).toString('utf8').trim()
      : null;
    if (expectedSha256 && worktreeSha256 !== expectedSha256) errors.push(`${file}: 工作树 SHA-256 与来源清单不一致`);
    if (expectedSha256 && worktreeGitBlobId !== blobId) errors.push(`${file}: -text 输入的工作树 Git blob ID 与提交 blob 不一致`);
    results.push({ file, blobId, committedBytes: blob.length, committedSha256: blobSha256, worktreeGitBlobId, worktreeSha256, readable });
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

for (const file of requiredDocuments) inspectCommittedFile(file);
for (const item of sourceManifest.files) {
  inspectCommittedFile(item.repository_path, item.sha256, item.bytes, item.repository_path.endsWith('.png') ? 'png' : 'text');
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

console.log(JSON.stringify({ commit, sourceManifest: sourceManifestPath, checkedFiles: results.length, assertions: 16, errors, results }, null, 2));
if (errors.length > 0) process.exit(1);
