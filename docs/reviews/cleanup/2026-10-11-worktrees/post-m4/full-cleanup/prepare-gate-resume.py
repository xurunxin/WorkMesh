"""只声明一次删除前活动门暂停的重新预检；不重试原生失败或系统拒绝。"""
import sys
sys.dont_write_bytecode=True
import json
import subprocess
import audit

a,OUT,ROOT=audit.a,audit.OUT,audit.ROOT


def main():
    key='01a1187a-f0f0-76d8-8f5b-b954ee399cdc'
    original_path=OUT/('execution-'+key+'.json')
    original=a.load(original_path)
    assert original['target']==str(ROOT/key) and original['existsAfter'] is True
    assert original['error']=='发现其他活动消费者，不删除'
    assert not any(c['kind']=='powershell-cmdlet' or ('worktree' in c.get('input',[]) and 'remove' in c.get('input',[])) for c in original['calls'])
    assert [c['exitCode'] for c in original['calls'] if c['kind']=='native-subprocess' and 'verify-target.py' in ' '.join(c.get('input',[]))]==[0]
    args=['pwsh','-NoProfile','-Command','Get-CimInstance Win32_Process -Filter "ProcessId=34632" | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress']
    begin=a.utc();proc=subprocess.run(args,capture_output=True)
    assert proc.returncode==0 and not proc.stdout.strip(),'原命中PID仍存在，不能声明重新预检'
    a.write('gate-resume-decision.json',dict(recordedAt=a.utc(),key=key,target=str(ROOT/key),
        priorReceipt=original_path.name,priorReceiptSha256=a.sha(original_path.read_bytes()),
        priorResult=original['result'],priorError=original['error'],priorNativeDeleteDispatched=False,
        consumerExitObservation=dict(input=args,startedAt=begin,endedAt=a.utc(),exitCode=proc.returncode,
            stdout=proc.stdout.decode('utf-8','replace'),stderr=proc.stderr.decode('utf-8','replace')),
        evidenceLimit='原WMI仅记PID/parent/name；与并发只读回执查看时间重叠，原命令行缺失不补造归属。当前PID已消失，真正派发前仍须重新刷新所有活动/挂载/文件/远端引用。',
        rule='原目标仅预检门暂停，Git删除尚未调用；保原回执，追加新预检/代码绑定先推送后首次删除。任何原生删除失败或系统拒绝仍禁止恢复/换法。',
        executionEvidenceSuffix='gate-resume',guardRelaxed=False))
    print(json.dumps(dict(key=key,nativeDeletePreviouslyDispatched=False,priorPidAbsent=True,guardRelaxed=False)))


if __name__=='__main__':main()
