"""用 Git 自身 check-rules 验证薄检出计划，不改变主仓库配置或当前检出。"""
import sys
sys.dont_write_bytecode=True
import importlib.util
import json
from pathlib import Path
import subprocess
import audit

a,OUT,CURRENT=audit.a,audit.OUT,audit.CURRENT


def main():
    spec=importlib.util.spec_from_file_location('environment',OUT/'rebuild-environment.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    common=a.call(CURRENT,'rev-parse','--path-format=absolute','--git-common-dir')
    config=Path(common['stdout'].strip())/'config'
    config_before=a.sha(config.read_bytes())
    directories=module.thin_directories(CURRENT)
    rules=CURRENT/'.tmp/full-cleanup-thin-cone-rules.txt'
    rules.parent.mkdir(exist_ok=True)
    with rules.open('x',encoding='utf-8',newline='\n') as stream:stream.write('\n'.join(directories)+'\n')
    tree=a.call(CURRENT,'ls-tree','-r','-l','HEAD')
    assert tree['exit']==0
    lengths={}
    for line in tree['stdout'].splitlines():
        metadata,path=line.split('\t',1)
        if metadata.split()[1]=='blob':lengths[path]=int(metadata.split()[3])
    args=['git','sparse-checkout','check-rules','--cone','--rules-file',str(rules),'-z']
    start=a.utc();result=subprocess.run(args,cwd=CURRENT,input=('\0'.join(lengths)+'\0').encode(),capture_output=True)
    assert result.returncode==0,result.stderr.decode('utf-8','replace')
    selected=set(result.stdout.decode('utf-8').rstrip('\0').split('\0'))
    required=['CONTEXT.md','AGENT_PROTOCOL.md','OPENAPI.yaml','SCHEMA.sql',
        'docs/reviews/cleanup/2026-10-11-worktrees/usage-inventory.py',
        'docs/reviews/cleanup/2026-10-11-worktrees/post-m4/full-cleanup/rebuild-environment.py']
    assert all(p in selected for p in required)
    assert all(p in selected for p in lengths if p.startswith(('apps/','packages/','docs/adr/')))
    assert not any(p in selected for p in lengths if p.startswith('docs/reviews/r1/'))
    assert not any(p in selected for p in lengths if any(p.startswith('docs/plan/agent-mcp-m'+str(i)+'/') for i in range(6)))
    assert a.sha(config.read_bytes())==config_before
    a.write('thin-plan-verification.json',dict(recordedAt=a.utc(),head=a.call(CURRENT,'rev-parse','HEAD'),
        input=args,startedAt=start,endedAt=a.utc(),exitCode=result.returncode,stderr=result.stderr.decode('utf-8','replace'),
        directories=directories,requiredPaths=required,selectedCount=len(selected),totalCount=len(lengths),
        selectedGitBlobBytes=sum(lengths[p] for p in selected),totalGitBlobBytes=sum(lengths.values()),
        sharedConfigUnchanged=True,configurationApplied=False,
        limitations='Git 对象长度是计划对照，非Windows运行长度/物理释放；实际 thin 仍需平台已启用每工作树配置且新任务干净'))
    print(json.dumps(dict(success=True,selected=len(selected),all=len(lengths),selectedGitBlobBytes=sum(lengths[p] for p in selected),configurationApplied=False)))


if __name__=='__main__':main()
