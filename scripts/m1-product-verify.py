"""核最终实际暂存对象、完整范围空白及受控文件，保留独立命令退出。"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
directory = root / 'docs/plan/agent-mcp-m1'
evidence = directory / 'product-evidence'
results = []
for args in [
    ['git', 'add', '--all'],
    ['git', 'diff', '--cached', '--check', 'e49eda142d61bdd248ddc42ec16f5563abd4bbc6', '--'],
]:
    result = subprocess.run(args, cwd=root, capture_output=True)
    results.append(dict(args=args, exitCode=result.returncode,
        stdout=result.stdout.decode('utf8', errors='replace'), stderr=result.stderr.decode('utf8', errors='replace')))
    if result.returncode:
        (evidence / 'final-static-check.json').write_text(json.dumps(dict(commands=results), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
        raise SystemExit('Actual Git object check failed; see final-static-check.json')
frozen = []
for path in ['savedplan.md', 'implementation.md', 'operation-decisions.json', 'schema-proposal.sql', 'wait-dto-proposal.json', 'source-snapshot.zip', 'source-manifest.json']:
    relative = 'docs/plan/agent-mcp-m1/' + path
    original = subprocess.check_output(['git', 'rev-parse', '938f67f88c4f6889cbd49a3fd9b81fbd62aa60f6:' + relative], cwd=root).decode().strip()
    staged = subprocess.check_output(['git', 'rev-parse', ':' + relative], cwd=root).decode().strip()
    assert original == staged, relative + ': frozen plan changed'
    frozen.append(dict(path=relative, gitObjectId=staged, unchangedFromReviewedPlan=True))
assert (directory/'savedplan.md').read_bytes() == (directory/'implementation.md').read_bytes()
mapping = json.loads((directory/'product-operation-matrix.json').read_text(encoding='utf8'))
operations = mapping['operations'] if isinstance(mapping, dict) else mapping
assert len(operations) == 43
source = json.loads((evidence/'product-source-index.json').read_text(encoding='utf8'))
for row in source:
    assert hashlib.sha256((root/row['path']).read_bytes()).hexdigest() == row['worktreeSha256'], row['path']
with zipfile.ZipFile(evidence/'final-product-source.zip') as saved:
    assert saved.testzip() is None
    for row in source:
        assert hashlib.sha256(saved.read('worktree/'+row['path'])).hexdigest() == row['worktreeSha256']
audit = json.loads((evidence/'resource-audit.json').read_text(encoding='utf8'))
assert not audit['remainingOwnedContainers'] and not any(row['sameWorkspace'] for row in audit['currentlyMatchingPids'])
spill = json.loads((evidence/'build-spill-cleanup.json').read_text(encoding='utf8'))
assert spill['status'] == 'finished' and len(spill['resources']) == 114 and all(row['removed'] for row in spill['resources'])
assert not subprocess.check_output(['git','ls-files','--others','--exclude-standard','apps','packages'], cwd=root).strip()
record = dict(observedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    headBeforePlatformCommit=subprocess.check_output(['git','rev-parse','HEAD'], cwd=root).decode().strip(),
    stagedTreeBeforeThisReceipt=subprocess.check_output(['git','write-tree'], cwd=root).decode().strip(),
    commands=results, frozenReviewedInputs=frozen, staticResult='passed', operations=43,
    sourceFiles=len(source), actualSqlOrServicesRun=False,
    boundary='本命令仅最终静态/对象核验；本机产品用例结果来自各原独立运行，不由静态推断。新回执只增文档，不自引用生成提交 SHA。')
(evidence/'final-static-check.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps(dict(result='passed', operations=43, sourceFiles=len(source), gitDiffExit=results[-1]['exitCode'])))
