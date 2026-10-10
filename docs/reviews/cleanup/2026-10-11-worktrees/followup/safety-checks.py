"""适当的只读安全门负例及来源绑定；不创建/删除外部夹具。"""
import ast
from common import *

def main():
    rows = []
    for name, path in [('当前树',CURRENT),('workspace根',ROOT),('主仓库',ROOT/'DzkLDn6UW-IbfoTJzN9Ro/repo')]:
        refused = False
        try: gate(path)
        except AssertionError: refused = True
        assert refused
        rows.append({'case':name,'path':str(path),'expected':'拒绝候选','passed':refused})
    m = load(OUT/'mapping-g1-plan.json.gz')
    link = ROOT/TARGETS['g1-plan']/m['links'][0]['path']
    for path in (link,link/'package.json'):
        result = inventory.directory_gate(path)
        assert result and result['blockedAt']==str(link)
        rows.append({'case':'reparse本体/后代不得跟随','path':str(path),'result':result,'passed':True})
    rejected = False
    try: inventory.write_snapshot(ROOT/'not-a-cleanup-snapshot.json.gz',{})
    except ValueError: rejected = True
    assert rejected
    rows.append({'case':'输出范围不得越出受控清理目录','passed':True})
    for p in OUT.glob('*.py'): ast.parse(p.read_text(encoding='utf-8'),filename=str(p))
    write('safety-checks.json',{'recordedAt':utc(),'checks':rows,'pythonSyntax':'所有本轮py实际解析通过','mutation':'仅此回执，无外部测试目录或删除'})
    print({'safetyChecks':len(rows),'passed':True})

if __name__ == '__main__':
    main()
