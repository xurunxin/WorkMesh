"""生成方案源码索引；仅用于本次审查材料，不改产品或 CI。"""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def sha(data):
    return hashlib.sha256(data).hexdigest()


API = "apps/api/integration/"
NEW = API + "backend-retirement.integration.test.ts（待创建）"
rows = {
    "stage0.spec.ts": ("真实 API／PG／SSE", "安装登录、CSRF、幂等、revision、团队删除后拒写、SSE 接续", ["stage0.integration.test.ts", "bootstrap-install.integration.test.ts"], "跨 API 重启及 SSE 断线接续迁入退役集成套件"),
    "stage1.spec.ts": ("真实 API 与页面", "原子委派启动、失败重试新 Session、非管理员权限", ["stage1.integration.test.ts", "route-policy-authorization.integration.test.ts"], "核对原子启动与非管理员负例，补缺到退役集成套件"),
    "stage2.spec.ts": ("模拟页面与真实 API 混合", "协作可见性、lease force release、Inbox、决策与审计", ["stage2-collaboration.integration.test.ts"], "真实事务／scope／force release 保留；卡片与布局退役"),
    "stage4.spec.ts": ("真实 API 与页面", "规则操作、运行事实、模板、usage 与 feature gate", ["stage4-operations.integration.test.ts"], "领域控制保留，页面呈现退役"),
    "approval-real-agent.spec.ts": ("真实 PG／API／worker→fake Agent", "审批产生、worker 投递、Agent 接收、审批后结果与证据", ["stage1.integration.test.ts", "stage2-collaboration.integration.test.ts"], "完整纵向用例迁入退役集成套件，复用 FakeAgent、createFakeAgentServer 和 createAgentWebhookWorker"),
    "wecom-backend-compatibility.spec.ts": ("真实 PG／REST；本地 Markdown 函数", "本人可读、另一 Human 404、读取不新增决策事实、转发后实时鉴权", ["human-attention.integration.test.ts", "wecom-notifications.integration.test.ts"], "改为 REST 链接并验证复合 ID、匿名和撤权；登录页面丢定位作为历史限制保留"),
    "notification-channels.spec.ts": ("真实 API 与页面", "目标 owner、秘密脱敏、禁用持久化、撤销及无探测", ["notification-channels.integration.test.ts", "wecom-notifications.integration.test.ts"], "复用 owner／隔离／撤销负例；浏览器秘密存储检查退役"),
    "documents.spec.ts": ("真实 API 与页面", "不可变版本、冲突、导出、恢复、归档和来源归属", ["documents.integration.test.ts"], "复用领域覆盖，编辑器呈现退役"),
    "guidance.spec.ts": ("真实 API 与页面", "版本化 Guidance、scope、Session pin 与审计", ["guidance.integration.test.ts"], "保持不可变版本；页面操作退役"),
    "project-editor.spec.ts": ("真实 API 与页面", "Project 创建和 revisioned 更新、Markdown 数据持久化", ["stage0.integration.test.ts", "stage1.integration.test.ts"], "核对数据往返和 stale revision；页面 URL 恢复退役"),
    "workbench-llm-settings.spec.ts": ("真实 API 与页面", "预置可编辑后显式保存、模型连接注册撤销、凭据脱敏", ["workbench-llm-connections.integration.test.ts", "configuration-readiness.integration.test.ts"], "保留管理 REST 与秘密负例；表单退役"),
    "workbench-conversation.spec.ts": ("真实 API 与页面", "对话读取权限与服务配置入口", ["workbench-conversations.integration.test.ts", "configuration-readiness.integration.test.ts"], "保持对话和设置 REST；桌面／手机入口退役"),
    "workbench-accessibility.spec.ts": ("页面结构／键盘", "API 返回 scope 由后端套件承担", ["workbench-conversations.integration.test.ts"], "无障碍和几何断言退役，不冒后端已验收"),
    "agent-governed-controls.spec.ts": ("page.route 模拟响应", "Stop、Plan revision、retry 新 Session、If-Match 与精确输入", ["stage1.integration.test.ts", "autonomous-control-plane.integration.test.ts", "execution-waits.integration.test.ts"], "模拟安全语义用真实后端补缺；草稿、焦点和导航退役"),
    "agent-run-timeline.spec.ts": ("页面投影夹具", "因果组、不可变 Plan、证据来源与分页", ["stage2-collaboration.integration.test.ts", "stage3-delivery.integration.test.ts"], "投影合同核后端，DOM 数量、键盘和 URL 状态退役"),
    "attention-center.spec.ts": ("page.route 模拟响应", "当前 scope、精确审批、逐项权限与 stale recovery 拒绝", ["human-attention.integration.test.ts", "stage2-collaboration.integration.test.ts"], "迁移必要后端负例；批量表单状态不增加新后端批量能力"),
    "recovery-center.spec.ts": ("page.route 模拟响应", "恢复投影、最新 revision、保留证据及受控 retry", ["workbench-recovery.integration.test.ts", "stage5-agent-connections.integration.test.ts", "execution-result.integration.test.ts"], "缺失后端恢复负例迁入退役集成套件，页面几何与 URL 退役"),
    "actionable-collaboration-queues.spec.ts": ("页面投影夹具", "H／C／E 分离、脱敏、队列计数与权限", ["collaboration-queue-counts.integration.test.ts", "human-attention.integration.test.ts", "stage2-collaboration.integration.test.ts"], "保留队列与隔离合同；响应式和页面 URL 退役"),
    "connection-diagnostics.spec.ts": ("页面／发现夹具", "过期、rotation、撤销、scope、秘密脱敏", ["stage5-agent-connections.integration.test.ts", "stage5-connector.integration.test.ts"], "复用真实凭据拒绝；页面状态和浏览器本地状态退役"),
    "mcp-onboarding.spec.ts": ("模拟发现和 MCP 响应", "发现失败安全、client 合同、MCP 不泄露配对 fragment", ["stage5-agent-connections.integration.test.ts", "stage5-connector.integration.test.ts"], "迁移发现、Skill、兑换及非法 client 的真实验证；复制按钮和几何退役"),
    "features-disabled.spec.ts": ("页面 feature gate", "禁用功能不得入准入路径", ["stage4-operations.integration.test.ts", "route-policy-authorization.integration.test.ts"], "保持真实 FEATURE_DISABLED；导航和请求次数退役"),
    "pagination.spec.ts": ("页面分页与夹具", "opaque cursor、过滤 scope、去重与第二页可达", ["stage0.integration.test.ts", "stage4-operations.integration.test.ts"], "保留服务端 cursor 绑定；页面晚响应和 Registry 交互退役"),
    "work-item-detail.spec.ts": ("页面与请求输入检查", "If-Match、幂等键、精确 mutation 输入", ["stage0.integration.test.ts", "stage1.integration.test.ts"], "保留后端输入与 stale revision；Sheet、焦点和草稿退役"),
    "work-surfaces.spec.ts": ("页面与 mutation 夹具", "稳定 revisioned mutation、Saved View 数据合同", ["stage0.integration.test.ts", "stage4-operations.integration.test.ts"], "保留 mutation／View REST；布局、拖动、语言和客户端重试呈现退役"),
    "rich-content.spec.ts": ("编辑器与布局", "Markdown 存取和附件鉴权", ["documents.integration.test.ts", "stage3-delivery.integration.test.ts"], "Markdown／附件 REST 保留，HTML 惰性显示和键盘呈现退役"),
    "collaboration-hub.spec.ts": ("页面布局", "attention 数据读取由后端承担", ["human-attention.integration.test.ts"], "桌面／手机可读性退役"),
    "command-center.spec.ts": ("页面搜索与键盘", "已存在的查询和资源隔离", ["stage0.integration.test.ts", "route-policy-authorization.integration.test.ts"], "搜索阈值和焦点退役，不新增搜索 API"),
    "frontend-unification.spec.ts": ("页面布局／语言", "既有 Project、Issue、Agent 资源读取", ["stage0.integration.test.ts", "stage1.integration.test.ts"], "等高卡片、局部跳转和本地化退役"),
    "theme-unification.spec.ts": ("主题样式", "无新增后端合同", [], "主题、CSS slot 与本地存储断言退役"),
    "human-reflow.spec.ts": ("预览服务／响应式", "无新增后端合同", [], "所有 reflow 断言退役，原截图保留"),
}


def disposition(path):
    if path.name in rows:
        kind, retained, targets, action = rows[path.name]
        return {"fixture": kind, "retained": retained,
                "existingBackendTests": [API + x for x in targets],
                "action": action, "newBackendTest": NEW,
                "execution": "待产品实施后执行"}
    return {"fixture": "预览服务／浏览器工具合同",
            "retained": "mock 数据与请求输入不构成服务端通过证据",
            "existingBackendTests": [API + "route-policy-authorization.integration.test.ts", API + "stage0.integration.test.ts", API + "stage4-operations.integration.test.ts"],
            "action": "页面、布局、浏览器工具与截图断言退役；安全语义按真实后端合同核缺并迁入退役集成套件，保留历史原件",
            "newBackendTest": NEW, "execution": "待产品实施后执行"}


paths = sorted(set(Path("apps/web/e2e").rglob("*.spec.ts")) |
               set(Path("apps/web/e2e").rglob("*.test.ts")))
inventory = []
for path in paths:
    data = path.read_bytes()
    relative = path.as_posix()
    blob = git("show", "HEAD:" + relative)
    lines = data.decode("utf-8").splitlines()
    tests = []
    assertions = []
    for number, line in enumerate(lines, 1):
        if re.search(r"\btest(?:\.(?:skip|fixme|describe))?\(", line):
            tests.append({"line": number, "source": line.strip()})
        if re.search(r"\bexpect(?:\.[A-Za-z]+)*\(", line):
            assertions.append({"line": number, "source": line.strip(),
                               "context": "\n".join(lines[number-1:number+5])})
    entry = {"path": relative, "gitBlob": git("rev-parse", "HEAD:" + relative).decode().strip(),
             "gitBlobSha256": sha(blob), "worktreeSha256": sha(data),
             "tests": tests, "assertions": assertions, "disposition": disposition(path)}
    for target in entry["disposition"]["existingBackendTests"]:
        if not Path(target).is_file():
            raise RuntimeError("后端目标不存在：" + target)
    inventory.append(entry)

record = {"sourceHead": git("rev-parse", "HEAD").decode().strip(),
          "method": "按源码逐行提取 test 与 expect 起始位置；不是 JS AST 或用例执行结果",
          "coverageLimit": "多行表达式、动态循环和 helper 由准确 Git blob 回查；不声称提取了运行时实例",
          "files": inventory}
(OUT / "test-inventory.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
table = ["| 原套件（apps/web/e2e/） | 原行为与夹具 | 现有后端源码覆盖入口 | 去向（待实施） |",
         "|---|---|---|---|"]
for entry in inventory:
    d = entry["disposition"]
    targets = "、".join("`" + Path(t).name + "`" for t in d["existingBackendTests"]) or "无后端迁移项"
    table.append("| `" + entry["path"].removeprefix("apps/web/e2e/") + "` | " + d["fixture"] + "；" + d["retained"] + " | " + targets + " | " + d["action"] + " |")
impact = (OUT / "test-impact.md").read_text(encoding="utf-8")
if "<!-- SUITE_TABLE -->" not in impact:
    raise RuntimeError("套件表占位不存在；拒绝重复生成覆盖审查文本")
(OUT / "test-impact.md").write_text(impact.replace("<!-- SUITE_TABLE -->", "\n".join(table)), encoding="utf-8", newline="\n")
print(json.dumps({"files": len(inventory), "declarations": sum(len(x["tests"]) for x in inventory), "assertionStarts": sum(len(x["assertions"]) for x in inventory)}))
