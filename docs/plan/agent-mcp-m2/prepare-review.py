"""补齐计划 provenance／原九类 DoD；本文件不运行产品检查。"""
from pathlib import Path
import hashlib,json,re,subprocess

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent

def dump(path,data):
    (OUT/path).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")

def body(path):
    f=json.loads((OUT/path).read_text(encoding="utf-8"))
    if f.get("status")=="fulfilled":f=f["value"]
    return "\n".join(b.get("text","") for b in f.get("content",[]) if b["type"]=="text")

def rawhash(b):
    return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}

def historical_provenance():
    conv=body("input/m2-conversation-readback.json")
    todo=body("input/m2-todo-readback.json")
    original=(OUT/"input/platform-injected-savedplan.md").read_text(encoding="utf-8")
    pos=todo.find("Saved plan")
    visible=todo[pos:] if pos>=0 else ""
    # 不猜 prefix 的平台标题／换行 wrapper；检验原正文实际可见子串。
    prefixStart=visible.find("## 上下文与假设")
    prefix=visible[prefixStart:] if prefixStart>=0 else ""
    matched=0
    for x,y in zip(original,prefix):
        if x!=y:break
        matched+=1
    marker="(user/plan_revision)"
    at=conv.find(marker)
    end=conv.find("\n[",at)
    feedback=conv[at:end] if at>=0 and end>at else ""
    if feedback:
        (OUT/"input/chief-feedback.md").write_text(feedback.rstrip()+"\n",encoding="utf-8",newline="\n")
    dump("input/provenance.json",{
      "originalPlan":{"docId":"5XFjpFz5JO_Sf6_WBAZD6",
        "docIdSource":"本轮 conversation 可见plan链接；不是文档全文读取",
        "fullTextSource":"本轮用户消息 authoritative saved copy 注入",
        "files":["input/platform-injected-savedplan.md","history/author-original-plan.md"],
        "fullTextHash":rawhash(original.encode()),"archiveEncoding":"UTF-8；末尾补一个LF；不冒后台原编码",
        "platformVersion":None,"platformCreatedAt":None,
        "platformFullReadbackObtained":False,
        "toolVisiblePrefixMatchedCharacters":matched,
        "readbackTruncated":"工具返回含truncated；保存原JSON，不猜截断尾文"},
      "authorOriginalResponse":{"file":"history/author-original-response.md",
        "source":"可见原作者答复重新归档；正文与当前saved copy逐字比对"},
      "implementation":{"separatePlatformOriginalObtained":False,"docId":None,
        "source":"implementation.md为本Agent修订后savedplan的仓库byte-equal副本",
        "limitation":"未给独立platform implementation全文，不伪造原件/Hash"},
      "savedCopyAfterEdits":{"files":["savedplan.md","implementation.md"],
        "source":"本轮4次edit_plan成功响应后按精确替换构成，同步本地",
        "docId":None,"docIdKnownAfterTurn":False},
      "chiefFeedback":{"file":"input/chief-feedback.md","rawContainer":"input/m2-conversation-readback.json",
        "source":"平台conversation可见用户反馈；不是本Agent审查结果"},
      "writeAuthorization":{"questionDocId":"q-cKVakWbsPo380TgcEY7Ng","source":"本轮用户回答注入＋conversation",
        "answer":"提交规划工件（推荐）","productImplementationAuthorizedThisTurn":False,
        "resolution":"明确覆盖Do not modify any files yet的通用模板冲突；不新增任务"},
      "m1":{"chiefSource":"spec.md中Chief实证摘要","ownObservations":["input/main-observation.json",
        "input/m1-todo-readback.json","input/m1-ci411-readback.json"],
        "ci410Equals411":False,"ci411FullLogsObtained":False},
      "toolRawLimitations":{"format":"可见CallToolResult序列化；非wire/HTTP原字节",
        "nativeExit":None,"runtime":None,"hiddenCallId":None}})
    dump("input/resources.json",{"scope":"仅本轮规划静态阶段","containers":[],"images":[],
       "volumes":[],"networks":[],"persistentProcesses":[],
       "createdPaths":["docs/plan/agent-mcp-m2/","docs/adr/0082-parent-child-status-projection.md"],
       "shortProcesses":["git来源读取","Python静态生成/核验","Node CI分类"],
       "deletedResources":[],"retained":["当前worktree","恢复目录","M0/M1原证据","G1D0C3拒目标"],
       "secretsUsed":False,"cleanup":"短命进程自然退出；无递归清理，不触已拒目标"})

GENERAL=[
("完整REST/MCP/Pi链：两页limit=2造5个Milestone/Issue/relations/document与5个revision；遍历至null，IDs无遗漏无重复。restore后revision+1且历史正文不变；blocks/related准确；Inbox claim→正文read→reply、ACK独立语义；真实H接受handoff后target受控交付继续。",
 "C/E主链成功不包括C Document越owner；Agent无Human动作工具，H保留动作实际HTTP成功对照。",
 "stage2-collaboration、documents、Inbox/Handoff、planning-collaboration"),
("不同Team/Project/owner/父关系拒且指纹不变；Agent修改Human评论拒，Human他作者编辑拒；actor-target未claim无正文，别Session即使同actor不能读；H-only Guidance/accept与Doc C拒；第2页前撤Token/grant/principal/member后页拒不泄ID。",
 "UNAUTHENTICATED/CAPABILITY_DENIED/RESOURCE_SCOPE_DENIED沿入口真实阶段断言；同场景合法正对照能读。",
 "API授权＋真实MCP＋Pi错误实收"),
("两父相互指向、blocks环、删除引用Milestone、archived doc更新、handoff错误转换均拒且state/event/outbox不变；Inbox exact短Session失效不能新Session自动继承。",
 "合法非循环边/未引用删除/unarchive后更新成功，不能为失败换目标。",
 "planning/document/Handoff/Inbox integration"),
("显式same key/body回放：评论Human、文档/边/Room/claim/reply只一state/event/outbox事实；异body冲突。每SDK调用默认新key，单调用重试同key；导入同hash断点恢复保原mapping，TTL过期先查询对账。",
 "GET写幂等不适用：无key输入且零写；prepare纯函数相同hash；导入不是总事务。",
 "SDK/MCP＋stage2＋import现有tests"),
("doc同时核baseRevisionId/baseRevisionHash/revision，旧任一拒，不覆盖较新正文；relation/Handoff/reply以真实接口的If-Match规则测试，无revision的接口不inventheader。Plan冲突后读取新version不自动改旧意图。",
 "GET stale-write不适用：当前/历史revision内容准确；创建无If-Match按现行。",
 "documents/SDK/contracts＋stage2"),
("每写点注入SQL/emit/outbox失败，state/event/outbox全回滚；Human评论consumer回归不改H gate。import前实体成功保留，后失败准确报告mapping，再续只补未成实体。",
 "逐实体原子适用，整项目事务不适用；GET零写需指纹，非写回滚。",
 "API故障夹具＋import真实MCP"),
("重放Room/Inbox投影outbox不双消息/receipt；source已完成Handoff按现行命令确认。metadata→claim→正文必须有合法session，不用旧receipt解正文。",
 "F5 successor/redelivery不适用：本批无该域；GET无job producer；不把历史重放说成新特性。",
 "Worker/Inbox＋conformance"),
("双connection barrier竞争claim仅一winner；双doc编辑一success一冲突；并发反向edge/层级最终无环；reply竞Humanresolve按锁后事实成功/拒，无静默抢claim。",
 "独立session/非冲突字段仍能正常操作，核实际pg_blocking_pids，不用sleep判竞态。",
 "API planning/document/Inbox concurrency"),
("API/Worker/Pi重启后doc/history/Inbox/mapping可恢复合法读，durable cursor重连无双写；Stop/撤权下reply/Handoff转换拒。恢复新Session不能使用旧claim正文。",
 "跨Session F5恢复不适用；当前Session正常重启必须证据；遵M1Stop优先。",
 "M1 execution-recovery回归＋planning-collaboration")]
CHILD=[
("有限父maxInputTokens100→普通child显式60→受控交付/ACK/真实Pi完成且reservation60仍在→review显式40→四处budget/reservation同40→本人Room+code_review→完成→父query/complete；SDK/MCP/Pi保全创建五字段、record维度和额外字段。另跑省略review budget/41/101/负数/非有限拒例；{}链只补回归不能代有限链。",
 "普通child无plan/artifact能力；reviewer仅本人Room review_result＋本人code_review完成；无两者或任一缺均REVIEW_COMPLETION_EVIDENCE_REQUIRED。",
 "stage2＋真实MCP/Pi planning-collaboration"),
("分别撤parent Delegation、target definition/grant或installation，错parent/Team/step拒；publish_plan/非code_review reviewer拒；他actor/session/父证据不计本人。父query重验Token/principal/member/资源，子terminal可读。",
 "直接E与C/install模式严格区分；不能拿H cookie替；M3 PR producer自审具体场景不在本批新增，保现有身份拒。",
 "auth/lock-order＋conformance角色用例"),
("旧version/无stableidentity/错step/exclusive冲突拒；required的12非completed状态逐ID集合阻父，nonrequired相同状态不因该gate阻父；双证据四组合及structured/noArtifactReason分别不豁免。",
 "父projection仅live读集合；queued/paused/stopping/stale/terminal拒，空page不能掩盖撤权。默认父/step8，第九次拒；低父/step1边界只特权DB测试夹具，记录原值/SQL不当客户端DTO。",
 "finishSessionInTransaction现有gate tests＋projection integration"),
("两创建samekey/body只有一child/delegation/reservation/lease/交付；预算40改41沿旧key拒幂等冲突；Room/Artifact/complete无双写。defaultkey每新调用新identity，同次网络重试一致；explicit key原样。失败/超额后用新key及预算40可合法创建，不自动改原budget。",
 "terminal重放被M1前置拒则准确origin只读确认，不用终态E get或重新建child。",
 "SDK/MCP＋真实HTTP丢响应及origin确认"),
("发布新Plan后旧version/step输入STALE_PLAN_VERSION；稳定step跨version限额统计仍包含旧活跃child。创建无If-Match；完成旧revision拒、重读后用新key意图提交。",
 "父query能见旧绑定，不仅筛currentVersion；未知legacy绑定不能补猜。",
 "Plan/child版本integration"),
("旧reservation60保留，review40在Session/delegation/reservation/reviewLease/prompt/provision/event/outbox每fail全回滚，Σ不从60变100、零外部发送；原意图重试仅多一40。review证据/父完成故障不推进state；projection零业务写/无secret。",
 "故障后同key重试合法一份；security denial表单列，成功GET也不写该表。",
 "agent-lock-order／故障夹具＋projection"),
("outbox同delivery重放只一child，exactinstallation仍受live授权；Room/Artifact重复不放大；原parent/step不会被重放改写，failed required不自动替completed。",
 "旧/失效trigger及来源null沿M1失败关闭；没有新的事件类型。",
 "Worker交付＋M1 execution-recovery"),
("ordinary/ordinary、review/review、mixed真实锁等待验证父/跨version step上限、Σreservation及target并发：父100已有60，两请求40竞争只一成功；mixed child/review均走同锁不越100。未reserved legacy review只读占用不双计；Planpublish/创建、父complete/childcomplete、review_shared/exclusive按提交序裁定。",
 "失败/回滚/同keyreplay不占第二份；可选显式budget为用户q-ka2GipEunxQuHuFYGap2C裁定；省略全额不足拒是明确兼容限制，非假恢复。",
 "stage2/agent-lock-order＋真实conformance双连接"),
("API/Worker/Pi重启binding/reservation/lease/blockers仍在；Stop/pause/撤权拒普通创建/证据，M1正式settle、唯一续Turn、公平扫描及receipt恢复保持；父Stop不默认子cascade，逐子live检查。",
 "无新增机器shell故新shell清理用例不适用；真实Pi child过程/端口仍登记收尾，无共享资源清理。",
 "M1完整回归＋planning-collaboration")]

def acceptance():
    raw=(OUT/"frozen-m2.md").read_text(encoding="utf-8")
    rows=[]
    for line in raw.splitlines():
        if line.startswith("| ") and not line.startswith("| 验收类") and not line.startswith("| ---"):
            fields=[x.strip() for x in line.split("|")[1:-1]]
            if len(fields)==2:rows.append((fields[0],fields[1],line))
    assert len(rows)==18,len(rows)
    data=[]
    for i,(cat,text,line) in enumerate(rows):
        group="G" if i<9 else "C"
        assertions=(GENERAL if i<9 else CHILD)[i%9]
        data.append({"testId":f"M2-{group}-{i%9+1}","group":"规划协作" if group=="G" else "child/reviewer",
             "frozenCategory":cat,"frozenScenario":text,"frozenRawLine":line,
             "positiveAndRejectionAssertions":assertions[0],"applicabilityAndLimits":assertions[1],
             "testLocation":assertions[2],
             "futureTestFile":"packages/conformance/src/planning-collaboration.conformance.test.ts",
             "testTitle":f"M2-{group}-{i%9+1} {cat}",
             "status":"未来未运行","actualRuntime":None,"actualExit":None,"actualCounts":None})
    dump("acceptance-matrix.json",{
       "source":"完整冻结M2节两张九类表，逐原行承接","frozenRowCount":18,"cases":data,
       "requiredChildNonCompletedStates":["queued","acknowledged","planning","executing","awaiting_input",
        "awaiting_approval","blocked","paused","stopping","stale","failed","canceled"],
       "childCompletedPositive":True,"reviewerEvidenceRequired":["own_room_review_result","own_code_review_artifact"],
       "additionalCountGuard":{"source":"0001_v1_baseline.sql enforce_stage2_session_tree",
         "assertion":"terminal子仍占父所有直接子累计总量；create/review共享准入不能因活跃数零绕guard；保留baseline不迁移"},
       "checks":"verification.md原pnpm命令；本轮静态检查不代产品pass",
       "excluded":"UI/F/TA、新Human权限／新机器shell、真实外发/发布；不减少旧三OS/发行门禁"})

def provenance():
    # 当前修订固定消费完整平台注入及旧候选；不再调用首轮历史生成逻辑。
    import runpy
    module=runpy.run_path(str(OUT/"revision-evidence.py"))
    module["current_provenance"]()

if __name__=="__main__":
    provenance()
    acceptance()
    print("规划原文provenance与18行DoD生成完成，未来测试全部未运行")
