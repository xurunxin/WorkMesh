"""旧套件同名输出先内容寻址保全，再恢复历史 Git 字节；不改写历史验收。"""
from pathlib import Path
import hashlib,json,subprocess

root=Path(__file__).resolve().parents[4]
out=root/'docs/plan/agent-mcp-m4/execution'
receipt=out/'checks/final-integration-correct-environment/receipt.json'
assert receipt.exists(),'先等当前完整集成命令退出，不能在套件写入时恢复'
completed=json.loads(receipt.read_text(encoding='utf-8'))
assert completed['command']==['pnpm.cmd','test:integration']
paths=subprocess.run(['git','diff','--name-only','HEAD','--','ci-logs/'],cwd=root,capture_output=True,check=True).stdout.decode().splitlines()
records=[]
for name in paths:
    assert name.startswith('ci-logs/delivery-recovery/') and name.endswith('.json'),name
    path=root/name
    assert path.is_file() and not path.is_symlink(),name
    raw=path.read_bytes()
    json.loads(raw)
    digest=hashlib.sha256(raw).hexdigest()
    target=out/'evidence-objects'/digest
    if not target.exists():target.write_bytes(raw)
    else:assert target.read_bytes()==raw
    original=subprocess.run(['git','show',f'HEAD:{name}'],cwd=root,capture_output=True,check=True).stdout
    records.append({'source':name,'runtimeBytes':len(raw),'runtimeSha256':digest,'preservedPath':target.relative_to(root).as_posix(),'restoredGitBlob':subprocess.run(['git','rev-parse',f'HEAD:{name}'],cwd=root,capture_output=True,check=True).stdout.decode().strip(),'restoredBytes':len(original),'restoredSha256':hashlib.sha256(original).hexdigest()})
    path.write_bytes(original)
    assert path.read_bytes()==original
assert subprocess.run(['git','diff','--exit-code','HEAD','--','ci-logs/'],cwd=root,capture_output=True).returncode==0
report={'commandReceipt':receipt.relative_to(root).as_posix(),'suiteExitCode':completed['exitCode'],'records':records,'originalHistoryRestored':True,'limitation':'早期未保全的同名 alias 不补造；此处仅保全本次完整集成运行输出，旧 Git 历史不是新运行证据。'}
(out/'history-runtime-preservation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'preserved':len(records),'historyDiffZero':True}))
