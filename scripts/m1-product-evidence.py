"""从实际回执生成产品索引；不推断退出码、不把计划用例标为已运行。"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
directory = root / 'docs/plan/agent-mcp-m1'
evidence = directory / 'product-evidence'
digest = lambda data: hashlib.sha256(data).hexdigest()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
current_changed_paths = subprocess.check_output(['git', 'diff', '--name-only', 'e49eda142d61bdd248ddc42ec16f5563abd4bbc6', '--'], cwd=root, stderr=subprocess.DEVNULL).decode().splitlines()
current_untracked_paths = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
def is_product_input(relative):
    return relative.startswith(('apps/', 'packages/')) or relative in ('OPENAPI.yaml', 'SCHEMA.sql', 'vitest.config.ts')
current_product_paths = {relative for relative in current_changed_paths + current_untracked_paths
                         if is_product_input(relative) and (root / relative).is_file()}
checks = []
for path in sorted(evidence.glob('*.json')):
    receipt = json.loads(path.read_text(encoding='utf8'))
    if not isinstance(receipt, dict) or 'command' not in receipt:
        continue
    log = evidence / (path.stem + '.log')
    text = log.read_text(encoding='utf8', errors='replace') if log.exists() else ''
    summaries = [line.strip() for line in text.splitlines()
                 if re.search(r'Test Files\s+|Tests\s+\d|\d+ (passed|failed|skipped) \(', line)
                 or re.match(r'# (tests|pass|fail|skipped) ', line)]
    changed_inputs = []
    pre_post_changed = []
    captured_paths = set()
    archive_path = evidence / receipt.get('inputArchive', '')
    input_availability = 'not_recorded'
    input_hash_matches = None
    if archive_path.is_file():
        input_availability = 'unclosed_or_invalid'
        input_hash_matches = digest(archive_path.read_bytes()) == receipt.get('inputArchiveSha256') if receipt.get('inputArchiveSha256') else None
    if archive_path.is_file() and zipfile.is_zipfile(archive_path):
        input_availability = 'verified_manifest'
        with zipfile.ZipFile(archive_path) as saved:
            for row in json.loads(saved.read('inputs.json')):
                relative = row['path']
                captured_paths.add(relative)
                original = saved.read('worktree/' + relative)
                assert len(original) == row['worktreeBytes'] and digest(original) == row['worktreeSha256']
                if row.get('gitSha256'):
                    assert digest(saved.read('git/' + relative)) == row['gitSha256']
                source = root / relative
                if is_product_input(relative):
                    current = digest(source.read_bytes()) if source.is_file() else None
                    if current != row['worktreeSha256']:
                        changed_inputs.append(relative)
                    post = receipt.get('postFingerprints')
                    if isinstance(post, dict) and post.get(relative) != row['worktreeSha256']:
                        pre_post_changed.append(relative)
    checks.append(dict(name=path.stem, command=receipt['command'], exitCode=receipt.get('exitCode'),
                       status='finished' if receipt.get('exitCode') is not None else 'interrupted_or_unfinished',
                       runtimeSeconds=receipt.get('runtimeSeconds'), node=receipt.get('node'),
                       inputArchive=receipt.get('inputArchive'), inputArchiveSha256=receipt.get('inputArchiveSha256'),
                       inputArchiveAvailability=input_availability, inputArchiveHashMatchesReceipt=input_hash_matches,
                       log=log.name if log.exists() else None,
                       rawLogSha256=digest(log.read_bytes()) if log.exists() else None,
                       readableLogSha256=digest(('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n').encode()) if log.exists() else None,
                       summaries=summaries, changedProductInputsSinceRun=changed_inputs,
                       productInputsChangedDuringRun=pre_post_changed,
                       postFingerprintAvailable=isinstance(receipt.get('postFingerprints'), dict),
                       currentChangedProductPathsNotInInputArchive=sorted(current_product_paths - captured_paths),
                       absentPathBoundary='输入只归档运行当时相对实际 main 的差异；后来新增差异另列，不从旧 HEAD 猜其运行字节或静态补造通过'))
(evidence / 'check-index.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
lines = ['# 实际命令与受测组合索引', '',
         '退出码只取原回执；缺失与中断保持未知。数量取完整原日志，各 workspace 小计不冒单一总数。输入 ZIP 保存 Git blob 与运行工作树双字节；下列“后来变化”不等于原结果无效，但须按影响补验证。', '',
         '| 回执 | 退出 / 秒 | 实际数量 | 后来变化 / 运行期间变化 / 当时未捕获的新差异 |', '| --- | --- | --- | --- |']
for check in checks:
    summary = '<br>'.join(check['summaries']) or '无数量摘要；见原日志'
    lines.append(f'| [{check["name"]}]({check["name"]}.json) | {check["exitCode"]} / {check["runtimeSeconds"]} | {summary} | {len(check["changedProductInputsSinceRun"])} / {len(check["productInputsChangedDuringRun"])} / {len(check["currentChangedProductPathsNotInInputArchive"])}（post 是否可用及精确路径见 JSON） |')
(evidence / 'check-index.md').write_text('\n'.join(lines) + '\n', encoding='utf8')

# Preserve full log bytes before making readable copies pass the repository's
# existing whitespace check. No .gitattributes/check bypass is introduced.
previous_index_path = evidence / 'raw-log-index.json'
if previous_index_path.exists():
    previous_index = json.loads(previous_index_path.read_text(encoding='utf8'))
    previous_archive = previous_index['archive']
    history_path = evidence / ('raw-log-index-' + Path(previous_archive).stem.removeprefix('raw-logs-') + '.json')
    if not history_path.exists():
        history_path.write_bytes(previous_index_path.read_bytes())
raw_members = {}
raw_index = []
for path in sorted(evidence.glob('*.log')):
    worktree = path.read_bytes()
    relative = path.relative_to(root).as_posix()
    raw_index.append(dict(path=relative, kind='worktree', bytes=len(worktree), sha256=digest(worktree), sourceHead=head))
    raw_members['bytes/' + digest(worktree)] = worktree
    git = subprocess.run(['git', 'show', f'{head}:{relative}'], cwd=root, capture_output=True)
    if git.returncode == 0:
        raw_index.append(dict(path=relative, kind='git-blob', bytes=len(git.stdout), sha256=digest(git.stdout), sourceHead=head))
        raw_members['bytes/' + digest(git.stdout)] = git.stdout
    readable = '\n'.join(line.rstrip() for line in worktree.decode('utf8', errors='replace').splitlines()).rstrip() + '\n'
    path.write_text(readable, encoding='utf8', newline='\n')
archive = evidence / ('raw-logs-' + digest(json.dumps(raw_index, sort_keys=True).encode())[:16] + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as saved:
    for name, data in raw_members.items():
        saved.writestr(name, data)
    saved.writestr('index.json', json.dumps(raw_index, ensure_ascii=False, indent=2))
with zipfile.ZipFile(archive) as saved:
    for row in raw_index:
        data = saved.read('bytes/' + row['sha256'])
        assert len(data) == row['bytes'] and digest(data) == row['sha256']
(evidence / 'raw-log-index.json').write_text(json.dumps(dict(archive=archive.name, bytes=archive.stat().st_size,
    sha256=digest(archive.read_bytes()), entries=raw_index,
    originalRawIndexes=[path.name for path in sorted(evidence.glob('raw-log-index-*.json'))]), ensure_ascii=False, indent=2) + '\n', encoding='utf8')

changed = subprocess.check_output(['git', 'diff', '--name-only', 'e49eda142d61bdd248ddc42ec16f5563abd4bbc6', '--'], cwd=root, stderr=subprocess.DEVNULL).decode().splitlines()
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
source_rows = []
with zipfile.ZipFile(evidence / 'final-product-source.zip', 'w', zipfile.ZIP_DEFLATED) as saved:
    for relative in sorted(set(changed + untracked)):
        path = root / relative
        if not path.is_file() or relative.startswith(('docs/plan/', 'ci-logs/')) or path.suffix == '.zip':
            continue
        data = path.read_bytes()
        git = subprocess.run(['git', 'show', f'{head}:{relative}'], cwd=root, capture_output=True)
        saved.writestr('worktree/' + relative, data)
        if git.returncode == 0:
            saved.writestr('git/' + relative, git.stdout)
        source_rows.append(dict(path=relative, worktreeBytes=len(data), worktreeSha256=digest(data),
          gitBytes=len(git.stdout) if git.returncode == 0 else None, gitSha256=digest(git.stdout) if git.returncode == 0 else None,
          gitSourceHead=head, relation='identity' if git.returncode == 0 and git.stdout == data else 'distinct bytes preserved'))
    saved.writestr('source-index.json', json.dumps(source_rows, ensure_ascii=False, indent=2))
(evidence / 'product-source-index.json').write_text(json.dumps(source_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
with zipfile.ZipFile(evidence / 'final-product-source.zip') as saved:
    for row in source_rows:
        data = saved.read('worktree/' + row['path'])
        assert len(data) == row['worktreeBytes'] and digest(data) == row['worktreeSha256']
        if row['gitSha256']:
            data = saved.read('git/' + row['path'])
            assert len(data) == row['gitBytes'] and digest(data) == row['gitSha256']
for check in checks:
    if check['log']:
        assert digest((evidence / check['log']).read_bytes()) == check['readableLogSha256']
print(json.dumps(dict(checks=len(checks), sourceFiles=len(source_rows), rawArchive=archive.name, sourceHead=head)))
