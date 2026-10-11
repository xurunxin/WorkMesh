"""登记本轮当前构建；不把未发生的合入触发写成已经回收。"""
import sys
sys.dont_write_bytecode = True
import audit

a, OUT, CURRENT = audit.a, audit.OUT, audit.CURRENT


def main():
    proofs = [a.load(OUT/name) for name in ('rebuild-verification.json', 'rebuild-verification-isolated.json', 'rebuild-verification-copy-isolation.json')]
    a.write('current-lifecycle-registration.json', dict(recordedAt=a.utc(),
        workspace=str(CURRENT), branch=a.call(CURRENT, 'branch', '--show-current'),
        headAtRegistration=a.call(CURRENT, 'rev-parse', 'HEAD'), completedHead=None,
        protected=True, eligibleForDeletion=False, openingInventoryActuallyTriggered=True,
        postMergeTriggerActuallyOccurred=False, currentWorktreeRemoved=False,
        exactPrivateTestCandidates=[p['privateVirtualStore'] for p in proofs],
        futureCondition='本轮准确新head独审和RequiredCI及实际合入后再刷新owner/活动/保护来源；本轮不清自己',
        followupPolicy='按用户17:06裁定，本轮收尾后停止后续推进，等待换机并明确恢复；不自动启动候选回收或业务任务',
        newMachineConfigurationPerformed=False, secretMigrationPerformed=False))
    print('当前构建及三处本人专属验证环境已登记，未派发后续删除')


if __name__ == '__main__':
    main()
