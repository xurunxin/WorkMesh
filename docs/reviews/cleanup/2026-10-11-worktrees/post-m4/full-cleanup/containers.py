"""仅登记并收尾已有 immutable 账本绑定的六个本人测试容器/卷；无 prune。"""
import sys
sys.dont_write_bytecode=True
import json
import subprocess
from pathlib import Path
import audit

a=audit.a;OUT=audit.OUT;CURRENT=audit.CURRENT
FORMAT='{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State}},"mounts":{{json .Mounts}},"imageId":{{json .Image}},"labels":{{json .Config.Labels}}}'

def command(args):
    start=a.utc();p=subprocess.run(['docker',*args],capture_output=True,text=True)
    return dict(input=['docker',*args],startedAt=start,endedAt=a.utc(),exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr)

def checked(args):
    r=command(args);assert r['exitCode']==0,r
    return r

def main():
    phase=sys.argv[1]
    if phase=='plan':
        activity=a.load(OUT/'activity-opening.json')
        by_id={x['id']:x for x in activity['containers']}
        m4_path='docs/plan/agent-mcp-m4/execution/resources.json'
        m5_path='docs/plan/agent-mcp-m5/product-cleanup.json'
        m4=a.load(CURRENT/m4_path);m5=a.load(CURRENT/m5_path)
        targets=[]
        for src in m4['containers']:
            targets.append(dict(id=src['containerId'],name='/'+src['name'],imageId=src['imageId'],volumes=[src['volume']],source=m4_path))
        for src in m5['before']:
            targets.append(dict(id=src['id'],name=src['name'],imageId=src['imageId'],volumes=[m['Name'] for m in src['mounts'] if m['Type']=='volume'],source=m5_path))
        assert len(targets)==6
        for t in targets:
            observed=by_id[t['id']]
            assert observed['name']==t['name'] and observed['imageId']==t['imageId'] and not observed['state']['Running']
            assert sorted(m['Name'] for m in observed['mounts'] if m['Type']=='volume')==sorted(t['volumes'])
            t['observed']=observed
            for volume in t['volumes']:
                consumers=[x['id'] for x in activity['containers'] if any(m.get('Name')==volume for m in x['mounts'])]
                assert consumers==[t['id']],(volume,consumers)
                t.setdefault('volumeEvidence',[]).append(dict(volume=volume,consumers=consumers,
                    metadata=next(v for v in activity['volumes'] if v['Name']==volume)))
        sources=[dict(path=p,sha256=a.sha((CURRENT/p).read_bytes()),gitBlob=a.call(CURRENT,'rev-parse',a.MAIN+':'+p)['stdout'].strip()) for p in (m4_path,m5_path)]
        a.write('containers-plan.json',dict(recordedAt=a.utc(),targets=targets,sources=sources,rebuild='Git 账本与 prepare-resources/product-runtime 入口重新生成测试 DB/卷/秘密，不归档业务数据',
            protectedImages=list({t['imageId'] for t in targets}),remainingProjectNamed=[x for x in activity['containers'] if x['name'].startswith(('/r1','/workmesh-'))],
            remainingReason='默认 compose 业务数据不在授权范围；r1 无准确原 container ID→本任务 owner 账本，不能凭名称/停止状态删；其他项目不候选'))
        print(dict(candidates=len(targets),volumes=sum(len(t['volumes']) for t in targets)))
    elif phase=='execute':
        assert a.load(OUT/'preflight-binding.json')['success']
        plan=a.load(OUT/'containers-plan.json');receipts=[]
        for t in plan['targets']:
            result=dict(target=t['id'],name=t['name'],calls=[],result='未执行',error=None)
            try:
                verify=checked(['inspect','--format',FORMAT,t['id']]);result['calls'].append(verify)
                observed=json.loads(verify['stdout']);assert observed['name']==t['name'] and observed['imageId']==t['imageId'] and not observed['state']['Running']
                assert sorted(m['Name'] for m in observed['mounts'] if m['Type']=='volume')==sorted(t['volumes'])
                ids=checked(['ps','-aq']);result['calls'].append(ids)
                mounts=checked(['inspect','--format','{"id":{{json .Id}},"mounts":{{json .Mounts}}}',*ids['stdout'].split()]);result['calls'].append(mounts)
                rows=[json.loads(line) for line in mounts['stdout'].splitlines()]
                for volume in t['volumes']:
                    assert [r['id'] for r in rows if any(m.get('Name')==volume for m in r['mounts'])]==[t['id']]
                remove=command(['rm',t['id']]);result['calls'].append(remove)
                assert remove['exitCode']==0,'容器首败，停止原目标'
                for volume in t['volumes']:
                    # 引擎 volume rm 本身还会拒绝其他消费者；不用 Force，不同失败后换法。
                    removal=command(['volume','rm',volume]);result['calls'].append(removal)
                    assert removal['exitCode']==0,'卷首败，停止原目标'
                absent=command(['inspect',t['id']]);result['calls'].append(absent);assert absent['exitCode']!=0
                for volume in t['volumes']:
                    absent=command(['volume','inspect',volume]);result['calls'].append(absent);assert absent['exitCode']!=0
                image=checked(['image','inspect',t['imageId'],'--format','{{.Id}}']);result['calls'].append(image)
                assert image['stdout'].strip()==t['imageId']
                result['result']='精确本人测试容器和独占卷已移除；共享镜像仍存在'
            except (AssertionError,ValueError) as e:result['error']=str(e);result['result']='停止原目标，不重试/换法'
            result['endedAt']=a.utc();a.write('container-execution-'+t['id'][:12]+'.json',result);receipts.append(result)
            print(json.dumps(dict(name=t['name'],result=result['result'],error=result['error']),ensure_ascii=False),flush=True)
        a.write('containers-execution.json',dict(recordedAt=a.utc(),rows=receipts,physicalNetReleasedBytes=None))
    else:raise AssertionError('未知阶段')

if __name__=='__main__':main()
