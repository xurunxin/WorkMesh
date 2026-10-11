"""脱敏保全模型实收与进程回执，按完整内容身份复用；不复制原生二进制。"""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[4]
private=root/'.tmp/m4-4adc5e39'
out=root/'docs/plan/agent-mcp-m4/execution'
env=json.loads((private/'environment.json').read_text(encoding='utf-8'))
secrets=[value for key,value in env.items() if len(value)>8 and any(part in key.upper() for part in ['TOKEN','PASSWORD','SECRET','MASTER_KEY','DATABASE_URL'])]
sensitive=re.compile(r'^(authorization|cookie|apiKey|accessKeyId|secretAccessKey|password|servicePassword|secretMaterial|webhookSecret|(?:session|installation|connection|bootstrap|runner|service)Token)$',re.I)
def redact(value):
    if isinstance(value,dict):return {key:'[REDACTED]' if sensitive.fullmatch(key) else redact(body) for key,body in value.items()}
    if isinstance(value,list):return [redact(item) for item in value]
    if isinstance(value,str):
        for secret in secrets:value=value.replace(secret,'[REDACTED]')
        return re.sub(r'wm[ips]_[A-Za-z0-9_-]+','[credential]',value)
    return value
records=[]
objects=out/'evidence-objects';objects.mkdir(exist_ok=True)
for directory in ['conformance-evidence','native-evidence']:
    base=private/directory
    sources=list(base.glob('*.json'))
    # Native driver 在独有 opencode 根写进程、资源与命令回执。
    # 只取这些根的直接 JSON；不归档 config/cache/SQLite/原生二进制树。
    if directory=='native-evidence':
        for owned in sorted(base.glob('opencode-*')):
            assert owned.resolve().is_relative_to(base.resolve()) and not owned.is_symlink()
            if owned.is_dir():sources.extend(owned.glob('*.json'))
    for source in sorted(sources):
        raw=source.read_bytes();value=json.loads(raw)
        saved=(json.dumps(redact(value),ensure_ascii=False,indent=2)+'\n').encode()
        sha=hashlib.sha256(saved).hexdigest();target=objects/sha
        if not target.exists():target.write_bytes(saved)
        else:assert target.read_bytes()==saved
        records.append({'source':source.relative_to(root).as_posix(),'observedRawBytes':len(raw),'observedRawSha256':hashlib.sha256(raw).hexdigest(),'preservedPath':target.relative_to(root).as_posix(),'preservedBytes':len(saved),'preservedSha256':sha,'redacted':True})
report={'records':records,'fullJsonRead':True,'binaryBuildTreesArchived':False,'casReuse':True,'retentionLimitation':'早期同名私有 alias 在加入CAS前曾被后续运行覆盖，旧缺原件不补造；独有model/Pi/进程回执及CAS后各版本保留。当前恢复私有路径仍保留。'}
previous=out/'runtime-evidence-current.json'
if previous.exists():
    raw=previous.read_bytes();sha=hashlib.sha256(raw).hexdigest();target=objects/sha
    if not target.exists():target.write_bytes(raw)
    else:assert target.read_bytes()==raw
    report['previousManifest']={'path':target.relative_to(root).as_posix(),'bytes':len(raw),'sha256':sha}
(out/'runtime-evidence-current.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'records':len(records),'uniqueContentObjects':len(set(item['preservedSha256'] for item in records)),'binaryCopies':0}))
