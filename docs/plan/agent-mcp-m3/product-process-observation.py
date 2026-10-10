"""检查本轮测试结束后的进程/容器；不停止或删除观察到的其他资源。"""
from pathlib import Path
import json,subprocess,sys,time
HERE=Path(__file__).parent;ROOT=HERE.resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8')
command="Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'node.exe','python.exe' -and $_.CommandLine -like '*01a1246e-406c-7593-ada6-66996634434b*' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"
process=subprocess.run(['pwsh','-NoProfile','-Command',command],capture_output=True,text=True,encoding='utf-8');process.check_returncode()
rows=json.loads(process.stdout) if process.stdout.strip() else []
if isinstance(rows,dict):rows=[rows]
docker=subprocess.run(['docker','ps','--filter','label=workmesh.m3.owner','--format','{{.ID}} {{.Names}}'],capture_output=True,text=True);docker.check_returncode()
value={'observedUnix':time.time(),'workspace':str(ROOT),'processObservation':{'command':command,'nativeExit':process.returncode,'rows':rows},'dockerObservation':{'argv':['docker','ps','--filter','label=workmesh.m3.owner','--format','{{.ID}} {{.Names}}'],'nativeExit':docker.returncode,'stdout':docker.stdout},
 'boundary':'当前观察不伪补早期缺PID登记；不清理任何观察到的他人/共享资源。测试与helper不得后台留到末报。E2E认证state/trace留本机忽略路径，不直接上传。'}
assert not docker.stdout.strip(), '仍有M3 owner容器，不能称收尾完成'
assert not any('product-checks.py' in (r['CommandLine'] or '') or 'vitest.mjs' in (r['CommandLine'] or '') for r in rows), '仍有检查进程'
(HERE/'product-process-observation.json').write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'processes':len(rows),'ownedContainers':0,'exit':0}))
