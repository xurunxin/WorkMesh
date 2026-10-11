"""只验证规划数据/来源/链接；不安装依赖或运行产品。"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
MAIN = 'c2b3d363c037157df13beb82799d99d07a9b7db8'
ADR = ROOT/'docs/adr/0086-optional-agent-domain-read-projections.md'
failures = []
counts = {'json':0,'utf8':0,'localLinks':0,'sourceBlobs':0,'operationContracts':0}
start = time.perf_counter()
start_utc = datetime.now(timezone.utc).isoformat()
def check(condition, message):
    if not condition:
        failures.append(message)
def git(*args):
    return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=True).stdout
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
files = sorted([p for p in OUT.rglob('*') if p.is_file()] + [ADR])
for path in files:
    try:
        text = path.read_bytes().decode('utf-8')
        counts['utf8'] += 1
        if path.suffix=='.json':
            json.loads(text)
            counts['json'] += 1
        if path.suffix=='.md':
            for match in re.finditer(r'\[[^\]\n]+\]\(([^)]+)\)',text):
                target = match.group(1).split('#',1)[0]
                if not target or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',target):
                    continue
                counts['localLinks'] += 1
                check((path.parent/target).resolve().exists(),f'链接缺失：{path.name} -> {target}')
    except (UnicodeDecodeError,json.JSONDecodeError) as error:
        failures.append(f'文件解析失败：{path}: {error}')
manifest = json.loads((OUT/'input/source-manifest.json').read_text(encoding='utf-8'))
check(not manifest['missingPaths'],'来源有缺失路径')
for record in manifest['records']:
    raw = git('cat-file','blob',record['gitBlob'])
    check(len(raw)==record['gitBytes'] and sha(raw)==record['gitSha256'],f'Git全文指纹不符：{record["path"]}')
    if 'worktreeSha256' in record:
        check(sha((ROOT/record['path']).read_bytes())==record['worktreeSha256'],f'工作树来源发生变化：{record["path"]}')
    counts['sourceBlobs'] += 1
check((OUT/'input/frozen-m4.md').read_bytes()==(OUT/'input/current-main-m4.md').read_bytes(),'冻结M4不相等')
check(len((OUT/'input/frozen-m4.md').read_text(encoding='utf-8').splitlines())==25,'M4原文非完整25行')

todo = json.loads((OUT/'input/todo-readback.json').read_text(encoding='utf-8'))
tool_text = '\n'.join(x['text'] for x in todo['content'] if x['type']=='text')
spec = tool_text.split('Spec:\n',1)[1].split('\nSaved plan:',1)[0].strip()
check((OUT/'spec.md').read_text(encoding='utf-8').strip()==spec,'spec未与完整工具Spec逐字相等')
plan = (OUT/'savedplan.md').read_text(encoding='utf-8').strip()
sync = (OUT/'platform-sync.md').read_text(encoding='utf-8')
old = re.search(r'^> (- \*\*`docs/plan/agent-mcp-m4/`.*)$',sync,re.M).group(1)
new = next(line for line in plan.splitlines() if line.startswith('- **`docs/plan/agent-mcp-m4/`'))
old_plan = plan.replace(new,old)
prefix = tool_text.split('\nSaved plan:',1)[1]
# 元信息行不是正文；保留工具截断标记之外的精确可见正文。
position = prefix.find('## 上下文')
visible = prefix[position:].split('\n…(truncated)',1)[0].strip()
check(position>=0 and old_plan.startswith(visible),'平台Saved plan可见前缀与用户注入旧全文不一致')
check('本轮仅写入并提交规划文件' in plan,'平台计划未纳本轮限定')

decisions = json.loads((OUT/'operation-decisions.json').read_text(encoding='utf-8'))
rules = git('show',f'{MAIN}:packages/contracts/src/agent-discovery-rules.ts').decode('utf-8').splitlines()
api = git('show',f'{MAIN}:OPENAPI.yaml').decode('utf-8')
check(len(decisions['selected'])==19,'选定操作数量不符')
check(len({x['operationId'] for x in decisions['selected']})==19,'重复operation')
for entry in decisions['selected']:
    parsed = json.loads(rules[entry['source']['line']-1].strip().removesuffix(','))
    check(parsed==entry['sourceRule'],f'现行逐项权限谓词不符：{entry["operationId"]}')
    check(re.search(r'operationId:\s*'+re.escape(entry['operationId'])+r'\b',api) is not None,f'接口不存在：{entry["operationId"]}')
    check(entry['planned']['actualStatus']=='未实施/未测',f'planned误标actual：{entry["operationId"]}')
    counts['operationContracts'] += 1
check('Proposed' in ADR.read_text(encoding='utf-8'),'ADR未保待审')
expected_prefix='docs/plan/agent-mcp-m4/'
changed = git('diff','--name-only','HEAD').decode().splitlines()+git('ls-files','--others','--exclude-standard').decode().splitlines()
for path in changed:
    check(path.startswith(expected_prefix) or path=='docs/adr/0086-optional-agent-domain-read-projections.md',f'越出规划文件范围：{path}')
data = {'command':'python -B docs/plan/agent-mcp-m4/validate-plan.py','startUtc':start_utc,
        'endUtc':datetime.now(timezone.utc).isoformat(),
        'runtimeSeconds':time.perf_counter()-start,'exitCode':1 if failures else 0,'counts':counts,'failures':failures,
        'productTestsRun':False,'independentReview':'待Chief交接正式独审'}
destination=OUT/'input/planning-validation.json'
# 失败原件独立保存，不让后续修复覆盖。
if failures:
    previous=list((OUT/'input').glob('planning-validation-failure-*.json'))
    destination=OUT/'input'/f'planning-validation-failure-{len(previous)+1}.json'
destination.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(data,ensure_ascii=False))
sys.exit(data['exitCode'])
