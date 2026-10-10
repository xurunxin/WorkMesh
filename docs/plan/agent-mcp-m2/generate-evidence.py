"""仅生成 M2 规划证据；不改产品文件。Python 标准库与已有 PyYAML。"""
from pathlib import Path
import hashlib, json, re, subprocess, sys, zipfile
import yaml

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = "cfce77546b64c2a8d7d12949261c38e2f666d5ae"
FROZEN = "c768e1e3db297d8b91b53dd68b60e723a8a40e7d"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def digest(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}

def write(path, value):
    data = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    (OUT / path).write_text(data, encoding="utf-8", newline="\n")

def source_paths():
    tracked = git("ls-tree", "-r", "--name-only", MAIN).decode().splitlines()
    roots = ("docs/adr/", "apps/api/src/", "apps/api/integration/", "apps/mcp/src/",
             "apps/agent-runner/src/", "apps/agent-runner/skills/", "apps/worker/src/",
             "packages/contracts/src/", "packages/domain/src/", "packages/db/src/",
             "packages/db/migrations/", "packages/agent-sdk/src/", "packages/config/src/",
             "packages/conformance/", ".github/workflows/", "scripts/")
    exact = {"CONTEXT.md","AGENT_PROTOCOL.md","OPENAPI.yaml","SCHEMA.sql","AGENTS.md",
             "package.json","pnpm-lock.yaml","pnpm-workspace.yaml","turbo.json","vitest.config.ts",
             ".gitattributes","docs/agent-integration.md","docs/route-policy-matrix.md",
             "docs/agent-operation-manifest.md"}
    plan_roots = ("docs/plan/agent-mcp-m0/", "docs/plan/agent-mcp-m1/")
    return [p for p in tracked if p in exact or p.startswith(roots)
            or (p.startswith(plan_roots) and
                (p.endswith((".md",".json")) and "/history/" not in p))]

def archive():
    frozen_files = ["docs/plan/backend-agent-mcp-priority/" + n + ".md" for n in
                    ["README","batches-and-acceptance","coverage-matrix","operation-index",
                     "branch-separation","sources","review"]]
    entries, members = [], {}
    for commit, paths in [(FROZEN, frozen_files), (MAIN, source_paths())]:
        for path in paths:
            raw = git("show", f"{commit}:{path}")
            h = digest(raw)
            member = "members/" + h["sha256"]
            members.setdefault(member, raw)
            current = ROOT / path
            wt = current.read_bytes() if current.is_file() else None
            wh = digest(wt) if wt is not None else None
            if wh:
                wm = "members/" + wh["sha256"]
                members.setdefault(wm, wt)
            entries.append({"commit":commit, "path":path,
                "blobId":git("rev-parse", f"{commit}:{path}").decode().strip(),
                "git":{"member":member, **h},
                "worktree":({"member":wm, **wh} if wh else None),
                "worktreeObservedAgainst":"开工工作树；frozen 来源与 main 分列，非历史工作树",
                "frozenEqualsMain":(git("show",f"{MAIN}:{path}") == raw) if commit == FROZEN else None})
    all_batches = git("show", f"{FROZEN}:docs/plan/backend-agent-mcp-priority/batches-and-acceptance.md")
    section = all_batches[all_batches.index("## M2：".encode()):all_batches.index("## M3：".encode())]
    members["frozen/m2-section.md"] = section
    readable = section.decode("utf-8").rstrip("\r\n") + "\n"
    write("frozen-m2.md", readable)
    commits = []
    for commit in [FROZEN, MAIN, "3ff46eb20616dc5488ba46b77b27e1fb2d783a93",
                   "394401880cb687d1a682b56d57b1342a86531c5c"]:
        raw = git("cat-file","commit",commit)
        member = "commits/" + commit
        members[member] = raw
        lines = raw.decode().splitlines()
        commits.append({"commit":commit,"tree":next(x[5:] for x in lines if x.startswith("tree ")),
                        "parents":[x[7:] for x in lines if x.startswith("parent ")],
                        "raw":{"member":member,**digest(raw)}})
    archive_path = OUT / "source-snapshot.zip"
    with zipfile.ZipFile(archive_path,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(members.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644 << 16
            z.writestr(info,data)
    write("source-manifest.json",{
        "status":"完整 Git blob 与本轮工作树字节；工具截断不是来源",
        "main":MAIN,"frozen":FROZEN,"entries":entries,"commits":commits,
        "frozenSection":{"member":"frozen/m2-section.md",**digest(section),
                         "readable":digest(readable.encode()),"conversion":"仅 EOF 规范为一个 LF"},
        "archive":digest(archive_path.read_bytes()),
        "m1Precondition":{
            "todoId":"WZQPIqZlFUUCVJ0-706Wn","observedPhase":"done",
            "pr":213,"prMergedSource":"Chief Spec＋main实际merge commit；未另取GitHub PR完整原件",
            "ci411":"input/m1-ci411-readback.json","ci411RawActionsLogsObtained":False,
            "ci410IsDifferentRun":True,
            "reviewClosureSource":"Chief输入；本轮未重做M1独审",
            "mainEqualsSecondParentTree":commits[1]["tree"] == commits[2]["tree"],
            "reviewedProductToEvidenceDiff":git("diff","--name-status",
                  "394401880cb687d1a682b56d57b1342a86531c5c",
                  "3ff46eb20616dc5488ba46b77b27e1fb2d783a93").decode().splitlines(),
            "frozenToMainDiff":git("diff","--name-status",FROZEN,MAIN).decode().splitlines()},
        "memberCount":len(members)})

FAMILIES = {
"规划":("listProjects getProject createProject updateProject listWorkItems getWorkItem createWorkItem updateWorkItem listProjectMilestones createProjectMilestone getMilestone updateMilestone deleteMilestone listWorkItemRelations createWorkItemRelation deleteWorkItemRelation").split(),
"评论":("listWorkItemComments createComment updateComment").split(),
"文档":("listDocuments createDocument getDocument updateDocument listDocumentHistory getDocumentRevision diffDocumentRevisions exportDocumentMarkdown archiveDocument unarchiveDocument restoreDocumentRevision").split(),
"Guidance":("getWorkspaceGuidance getTeamGuidance getProjectGuidance listWorkspaceGuidanceHistory listTeamGuidanceHistory listProjectGuidanceHistory diffWorkspaceGuidance diffTeamGuidance diffProjectGuidance publishWorkspaceGuidance publishTeamGuidance publishProjectGuidance archiveWorkspaceGuidance archiveTeamGuidance archiveProjectGuidance rollbackWorkspaceGuidance rollbackTeamGuidance rollbackProjectGuidance").split(),
"Decision":("createWorkItemDecision createProjectDecision createSessionDecision getDecision finalizeDecision supersedeDecision reverseDecision").split(),
"Room/Inbox":("getWorkRoom getWorkRoomTimeline postWorkRoomMessage listInbox getInboxItem claimInboxItem acknowledgeInboxItem replyInboxItem").split(),
"Handoff":("listHandoffs offerHandoff inspectExactTargetHandoff requestHandoff acceptHandoff rejectHandoff cancelHandoff completeHandoff").split(),
"子任务":("commentOnPlanStep proposePlanAssignment appendContextDelta createChildAgentSession createReviewDelegation").split(),
"M1依赖":("getAgentSession listAgentSessions getAgentSessionContext getAgentPlan listAgentPlanVersions publishAgentPlan acknowledgeAgentSession transitionAgentSessionState heartbeatAgentSession completeAgentSession failAgentSession acknowledgeAgentSessionStop getAgentSessionExecutionResult publishArtifact").split()
}
SDK={
"createProjectMilestone":"createMilestone","getAgentPlan":"getPlan","listAgentPlanVersions":"listPlanVersions",
"getAgentSession":"getSession","listAgentSessions":"listSessions","getAgentSessionContext":"getSessionContext",
"getWorkRoom":"getRoom","getWorkRoomTimeline":"getRoomTimeline","createChildAgentSession":"createChildSession",
"createWorkItemRelation":"createWorkItemRelation","deleteWorkItemRelation":"deleteWorkItemRelation",
"exportDocumentMarkdown":"exportDocumentMarkdown","publishAgentPlan":"publishPlan",
"acknowledgeAgentSession":"acknowledge","transitionAgentSessionState":"transitionState",
"heartbeatAgentSession":"heartbeat","completeAgentSession":"complete","failAgentSession":"fail",
"acknowledgeAgentSessionStop":"stopAcknowledgement","getAgentSessionExecutionResult":"getSessionExecutionResult",
"offerHandoff":"offerHandoff","inspectExactTargetHandoff":"inspectPendingHandoff","rejectHandoff":"rejectPendingHandoff",
"acknowledgeInboxItem":"acknowledgeInbox","claimInboxItem":"claimInbox","getInboxItem":"getInboxItem","replyInboxItem":"replyInbox",
"listWorkItemComments":"listWorkItemComments","createWorkItemDecision":"createWorkItemDecision",
"createProjectDecision":"createProjectDecision","createSessionDecision":"createSessionDecision",
"restoreDocumentRevision":"restoreDocument"}
TOOL={
"listWorkItemComments":"list_work_item_comments","createWorkItemDecision":"create_work_item_decision",
"createProjectDecision":"create_project_decision","createSessionDecision":"create_session_decision",
"getDecision":"get_decision","listHandoffs":"list_handoffs","createChildAgentSession":"create_child_session",
"createReviewDelegation":"create_review_delegation","postWorkRoomMessage":"post_work_room_message",
"getAgentPlan":"get_plan","listAgentPlanVersions":"list_plan_versions","getAgentSession":"get_agent_session",
"listAgentSessions":"list_agent_sessions","getAgentSessionContext":"get_agent_context",
"publishAgentPlan":"publish_plan","acknowledgeAgentSession":"ack_agent_session",
"transitionAgentSessionState":"transition_agent_session_state","heartbeatAgentSession":"heartbeat",
"completeAgentSession":"complete_session","failAgentSession":"fail_session",
"acknowledgeAgentSessionStop":"ack_stop","getAgentSessionExecutionResult":"get_agent_session_execution_result",
"exportDocumentMarkdown":"export_document_markdown","restoreDocumentRevision":"restore_document_revision",
"inspectExactTargetHandoff":"inspect_pending_handoff","rejectHandoff":"reject_handoff",
"acknowledgeInboxItem":"ack_inbox_item","claimInboxItem":"claim_inbox_item",
"listInbox":"list_inbox_items","createProjectMilestone":"create_milestone",
"createWorkItemRelation":"add_work_item_relation","deleteWorkItemRelation":"delete_work_item_relation"}
CONTRACT={
"createChildAgentSession":"childSessionInputSchema / childAgentSessionResponseSchema（创建专用，保绑定字段和原额外字段）",
"createReviewDelegation":"reviewDelegationInputSchema（新增可选budget） / reviewDelegationResponseSchema {session:childAgentSessionResponseSchema,lease:leaseResponseSchema}",
"commentOnPlanStep":"现有内联 schema / 原响应",
"proposePlanAssignment":"assignmentProposalInputSchema / 原响应",
"appendContextDelta":"contextDeltaInputSchema / 原响应",
"postWorkRoomMessage":"roomMessageInputSchema / 原消息响应",
"createWorkItemDecision":"decisionInputSchema / 原 Decision行",
"createProjectDecision":"decisionInputSchema / 原 Decision行",
"createSessionDecision":"decisionInputSchema / 原 Decision行",
"offerHandoff":"handoffInputSchema / 原 Handoff行",
"rejectHandoff":"handoffRejectInputSchema / 原 Handoff行",
"createDocument":"createDocumentInputSchema / documentResponseSchema",
"updateDocument":"updateDocumentInputSchema / documentResponseSchema",
"listDocumentHistory":"现有cursor query / documentHistoryResponseSchema",
"getDocumentRevision":"UUID路径 / documentRevisionSchema",
"diffDocumentRevisions":"fromRevisionId/toRevisionId query / documentDiffResponseSchema",
"restoreDocumentRevision":"restoreDocumentRevisionInputSchema / documentResponseSchema",
"exportDocumentMarkdown":"UUID路径 / text/markdown 字符串"}
HUMAN = {"createComment","updateComment","deleteComment","getWorkRoomTimeline","acceptHandoff","cancelHandoff","completeHandoff","finalizeDecision","supersedeDecision","reverseDecision"}
READ_STATES=["acknowledged","planning","executing","awaiting_input","awaiting_approval","blocked"]
WRITE_STATES=["acknowledged","planning","executing","awaiting_input","awaiting_approval","blocked"]
SOURCE={"规划":"apps/api/src/server.ts + apps/api/src/delivery/routes.ts + apps/api/src/commands.ts","评论":"apps/api/src/server.ts","文档":"apps/api/src/documents.ts",
"Guidance":"apps/api/src/guidance.ts","Decision":"apps/api/src/collaboration/routes.ts",
"Room/Inbox":"apps/api/src/collaboration/routes.ts + apps/api/src/inbox/routes.ts",
"Handoff":"apps/api/src/collaboration/routes.ts","子任务":"apps/api/src/collaboration/routes.ts","M1依赖":"apps/api/src/agent/routes.ts + apps/api/src/agent/commands.ts"}

def snake(name):
    return re.sub(r"(?<!^)(?=[A-Z])","_",name).lower()

def mapping():
    api=yaml.safe_load(git("show",f"{MAIN}:OPENAPI.yaml").decode())
    catalog={v["operationId"]:(m.upper(),p,v) for p,ms in api["paths"].items()
             for m,v in ms.items() if isinstance(v,dict) and "operationId" in v}
    old=json.loads(git("show",f"{MAIN}:docs/plan/agent-mcp-m0/operation-decisions.json"))
    oldops={x["operationId"]:x for x in old["operations"]}
    sdk=git("show",f"{MAIN}:packages/agent-sdk/src/index.ts").decode()
    mcp=git("show",f"{MAIN}:apps/mcp/src/index.ts").decode()
    runner=git("show",f"{MAIN}:apps/agent-runner/src/workmesh-tools.ts").decode()
    existingRunner={op:name for name,op in re.findall(r"add\('(workmesh_[^']+)', '([^']+)'",runner)}
    contractSource=git("show",f"{MAIN}:packages/contracts/src/index.ts").decode()
    schemaNames=set(re.findall(r"export const (\w+)\s*=",contractSource))
    operations=[]
    absent=[]
    for family,names in FAMILIES.items():
        for op in names:
            if op not in catalog:
                absent.append(op);continue
            method,path,decl=catalog[op]
            reserved=op in HUMAN or (family=="Guidance" and not op.startswith("get"))
            # Guidance history/diff domain reads remain bounded; route actor gate is authoritative.
            if family=="Guidance" and op.startswith(("list","diff")):
                reserved="agent" not in decl.get("x-workmesh-actor-kinds",[])
            oldop=oldops.get(op,{})
            tool=TOOL.get(op,snake(op))
            historicalBindings=oldop.get("currentMcpBindings",[]) or oldop.get("mcpBindings",[])
            actual=[b.get("bindingId","").replace("tool:","") for b in historicalBindings if b.get("bindingId","").startswith("tool:")]
            existing=[t for t in actual if "registerTool('"+t+"'" in mcp]
            if len(existing)==1:tool=existing[0]
            sn=SDK.get(op,op)
            if op.endswith("Guidance") and op.startswith("get"):sn="getGuidance"
            sx=oldop.get("sdkNamedAdapters",[])
            if isinstance(sx,list):
                for item in sx:
                    name=item if isinstance(item,str) else item.get("method",item.get("name","")) if isinstance(item,dict) else ""
                    if name and re.search(r"\b"+re.escape(name)+r"\s*(?:<[^>]*>)?\(",sdk):sn=name;break
            if sn==op and oldop.get("sdkStaticEvidence"):
                match=re.match(r"([A-Za-z]\w*):",str(oldop["sdkStaticEvidence"]))
                if match:sn=match[1]
            allowed="保留 Human，Agent 拒绝" if reserved else "增量适配；领域资格仍由真实 REST重验"
            if op.startswith("get") and family=="Guidance":
                eligibility="C/E 仅在 workspace/team/project资源scope实际允许时只读；发布仍H"
            elif family=="文档":eligibility="E精确 owner授权；C Team-only 无owner资格，不bridge扩scope"
            elif op in ("inspectExactTargetHandoff","rejectHandoff"):
                eligibility="准确目标 installation；null session binding；不能在Pi当前E冒充安装"
            elif family=="子任务":eligibility="准确父 E／current Plan及stable step；创建另验目标真实三方授权"
            elif family=="Room/Inbox":eligibility="E准确recipient/claimant；actor-target未claim仅metadata；Room timeline H"
            elif family=="Handoff":eligibility="source E／target installation各走专门入口；Human接受/取消/完成"
            elif family=="Decision":eligibility="E允许scope提案/read；无finalize权限"
            elif family=="M1依赖":eligibility="严格沿M1操作自己的状态/origin/凭据合同，非普通live集合概括"
            else:eligibility="C普通Team协作或E精确work/project scope，current grant/principal活跃；越资源拒"
            pagination="无分页请求；保原单对象/有界响应"
            if op.startswith("list"):
                pagination="signed opaque cursor；limit默认50/max200；逐页scope重验"
                if op=="listDocuments":pagination="UUID cursor；limit默认50/max100；ownerType/ownerId不变"
                elif op=="listDocumentHistory":pagination="正整数revision-number cursor（字符串回传）；limit默认50/max100"
                elif family=="Guidance":pagination="现有hardcap history200/audit500，不伪称完整分页；本批current Guidance读不扩history合同"
            contract=CONTRACT.get(op,"沿现有 OPENAPI operation＋contracts导出 DTO；完整参数见 openApiContract及 source-snapshot")
            namedSchemas=[]
            if family=="规划":
                kind="milestone" if "Milestone" in op else "workItemRelation" if "Relation" in op else "workItem" if "WorkItem" in op else "project"
                namedSchemas=[kind+"ResponseSchema"]
                if method in ("POST","PATCH"):
                    namedSchemas += [kind+("PatchSchema" if method=="PATCH" and kind in ("milestone","workItem") else "InputSchema")]
                if op=="updateProject":namedSchemas=["projectInputSchema","projectResponseSchema"]
            elif family=="评论":namedSchemas=["commentResponseSchema"]+(["commentInputSchema"] if method=="POST" else ["commentPatchSchema"] if method=="PATCH" else [])
            elif family=="文档":
                namedSchemas=re.findall(r"\b\w+Schema\b",contract)
                if not namedSchemas:namedSchemas=["documentResponseSchema"]
            elif family=="Room/Inbox":
                namedSchemas={"postWorkRoomMessage":["roomMessageInputSchema"],"listInbox":["inboxListItemResponseSchema"],"getInboxItem":["inboxItemDetailResponseSchema"],"claimInboxItem":["inboxClaimInputSchema","inboxReceiptResponseSchema"],"acknowledgeInboxItem":["inboxAcknowledgeInputSchema","inboxReceiptResponseSchema"],"replyInboxItem":["inboxReplyInputSchema","inboxReplyResponseSchema"]}.get(op,[])
            elif family in ("子任务","Handoff","Decision"):namedSchemas=re.findall(r"\b\w+Schema\b",contract)
            namedSchemas=[n for n in namedSchemas if n in schemaNames]
            if namedSchemas and op not in CONTRACT:contract=" / ".join(namedSchemas)+"；原handler其余字段透传保留"
            row={
              "operationId":op,"family":family,"rest":{"method":method,"path":path},
              "sourceHead":MAIN,"source":SOURCE[family],
              "openApiContract":decl,
              "policy":{"id":decl.get("x-workmesh-policy-id"),"actors":decl.get("x-workmesh-actor-kinds"),
                "featureKey":decl.get("x-workmesh-feature-key"),"featureTier":decl.get("x-workmesh-feature-tier"),
                "source":"packages/contracts/src/route-policy.ts（完整快照）；资格不能用historicalPolicy代现行handler"},
              "historicalPolicy":oldop.get("currentPolicy"),
              "contracts":contract,"namedSchemas":namedSchemas,
              "schemaSources":[{"name":n,"path":"packages/contracts/src/index.ts","line":contractSource[:contractSource.index("export const "+n)].count("\n")+1} for n in namedSchemas],
              "sdk":{"name":sn,"existsByLexicalSource":bool(re.search(r"\b"+re.escape(sn)+r"\s*(?:<[^>]*>)?\(",sdk)),
              "file":"packages/agent-sdk/src/index.ts","change":"保留签名，补typed返回/分页；新具名adapter按本表实现" if not reserved else "保留现有Human方法，不新增Agent授权"},
              "mcp":{"name":tool,"currentlyRegisteredByLexicalSource":"registerTool('"+tool+"'" in mcp,
              "file":"apps/mcp/src/index.ts","change":"保留旧名字/输入；缺具名工具补同名，绑定精确真实凭据" if not reserved else "Agent隐藏；缓存调用结构化拒绝"},
              "runner":{"name":existingRunner.get(op,"workmesh_"+tool),"presentByLiteralName":op in existingRunner,
              "file":"apps/agent-runner/src/workmesh-tools.ts","change":"按live manifest／role与本表资格注册，parent身份固定api.sessionId" if not reserved else "不注册；保Human交接说明"},
              "discovery":"scripts/generate-agent-discovery.py合成M0/M1＋M2增量→policy binding/derived manifest；M0/M1输入不改",
              "decision":allowed,"credentialsAndScope":eligibility,
              "pagination":pagination,
              "revision":oldop.get("currentPolicy",{}).get("revision","沿当前声明/handler"),
              "idempotency":oldop.get("currentPolicy",{}).get("idempotency","沿当前声明/handler"),
              "tests":["M2-G-"+str(i) for i in range(1,10)]+(["M2-C-"+str(i) for i in range(1,10)] if family in ("子任务","M1依赖") else []),
              "positive":"有资格者按真实DTO成功且返回原resource字段，分页读至nextCursor=null；H保留动作Human正对照",
              "negative":"同operation越scope/撤权/非法state拒并保error.code/details/correlationId；无业务写；不能把manifest当授权",
              "futureProductTestStatus":"未运行"}
            if op in ("createChildAgentSession","createReviewDelegation"):
                proposal=yaml.safe_load((OUT/"openapi-proposal.yaml").read_text(encoding="utf-8"))
                row["proposedOpenApiContract"]=proposal["paths"][path]["post"]
                row["proposedSchemas"]=["childSessionInputSchema" if op=="createChildAgentSession" else "reviewDelegationInputSchema", "childAgentSessionResponseSchema"]
                if op=="createReviewDelegation":row["proposedSchemas"].append("reviewDelegationResponseSchema")
                row["proposalSources"]=["dto-proposal.ts","openapi-proposal.yaml","security-contract.md"]
                row["preserveResponseFields"]=["parent_session_id","plan_step_version_id","required_for_parent","inherited_budget","max_child_sessions"]
                row["budgetContract"]={"input":"budget?:Record<string,number>","validation":"finite非负；有父cap的维度只可缩减",
                  "effective":"inheritChildBudget(parent.budget, body.budget ?? {})",
                  "reservation":"reserveChildBudget按有效值检Σ；Session budget/inherited_budget与allocation/reserved一致",
                  "omittedDimensions":"仍继承父值","automaticRelease":False,"autoResizeToRemaining":False,
                  "externalExhaustionCode":"CHILD_BUDGET_EXCEEDED"}
                row["sdk"]["change"]="保旧显式泛型调用；默认新typed创建schema校验，passthrough原绑定和额外字段"
                row["sdk"]["defaultReturnType"]="ChildAgentSession" if op=="createChildAgentSession" else "ReviewDelegationResponse"
                row["mcp"]["inputExtension"]={"budget":"可选finite非负数字record；review新增，ordinary已存在"}
                row["mcp"]["responseValidation"]="按创建schema，不能用普通Session schema剥字段；structuredContent.data原字段保全"
                row["runner"]["inputExtension"]={"budget":"同REST原样透传；父固定api.sessionId，不重填全额"}
                row["clientChildLimitConfiguration"]="父/step默认8；不新增客户端maxChildSessions；低限额测试专用特权夹具"
                row["positive"]="父maxInputTokens100，ordinary显式60→完成旧reservation仍60→review显式40，四处budget同值，SDK/MCP/Pi保创建字段→双证据→父完成"
                row["negative"]="review省略budget/41/超父cap/negative/nonfinite/预算竞争拒；回滚/replay不重复预留；默认8第九次拒；权限仍沿原门禁"
            operations.append(row)
    new=json.loads((OUT/"policy-proposal.json").read_text(encoding="utf-8"))
    operations.append(new["operationDecision"])
    composite={"prepare_project_import":{"effects":"pure本地schema/hash校验，无远端写","source":"apps/mcp/src/coordination-product.ts"},
      "apply_project_import":{"source":"apps/mcp/src/coordination-product.ts","credential":"C",
       "operationIds":["listTeams","listWorkflowStates","createProject",
                       "createProjectMilestone","createWorkItem","createWorkItemRelation"],
       "atomicity":"逐实体独立事务/key，逐mapping恢复；完整准入先验全部子命令；禁止整项目原子声明",
       "recovery":"同normalized plan/hash/key续原mapping，部分成功逐项报告；TTL过期先查现存事实对账再续"}}
    write("operation-decisions.json",{"status":"规划候选；source declarations与lexical adapter观察，不是产品测试结论",
      "sourceHead":MAIN,"frozen":FROZEN,"operations":operations,"notFoundIdentifiers":absent,
      "composites":composite,"ownerFieldExtensions":{"createWorkItem":["parentId","milestoneId"],"updateWorkItem":["parentId","milestoneId"],
       "listWorkItems":["projectId","parentId","milestoneId","cursor","limit"],"listInbox":["status","cursor","limit"]},
      "contractReuse":"实际schema/handler字段全部见ZIP；创建使用新child专用schema保五字段及record/passthrough，review可选budget；原OpenAPI与提案分列，不冒新端点已有",
      "notes":["history/diff对Guidance只补路由现行实际允许的读；Human-only绝不改Agent",
       "文字存在/operation数量不能证明功能通过；每操作正拒对应真实test ID",
       "只读无写key/If-Match：幂等mutation和stale write测试不适用，要求零写/版本准确；其他类按family真实夹具",
       "M1 dependency不扩重做实现；测试在新head回归"]})
    lines=["# 逐操作消费者矩阵","","所有『新增／补齐』都是确认后的产品阶段。机器文件保留每项完整 OpenAPI operation、历史 policy 来源、现行元数据、具名消费者和测试 ID；lexical存在仅为源码观察，不证明runtime可用。",
     "","| 操作 | REST | DTO／SDK | MCP／Runner | 资格／处理 | 分页 |","| --- | --- | --- | --- | --- | --- |"]
    for r in operations:
        lines.append("| "+ " | ".join([r["operationId"],r["rest"]["method"]+" "+r["rest"]["path"],
          r["contracts"]+"；"+r["sdk"]["name"],r["mcp"]["name"]+" / "+r["runner"]["name"],
          r["credentialsAndScope"]+"；"+r["decision"],r["pagination"]]).replace("\n"," ")+" |")
    lines.extend(["","复合导入 operation 子集与逐实体恢复见 operation-decisions.json.composites；不创建Pi自主导入工具。",
      "","现有Zod本体保全在source archive。两种创建提取共享schema并新增childAgentSessionResponseSchema保全五个绑定字段、预算record和原额外字段；review输入增加可选budget，REST/Zod/SDK/MCP/Runner同值透传、执行Session budget/inherited_budget与allocation/reserved一致。新增GETstrict DTO与两POST合同见dto-proposal.ts/openapi-proposal.yaml；未改当前产品。父/step限额默认8，无客户端配置，低上限仅特权测试夹具。",
      "","Runner规划输入补parentId/milestoneId及filter/cursor/limit，所有分页以nextCursor原样回传；doc history正整数cursor不当UUID；export保留markdown字符串，MCP包结构化content，Pi返回同内容。reviewer不注册publish_plan且publication写交给本人Room和code_review；GET不调用写Activity包装。"])
    write("operation-matrix.md","\n".join(lines)+"\n")

if __name__ == "__main__":
    if "--matrix-only" not in sys.argv:
        archive()
    mapping()
    print(json.dumps({"source":"source-manifest.json","operations":"operation-decisions.json","status":"生成完成；尚需独立静态核验"},ensure_ascii=False))
