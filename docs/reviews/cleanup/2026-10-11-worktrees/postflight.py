"""核验此次清理结果与原清单；只读旧工作树，仅写本轮回执。"""
import sys
sys.dont_write_bytecode = True
import gzip
import hashlib
import json
import subprocess
from pathlib import Path
from inventory import CURRENT, OUT, ROOT, git, utc, write

def main():
    receipt = json.loads((OUT / 'execution-53.json').read_text(encoding='utf-8-sig'))
    registration = git(CURRENT, 'worktree', 'list', '--porcelain')
    before = json.loads((OUT / 'registration-before.json').read_text(encoding='utf-8'))
    blocks = registration['stdout'].strip().split('\n\n')
    old_blocks = before['stdout'].strip().split('\n\n')
    pointer = Path(receipt['command'][-1])
    assert receipt['exitCode'] == 0 and not pointer.exists()
    assert pointer.name not in registration['stdout'] and 'prunable' not in registration['stdout']
    assert len(blocks) == len(old_blocks) - 1
    protected = json.loads((OUT / 'protected-paths.json').read_text(encoding='utf-8'))
    changes = []
    for row in protected:
        row['existsAfter'] = Path(row['path']).exists()
        if row['existsBefore'] != row['existsAfter']:
            changes.append(row)
    write('protected-paths-after.json', protected)
    remaining = []
    for block in blocks:
        fields = dict(line.split(' ', 1) for line in block.splitlines() if ' ' in line)
        p = Path(fields['worktree'])
        old = next(b for b in old_blocks if b.splitlines()[0] == block.splitlines()[0])
        previous = dict(line.split(' ', 1) for line in old.splitlines() if ' ' in line)
        remaining.append({'path': str(p), 'exists': p.exists(), 'registrationHead': fields['HEAD'],
                          'previousHead': previous['HEAD'], 'headChanged': fields['HEAD'] != previous['HEAD'],
                          'headRead': git(p, 'rev-parse', 'HEAD')})
    branch = git(CURRENT, 'show-ref', '--verify', 'refs/heads/tds/conv-01a11e5e-9e0c-704b-a590-3fee492f4f6a')
    assert branch['exitCode'] == 0
    compressed = json.loads((OUT / 'compressed-index.json').read_text(encoding='utf-8'))
    for row in compressed:
        data = (OUT / row['file']).read_bytes()
        raw = gzip.decompress(data)
        assert hashlib.sha256(data).hexdigest() == row['gzipSha256']
        assert hashlib.sha256(raw).hexdigest() == row['uncompressedSha256']
        json.loads(raw)
        # 预检压缩文件的工作树和已提交 blob 原字节相等。
        blob = subprocess.run(['git', '-C', str(CURRENT), 'show', 'dacefe0effa3:docs/reviews/cleanup/2026-10-11-worktrees/' + row['file']], capture_output=True, check=True).stdout
        assert blob == data
    parsed = 0
    for p in OUT.glob('*.json'):
        json.loads(p.read_text(encoding='utf-8-sig'))
        parsed += 1
    write('postflight.json', {'recordedAt': utc(), 'registration': registration, 'countBefore': len(old_blocks),
          'countAfter': len(blocks), 'prunable': 0, 'targetExists': pointer.exists(), 'localBranchRetained': branch,
          'remaining': remaining, 'protectedObservations': len(protected), 'protectionExistenceChanges': changes,
          'compressedRoundTripAndCommittedBytes': len(compressed), 'jsonParsed': parsed,
          'diskDifferenceInOperationWindow': receipt['diskAfter']['FreeSpace'] - receipt['diskBefore']['FreeSpace'],
          'logicalBytesRemoved': 151693775, 'attributablePhysicalBytesFreed': None,
          'limitations': '保留路径只核存在性，不声称所有内容哈希不变；活动任务可自行修改其目录。历史缺失路径不回填。没有全局 handles／恢复 registry，也没有读取或删除共享 store。'})
    print(json.dumps({'registrationBefore': len(old_blocks), 'registrationAfter': len(blocks), 'protected': len(protected),
                      'existenceChanges': len(changes), 'parsedJSON': parsed, 'gzipVerified': len(compressed)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
