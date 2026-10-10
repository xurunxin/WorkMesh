"""从已合正式执行器生成本轮精确候选入口；只写本轮受控脚本。"""
from common import OUT, TARGETS

source = (OUT.parent / 'continuation/execute-target.ps1').read_text(encoding='utf-8')
source = source.replace('[ValidateSet(54,55,56,57)][int]$Todo',
                        "[ValidateSet('g1-plan','g1-build','upgrade-first','upgrade-final','cleanup-old')][string]$Key")
source = source.replace('$Todo', '$Key').replace('todo=', 'key=')
start = source.index('$names = @{')
end = source.index('\n', start)
names = '$names = @{' + ';'.join("'" + k + "'='" + v + "'" for k, v in TARGETS.items()) + '}'
source = source[:start] + names + source[end:]
source = source.replace('preflight-commit-binding.json', 'preflight-binding.json')
source = source.replace('$record | Select-Object todo,target,result,error,targetExistsAfter,diskBefore,diskAfter',
                        '[pscustomobject]$record | Select-Object key,target,result,error,targetExistsAfter,diskBefore,diskAfter')
dest = OUT / 'execute-target.ps1'
assert not dest.exists()
dest.write_text(source, encoding='utf-8')
