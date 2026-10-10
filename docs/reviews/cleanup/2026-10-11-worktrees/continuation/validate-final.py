"""必要交付解析/ZIP 原字节和结果核验；不执行产品测试或删除。"""
import sys
sys.dont_write_bytecode = True
import ast
import gzip
import hashlib
import json
from pathlib import Path
import zipfile
from audit import OUT, CURRENT, utc, write, call

def main():
    parsed, gzip_index, scripts = [], [], []
    for p in sorted(OUT.iterdir()):
        if p.is_dir():
            continue
        data = p.read_bytes()
        if p.name.endswith('.json.gz'):
            raw = gzip.decompress(data)
            json.loads(raw.decode('utf-8-sig'))
            gzip_index.append({'path': p.name, 'gzipBytes': len(data), 'gzipSha256': hashlib.sha256(data).hexdigest(), 'jsonBytes': len(raw), 'jsonSha256': hashlib.sha256(raw).hexdigest()})
            parsed.append(p.name)
        elif p.suffix == '.json':
            json.loads(data.decode('utf-8-sig'))
            parsed.append(p.name)
        elif p.suffix == '.jsonl':
            for line in data.decode('utf-8-sig').splitlines():
                json.loads(line)
            parsed.append(p.name)
        elif p.suffix == '.py':
            ast.parse(data.decode('utf-8-sig'))
            scripts.append(p.name)
    for p in [OUT.parent/'usage-inventory.py']:
        ast.parse(p.read_text(encoding='utf-8-sig'))
        scripts.append(str(p.relative_to(CURRENT)))
    json.loads((OUT.parent/'cleanup-rules.json').read_text(encoding='utf-8-sig'))
    pre = json.loads((OUT/'preflight.json').read_text(encoding='utf-8-sig'))
    archives = []
    for item in pre['newArchives']:
        p = CURRENT / item['path']
        data = p.read_bytes()
        assert len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256']
        with zipfile.ZipFile(p) as z:
            assert z.testzip() is None
        archives.append({**item, 'preflightBytesUnchanged': True, 'finalCRCPassed': True})
    results = json.loads((OUT/'results.json').read_text(encoding='utf-8-sig'))
    post = json.loads((OUT/'postflight.json').read_text(encoding='utf-8-sig'))
    assert results['newRemovedCount'] == 4 and results['newRemovedLogicalBytes'] == 13118350054
    assert results['attributablePhysicalNetReleasedBytes'] is None
    assert post['registrationHealthy'] and post['allNewCandidatesRemoved'] and post['protectedExistenceUnchanged']
    for n in (54,55,56,57):
        m = json.loads(gzip.decompress((OUT/f'mapping-{n}.json.gz').read_bytes()))
        assert m['preservationCompleted'] and not m['unmatched'] and not m['preservationErrors']
        meta = json.loads(gzip.decompress((OUT/f'metadata-{n}.json.gz').read_bytes()))
        assert not meta['unmappedPackages'] and not meta['readOnlyFiles']
        e = json.loads((OUT/f'execution-{n}.json').read_text(encoding='utf-8-sig'))
        assert not e['error'] and e['targetExistsAfter'] is False
        assert all(r['exit'] == 0 for r in e['calls'])
    write('validation-before-result-commit.json', {'recordedAt': utc(), 'jsonJsonlGzipParsed': parsed, 'pythonAstParsed': scripts,
                                                 'gzipIndex': gzip_index, 'archives': archives, 'resultsPassed': True,
                                                 'productTestsRun': False, 'reason': '只运行本卡所需证据/解析/登记检查；没有产品变更'})
    print(json.dumps({'parsedFiles': len(parsed), 'pythonScripts': len(scripts), 'archives': len(archives), 'resultsPassed': True}, ensure_ascii=False))

if __name__ == '__main__':
    main()
