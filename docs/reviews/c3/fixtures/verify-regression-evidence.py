"""独立核验 C3 的精确 Git 源码、原始浏览器报告与逐项对照。"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

review = Path(__file__).resolve().parents[1]
repo = Path(__file__).resolve().parents[4]
source = json.loads((review / 'mocked-regression-sources.json').read_text(encoding='utf8'))
comparison = json.loads((review / 'mocked-regression-comparison.json').read_text(encoding='utf8'))
index = json.loads((review / 'mocked-regression-evidence-index.json').read_text(encoding='utf8'))
archive = review / index['archive']
assert hashlib.sha256(archive.read_bytes()).hexdigest() == index['archiveSha256']


def plain(value):
    return re.sub(r'\x1b\[[0-9;]*m', '', value)


def fingerprint(message):
    value = plain(message)
    waiting = re.findall(r'waiting for ([^\n]+)', value)
    value = re.split(r'Call [Ll]og:', value)[0]
    value = re.split(r'\n\s*>?\s*\d+\s*\||\n\s+at ', value)[0]
    value = re.sub(r':\d+:\d+', ':<line>:<column>', value)
    return value.strip() + ('\n等待目标: ' + waiting[0] if waiting else '')


def parse_report(report):
    rows = {}

    def walk(suite, titles):
        parents = titles + [suite['title']] if titles is not None else []
        for spec in suite.get('specs', []):
            title = ' › '.join(parents + [spec['title']])
            file = spec['file'].replace('\\', '/')
            key = file[file.index('mocked/'):] + ' › ' + title
            assert len(spec['tests']) == 1
            test = spec['tests'][0]
            assert len(test['results']) == 1  # 没有隐藏的 retry。
            result = test['results'][0]
            rows[key] = (result['status'], test['timeout'],
                         [fingerprint(error.get('message', '')) for error in result.get('errors', [])])
        for child in suite.get('suites', []):
            walk(child, parents)

    for suite in report['suites']:
        walk(suite, None)
    return rows


with zipfile.ZipFile(archive) as zipped:
    assert zipped.testzip() is None
    assert len(index['members']) == len(zipped.namelist()) == len(set(zipped.namelist()))
    for member in index['members']:
        data = zipped.read(member['member'])
        assert len(data) == member['bytes']
        assert hashlib.sha256(data).hexdigest() == member['sha256']
        assert f"{zipped.getinfo(member['member']).CRC:08x}" == member['crc32']
    actual = {}
    for label in ['baseline', 'head']:
        report = json.loads(zipped.read(label + '-report.json'))
        receipt = json.loads(zipped.read(label + '-result.json'))
        assert receipt['exitCode'] == 1 and receipt['sourceCommit'] == source['refs'][label]
        assert report['stats'] == comparison['stats'][label]
        actual[label] = parse_report(report)
        assert len(actual[label]) == 47
        for key, (status, timeout, errors) in actual[label].items():
            recorded = comparison['allTests'][label]['tests'][key]
            assert (status, timeout, errors) == (
                recorded['status'], recorded['timeout'], [e['fingerprint'] for e in recorded['errors']])
    assert actual['baseline'] == actual['head']
    assert sum(row[0] == 'passed' for row in actual['head'].values()) == 15
    assert len(comparison['failures']) == 32
    assert {row['originalFailureId'] for row in comparison['failures']} == set(range(1, 33))
    assert {row['key'] for row in comparison['failures']} == {
        key for key, row in actual['head'].items() if row[0] != 'passed'}


def tree(ref):
    data = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', ref], cwd=repo)
    return {row.split(b'\t', 1)[1].decode(): row.split(b'\t', 1)[0].split()[2].decode()
            for row in data.split(b'\x00') if row}


objects = {}
for label in ['baseline', 'head']:
    git_tree = tree(source['refs'][label])
    files = source['source'][label]
    for path, item in files.items():
        if path in ['portPatches', 'runtime']:
            continue
        assert git_tree[path] == item['gitBlob'], path
        objects[item['gitBlob']] = (item['gitBytes'], item['gitSha256'])
    for patch in files['portPatches']:
        assert patch['originalSha256'] == files[patch['path']]['sha256']
    for category in comparison['categories'].values():
        for path in category['files']:
            assert source['source']['baseline'][path]['gitBlob'] == source['source']['head'][path]['gitBlob']

blob_output = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=repo,
                                    input='\n'.join(objects).encode() + b'\n')
offset = 0
blobs = {}
for object_id, (size, sha256) in objects.items():
    end = blob_output.index(b'\n', offset)
    header = blob_output[offset:end].decode().split()
    assert header == [object_id, 'blob', str(size)]
    data = blob_output[end + 1:end + 1 + size]
    assert hashlib.sha256(data).hexdigest() == sha256
    blobs[object_id] = data
    offset = end + 1 + size + 1
assert offset == len(blob_output)
for label in ['baseline', 'head']:
    for path, item in source['source'][label].items():
        if path in ['portPatches', 'runtime']:
            continue
        original = blobs[item['gitBlob']]
        assert item['archiveTransform'] in ['identity', 'lf-to-crlf']
        archived = original if item['archiveTransform'] == 'identity' else original.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        assert len(archived) == item['bytes']
        assert hashlib.sha256(archived).hexdigest() == item['sha256']

delivery = {path: blob for path, blob in tree('HEAD').items() if not path.startswith('docs/')}
expected = {path: item['gitBlob'] for path, item in source['source']['head'].items()
            if path not in ['portPatches', 'runtime']}
assert delivery == expected, '交付产品源码已变化，需重新绑定并检查受影响用例'
subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', '.', ':(exclude)docs'], cwd=repo, check=True)
assert source['postRunSourceCheck']['changesBeyondDeclaredPatches'] == {'baseline': [], 'head': []}
assert comparison['newRegressions'] == comparison['unknownClassification'] == 0
assert not comparison['assertionChanges'] and not comparison['timeoutChanges']
print(f"核验成功：{len(index['members'])} 个归档成员、{len(objects)} 个 Git blob；两份 47 项均 15 通过/32 失败，逐项对照一致。")
