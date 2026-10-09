"""只依据真实运行回执生成当前产品验收映射；历史规划矩阵保持原义。"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import subprocess
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[4]
BASE = ROOT / 'docs/reviews/c2/product'
REQUIRED = ['lint', 'typecheck', 'test', 'test-integration', 'test-e2e']

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def sha(body):
    return hashlib.sha256(body).hexdigest()

reports = [(path, read(path)) for path in sorted(BASE.glob('*/results.json'))]
successful = [(path, report) for path, report in reports if report['mode'] == 'full' and all(any(check['label'] == label and check['exitCode'] == 0 for check in report['checks']) for label in REQUIRED[:-1])]
if not successful:
    raise RuntimeError('缺少当前源码前四项完整必需检查成功的回执')
full_path, full = successful[-1]
expected_source = next(check for check in full['checks'] if check['label'] == 'test-integration')['sourceAfter']['sha256']
e2e_reports = [(path, report) for path, report in reports if any(check['label'] == 'test-e2e' and check['exitCode'] == 0 and check['sourceAfter']['sha256'] == expected_source for check in report['checks'])]
if not e2e_reports:
    raise RuntimeError('缺少与前四项源码指纹完全一致的正式根 E2E 成功回执')
e2e_path, e2e = e2e_reports[-1]
visuals = [(path, report) for path, report in reports if report['mode'] == 'visual' and not report.get('failure')]
if not visuals:
    raise RuntimeError('缺少实际实施前 UI 对照')
visual_path, visual = visuals[-1]
checks = [{**check, 'receipt': full_path.relative_to(ROOT).as_posix()} for check in full['checks'] if check['label'] in REQUIRED[:-1]]
checks += [{**check, 'receipt': e2e_path.relative_to(ROOT).as_posix()} for check in e2e['checks'] if check['label'] == 'test-e2e' and check['exitCode'] == 0]
for check in checks:
    if check['sourceBefore'] != check['sourceAfter']:
        raise RuntimeError('受测源码在检查中变化，不能归为当前通过')
    if check['sourceAfter']['sha256'] != expected_source:
        raise RuntimeError('分轮检查的源码指纹不一致，不能合并报告')

archives = []
for path, report in reports:
    with zipfile.ZipFile(path.parent / 'raw-logs.zip') as archive:
        if archive.testzip() is not None:
            raise RuntimeError('原始脱敏日志 CRC 不通过')
        members = []
        for name in archive.namelist():
            body = archive.read(name)
            members.append({'name': name, 'bytes': len(body), 'sha256': sha(body)})
        for check in report['checks']:
            body = archive.read(check['label'] + '.log')
            if len(body) != check['rawLogBytes'] or sha(body) != check['rawLogSha256']:
                raise RuntimeError('回执与原始脱敏日志字节不一致')
    archives.append({'run': report['run'], 'path': str((path.parent / 'raw-logs.zip').relative_to(ROOT)).replace('\\','/'), 'bytes': (path.parent / 'raw-logs.zip').stat().st_size, 'sha256': sha((path.parent / 'raw-logs.zip').read_bytes()), 'members': members, 'crc': '通过'})
write(BASE / 'log-archive-index.json', archives)

unit = 'apps/worker/src/wecom-notifications.test.ts'
integration = 'apps/api/integration/wecom-notifications.integration.test.ts'
c1 = 'apps/worker/integration/stage4-automation.integration.test.ts'
web = 'apps/web/e2e/wecom-notifications.spec.ts'
mapping = [
    [(unit, '低敏 Markdown、4096 UTF-8 边界、errcode=0 及固定公共地址连接'), (integration, '同源重放去重，明确拒绝恢复复用 delivery；同 ACK 幂等、旧 fence 拒绝'), (web, '当前 Human 登录 canonical 深链与可读正对照')],
    [(integration, '当前 disabled/inactive/revoked/membership/changed/muted 撤权先提交，真实授权锁后零 fake provider 调用；Stop 先提交'), (web, 'Bob 转发 GET 404、无上一 Human 缓存，失权后重新登录')],
    [(unit, '秘密端点、非 HTTPS origin、私网 DNS、开放重定向与编码路径拒绝'), (integration, 'Redis 状态丢失：共享冷却 120 秒，旧 token 不恢复发送')],
    [(integration, '同源重放去重，明确拒绝恢复复用 delivery；同 ACK 幂等、旧 fence 拒绝'), (c1, 'admits only exact assigned Human targets and deduplicates concurrent source replay and fan-out')],
    [(integration, 'changed target 锁后抑制、旧 claim fence 拒绝'), (c1, 'allows one current holder, rejects stale prepare/ack and preserves one logical attempt'), ('apps/api/integration/notification-channels.integration.test.ts', '本人 target CRUD、If-Match 与异体幂等冲突')],
    [(integration, 'checkpoint 事务回滚不外发；发送后进程崩溃重启进入 uncertain，旧 fence 不 ACK'), (c1, 'recovers source commit, admission rollback and checkpoint commit without partial fan-out')],
    [(integration, '网络未知不自动重送；C1 显式对账复用原 delivery/fence，渠道零决策事件/outbox'), (c1, 'replays outbox after intent commit without duplicate attempts or notification event recursion')],
    [(integration, '实际发送窗口：0 秒预留、4 秒发送，60 秒不释放额度，跨 Worker 不出现第 21 条；并发 Worker 原子额度上限；崩溃后仅 token 过期；授权锁等待跨窗口；可信完成晚于发送截止上界；真实 Redis TIME 与部分 bucket 丢失')],
    [(integration, 'C2 实际五秒 Abort 结束请求后进入 uncertain，不自动重送且额度保留 D+60；checkpoint/发送后崩溃与原 fence 对账'), (web, '无提供方/Worker 的网页可见正对照、重新加载、Back/Forward 和关闭焦点')],
]
coverage = read(ROOT / 'docs/plan/c2-wecom/test-coverage.json')
current_matrix = [{'id': old['id'], 'category': old['category'], 'applicable': True, 'cases': [{'file': file, 'scenario': scenario, 'receipt': (e2e_path if file == web else full_path).relative_to(ROOT).as_posix()} for file, scenario in cases], 'result': '真实 fake/数据库/Redis/网页检查通过', 'evidence': [full_path.relative_to(ROOT).as_posix(), e2e_path.relative_to(ROOT).as_posix()]} for old, cases in zip(coverage['matrix'], mapping, strict=True)]
original_tests = [
    {'id': row['id'], 'sourceText': row['text'], 'currentSpecClause': clause, 'matrixIds': ids, 'result': result}
    for row, clause, ids, result in zip(coverage['originalTests'], [
        '出站协议、载荷上限、错误映射、频控、timeout 与失败恢复',
        'canonical、安全登录返回、当前 Human 鉴权和焦点',
        '停用、撤销、离队、Stop 后抑制；无权转发者不可见',
        '渠道零决策事件/决策 outbox',
        '网页故障回退及 C1 管理入口复用',
        '本卡仅出站，无回调签名/绑定解绑/时窗依赖；保留旧原文及既有修订处置',
    ], [['R1-16-1','R1-16-3','R1-16-8','R1-16-9'],['R1-16-1','R1-16-2'],['R1-16-2','R1-16-5'],['R1-16-4','R1-16-7'],['R1-16-9'],[]], ['通过 fake 验证']*5+['不适用：Webhook POST 无入站 endpoint 或 Human 绑定系统'], strict=True)
]
current = {'stage': 'review', 'input': 'docs/reviews/c2/product-input.json', 'authorizedDesignHead': '178ac8cb297a78ea830f23845aa1d59972cca149',
    'testedBaseHead': full.get('inputHead', 'f7c2265b4abd1f06ca97be5c2a16a1568fc2b767'), 'actualMainInput': '18252ba8761aa810c3fd12d31ecae83e8b24d985',
    'matrix': current_matrix, 'originalTests': original_tests,
    'requiredChecks': [{'label': check['label'], 'command': check['command'], 'exitCode': check['exitCode'], 'source': check['sourceAfter'], 'receipt': check['receipt']} for check in checks],
    'testPlacement': '复用既有 API integration Redis 夹具；C1 Worker 回归保持原文件，CI 工作流/策略未修改。已审产品方案文件原样保留，实际文件映射在本字段追加。',
    'outbound': '仅 fake provider，未真实外发', 'dod': {'单渠道': 'fake 全链通过，真实外发未授权/未运行', '适用断言与本机必需检查': '通过；具体 skip 见回执', '网页非关键路径': 'fake 故障与普通网页正对照通过', '协议配置证据': '已归档，原始来源与历史检查未改写', '独立成果审查': '待', '视觉停点': '待 Chief 阅读实际前后截图', '当前RequiredCI': '待推送后真实 PR 检查', 'actualMain': '产品尚未合入，不宣称整卡完成'},
    'review': 'docs/reviews/c2/product-review.md', 'status': '产品本机验证完成；等待独审/视觉停点/当前 CI/actual main，历史规划状态不覆写'}
coverage['currentProductExecution'] = current
write(ROOT / 'docs/plan/c2-wecom/test-coverage.json', coverage)
r1 = read(ROOT / 'docs/reviews/r1/test-coverage.json')
next(row for row in r1['features'] if row['seqNum'] == 16)['currentProductExecution'] = current
write(ROOT / 'docs/reviews/r1/test-coverage.json', r1)
index = read(ROOT / 'docs/plan/activation-task-specs/index.json')
next(row for row in index['tasks'] if row['seqNum'] == 16)['currentProductExecution'] = {key: current[key] for key in ['stage','input','authorizedDesignHead','actualMainInput','review','status']}
write(ROOT / 'docs/plan/activation-task-specs/index.json', index)
for name, section in [
    ('docs/plan/activation-task-specs/16.md', '## 当前产品成果与 review 门禁\n\n企业微信单向 Markdown、C1 投递复用及安全登录深链已实现；五项必需本机检查均退出 0，fake provider/独有 Redis、数据库与真实网页回执见 `docs/reviews/c2/product-review.md`。六原验收、九类与 DoD 的当前结果另存矩阵 currentProductExecution，历史原文/来源/首败/回执缺口保留。未真实外发。成果停 review，独审、视觉停点、当前 PR Required CI、actual main 和 Chief 最终确认尚待完成，不宣称整卡验收。'),
    ('docs/reviews/r1/test-coverage.md', '## C2 当前产品检查映射\n\n六原验收与九类的历史字段保持原义。当前已实现及真实运行结果见 [产品审阅入口](../c2/product-review.md) 和 test-coverage.json 中 C2 currentProductExecution。真实 Redis 竞态用例复用现有 API integration 夹具；C1 原 Worker 回归保留，无 CI 工作流/门禁修改。只出站不适用入站签名、绑定解绑、回调时窗；fake 不冒真实外发通过，独审/当前 CI/main 尚待验收。'),
    ('docs/adr/0076-china-ecosystem-ingress-channel-delivery-contract-and-model-presets.md', '### C2 产品成果记录\n\n单一企业微信只提醒适配器与 canonical 安全登录返回已实现，沿用 C1 的当前授权线性化、workspace 前置锁/完整锁序、发送 checkpoint、fence 和 unknown 对账。Redis 额度与 serial token 分离，额度至少 D+60 秒或可信完成+60 秒，丢失状态共同冷却 120 秒；DNS 后再次核单调截止，已发出后 timeout/断连为 unknown。登录页 hydration 完成前禁用提交并使用 POST，当前 Human 重新读取权限与焦点，无权转发拒绝。\n\n实际六原验收/九类、必需本机检查、前后 UI、配置与资源证据见 [产品审阅入口](../reviews/c2/product-review.md)。复用已有 API integration Redis 夹具，C1 Worker 回归与 CI 策略保留。没有迁移、新 API 或决策事件/身份桥接，不改变本 ADR 其它 Proposed 范围；产品独审、视觉停点、当前 Required CI 和实际 main 落地仍为后续门禁。'),
]:
    path = ROOT / name
    old = path.read_text(encoding='utf-8')
    marker = '<!-- C2-PRODUCT-REVIEW:BEGIN -->'
    if marker in old:
        old = old.split(marker)[0]
    path.write_text(old.rstrip() + '\n\n' + marker + '\n' + section + '\n<!-- C2-PRODUCT-REVIEW:END -->\n', encoding='utf-8')

summary = {'generatedAt': datetime.now(timezone.utc).isoformat(), 'current': current, 'runs': [{'run': report['run'], 'mode': report['mode'], 'exit': 1 if report.get('failure') else 0, 'failure': report.get('failure'), 'receipt': path.relative_to(ROOT).as_posix()} for path, report in reports], 'visualBaseline': visual_path.relative_to(ROOT).as_posix(), 'history': '原文档 raw ZIP/来源/旧首败和删除回执缺口保持原义，不以汇总补造缺失时间或退出码'}
write(BASE / 'verification.json', summary)
root_log = (full_path.parent / 'test-integration.log').read_text(encoding='utf-8')
counts = re.findall(r'Tests\s+(\d+) passed(?: \| (\d+) skipped)?', root_log)
integration_counts = '；'.join(f'{name} {passed} 通过、{skipped or 0} skip' for name, (passed, skipped) in zip(['DB', 'API', 'Worker'], counts, strict=True))
recovery_skip = bool(re.search(r'Tests\s+1 skipped', root_log))
e2e_log = (e2e_path.parent / 'test-e2e.log').read_text(encoding='utf-8')
e2e_count = re.findall(r'(\d+) passed \(', e2e_log)[-1]
review = f'''# C2 产品审阅入口

已实现企业微信单向低敏 Markdown 提醒及 canonical 登录安全返回，复用 C1 target、intent、delivery、发送 checkpoint、授权锁、fenced ACK 和 unknown 对账。未新增 target CRUD、队列、身份桥接、回调或决策按钮，未真实外发。

## 实现与配置

- `apps/worker/src/wecom-notifications.ts`：官方端点严格白名单、4096 UTF-8 内容字节、公共 DNS 固定连接、64 KiB 有界响应/Zod、提供方明确拒绝与网络 unknown 分离、秘密 HMAC 频控。额度不按预留时点出窗，最早 D+60 秒；可信完成更晚时按完成+60 秒保留，token 独立释放，Redis 丢失共同冷却 120 秒。
- `apps/worker/src/automation.ts` 与 `packages/db/src/channel-notifications.ts`：许可在精确候选 claim 前取得，锁后重读当前权限并核许可/真实租期，再提交发送 checkpoint；频控等待延后原 delivery，预算不消耗，不确定结果不自动重送。
- Worker registry/API 配置、三份 compose、环境示例和 `docs/production-deployment.md`：渠道默认关闭；启用要求 Redis、HTTPS WEB_ORIGIN、当前 Human 本人安全秘密引用。C3 目录/A1 拒绝/C1 授权语义保留；无数据库迁移或新增 API/领域事件。
- 网页 `safeLoginReturnTo`、登录和 Attention：拒绝外域/协议相对/控制字符/凭据/畸形编码/登录循环；只返回同源路径。登录前 hydration 门禁及 POST 表单防原生 GET 泄露；返回后按当前 Human 重新读取。转发详情 GET 404、失权重新登录；返回、Back/Forward、关闭详情焦点与迟响应取消都有实际断言。

## 验证与复现

前四项正式必需检查回执：[results.json](product/{full['run']}/results.json)；正式根 `pnpm test:e2e` 回执：[E2E results.json](product/{e2e['run']}/results.json)。前一轮 E2E 因共享端口已占用在启动前失败，保留原退出码；端口自行释放后只重跑失败的根 E2E，不接管其它任务服务。两轮各自使用独有随机凭据和 PostgreSQL/Redis/S3，五项命令的源码前后及跨轮指纹完全一致，未将不同源码拼成通过。Node `.node-version` 指定的运行时和 pnpm 子进程路径已实读；每个命令记录 UTC 起止、PID、退出码。五项 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 均退出 0。API/Web 单元先在前四项这一轮同源码、同 env 顺序实际执行，正式 `pnpm test` 复用其本轮绿色 Turbo 缓存并检查全部包，不借历史检查冒当前通过。集成分组实际结果：{integration_counts}；可选 recovery {'1 skip' if recovery_skip else '见原始回执'}；E2E {e2e_count} 项通过。Skip 不计通过，未启用的可选 recovery/retention/runner 夹具不冒作实证。

复现完整检查：`python docs/reviews/c2/product/run-checks.py full`；C2 定向：同脚本 `targeted` 或 `e2e`。脚本只创建带本轮随机归属标签的 PostgreSQL/Redis/S3，凭据仅随机环境变量，成功或失败均保全脱敏日志后逐容器退出清理。检查不向企业微信发请求；提供方均注入 fake。API integration 已有 Redis，因此 C2 真实 Lua 用例落在 `apps/api/integration/wecom-notifications.integration.test.ts`，C1 的原 Worker 文件保持不变；CI 工作流和空白门禁保持原样。

六原验收和九类逐条结果：[当前矩阵](../../plan/c2-wecom/test-coverage.json) 的 `currentProductExecution`；旧原文、历史阶段与未运行的规划矩阵保持冻结。补充 `pnpm ci:validate` 成功日志见 [ci-validate-final.log](product/ci-validate-final.log)。此前失败、夹具修正与未运行后续命令见 [verification.json](product/verification.json)，原脱敏日志 ZIP 的 CRC、大小及哈希见 [log-archive-index.json](product/log-archive-index.json)。未放宽断言、timeout、CI 策略；本机单元 forks 仅子进程限为 {full['testPool']['VITEST_MAX_FORKS']}，避免默认无限 forks 与同机其它任务竞争。

此前完整 E2E 的焦点及测试清理失败已修正：详情获得焦点后支持 Escape 关闭并恢复触发按钮，原测试新增详情关闭和 URL 清除断言；测试 Human 被登录审计引用时保持停用，追加审计事实随专用数据库整体回收。共用 HTTP helper 保持旧 64 KiB 响应上限，新增不读取正文模式的超限负例。为恢复这一兼容行为而中止的检查另存 [真实停止回执](product/helper-compatibility-stop.json)，不计为通过，不改写原失败日志。

## UI 与资源

实施前真实 UI 对照回执：[baseline](product/{visual['run']}/results.json)。仅在没有活动产品检查时替换四份 UI 为 f7c226 输入字节，测试后逐份恢复原 SHA；不切分支或创建旧 worktree，不将基线检查当当前通过。可读前后截图见下方图库；视觉停点仍由 Chief 读回。

临时路径保全/逐路径清理见 [temporary-cleanup.json](product/temporary-cleanup.json)。截图、视频和 error-context 保留原字节；可能含测试会话、CSRF 或请求凭据的原 trace/auth 文件未提交，逐文件哈希与排除理由诚实记录。共享镜像、共享网络、当前和旧恢复工作树保留，未 global prune。历史删除操作的未知时间及逐项回执缺口不伪补。

## 尚未齐备的门禁

当前成果停 review，等待另一 Agent 实读成果独审、Chief 视觉停点、最新 PR Required CI、实际 main 合入及最终确认。当前 main 输入为 `18252ba8761aa810c3fd12d31ecae83e8b24d985`；不以文档通过、历史 CI 或 fake 消息冒作整卡验收与真实外发验证。
'''
(ROOT / 'docs/reviews/c2/product-review.md').write_text(review, encoding='utf-8')
print(full['run'], '当前六原验收/九类映射与实际回执已绑定；最终门禁保持待验收')
