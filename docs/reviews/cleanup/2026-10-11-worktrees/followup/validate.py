"""本轮证据解析、实际回执与源码指纹验证；不跑产品套件、不删除。"""
import ast
import gzip
import json
import zipfile
import sys
from common import *

def main():
    result={'startedAt':utc(),'parsed':[],'partialArchives':[],'archives':[],'sourceBinding':[],'operations':[]}
    for p in sorted(OUT.iterdir()):
        if p.suffix=='.json': json.loads(p.read_text(encoding='utf-8-sig')); result['parsed'].append(p.name)
        elif p.name.endswith('.json.gz'): load(p); result['parsed'].append(p.name)
        elif p.suffix=='.jsonl':
            for line in p.read_text(encoding='utf-8-sig').splitlines(): json.loads(line)
            result['parsed'].append(p.name)
        elif p.suffix=='.py': ast.parse(p.read_text(encoding='utf-8'),filename=str(p))
        elif p.name.endswith('.py.gz'): ast.parse(gzip.decompress(p.read_bytes()).decode(),filename=p.name)
        elif p.suffix=='.zip':
            used=p.name in {load(OUT/f'mapping-{k}.json.gz')['archive']['path'] for k in TARGETS if k!='cleanup-old'}
            try:
                with zipfile.ZipFile(p) as z:
                    assert z.testzip() is None
                    details={'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'crcPassed':True,'members':len(z.infolist()),'usedForDeletion':used}
                    for item in z.infolist(): z.read(item)
                result['archives'].append(details)
            except (zipfile.BadZipFile,AssertionError) as error:
                assert not used
                result['partialArchives'].append({'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'error':str(error),'usedForDeletion':False})
    binding=load(OUT/'preflight-binding.json')
    for r in binding['files']:
        b=git('cat-file','blob',r['blob']); actual=(CURRENT/r['path']).read_bytes()
        assert sha(b)==r['gitSha256'] and sha(actual)==r['windowsSha256']
        result['sourceBinding'].append({'path':r['path'],'blob':r['blob'],'passed':True,'transformation':r['transformation']})
    for key in TARGETS:
        if key=='cleanup-old': continue
        operation=load(OUT/f'execution-{key}.json'); verification=load(OUT/f'verification-{key}.json')
        assert operation['error'] is None and not operation['targetExistsAfter'] and verification['success']
        journal=[json.loads(l) for l in (OUT/f'operation-journal-{key}.jsonl').read_text(encoding='utf-8').splitlines()]
        assert journal==operation['calls']
        assert all(c['exit']==0 for c in journal)
        git_calls=[c for c in journal if c['input'][0]=='git']
        assert len(git_calls)==1 and git_calls[0]['input']==['git','-C',str(CURRENT),'worktree','remove',operation['target']]
        result['operations'].append({'key':key,'nativeGitExit':git_calls[0]['exit'],'journalCalls':len(journal),
                                     'cmdletNormalizedExitSemantics':'Remove-Item的0/1是即时成功/终止异常归一值，不冒独立OS进程exit',
                                     'allCallsExitZero':True,'verificationExclusiveFiles':verification['exclusiveReadCount']})
    for p in OUT.glob('*.ps1'):
        # 仅解析语法；不运行执行器。
        # 外层另实跑 PowerShell Parser，不运行执行器。
        result.setdefault('powershellFiles',[]).append(str(p.relative_to(CURRENT)).replace('\\','/'))
    diff=call(CURRENT,'diff',MAIN,'--check'); assert diff['exit']==0
    result['diffCheck']=diff
    result['endedAt']=utc(); result['success']=True
    write('validation' + ('-' + sys.argv[1] if len(sys.argv)>1 else '') + '.json',result)
    print({'success':True,'parsed':len(result['parsed']),'boundPreflight':len(result['sourceBinding']),'operations':len(result['operations']),
           'partialArchivesExcluded':len(result['partialArchives'])})

if __name__ == '__main__':
    main()
