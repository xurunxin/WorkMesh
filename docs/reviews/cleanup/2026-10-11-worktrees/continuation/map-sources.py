"""逐文件源字节映射；不跟随链接、不删除目标；未知证据保持待保全。"""
import sys
sys.dont_write_bytecode = True
import collections
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile
from audit import OUT, CURRENT, ROOT, MAIN, TARGETS, utc, write, call

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.run(['git', '-C', str(CURRENT), *args], capture_output=True, check=True).stdout

def tree(commit):
    result = {}
    for item in git('ls-tree', '-r', '-z', commit).split(b'\0'):
        if item:
            meta, path = item.split(b'\t')
            mode, kind, blob = meta.decode().split()
            assert kind == 'blob' and mode in ('100644', '100755')
            result[path.decode()] = {'mode': mode, 'blob': blob}
    return result

def read_gzip(name):
    return json.loads(gzip.decompress((OUT / name).read_bytes()))

def digest_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def main():
    audits = read_gzip('audit.json.gz')
    trees = {r['todo']: tree(r['head']['stdout'].strip()) for r in audits}
    main_tree = tree(MAIN)
    all_blobs = {v['blob'] for t in trees.values() for v in t.values()}
    all_blobs.update(v['blob'] for p, v in main_tree.items() if p.startswith('docs/plan/agent-mcp-m'))
    blob_hashes = {}
    proc = subprocess.Popen(['git', '-C', str(CURRENT), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    for blob in sorted(all_blobs):
        proc.stdin.write((blob + '\n').encode())
        proc.stdin.flush()
        header = proc.stdout.readline().decode().split()
        assert header[:2] == [blob, 'blob']
        size = int(header[2])
        data = proc.stdout.read(size)
        assert len(data) == size and proc.stdout.read(1) == b'\n'
        crlf = data.replace(b'\n', b'\r\n')
        blob_hashes[blob] = {'gitBytes': size, 'gitSha256': sha(data), 'crlfBytes': len(crlf), 'crlfSha256': sha(crlf)}
    proc.stdin.close()
    assert proc.wait() == 0
    write('blob-digests.json.gz', blob_hashes)
    print(json.dumps({'phase': 'Git 对象原字节', 'blobs': len(blob_hashes)}, ensure_ascii=False), flush=True)

    # 读取并核对 main 中实际可得的报告、索引、manifest 和 ZIP 原件。
    sources, zip_members, errors = [], {}, []
    for rel, obj in main_tree.items():
        if not rel.startswith('docs/plan/agent-mcp-m'):
            continue
        path = CURRENT / rel
        if path.suffix not in ('.json', '.md', '.zip'):
            continue
        data = path.read_bytes()
        digest = sha(data)
        b = blob_hashes[obj['blob']]
        transform = 'identity' if digest == b['gitSha256'] else 'replace-every-LF-with-CRLF' if digest == b['crlfSha256'] else 'unmapped'
        assert transform != 'unmapped', rel
        source = {'path': rel, 'commit': MAIN, 'blob': obj['blob'], **b, 'windowsBytes': len(data), 'windowsSha256': digest, 'reconstruction': transform}
        sources.append(source)
        if path.suffix == '.json':
            json.loads(data.decode('utf-8-sig'))
        elif path.suffix == '.md':
            data.decode('utf-8-sig')
        else:
            try:
                with zipfile.ZipFile(path) as z:
                    for info in z.infolist():
                        if info.is_dir():
                            continue
                        h = hashlib.sha256()
                        with z.open(info) as f:
                            for chunk in iter(lambda: f.read(1024 * 1024), b''):
                                h.update(chunk)
                        member = {'zip': rel, 'zipBlob': obj['blob'], 'zipCommit': MAIN, 'zipSha256': digest, 'member': info.filename, 'bytes': info.file_size, 'sha256': h.hexdigest()}
                        zip_members.setdefault(h.hexdigest(), []).append(member)
            except (zipfile.BadZipFile, RuntimeError, EOFError) as e:
                errors.append({'zip': rel, 'error': str(e), 'action': '该成员来源不用于放行；保留原损坏 ZIP 及真实读取失败'})
    write('sources-read.json.gz', {'sources': sources, 'zipErrors': errors, 'memberCount': sum(len(v) for v in zip_members.values())})
    write('zip-members.json.gz', zip_members)
    print(json.dumps({'phase': '主线报告及 ZIP', 'sources': len(sources), 'members': sum(len(v) for v in zip_members.values()), 'errors': errors}, ensure_ascii=False), flush=True)

    # Node 官方包的当前本机原件：只归档一份内容寻址 ZIP，映射解包成员。
    runtime = ROOT / TARGETS[54] / '.tmp/m0-node22/node.zip'
    runtime_digest = digest_file(runtime)
    runtime_copy = OUT / 'node-v22.19.0-win-x64.zip'
    if not runtime_copy.exists():
        runtime_copy.write_bytes(runtime.read_bytes())
    assert digest_file(runtime_copy) == runtime_digest
    runtime_members = {}
    with zipfile.ZipFile(runtime) as z:
        for info in z.infolist():
            if not info.is_dir():
                data = z.read(info)
                runtime_members[sha(data)] = {'zip': str(runtime_copy.relative_to(CURRENT)).replace('\\', '/'), 'zipSha256': runtime_digest, 'member': info.filename, 'bytes': len(data), 'sha256': sha(data), 'commit': 'pending-preflight-commit'}
    write('runtime-source.json', {'source': str(runtime), 'archive': str(runtime_copy.relative_to(CURRENT)), 'sha256': runtime_digest, 'bytes': runtime.stat().st_size, 'members': list(runtime_members.values())})

    for audit in audits:
        n = audit['todo']
        root = ROOT / TARGETS[n]
        head = audit['head']['stdout'].strip()
        t = trees[n]
        ignored = {r['path']: r for r in read_gzip(f'ignored-{n}.json.gz')}
        rows, unmatched = [], []
        for file in read_gzip(f'scan-{n}.json.gz')['files']:
            rel = file['path']
            path = root / rel
            digest = digest_file(path)
            row = {**file, 'windowsSha256': digest}
            if rel == '.git':
                row.update(kind='git-administration', source=path.read_text().strip(), reconstruction='linked worktree 本机登记指针，无产品成果')
            elif rel in t:
                obj = t[rel]
                b = blob_hashes[obj['blob']]
                transform = 'identity' if digest == b['gitSha256'] else 'replace-every-LF-with-CRLF' if digest == b['crlfSha256'] else 'unmapped'
                row.update(kind='tracked', sourceCommit=head, gitBlob=obj['blob'], mode=obj['mode'], **b, reconstruction=transform)
                if transform == 'unmapped':
                    unmatched.append(rel)
            else:
                assert rel in ignored, rel
                cat = ignored[rel]['category']
                # .vite / .turbo 日志也保全，不用 dependency 类掩盖验收结果。
                evidence = cat not in ('dependency', 'build-output', 'python-bytecode') or '/.vite/' in rel or '/.m1-runtime/' in rel
                if digest in zip_members:
                    row.update(kind='archived-evidence', source=zip_members[digest][0], reconstruction='ZIP 成员原字节一致')
                elif digest in runtime_members:
                    row.update(kind='runtime-original', source=runtime_members[digest], reconstruction='Node 原包成员原字节一致')
                elif digest == runtime_digest:
                    row.update(kind='runtime-original', source={'path': str(runtime_copy.relative_to(CURRENT)), 'sha256': runtime_digest, 'commit': 'pending-preflight-commit'}, reconstruction='保全 ZIP 原字节一致')
                elif evidence:
                    row.update(kind='requires-preservation', category=cat)
                    unmatched.append(rel)
                else:
                    # 每 path 保存现场原哈希；仅声明重建功能性输出，不承诺构建缓存逐字节再现。
                    if cat == 'dependency':
                        recipe = 'pnpm install --frozen-lockfile；生成 shim/本地 virtual store；历史遗留包另由 package.json 版本及锁文件历史核对'
                    elif cat == 'build-output':
                        recipe = 'package.json build 脚本、turbo.json、tsconfig 与此 immutable 源码；.next/cache/dist 为构建输出，时间/缓存非逐字节重现'
                    else:
                        recipe = '同路径已保全 .py 源码、CPython version-tag；解释器自动产生 __pycache__，非验收原件'
                    row.update(kind='rebuildable-output', category=cat, sourceCommit=head, lockBlob=t['pnpm-lock.yaml']['blob'], packageJsonBlob=t['package.json']['blob'], recipe=recipe)
            rows.append(row)
        write(f'mapping-{n}.json.gz', {'todo': n, 'path': str(root), 'head': head, 'main': MAIN, 'recordedAt': utc(), 'files': rows, 'unmatched': unmatched, 'links': audit['links'], 'nestedGit': audit['nestedGit'], 'errors': audit['errors']})
        print(json.dumps({'todo': n, 'files': len(rows), 'kinds': dict(collections.Counter(r['kind'] for r in rows)), 'unmatched': len(unmatched)}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
