"""保全本轮实际 JSONL 调用与返回原件；不补造旧清理现场。"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
SOURCE = Path(r'C:\Users\xurx\.tds\codex-home\sessions\2026\10\11\rollout-2026-10-11T00-56-55-01a126bf-04bf-7943-9ae6-d7c1c3d13276.jsonl')

def main():
    rows = [(i + 1, line, json.loads(line)) for i, line in enumerate(SOURCE.read_text(encoding='utf-8').splitlines())]
    selected = {}
    for line, raw, row in rows:
        p = row.get('payload', {})
        if row.get('type') == 'response_item' and p.get('type') == 'custom_tool_call':
            value = p.get('input', '')
            if any(prefix + ' docs/reviews/cleanup/2026-10-11-worktrees/capture-receipts.py' in value for prefix in ['Add File:', 'Update File:']):
                continue
            if any(marker in value for marker in ['store("deletion-call"', 'store("delete-main"', 'store("preflight-push"',
                                                  'store("postflight-tool"', 'safety-tool-receipt.json',
                                                  'python docs/reviews/cleanup/2026-10-11-worktrees/inventory.py',
                                                  'python docs/reviews/cleanup/2026-10-11-worktrees/preservation.py',
                                                  'prepare.py; Get-ChildItem', 'store("preflight-check"',
                                                  'docs/reviews/b1-b2 --glob', 'session_id:30302']):
                selected[p['call_id']] = {'callId': p['call_id'], 'source': str(SOURCE), 'dispatchLine': line,
                                         'dispatch': row, 'dispatchOriginalLine': raw}
    for line, raw, row in rows:
        p = row.get('payload', {})
        if row.get('type') == 'response_item' and p.get('type') == 'custom_tool_call_output' and p.get('call_id') in selected:
            selected[p['call_id']].update({'returnLine': line, 'return': row, 'returnOriginalLine': raw})
    assert 'call_47eafc1226ca4383a586cebce37d1059' in selected
    assert 'return' in selected['call_47eafc1226ca4383a586cebce37d1059']
    result = {'purpose': '本轮 inventory/预检/main/提交/正式移除/事后核验的实际调用定位与完整输入返回；不含历史现场补写',
              'lineNumbering': '1-based physical JSONL lines', 'source': str(SOURCE), 'receipts': list(selected.values())}
    (OUT / 'original-tool-receipts.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'receipts': len(selected), 'withoutReturn': [k for k, v in selected.items() if 'return' not in v]}, ensure_ascii=False))

if __name__ == '__main__':
    main()
