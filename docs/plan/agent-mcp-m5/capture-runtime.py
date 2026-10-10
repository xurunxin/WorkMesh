"""核已安装OpenCode原生runtime，不重新安装，不执行模型或登录。"""
from pathlib import Path
import datetime,hashlib,json,os,subprocess,zipfile

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
package=Path(os.environ['USERPROFILE'])/'.bun/install/global/node_modules/@opencode/cli'
exe=package/'bin/opencode.exe'
manifest=json.loads((package/'package.json').read_text(encoding='utf8'))
started=datetime.datetime.now(datetime.timezone.utc)
proc=subprocess.run([str(exe),'--version'],capture_output=True,timeout=30,cwd=ROOT)
ended=datetime.datetime.now(datetime.timezone.utc)
def fp(data):return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
data={'packageName':manifest['name'],'packageVersion':manifest['version'],'path':str(exe),
      'binary':fp(exe.read_bytes()),'launcherPath':str(Path(os.environ['USERPROFILE'])/'.bun/bin/opencode.exe'),
      'launcherRole':'Bun shim；不能把其8192字节指纹冒原生runtime指纹',
      'versionOutput':proc.stdout.decode().strip(),'nativeExit':proc.returncode,
      'argv':[str(exe),'--version'],'startedAt':started.isoformat(),'endedAt':ended.isoformat(),
      'runtimeSeconds':(ended-started).total_seconds(),'installed':True,'connected':False,
      'stdout':fp(proc.stdout),'stderr':fp(proc.stderr),'actualModelRun':False}
(OUT/'client-runtime.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
members={'version/stdout':proc.stdout,'version/stderr':proc.stderr,'package/package.json':(package/'package.json').read_bytes(),
         'package/postinstall.mjs':(package/'postinstall.mjs').read_bytes()}
with zipfile.ZipFile(OUT/'input/client-runtime-originals.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name,body in members.items():
  info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,body)
print(json.dumps({'nativeExit':proc.returncode,'runtimeBytes':data['binary']['bytes'],'runtimeVersion':data['versionOutput'],'actualModelRun':False}))
