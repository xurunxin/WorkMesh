"""删除紧邻前逐字节/独占读取/链接本体核验；绝不执行删除。"""
import sys
sys.dont_write_bytecode = True
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from audit import OUT, CURRENT, ROOT, TARGETS, utc, write, call
from metadata_proof_import import raw_link, exclusive_open
sys.path.insert(0, str(OUT.parent))
from inventory import scan

def load(name):
    return json.loads(gzip.decompress((OUT / name).read_bytes()))

def main():
    n = int(sys.argv[1])
    main_sha = sys.argv[2]
    mapping = load(f'mapping-{n}.json.gz')
    meta = load(f'metadata-{n}.json.gz')
    root = ROOT / TARGETS[n]
    result = {'todo': n, 'startedAt': utc(), 'path': str(root), 'main': main_sha, 'success': False, 'errors': []}
    try:
        assert mapping['preservationCompleted'] and not mapping['unmatched']
        assert not meta['readOnlyFiles'] and not meta['unmappedPackages']
        assert root.absolute() == root and root.parent == ROOT and root != CURRENT
        for p in [root, *root.parents]:
            assert not p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT, str(p)
        sources = json.loads((OUT.parent / 'protected-paths.json').read_text(encoding='utf-8-sig'))
        conflicts = [r for r in sources if r.get('source') and (r['path'].lower() == str(root).lower() or r['path'].lower().startswith(str(root).lower() + '\\'))]
        assert not conflicts, conflicts
        result['historicalProtectionConflicts'] = conflicts
        result['head'] = call(root, 'rev-parse', 'HEAD')
        result['remote'] = call(root, 'remote', 'get-url', 'origin')
        result['status'] = call(root, 'status', '--porcelain=v1', '--untracked-files=all')
        result['ancestor'] = call(CURRENT, 'merge-base', '--is-ancestor', mapping['head'], main_sha)
        assert result['head']['stdout'].strip() == mapping['head']
        assert result['remote']['stdout'].strip() == 'https://github.com/xurunxin/WorkMesh.git'
        assert not result['status']['stdout'] and result['status']['exit'] == result['ancestor']['exit'] == 0
        result['registration'] = call(CURRENT, 'worktree', 'list', '--porcelain')
        blocks = result['registration']['stdout'].strip().split('\n\n')
        found = [b for b in blocks if b.splitlines()[0].split(' ', 1)[1].replace('/', '\\').lower() == str(root).lower()]
        assert len(found) == 1 and '\nlocked' not in found[0] and '\nprunable' not in found[0]
        assert 'HEAD ' + mapping['head'] in found[0]
        files, links, nested, errors = scan(root)
        assert not nested and not errors
        expected = {r['path']: r for r in mapping['files']}
        assert {r['path']: r['bytes'] for r in files} == {r['path']: r['bytes'] for r in mapping['files']}
        result['exclusiveReadCount'] = 0
        for f in files:
            p = root / f['path']
            s = p.lstat()
            assert not s.st_file_attributes & (stat.FILE_ATTRIBUTE_REPARSE_POINT | stat.FILE_ATTRIBUTE_READONLY)
            exclusive_open(p)
            h = hashlib.sha256()
            with p.open('rb') as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(chunk)
            assert h.hexdigest() == expected[f['path']]['windowsSha256'], f['path']
            result['exclusiveReadCount'] += 1
        expected_links = {r['path']: r for r in meta['links']}
        assert {r['path'] for r in links} == set(expected_links)
        for link in links:
            old = expected_links[link['path']]
            assert old['insideCandidate'] and link['target'] == old['target']
            actual = raw_link(root / link['path'])
            assert actual['rawSha256'] == old['rawSha256'] and actual['tag'] in (0xa0000003, 0xa000000c)
        result['linkCount'] = len(links)
        result['logicalBytes'] = sum(r['bytes'] for r in files)
        result['success'] = True
    except (OSError, AssertionError, ValueError) as e:
        result['errors'].append({'type': type(e).__name__, 'message': str(e), 'action': '停止该目标；未发删除调用'})
    result['endedAt'] = utc()
    write(f'verification-{n}.json', result)
    print(json.dumps({k: result.get(k) for k in ('todo', 'success', 'exclusiveReadCount', 'linkCount', 'logicalBytes', 'errors')}, ensure_ascii=False), flush=True)
    if not result['success']:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
