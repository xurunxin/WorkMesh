"""受控单包离线验证；不新装工具、不运行生命周期脚本、不触已有任务环境。"""
import sys
sys.dont_write_bytecode=True
import json
import os
from pathlib import Path
import subprocess
import importlib.util
import re
import hashlib

OUT=Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('environment',OUT/'rebuild-environment.py')
env=importlib.util.module_from_spec(spec);spec.loader.exec_module(env)
ROOT=Path.cwd()

def main():
    result=env.plan(ROOT)
    phase=sys.argv[1] if len(sys.argv)>1 else 'initial'
    assert re.fullmatch('[a-z0-9-]+',phase)
    fixture=ROOT/('.tmp/full-cleanup-rebuild-proof-'+phase)
    private=Path(result['privateVirtualStore']).parent/(ROOT.name+'-proof-picocolors-'+phase)
    assert not fixture.exists() and not private.exists()
    fixture.mkdir(parents=True)
    lock=(ROOT/'pnpm-lock.yaml').read_text()
    pin='picocolors@1.1.1'
    integrity=re.search(r'  picocolors@1\.1\.1:\n    resolution: \{integrity: ([^}]+)\}',lock).group(1)
    (fixture/'package.json').write_text(json.dumps(dict(name='workmesh-rebuild-proof',private=True,packageManager='pnpm@9.15.4',dependencies={'picocolors':'1.1.1'}))+'\n')
    (fixture/'pnpm-lock.yaml').write_text("lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n      picocolors:\n        specifier: 1.1.1\n        version: 1.1.1\npackages:\n  picocolors@1.1.1:\n    resolution: {integrity: "+integrity+"}\nsnapshots:\n  picocolors@1.1.1: {}\n")
    (fixture/'pnpm-workspace.yaml').write_text('packages: []\n')
    args=[result['pnpm'],'install','--ignore-workspace','--offline','--frozen-lockfile','--ignore-scripts','--store-dir',str(Path(result['store']).parent),
        '--virtual-store-dir',str(private),'--package-import-method=copy','--side-effects-cache=false']
    before=(fixture/'pnpm-lock.yaml').read_bytes()
    proc=subprocess.run(args,cwd=fixture,capture_output=True,text=True,stdin=subprocess.DEVNULL,env={**os.environ,'CI':'true'},timeout=120)
    proof=dict(plan=result,fixture=str(fixture),privateVirtualStore=str(private),input=args,exit=proc.returncode,stdout=proc.stdout,stderr=proc.stderr,
        verification='尚未通过',physicalSavedBytes=None)
    if proc.returncode==0:
        package=private/'picocolors@1.1.1/node_modules/picocolors/picocolors.js'
        raw=package.read_bytes();identity=os.stat(package)
        # 新任务自己的文件可变，不可写穿 CAS 或另一任务；原 package 字节在内存留作复原。
        other=private/'mutation-proof.txt'
        other.write_bytes(b'private-state')
        content=hashlib.sha512(raw).hexdigest()
        store_file=Path(result['store'])/'files'/content[:2]/content[2:]
        assert store_file.read_bytes()==raw
        store_stat=os.stat(store_file)
        proof.update(lockUnchanged=before==(fixture/'pnpm-lock.yaml').read_bytes(),packageBytes=len(raw),packageSha256=hashlib.sha256(raw).hexdigest(),
            privateFileIdentity=[identity.st_dev,identity.st_ino],nlink=identity.st_nlink,
            storePath=str(store_file),storeIdentity=[store_stat.st_dev,store_stat.st_ino],sameIdentity=identity.st_ino==store_stat.st_ino,
            rootNodeModulesIsPrivate=str(fixture/'node_modules'),packageModulesYaml=(fixture/'node_modules/.modules.yaml').read_text(),
            verification='单包从已有 store 离线重建成功；源码锁未变；copy/任务 virtual store 生效，物理节省未测')
        assert identity.st_ino!=store_stat.st_ino and identity.st_nlink==1, 'copy 未隔离实际文件身份'
        package.write_bytes(raw+b'\n// private mutation verification\n')
        proof['storeUnchangedAfterPrivateWrite']=store_file.read_bytes()==raw
        package.write_bytes(raw)
        assert proof['storeUnchangedAfterPrivateWrite']
    with (OUT/('rebuild-verification-'+phase+'.json')).open('x',encoding='utf-8') as stream:
        stream.write(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in proof.items() if k not in ('packageModulesYaml','plan')},ensure_ascii=False))
    assert proc.returncode==0

if __name__=='__main__':main()
