"""复用已合执行前逐文件核验，仅本轮精确候选；不删除。"""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
OUT = Path(__file__).absolute().parent
BASE = OUT.parent
sys.path.insert(0, str(BASE / 'followup'))
import common
common.OUT = OUT
common.CURRENT = OUT.parents[4]
common.ROOT = common.CURRENT.parent
common.TARGETS = {'cleanup-pr217': '01a12766-4132-7d8c-a542-dcbfb2008b49'}
sys.argv = [__file__, 'cleanup-pr217', sys.argv[1]]
module = common.module('post_m4_verify', BASE / 'followup/verify-target.py')
sys.exit(module.main())
