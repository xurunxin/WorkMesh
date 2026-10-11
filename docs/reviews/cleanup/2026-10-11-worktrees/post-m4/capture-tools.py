"""保本轮真实调用与返回的 JSONL 原行，包含首败；不复制完整会话。"""
import json
import sys
from audit import OUT, CURRENT, ROOT, utc, sha, write

def main():
    sources = []
    for path in (ROOT.parent / 'codex-home/sessions/2026/10/11').glob('*.jsonl'):
        with path.open(encoding='utf-8') as stream:
            if json.loads(stream.readline()).get('payload',{}).get('cwd') == str(CURRENT):
                sources.append(path)
    assert len(sources) == 1
    source = sources[0]
    lines = source.read_text(encoding='utf-8').splitlines()
    calls = {}
    sessions = ('51474','23423','13682','53340')
    for i, raw in enumerate(lines,1):
        row = json.loads(raw)
        p = row.get('payload',{})
        if row.get('type') != 'response_item' or p.get('type') not in ('custom_tool_call','function_call'):
            continue
        value = p.get('input',p.get('arguments',''))
        if 'post-m4' not in value and not any(s in value for s in sessions):
            continue
        calls[p['call_id']] = dict(callId=p['call_id'], dispatchLine=i, dispatchOriginalLine=raw,
                                  dispatchOriginalLineSha256=sha(raw.encode()))
    for i, raw in enumerate(lines,1):
        row = json.loads(raw)
        p = row.get('payload',{})
        if row.get('type') == 'response_item' and p.get('type') in ('custom_tool_call_output','function_call_output') and p.get('call_id') in calls:
            calls[p['call_id']].update(returnLine=i,returnOriginalLine=raw,returnOriginalLineSha256=sha(raw.encode()))
    write('tool-receipts-'+sys.argv[1]+'.json.gz',dict(recordedAt=utc(), source=str(source),
        numbering='1-based physical JSONL lines', receipts=[v for v in calls.values() if 'returnOriginalLine' in v],
        pendingNotUsedAsCompleted=[k for k,v in calls.items() if 'returnOriginalLine' not in v]))
    print(dict(completed=sum('returnOriginalLine' in v for v in calls.values())))

if __name__ == '__main__':
    main()
