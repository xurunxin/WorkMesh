"""复用已合保全实现，仅适配新本轮的一个精确候选；不删除。"""
import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path

OUT = Path(__file__).absolute().parent
BASE = OUT.parent
CURRENT = OUT.parents[4]
sys.path.insert(0, str(BASE / 'followup'))
import common
common.OUT = OUT
common.CURRENT = CURRENT
common.ROOT = CURRENT.parent
common.MAIN = '6a06ce338f90bf16ce27e3cca1a76771eba42e6e'
common.TARGETS = {'cleanup-pr217': '01a12766-4132-7d8c-a542-dcbfb2008b49'}

def main():
    # gate/status/祖先/原保护/嵌套/逐文件 readonly/独占读取全部沿原实现。
    original = BASE / 'followup/preserve.py'
    bound = common.call(CURRENT, 'rev-parse', common.MAIN + ':' + str(original.relative_to(CURRENT)).replace('\\','/'))
    assert bound['exit'] == 0
    common.write('preservation-source.json', dict(source=str(original.relative_to(CURRENT)).replace('\\','/'),
        gitBlob=bound['stdout'].strip(), main=common.MAIN, windowsBytes=original.stat().st_size,
        windowsSha256=common.sha(original.read_bytes()), adaptation='只在本进程适配 OUT/当前路径/精确候选/main；原源码未改，原 main 不执行。'))
    module = common.module('post_m4_preservation', original)
    module.main()

if __name__ == '__main__':
    main()
