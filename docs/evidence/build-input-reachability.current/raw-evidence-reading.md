# 原始证据读取

原始日志和失败上下文以 `raw-evidence.zip` / `raw-evidence-index.json` 受控交付。独立明文运输副本已归档；历史JSON的路径、哈希和执行版本保持原样。当前ZIP自包含工作树原字节与Git提交字节，不要求浅克隆中存在旧Git对象。

在仓库根执行 `node scripts/verify-raw-evidence-archive.mjs`，先校验全部member、普通文件类型、路径规范化重复/越界、bytes/SHA-256及精确集合。读取全程在内存中，不落地不受信路径，不跟随链接。

精确读取历史原文（例）：

```js
import { verifyRawEvidenceDirectory, resolveEvidenceBytes } from './scripts/verify-raw-evidence-archive.mjs';
const archive = verifyRawEvidenceDirectory('.');
const bytes = resolveEvidenceBytes(archive, {
  logicalPath: 'docs/evidence/build-input-reachability.current/integration.4.log',
  version: 'd0806bc257fce1fba7ca7b320b79d6698ec6be45',
  byteKind: 'worktree',
});
console.log(bytes.toString('utf8'));
```

版本别名固定执行版本与逻辑路径，`sourceCommit`另标确实包含原件的提交；后续生成的日志可能尚未单独入库，此时sourceCommit为null、sourceBlobId标识Git过滤后字节。需要另一种字节时明确使用 `git-blob`；不得用同一归一化内容验证两列。当前完整索引也提供 `g1-archive-2026-10-08` 快照。未知路径、版本或字节类型直接失败，不回退到当前内容或历史网络fetch。

`pnpm ci:validate` 在既有source gate中执行归档安全负例与完整性校验，没有减弱CI选择、空白或Required CI规则。可达性验证器对其准确base中已有的ZIP/index/读取器另列归档输入，原44项不混入新数量。
