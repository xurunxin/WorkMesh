"""重新登记可变文档当前字节；旧生成时序和原证据保持不变。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[4]
subprocess.run(['git', 'add', '--all'], cwd=ROOT, check=True, stderr=subprocess.DEVNULL)
path = ROOT / 'docs/plan/c2-wecom/MANIFEST.json'
value = json.loads(path.read_text(encoding='utf-8'))
value['currentBackendManifest'] = {'recordedAt': datetime.now(timezone.utc).isoformat(), 'spec': 'docs/reviews/c2/backend/current-spec.md', 'inputMain': 'c768e1e3db297d8b91b53dd68b60e723a8a40e7d', '说明': '只更新当前可变文件字节；原 generatedAt/inputMain 和冻结源保持历史含义'}
for row in value['files']:
    body = (ROOT / row['path']).read_bytes()
    oid = subprocess.check_output(['git', 'rev-parse', ':' + row['path']], cwd=ROOT).decode().strip()
    blob = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=ROOT)
    row['worktree'] = {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest()}
    row['gitBlob'] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest(), 'oid': oid}
    row['identity'] = '字节一致' if body == blob else 'Git 换行转换；工作树/Git 各自哈希分别保留'
path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
