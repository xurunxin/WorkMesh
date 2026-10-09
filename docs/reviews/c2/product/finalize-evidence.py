"""收集已保全截图、更新真实工作树/Git blob 清单，不生成自引用提交 SHA。"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/product'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sha(body):
    return hashlib.sha256(body).hexdigest()

verification = read(BASE / 'verification.json')
full = ROOT / verification['current']['requiredChecks'][0]['receipt']
e2e = ROOT / next(check['receipt'] for check in verification['current']['requiredChecks'] if check['label'] == 'test-e2e')
baseline = ROOT / verification['visualBaseline']
images = [
    (baseline.parent, 'c2-baseline-login.png', 'before-login.png', '实施前：未保留登录目的地'),
    (baseline.parent, 'c2-baseline-authorized.png', 'before-authorized.png', '实施前：手动打开详情但未聚焦'),
    (e2e.parent, 'c2-before-login.png', 'after-login.png', '实施后：保留 canonical 安全登录返回'),
    (e2e.parent, 'c2-after-authorized-login.png', 'after-authorized.png', '实施后：有权当前 Human 详情聚焦'),
    (e2e.parent, 'c2-forwarded-unauthorized.png', 'after-forwarded.png', '实施后：不同当前 Human 无权，内容不可见'),
]
image_dir = BASE / 'ui'; image_dir.mkdir(exist_ok=True)
image_index = []
for folder, filename, target, label in images:
    with zipfile.ZipFile(folder / 'ui-evidence.zip') as archive:
        if archive.testzip() is not None:
            raise RuntimeError('UI ZIP CRC 校验失败')
        members = [name for name in archive.namelist() if name.endswith('/' + filename)]
        if len(members) != 1:
            raise RuntimeError('实际前后截图缺失或重复')
        body = archive.read(members[0])
    (image_dir / target).write_bytes(body)
    image_index.append({'path': 'ui/' + target, 'label': label, 'archive': (folder / 'ui-evidence.zip').relative_to(ROOT).as_posix(), 'member': members[0], 'bytes': len(body), 'sha256': sha(body)})
write(BASE / 'ui-index.json', image_index)
review = ROOT / 'docs/reviews/c2/product-review.md'
review.write_text(review.read_text(encoding='utf-8').rstrip() + '''

## 前后截图

两轮均插入相同内容的 C2 私有提醒；实施后的完整 E2E 还包含其它场景，因此列表和计数不同，不将这些测试数据差异当作产品改动。返回路径、当前身份和焦点以对应断言为证。

| 场景 | 实施前 | 实施后 |
| --- | --- | --- |
| 登录 | ![登录前](product/ui/before-login.png) | ![安全登录返回](product/ui/after-login.png) |
| 有权详情 | ![未聚焦详情](product/ui/before-authorized.png) | ![已重新授权并聚焦](product/ui/after-authorized.png) |

无权转发者实际页面：

![转发后无权](product/ui/after-forwarded.png)

截图原字节与来源见 [ui-index.json](product/ui-index.json)；浏览器 URL、当前身份和焦点通过实际 Playwright 断言，截图不冒作路径/授权证明。
''', encoding='utf-8')

# 源码与配置绑定：OID 是真实索引 blob；工作树字节与 Git 换行转换分列。
subprocess.run(['git', 'add', '--all'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
changed = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '18252ba8761aa810c3fd12d31ecae83e8b24d985'], cwd=ROOT).decode().splitlines()
source_index = []
for name in changed:
    path = ROOT / name
    if not path.is_file() or name.startswith('docs/'):
        continue
    body = path.read_bytes()
    oid = subprocess.check_output(['git','rev-parse', ':' + name],cwd=ROOT).decode().strip()
    blob = subprocess.check_output(['git','cat-file','blob',oid],cwd=ROOT)
    source_index.append({'path': name, 'worktree': {'bytes':len(body),'sha256':sha(body)}, 'gitBlob': {'bytes':len(blob),'sha256':sha(blob),'oid':oid}, 'identity': '字节一致' if body==blob else 'Git 换行转换；分别保存两类哈希'})
write(BASE / 'final-source-index.json', source_index)

manifest_path = ROOT / 'docs/plan/c2-wecom/MANIFEST.json'
manifest = read(manifest_path)
manifest['currentProductManifest'] = {'updatedAt': datetime.now(timezone.utc).isoformat(), 'input': 'docs/reviews/c2/product-input.json', 'sourceIndex':'docs/reviews/c2/product/final-source-index.json', '说明':'既有 inputMain/generatedAt 保留历史值；当前可变文档哈希按真实索引重新登记，非伪造历史原件'}
for file in manifest['files']:
    body = (ROOT / file['path']).read_bytes()
    oid = subprocess.check_output(['git', 'rev-parse', ':' + file['path']],cwd=ROOT).decode().strip()
    blob = subprocess.check_output(['git', 'cat-file', 'blob', oid],cwd=ROOT)
    file['worktree'] = {'bytes':len(body),'sha256':sha(body)}
    file['gitBlob'] = {'bytes':len(blob),'sha256':sha(blob),'oid':oid}
    file['identity'] = '字节一致' if body==blob else 'Git 换行转换；工作树/Git 各自哈希分别保留'
write(manifest_path, manifest)

# 证明产品检查后的源码与待提交 Git blob 同体，不能只比较文件名或历史 CI。
proof = read(e2e.parent / next(check['sourceAfter']['path'] for check in read(e2e)['checks'] if check['label']=='test-e2e'))
for row in proof:
    body = (ROOT / row['path']).read_bytes()
    oid = subprocess.check_output(['git', 'rev-parse', ':' + row['path']],cwd=ROOT).decode().strip()
    if sha(body) != row['worktreeSha256'] or oid != row['filteredGitOid']:
        raise RuntimeError('最终源输入与受测源码不一致：' + row['path'])
for zip_path in BASE.rglob('*.zip'):
    staged = subprocess.check_output(['git','show', ':' + zip_path.relative_to(ROOT).as_posix()],cwd=ROOT)
    if staged != zip_path.read_bytes():
        raise RuntimeError('证据 ZIP 被 Git 改写：' + str(zip_path))
print('截图、源码/索引 blob、原始 ZIP 字节校验通过；未提交产品合入/验收声明')
