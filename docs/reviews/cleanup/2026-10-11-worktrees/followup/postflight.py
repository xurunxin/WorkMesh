"""正式批次完成后核登记/保护/剩余清单；不删任何资源。"""
from common import *

def main():
    before = load(OUT/'usage-opening.json.gz'); after = load(OUT/'usage-after.json.gz')
    receipts = [load(OUT/f'execution-{k}.json') for k in TARGETS if k!='cleanup-old']
    protected = load(OUT/'protected-opening.json')['paths']
    declared = {r['target'].lower() for r in receipts if not r['error']}
    observations = []; changes = []
    for r in protected:
        exists = Path(r['path']).exists()
        new = {**r,'existsAfter':exists}
        new['expectedRemovedCandidateRoot'] = r['path'].lower() in declared and not r.get('source')
        if exists != r['existsNow'] and not new['expectedRemovedCandidateRoot']:
            changes.append(new)
        observations.append(new)
    assert not changes, changes
    write('protected-after.json', {'recordedAt':utc(),'paths':observations,'unexpectedExistenceChanges':changes,
                                  'currentProtected':str(CURRENT),'blockedOldCleanup':load(OUT/'blocked-cleanup-old.json')})
    registration = call(CURRENT,'worktree','list','--porcelain'); health=[]
    for block in registration['stdout'].strip().split('\n\n'):
        fields = dict(line.split(' ',1) for line in block.splitlines() if ' ' in line)
        root=Path(fields['worktree']); h=call(root,'rev-parse','HEAD')
        active = root.name == '01a1264e-bd35-76d4-b328-03e9b91301f3'
        health.append({'path':str(root),'registrationHead':fields['HEAD'],'exists':root.exists(),'head':h,
                       'activeHeadMayAdvanceDuringSampling':active,'headChangedDuringSampling':h['stdout'].strip()!=fields['HEAD']})
        assert root.exists() and h['exit']==0
        assert active or h['stdout'].strip()==fields['HEAD']
    assert '\nprunable' not in registration['stdout']
    for r in receipts:
        assert not r['error'] and not r['targetExistsAfter'] and not Path(r['target']).exists()
        assert str(Path(r['target'])).lower() not in {r['path'].lower() for r in health}
    review={r['path']:r for r in load(OUT/'retention-review.json')['rows']}
    retained=[]
    for r in after['rows']:
        old=review.get(r['path']); item={k:r[k] for k in ('path','logicalBytes','groups','head','complete')}
        if r['path']==str(CURRENT):
            item.update(todo=60,reason='本轮当前构建及依据永久保护',releaseCondition='本轮准确独审/RequiredCI/实际合入且结束、保全无恢复引用后才登记未来候选')
        elif r['path']==str(ROOT/TARGETS['cleanup-old']):
            item.update(todo=60,reason='旧现场9个只读夹具Git对象门禁失败，整个目标已停止未删除',releaseCondition='见blocked-cleanup-old.json精确9path，未取得例外且未补完整保全前不重试、不修改属性')
        else:
            assert old, r['path']
            item.update(todo=old['todo'],reason=old['currentReason'],releaseCondition=old['releaseCondition'],
                        source='retention-review.json＋原main历史source指针',currentHistoricalProtectionCount=old['currentlyPresentSourcePaths'])
        retained.append(item)
    write('retained-directories.json', {'recordedAt':utc(),'rows':sorted(retained,key=lambda r:r['logicalBytes'],reverse=True),
                                      'mainRepositorySeparate':after['mainRepositorySeparate'],'physicalNetReleasedBytes':None})
    prior={r['path']:r for r in before['rows']}; retained_changes=[]
    for r in after['rows']:
        if r['path'] in prior and r['logicalBytes']!=prior[r['path']]['logicalBytes']:
            retained_changes.append({'path':r['path'],'before':prior[r['path']]['logicalBytes'],'after':r['logicalBytes'],
                                     'delta':r['logicalBytes']-prior[r['path']]['logicalBytes'],'meaning':'活动或当前交付正常变化，不能硬算成清理净释放'})
    write('postflight.json', {'recordedAt':utc(),'registration':registration,'health':health,'successReceipts':receipts,
                            'logicalRemovedBytes':sum(load(OUT/f'mapping-{r["key"]}.json.gz')['logicalBytes'] for r in receipts),
                            'beforeWorktreeBytes':before['worktreeLogicalBytes'],'afterWorktreeBytes':after['worktreeLogicalBytes'],
                            'retainedLogicalChanges':retained_changes,'physicalNetReleasedBytes':None,
                            'failures':[], 'blockedBeforeDeletion':['cleanup-old'], 'newApprovalRejections':[],
                            'historicalRefusals':'G1/D0/C3维持原拒绝，未重试；#53–57旧成功/缺口不重做或補造'})
    print({'successes':len(receipts),'registrationCount':len(health),'retainedCount':len(retained),'unexpectedProtectionChanges':0})

if __name__ == '__main__':
    main()
