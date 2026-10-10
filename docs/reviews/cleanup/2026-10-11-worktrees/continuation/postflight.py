"""只读核新删除、登记、保护与回执；不重复 #53 现场核查。"""
import sys
sys.dont_write_bytecode = True
import collections
import gzip
import hashlib
import json
from pathlib import Path
from audit import OUT, CURRENT, ROOT, TARGETS, utc, write, call

def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def main():
    before = load(OUT / 'protected-before.json')
    after = [{**r, 'existsAfter': Path(r['path']).exists()} for r in before]
    differences = [r for r in after if r['existsAfter'] != r['exists']]
    write('protected-after.json', after)
    registration = call(CURRENT, 'worktree', 'list', '--porcelain')
    blocks = registration['stdout'].strip().split('\n\n')
    health = []
    for block in blocks:
        lines = block.splitlines()
        fields = dict(line.split(' ', 1) for line in lines if ' ' in line)
        path = Path(fields['worktree'])
        # 当前 main/活动分支可能合法推进；只核登记可读，不要求活动 HEAD 不变。
        head = call(path, 'rev-parse', 'HEAD') if path.exists() else None
        health.append({'path': str(path), 'exists': path.exists(), 'head': head, 'prunable': any(line.startswith('prunable') for line in lines), 'locked': any(line.startswith('locked') for line in lines)})
    results = []
    for n, name in TARGETS.items():
        p = OUT / f'execution-{n}.json'
        if not p.exists():
            results.append({'todo': n, 'path': str(ROOT / name), 'executed': False, 'reason': '没有实际执行回执；不补造'})
            continue
        e = load(p)
        journal = [json.loads(line) for line in (OUT / f'operation-journal-{n}.jsonl').read_text(encoding='utf-8').splitlines()]
        assert journal == e['calls']
        git_calls = [r for r in journal if r['input'][0] == 'git']
        process_calls = [r for r in journal if r['input'][0] == 'python']
        cmdlet_calls = [r for r in journal if r['input'][0] == 'Remove-Item']
        registered = any(str(Path(b.splitlines()[0].split(' ', 1)[1])).lower() == e['target'].lower() for b in blocks)
        branch = call(CURRENT, 'rev-parse', 'refs/heads/tds/conv-' + name)
        results.append({'todo': n, 'path': e['target'], 'executed': True, 'targetExists': Path(e['target']).exists(), 'registeredAfter': registered, 'result': e['result'], 'error': e['error'],
                        'gitCalls': git_calls, 'processCalls': process_calls, 'cmdletCalls': len(cmdlet_calls), 'cmdletFailures': sum(r['exit'] != 0 for r in cmdlet_calls),
                        'normalizedCmdletExitDefinition': 'PowerShell cmdlet 没有独立 OS 进程退出码；journal 的 exit0/1 为立即无终止异常/有异常的归一化结果；原异常和外层 tool 的真实 process exit 另存',
                        'junctionBodiesRemoved': sum('junction' in r.get('kind', '') for r in cmdlet_calls), 'ordinaryEmptyDirectoriesRemoved': sum('普通空目录' in r.get('kind', '') for r in cmdlet_calls),
                        'localBranchRetained': branch['exit'] == 0, 'localBranchReceipt': branch, 'diskBefore': e['diskBefore'], 'diskAfter': e['diskAfter'],
                        'volumeFreeSpaceChangeBytes': int(e['diskAfter']['FreeSpace'])-int(e['diskBefore']['FreeSpace']) if e['diskBefore'] else None, 'attributablePhysicalNetReleasedBytes': None})
    success = all(not r.get('targetExists', True) and not r.get('registeredAfter', True) and not r.get('error') and r.get('localBranchRetained') for r in results)
    healthy = registration['exit'] == 0 and all(r['exists'] and not r['prunable'] and r['head']['exit'] == 0 for r in health)
    write('postflight.json', {'recordedAt': utc(), 'results': results, 'allNewCandidatesRemoved': success, 'registration': registration, 'registrationCount': len(blocks), 'registrationHealthy': healthy, 'registeredPaths': health,
                            'protectedObservations': len(after), 'protectedExistenceDifferences': differences, 'protectedExistenceUnchanged': not differences,
                            'failedTargets': [r['todo'] for r in results if r.get('error')], 'emptyBatch': not any(r['executed'] for r in results),
                            'scope': '只核 #54–57 新实际执行；#53 原回执与已有验证保持，不重新核其已删目标；保护仅存在性，不声称活动内容未变'})
    print(json.dumps({'newRemoved': sum(r.get('executed') and not r.get('targetExists', True) and not r.get('error') for r in results), 'registrationCount': len(blocks), 'healthy': healthy, 'protectedDifferenceCount': len(differences)}, ensure_ascii=False))
    assert success and healthy and not differences

if __name__ == '__main__':
    main()
