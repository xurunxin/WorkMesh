"""将完整注入copy施加已接受的精确编辑，不把工具截断前缀冒全文。"""
from pathlib import Path
import json
OUT=Path(__file__).resolve().parent
body=(OUT/'input/platform-plan-before-sync.md').read_text(encoding='utf8')
observed=json.loads((OUT/'input/sync-platform-observations.json').read_text(encoding='utf8'))
tool='\n'.join(x['text'] for x in observed['todo']['value']['content'] if x['type']=='text')
prefix=tool.split('\nSaved plan:\n',1)[1].split('\n…(truncated)',1)[0]
assert body.startswith(prefix),'注入全文必须与实际可见前缀逐字一致'
edits=json.loads((OUT/'input/platform-sync-edits.json').read_text(encoding='utf8'))['edits']
for edit in edits:
 assert edit['accepted'] and body.count(edit['old'])==1
 body=body.replace(edit['old'],edit['new'],1)
(OUT/'savedplan.md').write_text(body,encoding='utf8',newline='\n')
print(json.dumps({'injectedFullPlan':True,'visiblePrefixMatches':True,'acceptedEdits':len(edits),
                  'independentDocOriginalObtained':False,'productTestsRun':False}))
