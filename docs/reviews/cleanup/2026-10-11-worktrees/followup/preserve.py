"""逐候选绑定 Git/Windows 字节、依赖输入与最小原件；只写本轮证据。"""
import collections
import json
import os
import re
import stat
import subprocess
import zipfile
from common import *

def main():
    locks = []
    for commit in git('log', MAIN, '--format=%H', '--', 'pnpm-lock.yaml').decode().splitlines():
        blob = git('rev-parse', commit + ':pnpm-lock.yaml').decode().strip()
        data = git('cat-file', 'blob', blob)
        locks.append({'commit': commit, 'blob': blob, 'bytes': len(data), 'sha256': sha(data), 'text': data.decode()})
    if not (OUT / 'lock-sources.json').exists():
        write('lock-sources.json', [{k: v for k, v in r.items() if k != 'text'} for r in locks])
    audits = load(OUT / 'scan-second.json.gz') if (OUT / 'scan-second.json.gz').exists() else []
    for key, name in ({} if audits else TARGETS).items():
        root = ROOT / name
        gate(root)
        assert not protection_conflicts(root)
        head = call(root, 'rev-parse', 'HEAD')
        status = call(root, 'status', '--porcelain=v1', '--untracked-files=all')
        assert status['exit'] == 0 and not status['stdout']
        ancestor = call(CURRENT, 'merge-base', '--is-ancestor', head['stdout'].strip(), MAIN)
        assert ancestor['exit'] == 0
        files, links, nested, errors = scanner.scan(root)
        assert not errors
        # 旧 #60 的三个受控 Git 夹具另作独立子仓库检查；不能用父 status 代替。
        nested_proofs = []
        for rel in nested:
            assert key == 'cleanup-old' and rel.startswith('.tmp/cleanup-link-proof-20261011'), rel
            child = root / rel
            is_bare = call(child, 'rev-parse', '--is-bare-repository')
            child_head = call(child, 'rev-parse', 'HEAD')
            child_status = None if is_bare['stdout'].strip() == 'true' else call(child.parent, 'status', '--porcelain=v1', '--untracked-files=all')
            nested_proofs.append({'path': rel, 'bare': is_bare, 'head': child_head, 'status': child_status,
                                  'decision': '受控夹具全部普通文件原字节另保全，不凭父 clean 删除子成果'})
        ignored_input = b'\0'.join(r['path'].encode() for r in files) + b'\0'
        started = utc()
        ignored_proc = subprocess.run(['git', '-C', str(root), 'check-ignore', '-z', '--stdin'], input=ignored_input, capture_output=True)
        ignored_call = {'input': ['git', '-C', str(root), 'check-ignore', '-z', '--stdin'],
                        'stdinSha256': sha(ignored_input), 'stdinPaths': len(files), 'startedAt': started, 'endedAt': utc(),
                        'exit': ignored_proc.returncode, 'stdout': ignored_proc.stdout.decode(), 'stderr': ignored_proc.stderr.decode()}
        assert ignored_call['exit'] in (0, 1)
        ignored = set(ignored_call['stdout'].split('\0'))
        tracked = tree(head['stdout'].strip())
        fixture_repos = []
        if key == 'cleanup-old':
            for f in files:
                if f['path'].startswith('.tmp/cleanup-link-proof-') and f['path'].endswith('/repo.git/HEAD'):
                    repo = (root / f['path']).parent
                    fixture_repos.append({'path': str(repo.relative_to(root)), 'bare': call(repo, 'rev-parse', '--is-bare-repository'),
                                          'refs': call(repo, 'show-ref'), 'head': call(repo, 'rev-parse', 'HEAD'),
                                          'source': '../continuation/link-proof*.json（本任务受控夹具输入/失败/输出原件）'})
        audits.append({'key': key, 'path': str(root), 'head': head, 'status': status, 'ancestor': ancestor,
                       'files': files, 'links': links, 'nestedGit': nested_proofs, 'errors': errors,
                       'ignoredCall': ignored_call, 'eol': call(root, 'ls-files', '--eol'), 'tracked': tracked, 'fixtureBareRepositories': fixture_repos})
        print(json.dumps({'stage': '只读扫描', 'key': key, 'files': len(files), 'bytes': sum(r['bytes'] for r in files), 'links': len(links), 'nestedGit': nested_proofs}, ensure_ascii=False), flush=True)
    if not (OUT / 'scan-second.json.gz').exists():
        write('scan-second.json.gz', audits)
    blobs = load(OUT / 'blob-digests.json.gz') if (OUT / 'blob-digests.json.gz').exists() else {}
    blob_ids = sorted({r['blob'] for a in audits for r in a['tracked'].values()})
    p = subprocess.Popen(['git', '-C', str(CURRENT), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    for blob in blob_ids:
        if blob in blobs:
            continue
        p.stdin.write((blob + '\n').encode()); p.stdin.flush()
        header = p.stdout.readline().decode().split()
        assert header[:2] == [blob, 'blob']
        data = p.stdout.read(int(header[2])); assert len(data) == int(header[2]) and p.stdout.read(1) == b'\n'
        transforms = {'identity': data, 'replace-every-LF-with-CRLF': data.replace(b'\n', b'\r\n'),
                      'normalize-CRLF-to-LF': data.replace(b'\r\n', b'\n'),
                      'normalize-CRLF-to-LF-then-LF-to-CRLF': data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')}
        blobs[blob] = {'gitBytes': len(data), 'gitSha256': sha(data), 'gitUtf8Bom': data.startswith(b'\xef\xbb\xbf'),
                       'transforms': {k: {'bytes': len(v), 'sha256': sha(v)} for k, v in transforms.items()}}
    p.stdin.close(); assert p.wait() == 0
    if not (OUT / 'blob-digests.json.gz').exists():
        write('blob-digests.json.gz', blobs)
    print(json.dumps({'stage': 'Git blob 原字节', 'blobs': len(blobs)}), flush=True)
    for a in audits:
        key = a['key']; root = Path(a['path']); head = a['head']['stdout'].strip()
        ignored_paths = set(a['ignoredCall']['stdout'].split('\0'))
        packages = {}; package_errors = []
        for row in a['files']:
            rel = row['path']
            if rel.startswith('node_modules/.pnpm/'):
                folder = rel.split('/')[2]
                match = re.match(r'^(@?[^@]+)@([^_]+)', folder)
                if not match or folder in packages: continue
                name = match.group(1).replace('+', '/')
                meta_path = root / 'node_modules/.pnpm' / folder / 'node_modules' / name / 'package.json'
                if not meta_path.is_file():
                    package_errors.append(folder); continue
                meta_bytes = meta_path.read_bytes(); meta = json.loads(meta_bytes)
                pin = meta['name'] + '@' + meta['version']
                lock = next((l for l in locks if re.search(r'^  [\'\"]?' + re.escape(pin) + r'(?:[\'\"]?:|\()', l['text'], re.M)), None)
                assert lock is not None, (key, pin)
                packages[folder] = {'package': pin, 'metadataPath': str(meta_path.relative_to(root)).replace('\\', '/'),
                                    'metadataBytes': len(meta_bytes), 'metadataSha256': sha(meta_bytes),
                                    'lock': {k: v for k, v in lock.items() if k != 'text'}}
        assert not package_errors, package_errors
        rows = []; redactions = []; archive_index = []; seen = {}
        archive = OUT / f'additional-{key}-3.zip'
        with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for f in a['files']:
                rel = f['path']; path = root / rel; st = path.lstat()
                assert not st.st_file_attributes & (stat.FILE_ATTRIBUTE_REPARSE_POINT | stat.FILE_ATTRIBUTE_READONLY), rel
                native.exclusive_open(path)
                data = path.read_bytes(); digest = sha(data)
                row = {**f, 'windowsSha256': digest, 'attributes': st.st_file_attributes, 'nlink': st.st_nlink,
                       'fileId': st.st_ino, 'device': st.st_dev, 'windowsUtf8Bom': data.startswith(b'\xef\xbb\xbf')}
                if rel == '.git':
                    row.update(kind='git-administration', source= data.decode().strip())
                elif rel in a['tracked']:
                    obj = a['tracked'][rel]; b = blobs[obj['blob']]
                    transform = next((k for k, v in b['transforms'].items() if v['sha256'] == digest and v['bytes'] == len(data)), None)
                    row.update(kind='tracked', sourceCommit=head, gitBlob=obj['blob'], mode=obj['mode'],
                               gitBytes=b['gitBytes'], gitSha256=b['gitSha256'], gitUtf8Bom=b['gitUtf8Bom'], reconstruction=transform)
                    if transform is None:
                        fixed = sanitizer.sanitize(data, path.suffix, f'{key}/{rel}', redactions)
                        member = 'bytes/' + sha(fixed) + path.suffix
                        if sha(fixed) not in seen:
                            z.writestr(member, fixed); seen[sha(fixed)] = member
                        source = {'zip': str(archive.relative_to(CURRENT)).replace('\\', '/'), 'member': member, 'bytes': len(fixed),
                                  'sha256': sha(fixed), 'commit': 'pending-preflight-commit', 'redacted': fixed != data}
                        archive_index.append({'path': rel, 'originalBytes': len(data), 'originalSha256': digest, 'source': source})
                        row.update(kind='tracked-runtime-variant', source=source, reconstruction='原 Git blob 与现场不等；现场原件另保全，不冒 clean 等于字节一致')
                else:
                    assert rel in ignored_paths or rel.startswith('.tmp/'), rel
                    parts = rel.split('/')
                    dependency = 'node_modules' in parts and '/.vite/' not in rel
                    build = any(v in parts for v in ('.next', 'dist')) or rel.endswith('.tsbuildinfo')
                    evidence = not dependency and (not build or path.name.endswith('.log') or path.name == 'trace')
                    # .modules.yaml 是真实安装输入，.turbo 输出/所有夹具文件都作原件。
                    evidence |= rel.endswith('.modules.yaml') or '.turbo' in parts or rel.startswith('.tmp/')
                    if not evidence:
                        folder = rel.split('/')[2] if rel.startswith('node_modules/.pnpm/') else None
                        row.update(kind='rebuildable-output', sourceCommit=head, lockBlob=a['tracked']['pnpm-lock.yaml']['blob'],
                                   packageJsonBlob=a['tracked']['package.json']['blob'], packageFolder=folder if folder in packages else None,
                                   recipe='依赖：真实历史锁及逐包 metadata/pnpm9.15.4 frozen install；构建：准确源码/package scripts/turbo/tsconfig。仅功能性重建，缓存非字节相同')
                    else:
                        # fixture 的 Git object/索引是已证明本任务生成的二进制；配置和文本仍走秘密检查。
                        binary_fixture = rel.startswith('.tmp/cleanup-link-proof-') and ('/objects/' in rel or path.name == 'index')
                        fixed = data if binary_fixture else sanitizer.sanitize(data, path.suffix, f'{key}/{rel}', redactions)
                        h = sha(fixed); member = seen.get(h)
                        if member is None:
                            member = 'bytes/' + h + path.suffix; z.writestr(member, fixed); seen[h] = member
                        source = {'zip': str(archive.relative_to(CURRENT)).replace('\\', '/'), 'member': member,
                                  'bytes': len(fixed), 'sha256': h, 'commit': 'pending-preflight-commit', 'redacted': fixed != data}
                        archive_index.append({'path': rel, 'originalBytes': len(data), 'originalSha256': digest, 'source': source})
                        row.update(kind='preserved-evidence', source=source,
                                   reconstruction='脱敏原件，秘密值不保全' if fixed != data else 'ZIP 原字节一致')
                rows.append(row)
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for r in archive_index: assert sha(z.read(r['source']['member'])) == r['source']['sha256']
        archive_sha = sha(archive.read_bytes())
        for r in rows:
            if r['kind'] in ('preserved-evidence','tracked-runtime-variant'): r['source']['zipSha256'] = archive_sha
        links = []
        for link in a['links']:
            target = os.path.normpath(link['target'].replace('\\\\?\\', ''))
            inside = os.path.commonpath([str(root), target]).lower() == str(root).lower()
            raw = native.raw_link(root / link['path'])
            assert inside and raw['tag'] in (0xa0000003, 0xa000000c), link
            links.append({**link, **raw, 'insideCandidate': inside})
        reflog = call(root, 'reflog', 'show', '--format=%H %gD %gs', 'HEAD')
        ancestry = [call(CURRENT, 'merge-base', '--is-ancestor', h, MAIN) for h in sorted({l.split(' ')[0] for l in reflog['stdout'].splitlines()})]
        assert all(r['exit'] == 0 for r in ancestry)
        result = {k: v for k, v in a.items() if k not in ('files', 'links', 'tracked')}
        result.update(files=rows, links=links, recordedAt=utc(), main=MAIN, preservationCompleted=True,
                      logicalBytes=sum(r['bytes'] for r in rows), hardlinkedFileCount=sum(r['nlink'] > 1 for r in rows),
                      packages=packages, redactions=redactions, reflog=reflog, reflogAncestry=ancestry,
                      archive={'path': archive.name, 'bytes': archive.stat().st_size, 'sha256': archive_sha, 'index': archive_index})
        write(f'mapping-{key}.json.gz', result)
        print(json.dumps({'stage': '完成保全', 'key': key, 'logicalBytes': result['logicalBytes'], 'files': len(rows), 'links': len(links),
                          'hardlinks': result['hardlinkedFileCount'], 'packages': len(packages), 'archiveBytes': archive.stat().st_size,
                          'kinds': dict(collections.Counter(r['kind'] for r in rows)), 'redactions': len(redactions)}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
