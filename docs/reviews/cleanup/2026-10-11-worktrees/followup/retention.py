"""逐树复核旧保留理由与当前条件，保护原拒绝及明确恢复输入。"""
from common import *

def main():
    original = load(OUT.parent / 'continuation/retained-directories.json')
    protected = load(OUT.parent / 'protected-paths.json')
    snapshots = []
    for r in protected:
        snapshots.append({**r, 'existsNow': Path(r['path']).exists()})
    write('protected-opening.json', {'recordedAt': utc(), 'paths': snapshots})
    result = []
    for old in original:
        root = Path(old['path']); status = call(root, 'status', '--porcelain=v1', '--untracked-files=all')
        head = call(root, 'rev-parse', 'HEAD')
        matches = [r for r in snapshots if r.get('source') and (r['path'] == str(root) or r['path'].startswith(str(root)+'\\'))]
        present = [r for r in matches if r['existsNow']]
        key = next((k for k, v in TARGETS.items() if root.name == v), None)
        todo = old['todo']
        if key:
            reason = '本轮已追准确构建来源，进入独立逐文件预检；不是已删结果'
            condition = '保全提交/推送、逐文件重核及所有实时安全门通过后才可执行'
        elif todo in (10, 18, 17):
            reason = 'D0/G1/C3 原拒绝目标或保护父目录；新授权未解除原拒绝'
            condition = '保持禁止，不请求同一删除许可；只有明确解除原系统拒绝的依据才可另议'
        elif root.name in ('01a1187a-f0f1-74d9-a5e7-0022c903a6e6','01a1187a-f0f2-7dd4-b77e-b9540ad44d9e'):
            reason = '历史恢复输入仍有未提交成果；#5 当前仍 review，#8 Done 不丢弃本机差异'
            condition = '逐个保全未提交成果并取得准确恢复消费已解除的依据；本轮不自动解除明确保护'
        elif todo == 5:
            reason = '#5 当前 review 与连接器三 OS/发行门禁仍在；非闲置完成交付'
            condition = '完成原待审门禁及明确解除恢复引用后重新评估'
        elif todo == 58:
            reason = '#58 building；整树、M5 runtime/OpenCode/测试容器和进程保护'
            condition = '真正完成、保全且无活动/恢复引用后登记；本轮不触碰'
        elif str(todo).startswith('21'):
            reason = '#21 首面 checkpoint/看板恢复与未合入 UI 成果明确保护；closed 不代表成果无用'
            condition = '用户明确后续 UI 恢复消费范围，必要成果完整保全并解除准确恢复引用'
        elif todo in (9, 16):
            reason = '后端交付后按用户裁定保全 UI/恢复输入；原任务仍承接后续 UI，Done 不解除'
            condition = '先明确逐项 UI/验收原件的持久替代来源及后续消费，取得精确保留例外裁定'
        elif todo == 52:
            reason = '旧清理审计恢复，含 G1 priorEditRejectionReceipt 的精确受保护原件'
            condition = '原拒绝审计原件继续留存；不得经父目录删除绕过'
        else:
            reason = '现有精确保护子目标仍存在，含旧依赖/构建缓存或 RAW/trace 验收恢复输入'
            condition = '逐项核最小保全与准确解除依据；不能凭 Done/年龄解除旧38/36/2保护或父删绕过'
        result.append({'path': str(root), 'todo': todo, 'originalReason': old['reason'], 'originalSource': old['source'],
                       'currentReason': reason, 'releaseCondition': condition, 'candidateKey': key,
                       'head': head, 'status': status, 'ancestor': call(CURRENT, 'merge-base', '--is-ancestor', head['stdout'].strip(), MAIN),
                       'historicalSourcePaths': matches, 'currentlyPresentSourcePaths': len(present),
                       'openingLogicalBytes': next(r['logicalBytes'] for r in load(OUT/'usage-opening.json.gz')['rows'] if r['path']==str(root))})
    write('retention-review.json', {'recordedAt': utc(), 'main': MAIN, 'rows': result,
                                   'source': '旧 retained-directories、protected-paths 精确来源指针＋本轮 Git/status/当前 todo/恢复对话；旧缺失路径不当新成果'})
    print({'reviewed': len(result), 'candidates': sum(r['candidateKey'] is not None for r in result)})

if __name__ == '__main__':
    main()
