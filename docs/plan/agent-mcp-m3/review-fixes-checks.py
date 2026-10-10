"""成果独审修复后的独立门禁；每条由原记录器保存实际退出和源码字节。"""
from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parents[3]
recorder=Path(__file__).with_name('product-checks.py')
for name in ['check:workmesh-skill','check:runner-skill','ci:test','ci:validate','typecheck']:
    result=subprocess.run([sys.executable,str(recorder),'C:/nvm4w/nodejs/pnpm.cmd',name],cwd=root)
    if result.returncode:sys.exit(result.returncode)
