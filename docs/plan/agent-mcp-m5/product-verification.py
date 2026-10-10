"""核验暂存 Git 对象、运行字节、检查绑定及脱敏 ZIP；不提交、推送或删除。"""
from pathlib import Path
import datetime, hashlib, json, re, subprocess, sys, time, zipfile

ROOT = Path(__file__).resolve().parents[3]
DOC = ROOT / 'docs/plan/agent-mcp-m5'
RECEIPT = 'docs/plan/agent-mcp-m5/product-final-verification.json'
sys.stdout.reconfigure(encoding='utf8', errors='replace')

def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert result.returncode == 0, 'Git 只读核验失败：' + ' '.join(args)
    return result.stdout

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
tick = time.monotonic()
check = subprocess.run(['git', 'diff', '--cached', '--check'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
assert check.returncode == 0, check.stdout.decode(errors='replace') + check.stderr.decode(errors='replace')
paths = [p for p in git('diff', '--cached', '--name-only', '-z').decode().split('\0') if p and p != RECEIPT]
assert paths, '尚无本轮暂存内容'
rows = []
for path in paths:
    assert not path.startswith('ci-logs/'), '历史运行文件必须保全原字节'
    file = ROOT / path
    assert file.is_file() and not file.is_symlink(), '不接受缺失或 link 目标'
    raw = file.read_bytes()
    blob = git('rev-parse', ':' + path).decode().strip()
    staged = git('cat-file', 'blob', blob)
    expected = git('hash-object', '--path=' + path, path).decode().strip()
    assert expected == blob, '工作树经现行属性转换后不匹配暂存：' + path
    if file.suffix != '.zip':
        text = raw.decode('utf8')
        if file.suffix == '.json': json.loads(text)
        if file.suffix == '.md':
            for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
                if ':' in link or link.startswith('#'): continue
                target = (file.parent / link.split('#')[0]).resolve()
                assert target == ROOT / RECEIPT or target.exists(), '失效本地链接：' + path + ' → ' + link
    rows.append({'path': path, 'blob': blob, 'gitSha256': sha(staged), 'runtimeSha256': sha(raw),
                 'gitBytes': len(staged), 'runtimeBytes': len(raw), 'sameBytes': raw == staged})

index = json.loads((DOC / 'product-evidence-index.json').read_text(encoding='utf8'))
archive = DOC / index['archive']
assert sha(archive.read_bytes()) == index['sha256']
with zipfile.ZipFile(archive) as zipped:
    assert set(zipped.namelist()) == {row['member'] for row in index['entries']}
    for row in index['entries']: assert sha(zipped.read(row['member'])) == row['publicSha256']
for previous in index.get('supersededArchives', []):
    assert sha((DOC / previous['archive']).read_bytes()) == previous['sha256']
origin = json.loads((DOC / 'input/product-platform-readback-provenance.json').read_text(encoding='utf8'))
originzip = DOC / 'input' / origin['rawArchive']
assert sha(originzip.read_bytes()) == origin['rawArchiveSha256']
with zipfile.ZipFile(originzip) as zipped: assert sha(zipped.read(origin['member'])) == origin['rawSha256']
assert sha((DOC / 'input/product-platform-todo-readback.txt').read_bytes()) == origin['readableSha256']
frozen = ['frozen-m5.md', 'spec.md', 'savedplan.md', 'implementation.md', 'source-manifest.json']
for file in frozen:
    assert not git('diff', 'HEAD', '--', 'docs/plan/agent-mcp-m5/' + file), '禁止倒写冻结历史：' + file
receipts = json.loads((DOC / 'product-checks.json').read_text(encoding='utf8'))
observation = json.loads((DOC / 'input/product-main-observation.json').read_text(encoding='utf8'))
main = observation['show']['content'][0]['text'].splitlines()[0]
range_check = subprocess.run(['git', 'diff', '--cached', '--check', main], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
assert range_check.returncode == 0, range_check.stdout.decode(errors='replace') + range_check.stderr.decode(errors='replace')
range_paths = set(git('diff', '--no-renames', '--name-only', '-z', main, 'HEAD').decode().split('\0'))
range_paths.update(paths); range_paths.discard('')
classifier = subprocess.run(['node', '--input-type=module', '-e',
    "import {readFileSync} from 'node:fs'; import {classifyChanges,readWorkspaces} from './scripts/ci-policy.mjs'; console.log(JSON.stringify(classifyChanges(JSON.parse(readFileSync(0,'utf8')),readWorkspaces())))"],
    cwd=ROOT, input=json.dumps(sorted(range_paths)).encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
assert classifier.returncode == 0, classifier.stderr.decode(errors='replace')
ci_plan = json.loads(classifier.stdout)
bindings = []
for row in receipts:
    if 'sourceBinding' not in row: continue
    source = ROOT / row['sourceBinding']['path']
    assert sha(source.read_bytes()) == row['sourceBinding']['sha256']
    captured = json.loads(source.read_text(encoding='utf8'))['after']['entries']
    delta = [item['path'] for item in captured if (ROOT / item['path']).is_file()
             and sha((ROOT / item['path']).read_bytes()) != item['sha256']]
    bindings.append({'label': row['label'], 'exit': row['nativeExit'], 'runtimeDeltaSinceCheck': delta,
                     'meaning': '逐文件字节关联；不是逐行执行覆盖，新增测试不能借旧检查数量'})
    for log in row['logs'].values(): assert sha((ROOT / log['path']).read_bytes()) == log['sha256']
result = {'startedAt': started, 'endedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'runtimeSeconds': time.monotonic() - tick, 'nativeExit': 0,
          'headBeforePlatformCommit': git('rev-parse', 'HEAD').decode().strip(),
          'stagedDiffCheck': {'argv': ['git', 'diff', '--cached', '--check'], 'exit': check.returncode,
                              'stdout': check.stdout.decode(), 'stderr': check.stderr.decode()},
          'stagedRangeDiffCheck': {'argv': ['git', 'diff', '--cached', '--check', main], 'exit': range_check.returncode,
                                   'stdout': range_check.stdout.decode(), 'stderr': range_check.stderr.decode()},
          'files': rows, 'checkBindings': bindings, 'archiveMembersVerified': len(index['entries']),
          'staticCiClassification': {'mainObserved': main, 'paths': sorted(range_paths), 'exit': classifier.returncode,
                                     'plan': ci_plan, 'meaning': '提交前实跑分类器；不是最新PR RequiredCI运行或通过证据'},
          'receiptExcludedFromOwnManifest': RECEIPT,
          'commitReadback': '提交后沿本回执逐 blob 实读；本文件不伪预写未来 head 或结果',
          'fullM5Acceptance': '未完成；OpenCode隔离门禁失败与membership合同缺口保留'}
(DOC / 'product-final-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8', newline='\n')
print(json.dumps({'verifiedStagedFiles': len(rows), 'archiveMembersVerified': len(index['entries']), 'nativeExit': 0}))
