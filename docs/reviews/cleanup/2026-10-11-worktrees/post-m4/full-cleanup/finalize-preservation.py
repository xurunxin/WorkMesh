"""补足本地锁/D1a历史精确映射；发布前统一秘密复核，不记录秘密值。"""
import sys
sys.dont_write_bytecode=True
import gzip
import hashlib
import json
import importlib.util
import marshal
import os
import io
import types
from pathlib import Path
import re
import zipfile
import audit
import preserve

a=audit.a;OUT=audit.OUT;CURRENT=audit.CURRENT
KEY=re.compile(r'token|secret|password|authorization|cookie|api.?key|access.?key|master.?key',re.I)
URL=re.compile(rb'(?i)(?:postgres(?:ql)?|redis|https?)://[^\s:/@]+:([^\s/@]+)@')

def values(raw,found):
    def collect(v):
        if isinstance(v,dict):
            for key,item in v.items():
                if KEY.search(key) and isinstance(item,str) and len(item)>=12 and not item.startswith(('[REDACTED','<','${')):
                    found.add(item.encode())
                collect(item)
        elif isinstance(v,list):
            for item in v:collect(item)
    try:collect(json.loads(raw.decode('utf-8-sig')))
    except (ValueError,UnicodeDecodeError):pass
    found.update(m.group(1) for m in URL.finditer(raw) if len(m.group(1))>=12)
    for m in re.finditer(rb'(?i)\b[A-Z_]{0,80}(?:TOKEN|SECRET|PASSWORD|ACCESS_KEY)[A-Z_]{0,80}\b[=: \t]+[\"\']?([A-Za-z0-9_-]{16,256})',raw):
        found.add(m.group(1))

def main():
    summary=a.load(OUT/'preservation-summary.json')
    values_set=set()
    for row in a.load(OUT/'audit-opening.json.gz')['rows']:
        if row['excluded']:continue
        root=Path(row['path'])
        for f in row['scan']['files']:
            rel=f['path']
            if rel.startswith('.tmp/') and (Path(rel).suffix in ('.json','.jsonl','.env') or 'environment' in Path(rel).name):
                values((root/rel).read_bytes(),values_set)
        print(json.dumps(dict(stage='秘密来源定位',target=root.name,knownValues=len(values_set)),ensure_ascii=False),flush=True)
    original=OUT/'unique-sanitized.zip';destination=OUT/'unique-final-sanitized.zip'
    replacements={};redactions=[];seen={}
    with zipfile.ZipFile(original) as src,zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as dst:
        assert src.testzip() is None
        for info in src.infolist():
            raw=src.read(info);suffix=Path(info.filename).suffix
            # 九对象明确是受控 Git fixture 二进制；其余归档均已过格式安全门。
            try:fixed=preserve.h.sanitizer.sanitize(raw,suffix,info.filename,redactions,values_set)
            except ValueError:
                assert len(raw)<150 and suffix=='' and raw.startswith(b'x'),info.filename
                fixed=raw
            digest=a.sha(fixed)
            if digest not in seen:
                member='bytes/'+digest+suffix;dst.writestr(member,fixed)
                seen[digest]=dict(zip=str(destination.relative_to(CURRENT)).replace('\\','/'),member=member,bytes=len(fixed),sha256=digest)
            replacements[info.filename]=dict(source=seen[digest],sanitized=fixed!=raw)
    # 过期 Python cache 只有排除路径 frozenset 与现源码不同；不冒可重建同字节。
    # 完整解析 marshal 并逐 literal 核无秘密，保全这份小原件，不执行 bytecode。
    pyc_root=audit.ROOT/'01a1264e-bd35-76d4-b328-03e9b91301f3'
    pyc_rel='docs/plan/agent-mcp-m5/__pycache__/capture-planning.cpython-313.pyc'
    pyc_raw=(pyc_root/pyc_rel).read_bytes()
    assert pyc_raw[:4]==importlib.util.MAGIC_NUMBER
    stream=io.BytesIO(pyc_raw[16:]);code=marshal.load(stream);assert stream.tell()==len(pyc_raw)-16
    def check(value):
        if isinstance(value,types.CodeType):
            for v in (value.co_consts,value.co_names,value.co_varnames,value.co_freevars,value.co_cellvars,value.co_filename,value.co_name,value.co_qualname):check(v)
        elif isinstance(value,(tuple,frozenset)):
            for v in value:check(v)
        elif isinstance(value,(str,bytes)):
            raw=value.encode() if isinstance(value,str) else value
            assert preserve.h.sanitizer.sanitize(raw,'.txt','PYC literal',[],values_set)==raw,'PYC literal 需要脱敏；不归档敏感原字节'
        else:assert value is None or value is Ellipsis or isinstance(value,(int,float,complex,bool)),type(value)
    check(code)
    pyc_member='bytes/'+a.sha(pyc_raw)+'.pyc'
    with zipfile.ZipFile(destination,'a',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as dst:dst.writestr(pyc_member,pyc_raw)
    pyc_source=dict(zip=str(destination.relative_to(CURRENT)).replace('\\','/'),member=pyc_member,bytes=len(pyc_raw),sha256=a.sha(pyc_raw))
    seen[a.sha(pyc_raw)]=pyc_source
    with zipfile.ZipFile(destination) as z:
        assert z.testzip() is None
        for info in z.infolist():
            raw=z.read(info)
            assert not any(v in raw for v in values_set),info.filename
    archive_hash=a.sha(destination.read_bytes())
    for source in seen.values():source['zipSha256']=archive_hash
    gaps=[];results=[]
    historical=a.load(CURRENT/'docs/reviews/cleanup/remaining-materials-review-2026-10-08.json')
    for target in summary['rows']:
        root=Path(target['path']);key=root.name
        mapping=a.load(OUT/f'mapping-{key}.json.gz')
        preparation_errors=mapping['errors'];unresolved=[]
        for row in mapping['files']+mapping['index']:
            if row.get('kind')=='unique-archive':
                replace=replacements[row['source']['member']]
                row['source']=replace['source'];row['sanitized']=row.get('sanitized',False) or replace['sanitized']
        if preparation_errors and all('历史 lock 不含包 pin' in e['error'] for e in preparation_errors):
            lock_row=next(x for x in mapping['files'] if x['path']=='pnpm-lock.yaml')
            text=(root/'pnpm-lock.yaml').read_text(encoding='utf-8-sig')
            for error in preparation_errors:
                rel=str(Path(error['path']).relative_to(root)).replace('\\','/')
                data=(root/rel).read_bytes();meta=json.loads(data);pin=meta['name']+'@'+meta['version']
                folder=rel.split('/')[2]
                if not re.search(r'^  [\'\"]?'+re.escape(pin)+r'(?:[\'\"]?:|\()',text,re.M):
                    # #16 的一个已脱离当前锁的旧 zod：逐文件精确匹配仍受保护的 CAS。
                    assert key=='01a11b85-41f9-74f5-b456-7083d4d83e5e' and pin=='zod@3.24.3'
                    matched=[]
                    prefix='node_modules/.pnpm/'+folder+'/'
                    for file in mapping['files']:
                        if not file['path'].startswith(prefix):continue
                        raw=(root/file['path']).read_bytes();digest=hashlib.sha512(raw).hexdigest()
                        store=Path(r'X:\packages\.pnpm-store\v3\files')/digest[:2]/digest[2:]
                        if not store.is_file():store=store.with_name(store.name+'-exec')
                        assert store.is_file() and store.read_bytes()==raw, file['path']
                        file.update(kind='existing-shared-CAS',source=dict(path=str(store),sha512=digest,bytes=len(raw),sha256=a.sha(raw),pin=pin,
                            recipe='真实原 CAS 文件保持；可按已核字节恢复旧依赖；新任务只使用新锁所需依赖'))
                        matched.append(file['path'])
                    mapping['packages'][folder]=dict(pin=pin,metadataPath=rel,metadataBytes=len(data),metadataSha256=a.sha(data),
                        source='现有共享 CAS 精确逐文件核验，原 store 不删',files=matched)
                    gaps.append(dict(target=key,path=rel,previous=error,decision='旧锁已无此包；全部分发文件实核等于现有共享 CAS，不保整旧环境'))
                    continue
                mapping['packages'][folder]=dict(pin=pin,metadataPath=rel,metadataBytes=len(data),metadataSha256=a.sha(data),
                    lock=dict(kind=lock_row['kind'],source=lock_row['source'],windowsSha256=lock_row['windowsSha256'],
                        bytes=lock_row['bytes'],decision='真实本地未提交锁单独持久保全；不冒已合业务'))
                gaps.append(dict(target=key,path=rel,previous=error,decision='已核本地锁 pin 和必要代码、锁文件保全来源'))
            for row in mapping['files']:
                if row['path'].startswith('node_modules/.pnpm/') and row['path'].split('/')[2] in mapping['packages']:
                    row['packageFolder']=row['path'].split('/')[2]
        elif key=='01a1187a-f4ff-735d-814f-a7b26f8cfdc5':
            proof=historical['d1a']['rawSourceArchive'];source=historical['d1a']['sanitizedArchive']
            data=(CURRENT/source['repoPath']).read_bytes()
            assert len(data)==14776952 and a.sha(data)==source['sha256']
            with zipfile.ZipFile(CURRENT/source['repoPath']) as z:assert z.testzip() is None
            for error in preparation_errors:
                row=next(x for x in mapping['files'] if x['path']==error['path'])
                assert row['windowsSha256']==proof['sha256'] and row['bytes']==proof['bytesEach']
                with zipfile.ZipFile(root/row['path']) as z:
                    assert z.testzip() is None and len(z.infolist())==proof['entryCount']
                row.update(kind='existing-sanitized-archive',source=dict(commit=preserve.MAIN,path=source['repoPath'],blob=source['gitBlob'],
                    bytes=source['bytes'],sha256=source['sha256'],mappingProof='docs/reviews/cleanup/remaining-materials-review-2026-10-08.json#/d1a/rawSourceArchive',
                    redactionReport=historical['d1a']['redactionReport']),sanitized=True)
                row.pop('error',None)
                gaps.append(dict(target=key,path=row['path'],previous=error,decision='原 SHA/长度/491成员 CRC 实核，复用已合逐成员脱敏映射；不复制 RAW'))
        elif key=='01a1264e-bd35-76d4-b328-03e9b91301f3':
            for error in preparation_errors:
                rel=error['path'];assert rel=='docs/plan/agent-mcp-m5/__pycache__/capture-planning.cpython-313.pyc'
                row=next(x for x in mapping['files'] if x['path']==rel)
                row.update(kind='unique-archive',source=pyc_source,sanitized=False,
                    formatProof='Python3.13 magic、完整 marshal 消费、全部 literal 格式和真实秘密值核验；未执行字节码')
                row.pop('error',None)
                gaps.append(dict(target=key,path=rel,previous=error,decision='过期 cache 不等于现源码编译正文；格式/秘密检查后最小原字节保全，不冒可重建同字节；新环境重编主源码'))
        else:unresolved=preparation_errors
        mapping.update(preparationErrors=preparation_errors,errors=unresolved,preservationCompleted=not unresolved,finalizedAt=a.utc(),
            secretReview=dict(source='真实旧私有 JSON/environment/连接串字段；仅记录数量及脱敏 hashes，不保存值',uniqueKnownValues=len(values_set)))
        a.write(f'final-mapping-{key}.json.gz',mapping)
        results.append(dict(key=key,path=str(root),safe=not unresolved,errors=unresolved,logicalBytes=mapping['logicalBytes'],
            files=len(mapping['files']),readonly=len(mapping['readonly']),arguments=mapping['removeArguments']))
    readonly=a.load(OUT/'final-mapping-01a126be-7aba-7b1d-a57a-f58317f89a67.json.gz')['readonly']
    assert len(readonly)==9 and sum(x['bytes'] for x in readonly)==696
    a.write('readonly-exception.json',dict(source='2026-10-11 15:05 用户全清裁定；旧准备门不是系统拒绝',files=readonly,bytes=696,
        method='逐文件现属性/身份/hash 再核；只清 ReadOnly 位，保 Archive，不改 ACL；随后正式 Git remove；真正拒绝即停'))
    a.write('execution-plan.json',dict(recordedAt=a.utc(),targets=results,deniedParents=audit.DENIED,currentProtected=str(CURRENT),
        dirtyForce='仅已持久保全的旧 dirty/index/fixture 候选，预先声明正式 Git remove --force；绝不用于系统拒绝/失败后换法',
        linkFinish='仅 Git 成功后的事先映射链接本体非递归删除，零普通文件的空目录收尾；外部目标不删',
        archive=dict(path=destination.name,bytes=destination.stat().st_size,sha256=archive_hash,members=len(seen))))
    a.write('gap-resolution.json',dict(recordedAt=a.utc(),gaps=gaps,redactions=redactions,knownSecretValueCount=len(values_set),
        initialArchiveDisposition='发布前中间归档不作为恢复来源；统一秘密复核后只推最终脱敏归档，原中间包销毁',
        initialArchiveSha256=a.sha(original.read_bytes()),finalArchiveSha256=archive_hash))
    print(json.dumps(dict(targets=len(results),safe=sum(x['safe'] for x in results),gaps=gaps,redactions=len(redactions),archiveBytes=destination.stat().st_size),ensure_ascii=False))

if __name__=='__main__':main()
