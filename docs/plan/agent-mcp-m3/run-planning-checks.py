"""保全真实规划静态调用原输出、前后受测字节，不生成产品通过状态。"""
from pathlib import Path
import hashlib,json,os,platform,shutil,subprocess,sys,zipfile

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
CHECKS=OUT/'checks'
ADR=ROOT/'docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md'
REL='docs/plan/agent-mcp-m3/'

def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def snapshot():
    paths=[p for p in OUT.rglob('*') if p.is_file() and not any(k in p.parts for k in ('.runtime','__pycache__','checks'))]+[ADR]
    return {p.relative_to(ROOT).as_posix():p.read_bytes() for p in sorted(paths)}

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    node=shutil.which('node');python=sys.executable
    commands={
      'contract':[node,REL+'check-contract-proposal.mjs'],
      'ci-policy':[node,'--test','scripts/ci-policy.test.mjs'],
      'ci-validate':[node,'scripts/validate-ci.mjs'],
      'ci-selection':[node,REL+'check-ci-selection.mjs'],
      'static':[python,REL+'static-check.py'],
    }
    CHECKS.mkdir(exist_ok=True)
    env=dict(os.environ,NODE_PATH=str(OUT/'.runtime/node_modules'),PYTHONIOENCODING='utf-8')
    runtime={'node':subprocess.check_output([node,'--version'],env=env).decode().strip(),
      'nodeExecutable':node,'python':platform.python_version(),'pythonExecutable':python,
      'platform':platform.platform(),'yamlParser':'PyYAML '+__import__('yaml').__version__,
      'dependencyScope':'NODE_PATH只在此静态子进程指向本任务.runtime；不改系统环境或产品依赖'}
    codes=[]
    for name in sys.argv[1:]:
        argv=commands[name]
        number=len(list(CHECKS.glob(name+'-*.json')))+1
        stem=name+'-'+str(number)
        before=snapshot()
        p=subprocess.run(argv,cwd=ROOT,env=env,capture_output=True)
        after=snapshot()
        assert before==after,'核验过程中受测工件被改写'
        archive_path=CHECKS/(stem+'.zip')
        with zipfile.ZipFile(archive_path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('stdout.bin',p.stdout);archive.writestr('stderr.bin',p.stderr)
            for path,data in before.items():
                if path.endswith('/source-snapshot.zip'):continue
                archive.writestr('inputs/'+path,data)
        receipt={'name':name,'argv':argv,'cwd':str(ROOT),'exitCode':p.returncode,
          'runtime':runtime,'stdout':p.stdout.decode('utf-8',errors='replace'),
          'stderr':p.stderr.decode('utf-8',errors='replace'),
          'rawArchive':{'path':archive_path.relative_to(ROOT).as_posix(),**fp(archive_path.read_bytes())},
          'rawOutputs':{'stdout':fp(p.stdout),'stderr':fp(p.stderr)},
          'testedBefore':[{'path':k,**fp(v)} for k,v in before.items()],
          'testedAfterEqualsBefore':True,
          'sourceArchiveNote':'既有source-snapshot.zip不重复嵌入，受测before索引含其原字节hash，可逐项核回。',
          'productTestsExecuted':False,'skip':'按对应原输出，不从exit0猜数量'}
        (CHECKS/(stem+'.json')).write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
        print(json.dumps({'name':name,'exitCode':p.returncode,'receipt':stem+'.json','stdout':receipt['stdout'][-2400:],'stderr':receipt['stderr'][-2400:]},ensure_ascii=False))
        codes.append(p.returncode)
    sys.exit(1 if any(codes) else 0)

if __name__=='__main__':main()
