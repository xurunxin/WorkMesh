"""删除前逐路径身份/长度/哈希/属性/链接和准确远端主线再次核验；只读。"""
import sys
sys.dont_write_bytecode=True
import os
from pathlib import Path
import json
import re
import stat
import audit
import preserve

def main():
    key,main_sha=sys.argv[1:]
    a=audit.a;out=audit.OUT;root=audit.ROOT/key
    assert key not in audit.DENIED and root!=audit.CURRENT and root.parent==audit.ROOT and not a.usage.directory_gate(root)
    mapping=a.load(out/f'final-mapping-{key}.json.gz')
    assert mapping['preservationCompleted'] and not mapping['errors']
    binding=a.load(out/'preflight-binding.json')
    assert binding['success'] and len(binding['commit'])==40
    remote=a.load(out/f'remote-before-{key}.json')
    text='\n'.join(x['text'] for x in remote['result']['content'] if x['type']=='text')
    assert re.search(r'(?m)^'+main_sha+r'\s+refs/heads/main$',text)
    remote_branch=re.search(r'(?m)^([0-9a-f]{40})\s+'+re.escape(mapping['ref'])+r'$',text)
    assert remote_branch and remote_branch.group(1)==mapping['remoteHead'],'远端恢复分支改变，停安全门'
    assert a.call(root,'rev-parse','HEAD')['stdout']==mapping['head']['stdout']
    assert a.call(root,'status','--porcelain=v1','--untracked-files=all')['stdout']==mapping['status']['stdout']
    source=mapping['head']['stdout'].strip()
    ancestry=a.call(audit.CURRENT,'merge-base','--is-ancestor',source,main_sha)
    assert ancestry['exit']==0 or mapping['remoteAncestor']['exit']==0
    scanned=a.scan(root,full=True)
    expected={r['path']:r for r in mapping['files']}
    assert set(expected)=={r['path'] for r in scanned['files']}
    cache={};nlink_changes=[]
    for f in scanned['files']:
        saved=expected[f['path']]
        for field in ('bytes','attributes','device','fileId'):assert f[field]==saved[field],(f['path'],field)
        if f['nlink']!=saved['nlink']:
            policy=a.load(out/'hardlink-retirement-policy.json')
            source_binding=a.load(out/'hardlink-source-binding.json')
            assert source_binding['success']
            for bound in source_binding['files']:
                assert a.sha((audit.CURRENT/bound['path']).read_bytes())==bound['windowsSha256'],'追加门禁源码改变，停止'
            assert (f['device'],f['fileId'])==(policy['device'],policy['fileId'])
            retired=0;retirements=[]
            for source_root in policy['roots']:
                receipt_path=out/f"execution-{source_root['key']}.json"
                if source_root['key']==key or not receipt_path.exists():continue
                receipt=a.load(receipt_path)
                if receipt['error'] or receipt['existsAfter'] is not False:continue
                assert not os.path.lexists(receipt['target'])
                registration=a.call(audit.CURRENT,'worktree','list','--porcelain')
                assert registration['exit']==0 and receipt['target'].replace('\\','/') not in registration['stdout'].replace('\\','/')
                assert a.sha((out/source_root['mapping']).read_bytes())==source_root['mappingSha256']
                retired+=source_root['count'];retirements.append(dict(key=source_root['key'],count=source_root['count'],receiptSha256=a.sha(receipt_path.read_bytes())))
            assert saved['nlink']-retired==f['nlink'] and retired>0,'nlink改变未由本轮已完成派生链接退休精确解释'
            nlink_changes.append(dict(path=f['path'],before=saved['nlink'],after=f['nlink'],retirements=retirements))
        path=root/f['path'];st=os.stat(path,follow_symlinks=False)
        assert st.st_mtime_ns==saved['mtimeNs']
        identity=(st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)
        if identity not in cache:
            preserve.h.native.exclusive_open(path)
            cache[identity]=a.sha(path.read_bytes())
        assert cache[identity]==saved['windowsSha256'],f['path']
    assert sorted(scanned['links'],key=lambda x:x['path'])==sorted([{k:v for k,v in x.items() if k in ('path','target','attributes')} for x in mapping['links']],key=lambda x:x['path'])
    for link in mapping['links']:
        actual=preserve.h.native.raw_link(root/link['path'])
        assert actual['rawSha256']==link['rawSha256']
    a.write(f'verification-{key}.json',dict(recordedAt=a.utc(),path=str(root),main=main_sha,ancestry=ancestry,
        files=len(expected),links=len(mapping['links']),readonly=len(scanned['readonly']),nlinkChanges=nlink_changes,safe=True,preflightCommit=binding['commit']))
    print(json.dumps(dict(target=key,safe=True,files=len(expected),links=len(mapping['links']))))

if __name__=='__main__':main()
