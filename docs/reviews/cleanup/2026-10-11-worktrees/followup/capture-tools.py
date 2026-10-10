"""仅保存本轮所需真实工具调用/返回及JSONL物理定位，不保存完整会话。"""
import json
import sys
from common import *

def main():
    sources = []
    for path in (ROOT.parent / 'codex-home/sessions/2026/10/11').glob('*.jsonl'):
        with path.open(encoding='utf-8') as stream:
            first = stream.readline()
            if json.loads(first).get('payload',{}).get('cwd') == str(CURRENT): sources.append(path)
    assert len(sources) == 1, sources
    source = sources[0]; lines = source.read_text(encoding='utf-8').splitlines(); calls = {}
    for i, raw in enumerate(lines,1):
        row = json.loads(raw); p = row.get('payload',{})
        if row.get('type') != 'response_item' or p.get('type') not in ('custom_tool_call','function_call'): continue
        value = p.get('input',p.get('arguments',''))
        if 'capture-tools.py' in value: continue
        if 'followup' not in value and '23537' not in value and '82199' not in value and '80149' not in value: continue
        calls[p['call_id']] = {'callId':p['call_id'],'dispatchLine':i,'dispatchOriginalLine':raw}
    for i, raw in enumerate(lines,1):
        row = json.loads(raw); p = row.get('payload',{})
        if row.get('type') == 'response_item' and p.get('type') in ('custom_tool_call_output','function_call_output') and p.get('call_id') in calls:
            calls[p['call_id']].update(returnLine=i,returnOriginalLine=raw)
    write('tool-receipts-' + sys.argv[1] + '.json.gz', {'source':str(source),'numbering':'1-based physical JSONL lines','recordedAt':utc(),
                                                     'receipts':list(calls.values()),'withoutReturn':[k for k,v in calls.items() if 'returnOriginalLine' not in v]})
    print({'calls':len(calls),'withoutReturn':sum('returnOriginalLine' not in v for v in calls.values())})

if __name__ == '__main__':
    main()
