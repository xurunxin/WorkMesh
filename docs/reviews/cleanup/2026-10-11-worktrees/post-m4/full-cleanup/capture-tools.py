"""保本轮真实调用与返回的 JSONL 原行，包含首败；不复制完整会话。"""
import json
import sys
from audit import OUT, CURRENT, ROOT, utc, sha, write

def main():
    sources = []
    for path in (ROOT.parent / 'codex-home/sessions/2026/10/11').glob('*.jsonl'):
        with path.open(encoding='utf-8') as stream:
            metadata=json.loads(stream.readline()).get('payload',{})
            if metadata.get('cwd') == str(CURRENT) and isinstance(metadata.get('source'),str):
                sources.append(path)
    assert sources
    # 用户续接可生成多个主会话 JSONL；保各来源行号，不混成虚构连续日志。
    lines = [(str(source),i,raw) for source in sorted(sources)
             for i,raw in enumerate(source.read_text(encoding='utf-8').splitlines(),1)]
    calls = {}
    sessions = ('73916','33794','84645','34895','30188','10978','68058','28140','39658','71725','18208','80431','63191','9898')
    for source, i, raw in lines:
        row = json.loads(raw)
        p = row.get('payload',{})
        if row.get('type') != 'response_item' or p.get('type') not in ('custom_tool_call','function_call'):
            continue
        value = p.get('input',p.get('arguments',''))
        # exec 的早期 yield、notify 与最终 return 都保原行；wait 的调用不含目录名。
        if 'full-cleanup' not in value and not any(s in value for s in sessions) and p.get('name') not in ('functions.wait','functions.exec'):
            continue
        calls[(source,p['call_id'])] = dict(source=source,callId=p['call_id'], dispatchLine=i, dispatchOriginalLine=raw,
                                  dispatchOriginalLineSha256=sha(raw.encode()))
    for source, i, raw in lines:
        row = json.loads(raw)
        p = row.get('payload',{})
        key=(source,p.get('call_id'))
        if row.get('type') == 'response_item' and p.get('type') in ('custom_tool_call_output','function_call_output') and key in calls:
            calls[key].update(returnLine=i,returnOriginalLine=raw,returnOriginalLineSha256=sha(raw.encode()))
            calls[key].setdefault('allReturnOriginalLines',[]).append(dict(line=i,originalLine=raw,sha256=sha(raw.encode())))
    write('tool-receipts-'+sys.argv[1]+'.json.gz',dict(recordedAt=utc(), sources=[str(p) for p in sorted(sources)],
        numbering='1-based physical JSONL lines', receipts=[v for v in calls.values() if 'returnOriginalLine' in v],
        pendingNotUsedAsCompleted=[k for k,v in calls.items() if 'returnOriginalLine' not in v]))
    print(dict(completed=sum('returnOriginalLine' in v for v in calls.values())))

if __name__ == '__main__':
    main()
