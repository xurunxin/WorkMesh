"""补足现场证据映射与安全脱敏保全；仅写当前交付目录。"""
import sys
sys.dont_write_bytecode = True
import base64
import collections
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile
from audit import OUT, CURRENT, ROOT, MAIN, TARGETS, write, utc

def sha(b):
    return hashlib.sha256(b).hexdigest()

def git(*args):
    return subprocess.run(['git', '-C', str(CURRENT), *args], capture_output=True, check=True).stdout

def load(name):
    return json.loads(gzip.decompress((OUT / name).read_bytes()))

SECRET_KEYS = {'password', 'csrf_token', 'csrftoken', 'access_token', 'refresh_token', 'apikey', 'api_key', 'clientsecret', 'client_secret', 'secretkey', 'secret_key', 'authorization', 'cookie', 'set-cookie', 'token'}
CREDENTIAL = re.compile(rb'\b(?:wmi|wmp|wms|ghp|gho|ghu|github_pat)_[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?i:Bearer)[ \t]+[A-Za-z0-9._~-]+')
ENV_VALUES = [v.encode() for k, v in os.environ.items() if len(v) >= 8 and re.search(r'TOKEN|SECRET|PASSWORD|API_KEY', k, re.I)]

def collect_values(value, values):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in SECRET_KEYS and isinstance(item, str) and len(item) >= 4 and not item.startswith('[REDACTED'):
                values.add(item.encode())
            collect_values(item, values)
    elif isinstance(value, list):
        for item in value:
            collect_values(item, values)

def json_values(data):
    values = set()
    try:
        collect_values(json.loads(data.decode('utf-8-sig')), values)
    except (ValueError, UnicodeDecodeError):
        for line in data.splitlines():
            try:
                collect_values(json.loads(line), values)
            except (ValueError, UnicodeDecodeError):
                pass
    return values

def sanitize(data, suffix, trail, log, extra_values=()):
    # 不解包到磁盘，不执行归档内容；ZIP/HTML 内嵌 ZIP 同样检查。
    if data.startswith(b'PK\x03\x04'):
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            members = [(info, z.read(info)) for info in z.infolist() if not info.is_dir()]
        values = set(extra_values)
        for info, b in members:
            values.update(json_values(b))
        changed = False
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for info, b in members:
                fixed = sanitize(b, Path(info.filename).suffix, trail + '!' + info.filename, log, values)
                changed |= fixed != b
                z.writestr(info.filename, fixed)
        return out.getvalue() if changed else data
    if suffix.lower() in ('.png', '.jpg', '.jpeg', '.exe', '.node', '.dll', '.woff', '.woff2'):
        return data
    try:
        data.decode('utf-8-sig')
    except UnicodeDecodeError:
        # 未识别的非文本原件不能声称完成脱敏。
        raise ValueError('非文本原件缺少格式安全核验: ' + trail)
    values = set(extra_values) | json_values(data)
    fixed = data
    for v in ENV_VALUES + sorted(values, key=len, reverse=True):
        if v and v in fixed:
            fixed = fixed.replace(v, b'[REDACTED_TASK_SECRET]')
    fixed = CREDENTIAL.sub(b'[REDACTED_CREDENTIAL]', fixed)
    # Playwright HTML 的内嵌报告归档可能包含 trace/请求。
    def embed(match):
        try:
            decoded = base64.b64decode(match.group(1), validate=True)
        except ValueError:
            return match.group(0)
        if not decoded.startswith(b'PK\x03\x04'):
            return match.group(0)
        replaced = sanitize(decoded, '.zip', trail + '!embedded-report.zip', log)
        return match.group(0).replace(match.group(1), base64.b64encode(replaced)) if replaced != decoded else match.group(0)
    fixed = re.sub(rb'<script[^>]*id="playwrightReportBase64"[^>]*>([A-Za-z0-9+/=\r\n]+)</script>', embed, fixed)
    if fixed != data:
        log.append({'path': trail, 'originalBytes': len(data), 'originalSha256': sha(data), 'sanitizedBytes': len(fixed), 'sanitizedSha256': sha(fixed), 'method': '本任务已知环境秘密、JSON/JSONL 凭据字段值、credential/JWT/Bearer 模式；ZIP 跨成员秘密值与 HTML 内嵌报告同步替换；不保存秘密值'})
    assert not CREDENTIAL.search(fixed), trail
    return fixed

def main():
    blobs = load('blob-digests.json.gz')
    sources = load('sources-read.json.gz')['sources']
    source_by_sha = {}
    for s in sources:
        source_by_sha[s['windowsSha256']] = {'commit': MAIN, 'path': s['path'], 'blob': s['blob'], 'gitBytes': s['gitBytes'], 'gitSha256': s['gitSha256'], 'windowsBytes': s['windowsBytes'], 'windowsSha256': s['windowsSha256'], 'reconstruction': s['reconstruction']}
        source_by_sha[s['gitSha256']] = {'commit': MAIN, 'path': s['path'], 'blob': s['blob'], 'gitBytes': s['gitBytes'], 'gitSha256': s['gitSha256'], 'reconstruction': 'identity'}
    members = load('zip-members.json.gz')
    chosen = [int(x) for x in sys.argv[1:]] or list(TARGETS)
    for n in chosen:
        mapping = load(f'mapping-{n}.json.gz')
        if mapping.get('preservationCompleted'):
            print(json.dumps({'todo': n, 'result': '已有本轮保全映射；未重写'}, ensure_ascii=False))
            continue
        root = ROOT / TARGETS[n]
        unmatch = set(mapping['unmatched'])
        errors, redactions, archive_index = [], [], []
        archive = OUT / f'additional-evidence-{n}.zip'
        seen = {}
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for row in mapping['files']:
                rel = row['path']
                # runtime 下的工具/CI 原件均为证据，即便上游分类含 node_modules。
                special = bool(re.search(r'/\.m[123]-runtime/', rel))
                if row['kind'] == 'rebuildable-output' and special:
                    row['kind'] = 'requires-preservation'
                    unmatch.add(rel)
                if rel not in unmatch:
                    continue
                data = (root / rel).read_bytes()
                assert len(data) == row['bytes'] and sha(data) == row['windowsSha256']
                if row['kind'] == 'tracked':
                    b = git('cat-file', 'blob', row['gitBlob'])
                    transforms = {'normalize-CRLF-to-LF': b.replace(b'\r\n', b'\n'), 'normalize-CRLF-to-LF-then-LF-to-CRLF': b.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')}
                    match = next((k for k, v in transforms.items() if v == data), None)
                    if match:
                        row['reconstruction'] = match
                        unmatch.remove(rel)
                        continue
                if sha(data) in source_by_sha:
                    row.update(kind='archived-evidence' if row['kind'] != 'tracked' else 'tracked-runtime-variant', source=source_by_sha[sha(data)], reconstruction='对应持久 Git blob 经明确变换后等于现场原字节')
                    unmatch.remove(rel)
                    continue
                if sha(data) in members:
                    row.update(kind='archived-evidence' if row['kind'] != 'tracked' else 'tracked-runtime-variant', source=members[sha(data)][0], reconstruction='ZIP 成员等于现场原字节')
                    unmatch.remove(rel)
                    continue
                try:
                    fixed = sanitize(data, Path(rel).suffix, f'#{n}/{rel}', redactions)
                except (ValueError, zipfile.BadZipFile) as e:
                    errors.append({'path': rel, 'error': str(e), 'decision': '保留父工作树；不以缺少格式核验放行'})
                    continue
                digest = sha(fixed)
                member = seen.get(digest)
                if member is None:
                    member = 'bytes/' + digest + Path(rel).suffix
                    z.writestr(member, fixed)
                    seen[digest] = member
                source = {'zip': str(archive.relative_to(CURRENT)).replace('\\', '/'), 'member': member, 'bytes': len(fixed), 'sha256': digest, 'commit': 'pending-preflight-commit', 'redacted': fixed != data}
                archive_index.append({'path': rel, 'originalBytes': len(data), 'originalSha256': sha(data), 'source': source})
                row.update(kind='new-preserved-evidence', source=source, reconstruction='脱敏原件；原秘密字节不归档' if fixed != data else 'ZIP 成员原字节一致')
                unmatch.remove(rel)
        archive_digest = sha(archive.read_bytes())
        for row in mapping['files']:
            if isinstance(row.get('source'), dict) and row['source'].get('zip') == str(archive.relative_to(CURRENT)).replace('\\', '/'):
                row['source']['zipSha256'] = archive_digest
        mapping.update(unmatched=sorted(unmatch), preservationCompleted=not unmatch, preservationAt=utc(), redactions=redactions, preservationErrors=errors)
        write(f'mapping-{n}.json.gz', mapping)
        write(f'additional-evidence-{n}-index.json', {'todo': n, 'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': archive_digest, 'members': archive_index, 'redactions': redactions, 'errors': errors})
        print(json.dumps({'todo': n, 'unmatched': len(unmatch), 'unmatchedPaths': sorted(unmatch), 'newArchiveBytes': archive.stat().st_size, 'newMembers': len(seen), 'redactions': len(redactions), 'errors': errors, 'kinds': dict(collections.Counter(r['kind'] for r in mapping['files']))}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
