"""隔离安装仓库已有锁定依赖，仅用于规划DTO/CI静态核验。"""
from pathlib import Path
import json, shutil, subprocess

OUT=Path(__file__).resolve().parent
runtime=OUT/'.runtime'
runtime.mkdir(exist_ok=True)
source=OUT/'planning-tools'/'package.json'
shutil.copyfile(source,runtime/'package.json')
lock=OUT/'planning-tools'/'package-lock.json'
commands=[]
if lock.exists():
    shutil.copyfile(lock,runtime/'package-lock.json')
else:
    argv=[shutil.which('npm.cmd') or shutil.which('npm'),'install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']
    p=subprocess.run(argv,cwd=runtime,capture_output=True,text=True,encoding='utf-8',errors='replace')
    commands.append({'argv':argv,'cwd':str(runtime),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
    assert p.returncode==0,p.stderr
    shutil.copyfile(runtime/'package-lock.json',lock)
packages=json.loads(lock.read_text(encoding='utf-8'))['packages']
assert set(packages)=={'','node_modules/typescript','node_modules/yaml','node_modules/zod'},set(packages)
argv=[shutil.which('npm.cmd') or shutil.which('npm'),'ci','--ignore-scripts','--no-audit','--no-fund']
p=subprocess.run(argv,cwd=runtime,capture_output=True,text=True,encoding='utf-8',errors='replace')
commands.append({'argv':argv,'cwd':str(runtime),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
(OUT/'input'/'planning-tools-bootstrap.json').write_text(json.dumps({'commands':commands,'runtime':str(runtime),'scope':'仅本任务规划，未安装全仓产品依赖','cleanup':'核验结束后按路径归属清理；日志/锁文件保全'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
assert p.returncode==0,p.stderr
print(json.dumps({'dependencyCount':3,'packageCount':len(packages),'exitCode':0}))
