"""将最终运行bytes与每次原before/after映射；指纹不冒执行覆盖。"""
from pathlib import Path
import json,sys
HERE=Path(__file__).parent
sys.stdout.reconfigure(encoding='utf-8')
manifest=json.loads((HERE/'product-source-manifest.json').read_text(encoding='utf-8'))
final={r['path']:r['runtimeSha256'] for r in manifest['files']}
index=json.loads((HERE/'product-check-index.json').read_text(encoding='utf-8'))
rows=[]
for entry in index['receipts']:
    r=json.loads((HERE/entry['receipt']).read_text(encoding='utf-8'))
    missing=[p for p in final if p not in r['before'] or p not in r['after']]
    before=[p for p,h in final.items() if p in r['before'] and r['before'][p]!=h]
    after=[p for p,h in final.items() if p in r['after'] and r['after'][p]!=h]
    rows.append({'id':r['id'],'argv':r['argv'],'exit':r['exit'],'missingFinalSourceFingerprint':missing,
        'beforeDiffersFromFinal':before,'afterDiffersFromFinal':after,'completeUnchangedFinalSource':not(missing or before or after),
        'receipt':entry['receipt'],'actualEntrypoint':'由argv与完整stdout用例名称判定；指纹中包含文件不证明该文件被执行'})
value={'rows':rows,'finalSourceManifest':'product-source-manifest.json','boundary':'长命令起止差异保留，不推断未记录的模块加载时点。最终API/M3/Worker定向套件提供受影响源的完整无变绑定；其他必需命令用自身真实入口、回执与缓存统计。'}
(HERE/'product-test-source-bindings.json').write_bytes((json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'receipts':len(rows),'fullyBound':sum(r['completeUnchangedFinalSource'] for r in rows),'exit':0}))
