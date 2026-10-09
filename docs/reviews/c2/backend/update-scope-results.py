"""只追加当前后端候选读入口，保留旧六测试/九类/失败/视觉的历史记录。"""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/backend'
v = json.loads((BASE / 'verification.json').read_text(encoding='utf-8'))
receipt = v['requiredChecks'][0]['receipt']
folder = (ROOT / receipt).parent
report = json.loads((ROOT / receipt).read_text(encoding='utf-8'))
pointer = {'scope': '后端独立候选；原 UI 延后未验收', 'currentSpec': 'docs/reviews/c2/backend/current-spec.md',
           'preservation': 'docs/reviews/c2/backend/preservation.json', 'coverage': 'docs/reviews/c2/backend/coverage.json',
           'review': 'docs/reviews/c2/backend/review.md', 'verification': 'docs/reviews/c2/backend/verification.json',
           'oldHead': v['preservedOldHead'], 'main': v['inputMain'], 'scopeFirstHead': v['scopeFirstHead'],
           'result': '新候选五项必需检查成功；待新候选独审、最新 Required CI、actual main 与 Chief，不冒整项验收'}
for name, key in [('docs/plan/activation-task-specs/index.json', 'tasks'), ('docs/reviews/r1/test-coverage.json', 'features'), ('docs/plan/c2-wecom/test-coverage.json', None)]:
    path = ROOT / name
    data = json.loads(path.read_text(encoding='utf-8'))
    target = next(row for row in data[key] if row['seqNum'] == 16) if key else data
    target['currentBackendExecution'].update(pointer)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def append_once(path, marker, body):
    text = path.read_text(encoding='utf-8')
    assert marker not in text, str(path)
    path.write_text(text.rstrip() + '\n\n' + marker + '\n\n' + body + '\n', encoding='utf-8')

checks = '\n'.join('| `' + ' '.join(row['command']) + '` | ' + str(row['exitCode']) + ' |' for row in v['requiredChecks'])
summary = []
for label in ['test', 'test-integration', 'test-e2e']:
    current_folder = (ROOT / next(row['receipt'] for row in v['requiredChecks'] if row['label'] == label)).parent
    text = (current_folder / (label + '.log')).read_text(encoding='utf-8')
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    totals = [line.strip() for line in text.splitlines() if re.search(r'Tests\s+\d+|\d+ passed \(|\d+ skipped', line)]
    summary.append({'label': label, 'actualSummaryLines': totals, 'log': (current_folder / (label + '.log')).relative_to(ROOT).as_posix()})
(BASE / 'check-summaries.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

(BASE / 'review.md').write_text(f'''# C2 后端独立候选复核

本轮按用户正式收窄的 [完整当前规格](current-spec.md) 交付企业微信低敏出站后端。新增登录 returnTo、401 缓存隔离、返回/焦点/BackForward 与旧视觉未接受，完整保全后延后重设计；它们不属于本轮 DoD。这里仅提交新候选，尚未合入或完成整卡。

## 输入与分离

真实主线输入 `{v['inputMain']}`，规格先行提交 `{v['scopeFirstHead']}`，原完整成果 `{v['preservedOldHead']}`。精确 ref 的平台实读见 [观察记录](main-observations.json)，授权与计划来源见 [绑定](input-binding.json)。原完整成果仍在当前分支祖先，未 force-push；完整 Chief 旧正文原字节、旧 UI 和工作树/Git 双字节、merge head 自身 quota 修复及旧失败/未验收索引见 [保全索引](preservation.json) 和 [无损原件](preserved-source.zip)。未取得版本或生成时间记 null，不改写旧日志缺口。

七份 main UI 源码与既有测试索引 blob 完全一致；旧 `wecom-notifications.spec.ts` 仅从新候选移出，其原件与历史可恢复。当前 web 唯一新增文件为 `apps/web/e2e/wecom-backend-compatibility.spec.ts`，验证 main 既有消费者。全产品逐文件功能 hunk、旧来源与候选 OID 见 [verification.json](verification.json)，无损 patch 在 [backend-candidate.zip](backend-candidate.zip)；Worker `zod` 锁增量从准确 main 用实际包配置离线重生，只有三行锁增量。未带入未合任务源或 A2 Lite proxy。

## 后端行为与消费者限制

保留 `apps/worker/src/wecom-notifications.ts` 的单一 Markdown、4096 UTF-8 字节、固定 HTTPS 端点/DNS/TLS/重定向、bounded response/timeout 和明确失败/unknown；真实 Redis TIME、epoch、额度与串行 token 分离，完成/安全终止后至少 60 秒、未知/崩溃 D+60。quota 丢失在冷却返回前原子恢复 sentinel，多 Worker 重试不延长 ready，旧许可不能释放新 token。

`automation.ts`/`index.ts` 注册 admission/adapter、逐条 candidate/claim、锁等待后 remainingMs 复查，checkpoint 先 commit 后 I/O、unknown 不盲重送和连接关闭；`packages/db/src/channel-notifications.ts` 复用 C1 当前授权、workspace 前置锁、原 authority/resource 锁序、intent/attempt/fence、事务事件/outbox 与对账。`agent-webhook.ts` 仅增加可选读正文，原 status-only 消费者的 64 KiB/timeout 合同同验；API 只增加 configured provider 投影，configured 不代表实时 ready。默认 false，C1 Human target/秘密引用/管理入口复用，无新增 CRUD、队列、migration、route、event type 或权限。

新兼容测试消费真实 `wecomMarkdown` 与 main `canonicalObjectHref`。已登录有权 Human 可见列表详情与接口 200；独立浏览器会话的转发者同 URL 获 404、不见私有内容，提供方未启动时 main 读取仍可见，渠道 decision event/outbox 不增加。**当前 main 未登录跳登录页后丢失事项定位，登录成功回首页；须重新打开消息链接。** 该限制已实际断言并记入部署文档，不修改 UI 或声称完整通知用户闭环。

## 实际验证与资源

本轮四项通过运行 `{report['run']}`，完整 E2E 同源码重跑回执见 verification 中的 test-e2e 来源。Node 22.19.0、pnpm 9.15.4、独有 PostgreSQL/Redis/RustFS，精确命令、退出码、耗时、服务输入/随机凭据脱敏、首败、源码前后与清理回执见 [results.json](../product/{report['run']}/results.json)。发送测试仅 fake provider，频控 Lua 使用真实独有 Redis，无真实企业微信外发。

| 必需命令 | 实际退出码 |
| --- | --- |
{checks}

实际测试数量与 optional skip 的原日志汇总见 [check-summaries.json](check-summaries.json)，skip 不计通过。[六原测试与九类](coverage.json) 逐项映射到当前真实文件/场景；仅出站的入站签名/绑定/回调时窗明确不适用。保留跨窗口授权锁等待、多 Worker/崩溃、quota 六路冷却重试及 120 秒双目标恢复、撤权/停用/离队/Stop/fence、checkpoint 回滚与 unknown 对账、零决策事实和当前 main 拒绝边界实证。

889 份受测源码前后指纹 `{v['source']['sha256']}` 与 [实际 Git blob 字节](tested-source-blobs.json) 逐项绑定。[ZIP CRC/成员字节索引](archive-integrity.json) 独立复核可恢复原件。新兼容首轮错误等待列表内事项的额外 detail GET 超时，失败日志保留；修正夹具后定向兼容通过。首次完整检查的 E2E 因其他任务占用 3101 在服务准备阶段退出；未终止未知服务，待端口释放后以同一源码重跑完整 E2E。五项最终退出均为 0，首败不覆写，不改产品 UI、CI 服务复用或测试时限。资源先保全脱敏日志/失败截图/运行输入，再逐路径核链接与活动引用清理；含会话/CSRF 的 trace 仅保留指纹及脱敏失败材料，不提交凭据。实际回执见 [temporary-cleanup.json](../product/temporary-cleanup.json)，旧回执前缀不变，共享镜像、当前与恢复 worktree 保留。

复现本轮组合：`python docs/reviews/c2/product/run-checks.py backend`；复现消费者合同：`python docs/reviews/c2/product/run-checks.py backend-compatibility`。归档只读校验：`python docs/reviews/c2/backend/verify-candidate.py`、`node docs/plan/c2-wecom/verify-archive.mjs`；完整 PR 空白检查沿原规则执行，不增加 whitespace 豁免。

## 剩余门禁

新候选需另一 Agent 定向独审源代码拆分、精确 quota 源、共享传输和 URL 兼容；其 blocking/high 闭合后仍须最新 PR Required CI、actual main 与 Chief 确认。旧复审和旧 CI 保持历史含义，原视觉延后，不作为本轮前置。不合入或真实外发。
''', encoding='utf-8')
for name, body in [
    ('docs/reviews/c2/product-review.md', '当前权威交付已收窄为后端独立候选。旧 UI 实现、失败、截图与未接受状态均为历史，五项旧绿色不借给新候选；当前来源/切片/新实测/消费者限制/清理和剩余门禁见 [后端复核入口](backend/review.md)。'),
    ('docs/reviews/c2/backend/README.md', '规格先行与逐功能候选分离已执行；当前真实运行、source/blob/ZIP 证明和待独审/CI/main 门禁见 [完整后端复核入口](review.md)。'),
    ('docs/plan/activation-task-specs/16.md', '新后端组合五项必需本机检查已实际通过；main 当前消费者登录后丢事项定位，须重开链接，已记录且不修新 UI。新候选未完成独审/最新 Required CI/actual main/Chief；证据见 ../../reviews/c2/backend/review.md。'),
    ('docs/reviews/r1/test-coverage.md', '新组合六原测试/九类实际检查与原 UI 延后边界见 ../c2/backend/coverage.json；源码及完整结果见 ../c2/backend/review.md。可选 skip 不计通过，新候选独审/CI/main/Chief 仍待齐。'),
    ('docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md', 'C2 后端独立候选保留原授权/频控/投递语义并已实测新组合；main 当前未登录消费 canonical URL 后定位丢失须重新打开，明确为延后 UI 限制，不改变身份授权或本轮后端 DoD。完整源与后续独审/CI/main 门禁见 ../reviews/c2/backend/review.md。'),
]: append_once(ROOT / name, '<!-- C2-BACKEND-CANDIDATE -->', body)
print('当前后端读入口/六测试/九类/剩余门禁已同步，旧记录未冒作本轮验收')
