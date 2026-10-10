"""仅为本轮检查创建独有临时服务；凭据只在进程环境，退出按登记ID清理。"""
from pathlib import Path
import json,os,secrets,subprocess,sys,time,uuid
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).parent/'product-evidence'
owner='m2-'+uuid.uuid4().hex[:12]
resources=[];operations=[];env=dict(os.environ)
def call(argv,**kw):
    started=time.time()
    result=subprocess.run(argv,cwd=ROOT,env=env,capture_output=True,text=True,**kw)
    operations.append({'argv':argv,'nativeExit':result.returncode,'startedUnix':started,'endedUnix':time.time()})
    save()
    result.check_returncode()
    return result.stdout.strip()
def save():
    (OUT/(owner+'-resources.json')).write_text(json.dumps({'owner':owner,'resources':resources,'operations':operations,'sharedImagesPreserved':True,'volumesCreated':False,'networkCreated':False},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def create(kind,image,port,args):
    name=owner+'-'+kind
    resource={'kind':kind,'name':name,'image':image,'status':'preparing'};resources.append(resource);save()
    cid=call(['docker','run','-d','--name',name,'--label','workmesh.m2.owner='+owner,'-p','127.0.0.1::'+str(port),*args,image])
    resource.update(id=cid,status='running');save()
    info=json.loads(call(['docker','inspect',cid]))[0]
    resource['hostPort']=int(info['NetworkSettings']['Ports'][str(port)+'/tcp'][0]['HostPort']);save()
    return resource['hostPort']
code=1
try:
    env.update(POSTGRES_USER='workmesh',POSTGRES_DB='workmesh_m2_test',POSTGRES_PASSWORD=secrets.token_hex(24),
        MINIO_ROOT_USER='workmesh',MINIO_ROOT_PASSWORD=secrets.token_hex(24),RUSTFS_ACCESS_KEY='workmesh')
    env['RUSTFS_SECRET_KEY']=env['MINIO_ROOT_PASSWORD']
    pg=create('postgres','postgres:16-alpine',5432,['--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_USER','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB'])
    redis=create('redis','redis:7-alpine',6379,['--tmpfs','/data:rw'])
    s3=create('s3','rustfs/rustfs:1.0.0',9000,['--tmpfs','/data:rw,mode=0777','-e','RUSTFS_ACCESS_KEY','-e','RUSTFS_SECRET_KEY'])
    env.update(DATABASE_URL=f"postgres://workmesh:{env['POSTGRES_PASSWORD']}@127.0.0.1:{pg}/workmesh_m2_test",REDIS_URL=f'redis://127.0.0.1:{redis}',
        RUN_INTEGRATION='1',NODE_ENV='test',SESSION_SECRET=secrets.token_hex(32),WORKMESH_MASTER_KEY=secrets.token_hex(32),
        WORKMESH_BOOTSTRAP_TOKEN=secrets.token_urlsafe(32),WORKMESH_RUNNER_SERVICE_TOKEN=secrets.token_hex(32),
        S3_ENDPOINT=f'http://127.0.0.1:{s3}',S3_BUCKET='workmesh-artifacts',S3_REGION='us-east-1',S3_ACCESS_KEY_ID='workmesh',S3_SECRET_ACCESS_KEY=env['MINIO_ROOT_PASSWORD'],S3_FORCE_PATH_STYLE='true',
        AUTH_RATE_LIMIT_ENDPOINT_BURST='10000',AUTH_RATE_LIMIT_SOCKET_BURST='10000',AUTH_RATE_LIMIT_CLIENT_IP_BURST='10000',AUTH_RATE_LIMIT_SUBJECT_BURST='1000',AUTH_RATE_LIMIT_INSTALL_BURST='100',
        npm_execpath=str(Path('C:/nvm4w/nodejs/node_modules/pnpm/pnpm.exe')),PYTHONIOENCODING='utf-8')
    for resource in resources:
        if resource['kind']!='postgres':continue
        for _ in range(60):
            probe=subprocess.run(['docker','exec',resource['id'],'pg_isready','-U','workmesh','-d','workmesh_m2_test'],capture_output=True)
            if probe.returncode==0:break
            time.sleep(1)
        else:raise RuntimeError('Owned PostgreSQL not ready')
    # Create and HeadBucket validate the exact owned S3 service before integration.
    script="""const {createRequire}=require('node:module');const r=createRequire(process.cwd()+'/packages/artifact-storage/package.json');const {S3Client,CreateBucketCommand,HeadBucketCommand}=r('@aws-sdk/client-s3');const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});(async()=>{for(let i=0;i<60;i++){try{await c.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET,ObjectLockEnabledForBucket:true}));await c.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET}));c.destroy();return}catch(e){if(i===59)throw e;await new Promise(r=>setTimeout(r,1000))}}})().catch(e=>{console.error(e.name);process.exit(1)})"""
    call(['node','-e',script])
    commands=[sys.argv[1:]]
    if commands==[['all']]:commands=[['C:/nvm4w/nodejs/pnpm.cmd',x] for x in ['test:integration','test:e2e']]
    for command in commands:
        result=subprocess.run([sys.executable,str(Path(__file__).parent/'product-run.py'),*command],cwd=ROOT,env=env)
        code=result.returncode
        if code:break
finally:
    for resource in reversed(resources):
        if not resource.get('id'):continue
        try:
            info=json.loads(call(['docker','inspect',resource['id']]))[0]
            if info['Config']['Labels'].get('workmesh.m2.owner')!=owner:raise RuntimeError('Resource ownership mismatch; preserved')
            call(['docker','logs',resource['id']]) if False else None
            result=subprocess.run(['docker','logs',resource['id']],capture_output=True)
            # Service logs do not print environment; redact any known task credential before retention.
            output=result.stdout+result.stderr
            for key in ['POSTGRES_PASSWORD','MINIO_ROOT_PASSWORD','WORKMESH_MASTER_KEY','SESSION_SECRET','WORKMESH_BOOTSTRAP_TOKEN','WORKMESH_RUNNER_SERVICE_TOKEN']:
                if env.get(key):output=output.replace(env[key].encode(),b'[REDACTED]')
            (OUT/(resource['name']+'-service.log')).write_bytes(output)
            call(['docker','rm','-f',resource['id']]);resource.update(status='removed',cleanupExit=0)
        except Exception as error:resource.update(status='preserved',cleanupError=type(error).__name__);code=1
        save()
sys.exit(code)
