"""登记最终候选文档检查的真实命令、退出与输出；不调整 CI 门禁。"""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/backend'
receipts = []

def run(args):
    started = datetime.now(timezone.utc).isoformat()
    p = subprocess.run(args, cwd=ROOT, capture_output=True)
    row = {'command': args, 'startedAt': started, 'finishedAt': datetime.now(timezone.utc).isoformat(),
           'exitCode': p.returncode, 'stdout': p.stdout.decode('utf-8', errors='replace'), 'stderr': p.stderr.decode('utf-8', errors='replace')}
    receipts.append(row)
    (BASE / 'document-checks.json').write_text(json.dumps(receipts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if p.returncode: raise RuntimeError(str(args) + ' failed')
    print(args, 'exit', p.returncode)

for args in [
    ['node', '--version'],
    ['python', '--version'],
    ['git', 'diff', '--cached', '--check', 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'],
    ['git', 'diff', '--cached', '--check', '5b9c76b5f79917697906520edcd6947bfbfa925f'],
    ['python', 'docs/reviews/c2/backend/verify-candidate.py'],
    ['node', 'docs/plan/c2-wecom/verify-archive.mjs'],
    ['node', 'scripts/validate-lite-compose.mjs'],
]: run(args)

changed = subprocess.check_output(['git', 'diff', '--cached', '--name-only', 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d'], cwd=ROOT).decode().splitlines()
json_files = []
for name in changed:
    path = ROOT / name
    if path.is_file() and path.suffix == '.json':
        json.loads(path.read_text(encoding='utf-8')); json_files.append(name)
links = []
for path in [BASE / 'review.md', BASE / 'README.md']:
    for href in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf-8')):
        if re.match(r'^[a-z]+:', href): continue
        target = (path.parent / href.split('#')[0]).resolve()
        assert target.is_relative_to(ROOT) and target.exists(), (path, href)
        links.append({'source': path.relative_to(ROOT).as_posix(), 'href': href, 'exists': True})
receipts.append({'step': '变更 JSON 与当前复核入口本地链接', 'jsonFiles': json_files, 'links': links, 'exitCode': 0})
(BASE / 'document-checks.json').write_text(json.dumps(receipts, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('JSON/当前入口链接通过')
