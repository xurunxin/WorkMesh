"""执行紧邻前复核完整现场与推送保全；不执行删除。"""
import json
import os
import stat
import sys
import zipfile
from common import *

def main():
    key, main_sha = sys.argv[1:]
    assert key in TARGETS and re_main(main_sha)
    root = ROOT / TARGETS[key]
    result = {'key': key, 'path': str(root), 'main': main_sha, 'startedAt': utc(), 'success': False, 'errors': []}
    try:
        gate(root)
        binding = load(OUT / 'preflight-binding.json')
        assert binding['success']
        mapping_path = OUT / f'mapping-{key}.json.gz'
        mapping = load(mapping_path)
        committed = git('show', binding['commit'] + ':' + str(mapping_path.relative_to(CURRENT)).replace('\\', '/'))
        assert committed == mapping_path.read_bytes()
        assert mapping['preservationCompleted'] and mapping['hardlinkedFileCount'] == 0
        assert not protection_conflicts(root)
        remote = load(OUT / f'remote-main-{key}.json')
        assert remote['sha'] == main_sha and 'refs/heads/main' in str(remote['result'])
        result['head'] = call(root, 'rev-parse', 'HEAD')
        result['status'] = call(root, 'status', '--porcelain=v1', '--untracked-files=all')
        result['remote'] = call(root, 'remote', 'get-url', 'origin')
        result['ancestor'] = call(CURRENT, 'merge-base', '--is-ancestor', mapping['head']['stdout'].strip(), main_sha)
        assert result['head']['stdout'] == mapping['head']['stdout'] and not result['status']['stdout']
        assert result['status']['exit'] == result['ancestor']['exit'] == 0
        assert result['remote']['stdout'].strip() == 'https://github.com/xurunxin/WorkMesh.git'
        for proof in mapping['reflogAncestry']:
            assert call(CURRENT, 'merge-base', '--is-ancestor', proof['input'][-2], main_sha)['exit'] == 0
        result['registration'] = call(CURRENT, 'worktree', 'list', '--porcelain')
        blocks = result['registration']['stdout'].strip().split('\n\n')
        found = [b for b in blocks if b.splitlines()[0].split(' ',1)[1].replace('/','\\').lower() == str(root).lower()]
        assert len(found) == 1 and '\nlocked' not in found[0] and '\nprunable' not in found[0]
        files, links, nested, errors = scanner.scan(root)
        assert not errors and nested == [r['path'] for r in mapping['nestedGit']]
        expected = {r['path']: r for r in mapping['files']}
        assert {r['path']: r['bytes'] for r in files} == {r['path']: r['bytes'] for r in mapping['files']}
        result['exclusiveReadCount'] = 0
        for f in files:
            path = root / f['path']; st = path.lstat()
            assert st.st_nlink == expected[f['path']]['nlink'] == 1
            assert not st.st_file_attributes & (stat.FILE_ATTRIBUTE_READONLY | stat.FILE_ATTRIBUTE_REPARSE_POINT)
            native.exclusive_open(path)
            assert sha(path.read_bytes()) == expected[f['path']]['windowsSha256'], f['path']
            result['exclusiveReadCount'] += 1
        expected_links = {r['path']: r for r in mapping['links']}
        assert {r['path'] for r in links} == set(expected_links)
        for r in links:
            old = expected_links[r['path']]
            assert old['insideCandidate'] and r['target'] == old['target']
            assert native.raw_link(root / r['path'])['rawSha256'] == old['rawSha256']
        archive = OUT / mapping['archive']['path']
        assert sha(archive.read_bytes()) == mapping['archive']['sha256']
        assert git('show', binding['commit'] + ':' + str(archive.relative_to(CURRENT)).replace('\\','/')) == archive.read_bytes()
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for r in mapping['archive']['index']:
                assert sha(z.read(r['source']['member'])) == r['source']['sha256']
        result.update(success=True, linkCount=len(links), logicalBytes=mapping['logicalBytes'])
    except (AssertionError, OSError, ValueError) as error:
        result['errors'].append({'type': type(error).__name__, 'message': str(error), 'action': '停止原目标；未发删除'})
    result['endedAt'] = utc()
    write(f'verification-{key}.json', result)
    print(json.dumps({k: result.get(k) for k in ('key','success','exclusiveReadCount','logicalBytes','errors')}, ensure_ascii=False))
    return 0 if result['success'] else 1

def re_main(value):
    import re
    return re.fullmatch('[0-9a-f]{40}', value)

if __name__ == '__main__':
    sys.exit(main())
