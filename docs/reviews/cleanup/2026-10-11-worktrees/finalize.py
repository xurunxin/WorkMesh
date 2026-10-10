"""最终提交证据边界：Git 与 Windows 原字节分列，保留首败。"""
import sys
sys.dont_write_bytecode = True
import gzip
import hashlib
import json
import subprocess
from pathlib import Path
from inventory import CURRENT, OUT, utc, write
SOURCE = Path(r'C:\Users\xurx\.tds\codex-home\sessions\2026\10\11\rollout-2026-10-11T00-56-55-01a126bf-04bf-7943-9ae6-d7c1c3d13276.jsonl')

def main():
    records = [(i + 1, line, json.loads(line)) for i, line in enumerate(SOURCE.read_text(encoding='utf-8').splitlines())]
    failures = {}
    for line, raw, record in records:
        p = record.get('payload', {})
        if record.get('type') == 'response_item' and p.get('type') == 'custom_tool_call' and 'staged/worktree byte matches:' in p.get('input', ''):
            if any(prefix + ' docs/reviews/cleanup/2026-10-11-worktrees/finalize.py' in p.get('input', '') for prefix in ['Add File:', 'Update File:']):
                continue
            failures[p['call_id']] = {'callId': p['call_id'], 'source': str(SOURCE), 'dispatchLine': line, 'dispatch': record, 'dispatchOriginalLine': raw}
    for line, raw, record in records:
        p = record.get('payload', {})
        if record.get('type') == 'response_item' and p.get('type') == 'custom_tool_call_output' and p.get('call_id') in failures:
            failures[p['call_id']].update({'returnLine': line, 'return': record, 'returnOriginalLine': raw})
    write('first-final-validation-failure.json', {'purpose': '保留最终证据索引的首次失败；不是删除失败或新删除许可',
          'reason': '首版要求所有工作树字节等于 Git blob；PowerShell 生成 JSON 为 CRLF，Git autocrlf 归一化。嵌套 Python AssertionError 与缺 index 的 git add 失败；外层最后 diffcheck 0 掩盖前序失败，不能算整个验证通过。',
          'receipts': list(failures.values())})
    rows = []
    # 对已提交成果逐 blob 核对，最后的验证回执与索引不自引用。
    for p in sorted(OUT.iterdir()):
        if not p.is_file() or p.name in ('evidence-index.json', 'final-validation.json', 'finalize.py', 'first-final-validation-failure.json'):
            continue
        rel = p.relative_to(CURRENT).as_posix()
        result = subprocess.run(['git', '-C', str(CURRENT), 'show', '57d600d24f68:' + rel], capture_output=True, check=True)
        blob, windows = result.stdout, p.read_bytes()
        if blob == windows:
            transform = 'identity'
        elif windows == blob.replace(b'\n', b'\r\n'):
            transform = 'replace-every-LF-with-CRLF'
        else:
            # 同一文本的混合换行须明确记录位置；不能以归一化 hash 冒原字节。
            assert windows.replace(b'\r\n', b'\n') == blob, rel
            transform = 'restore-CR-at-listed-LF-offsets'
        if p.suffix == '.gz':
            assert transform == 'identity'
            json.loads(gzip.decompress(windows))
        elif p.suffix == '.json':
            assert json.loads(blob) == json.loads(windows)
        row = {'path': rel, 'sourceCommit': '57d600d24f68', 'gitBytes': len(blob), 'gitSha256': hashlib.sha256(blob).hexdigest(),
               'windowsBytes': len(windows), 'windowsSha256': hashlib.sha256(windows).hexdigest(), 'reconstruction': transform}
        if transform == 'restore-CR-at-listed-LF-offsets':
            row['insertCROffsetsInGitBlob'] = []
            i = 0
            for offset, b in enumerate(blob):
                if b == 10 and windows[i:i + 2] == b'\r\n':
                    row['insertCROffsetsInGitBlob'].append(offset)
                    i += 1
                assert b == windows[i]
                i += 1
        rows.append(row)
    write('evidence-index.json', {'recordedAt': utc(), 'scope': '已提交执行/保全/报告成果的 Git blob 与 Windows 原字节；索引/末次验证回执不自引用。运行时 CRLF 如实分列。', 'files': rows})
    print(json.dumps({'verifiedFiles': len(rows), 'transforms': {t: sum(r['reconstruction'] == t for r in rows) for t in sorted({r['reconstruction'] for r in rows})}, 'firstFailureReceipts': len(failures)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
