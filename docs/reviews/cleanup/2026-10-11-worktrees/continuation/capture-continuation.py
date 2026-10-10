"""截取本接续实际调用与工具返回；不收录会话全文、不补造历史回执。"""
import gzip
import hashlib
import json
from pathlib import Path
OUT = Path(__file__).resolve().parent
SOURCE = Path(r'C:\Users\xurx\.tds\codex-home\sessions\2026\10\11\rollout-2026-10-11T00-56-55-01a126bf-04bf-7943-9ae6-d7c1c3d13276.jsonl')

def main():
    lines = SOURCE.read_text(encoding='utf-8').splitlines()
    rows = [(i+1, raw, json.loads(raw)) for i, raw in enumerate(lines)]
    calls = {}
    for line, raw, row in rows:
        p = row.get('payload', {})
        if row.get('type') != 'response_item' or p.get('type') != 'custom_tool_call':
            continue
        text = p.get('input', '')
        if 'capture-continuation.py' in text:
            continue
        markers = ['continuation/', 'cont-', 'link-proof', '73542', '97048', '57839', '78518', '61339', '62175', '54823', '23157', 'usage-inventory.py']
        if not any(m in text for m in markers):
            continue
        calls[p['call_id']] = {'callId': p['call_id'], 'source': str(SOURCE), 'dispatchLine': line, 'dispatchOriginalLine': raw, 'dispatch': row}
    for line, raw, row in rows:
        p = row.get('payload', {})
        if row.get('type') == 'response_item' and p.get('type') == 'custom_tool_call_output' and p.get('call_id') in calls:
            calls[p['call_id']].update(returnLine=line, returnOriginalLine=raw, returnItem=row)
    result = {'source': str(SOURCE), 'numbering': '1-based physical JSONL lines', 'purpose': '本卡接续读取/保全/提交/正式移除/收尾/验证的实际工具输入返回；仅 selected 工具调用，不含完整聊天/环境秘密', 'receipts': list(calls.values())}
    raw = (json.dumps(result, ensure_ascii=False, indent=2)+'\n').encode()
    (OUT / 'original-tool-receipts.json.gz').write_bytes(gzip.compress(raw, mtime=0))
    print(json.dumps({'calls': len(calls), 'withoutReturn': [k for k,v in calls.items() if 'returnItem' not in v], 'jsonSha256': hashlib.sha256(raw).hexdigest()}))

if __name__ == '__main__':
    main()
