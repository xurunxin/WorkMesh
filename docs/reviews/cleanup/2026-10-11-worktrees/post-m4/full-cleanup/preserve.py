"""全清预检：逐路径保存身份/现场哈希，并复用 Git、ZIP 或明确重建输入。"""
import sys
sys.dont_write_bytecode = True
import collections
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import zipfile
import audit

a = audit.a
OUT, CURRENT, ROOT = audit.OUT, audit.CURRENT, audit.ROOT
BASE = OUT.parents[1]
spec = importlib.util.spec_from_file_location('historical_helpers', BASE / 'followup/common.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
MAIN = '6a06ce338f90bf16ce27e3cca1a76771eba42e6e'

def git(*args):
    return subprocess.run(['git', '-C', str(CURRENT), *args], capture_output=True, check=True).stdout

def tree(commit):
    return h.tree(commit)

def transforms(data):
    return {'identity':data, 'replace-every-LF-with-CRLF':data.replace(b'\n',b'\r\n'),
        'normalize-CRLF-to-LF':data.replace(b'\r\n',b'\n'),
        'normalize-CRLF-to-LF-then-LF-to-CRLF':data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')}

def catalog():
    refs = a.load(OUT / 'remote-opening.json')
    text = '\n'.join(x['text'] for x in refs['result']['content'] if x['type']=='text')
    remote = dict((name, sha) for sha, name in re.findall(r'(?m)^([0-9a-f]{40})\s+(refs/heads/[^\s]+)',text))
    assert remote['refs/heads/main']==MAIN
    opening = a.load(OUT / 'usage-opening.json.gz')
    targets = []
    sources = {}
    for row in opening['rows']:
        root = Path(row['path'])
        if root==CURRENT or root.name in audit.DENIED: continue
        head = a.call(root,'rev-parse','HEAD'); branch=a.call(root,'branch','--show-current')
        assert head['exit']==branch['exit']==0
        commit=head['stdout'].strip(); ref='refs/heads/'+branch['stdout'].strip()
        ancestor=a.call(CURRENT,'merge-base','--is-ancestor',commit,MAIN)
        remote_ancestor=a.call(CURRENT,'merge-base','--is-ancestor',commit,remote[ref])
        assert ancestor['exit']==0 or remote_ancestor['exit']==0, root
        tracked=tree(commit)
        index=a.call(root,'ls-files','--stage','-z')
        assert index['exit']==0
        staged=[]
        for item in index['stdout'].split('\0'):
            if item:
                meta,rel=item.split('\t',1); mode,blob,stage=meta.split()
                assert stage=='0', '冲突索引须另保全'
                staged.append(dict(path=rel,mode=mode,blob=blob))
        reflog=a.call(root,'reflog','show','--format=%H %gD %gs','HEAD')
        reflog_proof=[]
        for sha in sorted({x.split(' ')[0] for x in reflog['stdout'].splitlines()}):
            proofs=[a.call(CURRENT,'merge-base','--is-ancestor',sha,c) for c in (MAIN,remote[ref])]
            assert any(p['exit']==0 for p in proofs), ('未保全 reflog',root,sha)
            reflog_proof.append(dict(commit=sha,proofs=proofs))
        targets.append(dict(path=str(root),head=head,branch=branch,ref=ref,remoteHead=remote[ref],ancestor=ancestor,
            remoteAncestor=remote_ancestor,tracked=tracked,indexCall=index,index=staged,reflog=reflog,reflogProof=reflog_proof))
        for rel,obj in tracked.items(): sources.setdefault(obj['blob'],dict(commit=commit,path=rel,blob=obj['blob'],mode=obj['mode']))
    main_tree=tree(MAIN)
    for rel,obj in main_tree.items(): sources[obj['blob']]=dict(commit=MAIN,path=rel,blob=obj['blob'],mode=obj['mode'])
    digest_map={}; blobs={}
    batch=subprocess.Popen(['git','-C',str(CURRENT),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    for n,(blob,source) in enumerate(sources.items()):
        batch.stdin.write((blob+'\n').encode());batch.stdin.flush()
        header=batch.stdout.readline().decode().split();assert header[:2]==[blob,'blob']
        data=batch.stdout.read(int(header[2]));assert batch.stdout.read(1)==b'\n'
        t={k:dict(bytes=len(v),sha256=a.sha(v)) for k,v in transforms(data).items()}
        blobs[blob]=dict(gitBytes=len(data),gitSha256=a.sha(data),gitUtf8Bom=data.startswith(b'\xef\xbb\xbf'),transforms=t)
        for k,v in t.items(): digest_map.setdefault(v['sha256'],dict(**source,**blobs[blob],reconstruction=k))
        if n%2000==0: print(json.dumps(dict(stage='Git 对象',done=n,total=len(sources))),flush=True)
    batch.stdin.close();assert batch.wait()==0
    members={}; zip_proofs=[]
    for rel,obj in main_tree.items():
        if not rel.lower().endswith('.zip'): continue
        data=git('cat-file','blob',obj['blob'])
        try:
            reconstruction='identity'
            for transform, candidate in transforms(data).items():
                if zipfile.is_zipfile(io.BytesIO(candidate)):
                    try:
                        with zipfile.ZipFile(io.BytesIO(candidate)) as test:
                            if test.testzip() is None:
                                data=candidate; reconstruction=transform; break
                    except (zipfile.BadZipFile, OSError, RuntimeError):
                        pass
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                assert z.testzip() is None
                count=0
                zip_digest=a.sha(data)
                for info in z.infolist():
                    if info.is_dir():continue
                    raw=z.read(info);digest=a.sha(raw);count+=1
                    members.setdefault(digest,dict(commit=MAIN,zip=rel,zipBlob=obj['blob'],zipSha256=zip_digest,zipReconstruction=reconstruction,
                        member=info.filename,crc32=info.CRC,bytes=len(raw),sha256=digest))
                zip_proofs.append(dict(path=rel,blob=obj['blob'],bytes=len(data),sha256=a.sha(data),reconstruction=reconstruction,members=count,crcVerified=True))
        except zipfile.BadZipFile:
            # 历史 Git blob 仍可恢复原文件；损坏 ZIP 绝不用于成员映射。
            zip_proofs.append(dict(path=rel,blob=obj['blob'],bytes=len(data),sha256=a.sha(data),
                crcVerified=False,error='历史原件不是完整有效 ZIP；不消费成员、不修补原件'))
    a.write('catalog.json.gz',dict(main=MAIN,targets=targets,blobs=blobs,digests=digest_map,members=members,zipProofs=zip_proofs))
    print(json.dumps(dict(stage='来源目录完成',targets=len(targets),blobs=len(blobs),zipMembers=len(members),zips=len(zip_proofs))),flush=True)

def prepare():
    catalog_data=a.load(OUT/'catalog.json.gz')
    audits={Path(x['path']).name:x for x in a.load(OUT/'audit-opening.json.gz')['rows']}
    digest_map=catalog_data['digests']; members=catalog_data['members']; identity_cache={}
    locks=[]
    for commit in git('log',MAIN,'--format=%H','--','pnpm-lock.yaml').decode().splitlines():
        blob=git('rev-parse',commit+':pnpm-lock.yaml').decode().strip()
        raw=git('cat-file','blob',blob)
        locks.append(dict(commit=commit,blob=blob,bytes=len(raw),sha256=a.sha(raw),text=raw.decode()))
    a.write('lock-inputs.json',[{k:v for k,v in x.items() if k!='text'} for x in locks])
    runtime_source=dict(commit=MAIN,paths=['docs/plan/agent-mcp-m5/product-runtime.py','docs/plan/agent-mcp-m5/client-runtime.json',
        'docs/plan/agent-mcp-m5/product-resources-current.md','docs/plan/agent-mcp-m4/execution/resources.json',
        'docs/plan/agent-mcp-m4/execution/prepare-resources.py'])
    archive_path=OUT/'unique-sanitized.zip'
    redactions=[]; archive_members={}; summaries=[]
    with zipfile.ZipFile(archive_path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        def preserve(data,rel,binary_fixture=False):
            fixed=data if binary_fixture else h.sanitizer.sanitize(data,Path(rel).suffix,rel,redactions)
            digest=a.sha(fixed)
            if digest in digest_map: return dict(kind='existing-git',source=digest_map[digest],sanitized=fixed!=data)
            if digest in members: return dict(kind='existing-zip',source=members[digest],sanitized=fixed!=data)
            if digest not in archive_members:
                member='bytes/'+digest+Path(rel).suffix
                z.writestr(member,fixed)
                archive_members[digest]=dict(zip=str(archive_path.relative_to(CURRENT)).replace('\\','/'),member=member,bytes=len(fixed),sha256=digest)
            return dict(kind='unique-archive',source=archive_members[digest],sanitized=fixed!=data)
        for target in catalog_data['targets']:
            root=Path(target['path']); key=root.name
            if (OUT/f'mapping-{key}.json.gz').exists():raise AssertionError('已有保全，不重复')
            audit_data=audits[key];scan=audit_data['scan'];assert not scan['errors']
            rows=[]; errors=[]; packages={};nested=[]
            assert root.parent==ROOT and root!=CURRENT and key not in audit.DENIED and not a.usage.directory_gate(root)
            folders={f['path'].split('/')[2] for f in scan['files'] if f['path'].startswith('node_modules/.pnpm/')}
            for folder in folders:
                match=re.match(r'^(@?[^@]+)@([^_]+)',folder)
                if not match: continue
                name=match.group(1).replace('+','/')
                meta_path=root/'node_modules/.pnpm'/folder/'node_modules'/name/'package.json'
                if not meta_path.is_file():
                    errors.append(dict(path=str(meta_path),error='包 metadata 缺失'));continue
                raw=meta_path.read_bytes();meta=json.loads(raw);pin=meta['name']+'@'+meta['version']
                lock=next((x for x in locks if re.search(r'^  [\'\"]?'+re.escape(pin)+r'(?:[\'\"]?:|\()',x['text'],re.M)),None)
                if lock is None:
                    errors.append(dict(path=str(meta_path),error='历史 lock 不含包 pin '+pin));continue
                packages[folder]=dict(pin=pin,metadataPath=str(meta_path.relative_to(root)).replace('\\','/'),
                    metadataBytes=len(raw),metadataSha256=a.sha(raw),lock={k:v for k,v in lock.items() if k!='text'})
            for child in scan['nestedGit']:
                assert key=='01a126be-7aba-7b1d-a57a-f58317f89a67' and child.startswith('.tmp/cleanup-link-proof-'),child
                nested.append(dict(path=child,bare=a.call(root/child,'rev-parse','--is-bare-repository'),refs=a.call(root/child,'show-ref')))
            for i,f in enumerate(scan['files']):
                rel=f['path'];path=root/rel;st=os.stat(path,follow_symlinks=False)
                assert st.st_ino==f['fileId'] and st.st_size==f['bytes'] and st.st_file_attributes==f['attributes'],rel
                assert not st.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT
                readonly=bool(st.st_file_attributes & stat.FILE_ATTRIBUTE_READONLY)
                assert not readonly or (key=='01a126be-7aba-7b1d-a57a-f58317f89a67' and rel.startswith('.tmp/cleanup-link-proof-') and '/objects/' in rel)
                ident=(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)
                if ident in identity_cache:
                    digest,bom=identity_cache[ident];data=None
                else:
                    data=path.read_bytes();digest=a.sha(data);bom=data.startswith(b'\xef\xbb\xbf');identity_cache[ident]=(digest,bom)
                row=dict(**f,windowsSha256=digest,windowsUtf8Bom=bom,mtimeNs=st.st_mtime_ns)
                try:
                    if rel=='.git':row.update(kind='administration',source='正式 Git worktree remove 更新登记；主仓库不删')
                    elif digest in digest_map:row.update(kind='existing-git',source=digest_map[digest])
                    elif digest in members:row.update(kind='existing-zip',source=members[digest])
                    else:
                        parts=rel.split('/'); suffix=path.suffix.lower()
                        dependency='node_modules' in parts and not rel.endswith('.modules.yaml')
                        build=any(x in parts for x in ('.next','dist','.turbo','.vite')) or rel.endswith('.tsbuildinfo')
                        private_state=rel.startswith(('.tmp/m5-runtime/','.tmp/m4-4adc5e39/')) and (suffix in ('.db','.db-wal','.db-shm') or path.name.endswith(('.db-wal','.db-shm')))
                        if (dependency or build) and rel not in target['tracked']:
                            # 精确包 metadata 与历史 lock 绑定在后续包表；缓存只保证功能重建。
                            row.update(kind='rebuildable-dependency' if dependency else 'rebuildable-cache',sourceCommit=target['head']['stdout'].strip(),
                                lockBlob=target['tracked']['pnpm-lock.yaml']['blob'],scriptsBlob=target['tracked']['package.json']['blob'],
                                recipe='同源码/锁文件与实际 pnpm9.15.4 安装；构建按该源码 package scripts；缓存不承诺字节相同')
                            if rel.startswith('node_modules/.pnpm/'):
                                row['packageFolder']=parts[2] if parts[2] in packages else None
                        elif private_state:
                            row.update(kind='rebuildable-private-test-state',source=runtime_source,
                                recipe='本人隔离 OpenCode SQLite 状态；测试运行入口、首败/验收回执先保全；15:05 裁定重新初始化，不保存秘密数据库')
                        elif rel.startswith(('.tmp/m5-runtime/','.tmp/m4-4adc5e39/')) and suffix in ('.exe','.dll','.node'):
                            row.update(kind='rebuildable-native-runtime',source=runtime_source,
                                recipe='受控私有 native 测试派生物；已有客户端版本/原可执行 hash 与产品运行入口；共享安装本体不动；重新生成私有运行文件')
                        elif rel.startswith('.tmp/') and path.name.endswith('.index'):
                            row.update(kind='rebuildable-git-index',sourceCommit=target['head']['stdout'].strip(),recipe='本任务 CI 组装 index；真实 staged 索引另逐项保全，不以临时 index 恢复业务')
                        else:
                            if data is None:data=path.read_bytes()
                            binary_fixture=key=='01a126be-7aba-7b1d-a57a-f58317f89a67' and rel.startswith('.tmp/cleanup-link-proof-') and '/objects/' in rel
                            row.update(preserve(data,key+'/'+rel,binary_fixture))
                except (ValueError,zipfile.BadZipFile,AssertionError) as e:
                    row.update(kind='blocked',error=str(e));errors.append(dict(path=rel,error=str(e)))
                rows.append(row)
                if i%10000==0:print(json.dumps(dict(stage='现场映射',target=key,done=i,total=len(scan['files']))),flush=True)
            index_proof=[]
            for entry in target['index']:
                blob=entry['blob']
                if blob in catalog_data['blobs']:
                    b=catalog_data['blobs'][blob]
                    index_proof.append(dict(**entry,kind='existing-git',source=digest_map[b['gitSha256']]))
                else:
                    raw=git('cat-file','blob',blob)
                    index_proof.append(dict(**entry,gitBytes=len(raw),gitSha256=a.sha(raw),**preserve(raw,key+'/staged/'+entry['path'])))
            links=[]
            for link in scan['links']:
                target_path=os.path.normpath(link['target'].replace('\\\\?\\',''))
                raw=h.native.raw_link(root/link['path'])
                links.append(dict(**link,**raw,insideCandidate=os.path.commonpath([str(root),target_path]).lower()==str(root).lower(),
                    decision='仅删除派生链接本体，不递归目标；Git成功后若残留，事先声明非递归本体和空目录收尾'))
            result=dict(**{k:v for k,v in target.items() if k not in ('tracked','index')},status=audit_data['status'],ignored=audit_data['ignored'],
                files=rows,index=index_proof,links=links,nestedGit=nested,packages=packages,readonly=scan['readonly'],errors=errors,preservationCompleted=not errors,
                logicalBytes=scan['logicalBytes'],identityBytes=scan['identityBytes'],recordedAt=a.utc(),
                removeArguments=['worktree','remove']+(['--force'] if audit_data['status']['stdout'] or nested else [])+[str(root)])
            a.write(f'mapping-{key}.json.gz',result)
            summaries.append(dict(path=str(root),safe=not errors,errors=errors,logicalBytes=scan['logicalBytes'],
                kinds=dict(collections.Counter(r['kind'] for r in rows)),files=len(rows),links=len(links),readonly=len(scan['readonly'])))
            print(json.dumps(dict(stage='候选保全完成',**summaries[-1]),ensure_ascii=False),flush=True)
    with zipfile.ZipFile(archive_path) as z:
        assert z.testzip() is None
        for row in archive_members.values():assert a.sha(z.read(row['member']))==row['sha256']
    a.write('preservation-summary.json',dict(recordedAt=a.utc(),rows=summaries,archive=dict(path=archive_path.name,bytes=archive_path.stat().st_size,
        sha256=a.sha(archive_path.read_bytes()),members=list(archive_members.values())),redactions=redactions))

if __name__=='__main__':
    {'catalog':catalog,'prepare':prepare}[sys.argv[1]]()
