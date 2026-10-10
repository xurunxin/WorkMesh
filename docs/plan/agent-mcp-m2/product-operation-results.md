# M2 逐操作产品结果

冻结91操作逐项列出实际消费者。声明/注册检查不代运行；HTTP精确method/path请求回执由最近已通过根集成日志提取，不推测身份。MCP具名调用列给当前通过套件的精确断言源码行，Pi只计固定场景模型实际选择call（可见tools不计）。原实收及未测组合见[整卡报告](product-report.md)和[18行闭合矩阵](product-closure-matrix.md)。源码动态工具名明确标记，不冒literal注册；Human-only SDK字段是冻结目标名，无实际入口时sourcePresent=false，不冒Agent拥有该工具。

| operationId | SDK | MCP具名工具 | Runner | HTTP状态／次数；MCP断言行；Pi调用 | 边界 |
| --- | --- | --- | --- | --- | --- |
| listProjects | listProjects | list_projects, resolve_identifier | workmesh_list_projects | 200；6；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getProject | getProject | get_project | workmesh_get_project | 200/404；3；153,613；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createProject | createProject | apply_project_import, create_project | workmesh_create_project | 200/404；79；93,99,100,585；0 | 按现行资格/资源/feature；manifest不替代命令重验；C规划职责，Runner固定E资格过滤，注册不意味着可用 |
| updateProject | updateProject | update_project | workmesh_update_project | 200；1；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验；C规划职责，Runner固定E资格过滤，注册不意味着可用 |
| listWorkItems | listWorkItems | list_claimable_work_items, list_work_items, resolve_identifier | workmesh_list_work_items | 200/403；5；103,136；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getWorkItem | getWorkItem | get_work_item, resolve_identifier | workmesh_get_work_item | 200/401/403/409；16；108,111,154,189,614；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createWorkItem | createWorkItem | apply_project_import, create_work_item | workmesh_create_work_item | 200/401/404/409；187；93,99,100,134,169,185,187,585；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| updateWorkItem | updateWorkItem | update_work_item | workmesh_update_work_item | 200/400/403/409；11；112；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listProjectMilestones | listProjectMilestones | list_project_milestones, resolve_identifier | workmesh_list_project_milestones | API日志无观察；0；123,127,130；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createProjectMilestone | createMilestone | apply_project_import, create_milestone | workmesh_create_milestone | 200；44；93,99,100,116,585；0 | 按现行资格/资源/feature；manifest不替代命令重验；C规划职责，Runner固定E资格过滤，注册不意味着可用 |
| getMilestone | getMilestone | get_milestone | workmesh_get_milestone | API日志无观察；0；113,155；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| updateMilestone | updateMilestone | update_milestone | workmesh_update_milestone | 200；1；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| deleteMilestone | deleteMilestone | delete_milestone | workmesh_delete_milestone | 200；1；114；0 | 按现行资格/资源/feature；manifest不替代命令重验；C规划职责，Runner固定E资格过滤，注册不意味着可用 |
| listWorkItemRelations | listWorkItemRelations | list_work_item_relations | workmesh_list_work_item_relations | API日志无观察；0；140,142,147；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createWorkItemRelation | createWorkItemRelation | add_work_item_relation, apply_project_import | workmesh_create_work_item_relation | 200/409；3；93,99,100,109,138,139,579,582,585；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| deleteWorkItemRelation | deleteWorkItemRelation | remove_work_item_relation | workmesh_delete_work_item_relation | 200；1；146；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listWorkItemComments | listWorkItemComments | list_work_item_comments | workmesh_list_work_item_comments | 200；2；70；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createComment | createComment（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；3；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| updateComment | updateComment（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；3；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| listDocuments | listDocuments | list_documents | workmesh_list_documents | API日志无观察；0；38；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createDocument | createDocument | create_document | workmesh_create_document | API日志无观察；0；37,583；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getDocument | getDocument | get_document | workmesh_get_document | API日志无观察；0；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| updateDocument | updateDocument | update_document | workmesh_update_document | API日志无观察；0；43,44,58,63；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listDocumentHistory | listDocumentHistory | list_document_history | workmesh_list_document_history | API日志无观察；0；46,66,611；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getDocumentRevision | getDocumentRevision | get_document_revision | workmesh_get_document_revision | API日志无观察；0；610；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| diffDocumentRevisions | diffDocumentRevisions | diff_document_revisions | workmesh_diff_document_revisions | API日志无观察；0；49；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| exportDocumentMarkdown | exportDocumentMarkdown | export_document_markdown | workmesh_export_document_markdown | API日志无观察；0；51；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| archiveDocument | archiveDocument | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| unarchiveDocument | unarchiveDocument | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| restoreDocumentRevision | restoreDocumentRevision | restore_document_revision | workmesh_restore_document_revision | API日志无观察；0；52；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getWorkspaceGuidance | getGuidance | get_workspace_guidance | workmesh_get_workspace_guidance | 200；1；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getTeamGuidance | getGuidance | get_team_guidance | workmesh_get_team_guidance | 200/403；3；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getProjectGuidance | getGuidance | get_project_guidance | workmesh_get_project_guidance | 200；2；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listWorkspaceGuidanceHistory | listWorkspaceGuidanceHistory（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| listTeamGuidanceHistory | listTeamGuidanceHistory（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；2；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| listProjectGuidanceHistory | listProjectGuidanceHistory（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| diffWorkspaceGuidance | diffWorkspaceGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| diffTeamGuidance | diffTeamGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| diffProjectGuidance | diffProjectGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| publishWorkspaceGuidance | publishWorkspaceGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| publishTeamGuidance | publishTeamGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200/409；6；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| publishProjectGuidance | publishProjectGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200/400；2；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| archiveWorkspaceGuidance | archiveWorkspaceGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| archiveTeamGuidance | archiveTeamGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| archiveProjectGuidance | archiveProjectGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| rollbackWorkspaceGuidance | rollbackWorkspaceGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| rollbackTeamGuidance | rollbackTeamGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| rollbackProjectGuidance | rollbackProjectGuidance（无Agent SDK入口） | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| createWorkItemDecision | createWorkItemDecision | create_work_item_decision | workmesh_create_work_item_decision | 200/400/401/403/404/409；9；79；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createProjectDecision | createProjectDecision | create_project_decision | workmesh_create_project_decision | 200/403/404/409；7；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createSessionDecision | createSessionDecision | create_session_decision | workmesh_create_session_decision | 200；2；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getDecision | getDecision | get_decision | workmesh_get_decision | 200/403；4；80；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| finalizeDecision | finalizeDecision（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200/403/409；3；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| supersedeDecision | supersedeDecision（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| reverseDecision | reverseDecision（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 409；1；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| getWorkRoom | getRoom | get_work_room | workmesh_get_work_room | 200/403；25；358,591；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getWorkRoomTimeline | getRoomTimeline | 无 | 宿主/无Pi工具 | 200；3；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| postWorkRoomMessage | postRoomMessage | post_work_room_message | workmesh_send_room_message | 200/400/401/403/404/409/500；70；360,593；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listInbox | listInbox | list_inbox_items | workmesh_list_inbox_items | 200/401/409；17；361,594；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getInboxItem | getInboxItem | get_inbox_item | workmesh_get_inbox_item | 200/403/404/409；34；369,605,612；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| claimInboxItem | claimInboxItem | claim_inbox_item | workmesh_claim_inbox_item | 200/400/403/404/409；15；366,367,603,604；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| acknowledgeInboxItem | acknowledgeInboxItem | acknowledge_inbox_item | workmesh_acknowledge_inbox_item | 200/403/409；8；372；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| replyInboxItem | replyInboxItem | reply_inbox_item | workmesh_reply_inbox_item | 200/403/404；20；375,376,606；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listHandoffs | listHandoffs | list_handoffs | workmesh_list_handoffs | API日志无观察；0；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| offerHandoff | offerHandoff | offer_handoff | workmesh_offer_handoff | 200/403；12；383；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| inspectExactTargetHandoff | inspectPendingHandoff | inspect_pending_handoff | 宿主/无Pi工具 | 200/404；3；其它套件/未实测此MCP组合；0 | 准确目标安装凭据；当前E不是安装身份 |
| requestHandoff | requestHandoff | request_handoff | workmesh_request_handoff | 200；1；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| acceptHandoff | acceptHandoff（无Agent SDK入口） | 无 | 宿主/无Pi工具 | 200/409/500；9；其它套件/未实测此MCP组合；0 | Human-only；不授Agent、不注册Agent写工具 |
| rejectHandoff | rejectHandoff | reject_handoff | 宿主/无Pi工具 | 200；1；其它套件/未实测此MCP组合；0 | 准确目标安装凭据；当前E不是安装身份 |
| cancelHandoff | cancelHandoff | 无 | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| completeHandoff | completeHandoff | 无 | 宿主/无Pi工具 | 200/409；2；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| commentOnPlanStep | commentPlanStep | comment_plan_step | workmesh_comment_plan_step | 409；1；其它套件/未实测此MCP组合；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| proposePlanAssignment | proposeAssignment | propose_plan_step_assignment | workmesh_propose_plan_step_assignment | 409；1；其它套件/未实测此MCP组合；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| appendContextDelta | appendContextDelta | append_context_delta | workmesh_append_context_delta | 200/400/403；8；其它套件/未实测此MCP组合；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createChildAgentSession | createChildSession | create_child_session | workmesh_create_child_session | 200/400/409/500；42；287；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| createReviewDelegation | createReviewDelegation | create_review_delegation | workmesh_create_review_delegation | 200/400/403/409/500；23；304；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getAgentSession | getSession | get_agent_session | workmesh_get_session | 200/403；3；其它套件/未实测此MCP组合；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listAgentSessions | listSessions | list_agent_sessions | workmesh_list_sessions | API日志无观察；0；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getAgentSessionContext | getSessionContext | get_session_context | workmesh_get_session_context | 200/403；5；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| getAgentPlan | getPlan | get_session_plan | workmesh_get_session_plan | API日志无观察；0；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listAgentPlanVersions | listPlanVersions | list_session_plan_versions | workmesh_list_plan_versions | 200；1；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| publishAgentPlan | publishPlan | publish_plan | workmesh_publish_plan | 200/400/403/409；50；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| acknowledgeAgentSession | acknowledge | ack_agent_session | 宿主/无Pi工具 | 200；160；其它套件/未实测此MCP组合；0 | SDK/MCP及Runner宿主生命周期；不冒Pi用户工具 |
| transitionAgentSessionState | transitionState | transition_agent_session_state | workmesh_transition_state | 200/409；127；其它套件/未实测此MCP组合；0 | 按现行资格/资源/feature；manifest不替代命令重验 |
| heartbeatAgentSession | heartbeat | heartbeat | 宿主/无Pi工具 | 200/401/409；282；其它套件/未实测此MCP组合；0 | SDK/MCP及Runner宿主生命周期；不冒Pi用户工具 |
| completeAgentSession | complete | complete_session | workmesh_complete_session | 200/400/409/500；42；其它套件/未实测此MCP组合；2 | 按现行资格/资源/feature；manifest不替代命令重验 |
| failAgentSession | fail | fail_session | workmesh_fail_session | API日志无观察；0；227；5 | 按现行资格/资源/feature；manifest不替代命令重验 |
| acknowledgeAgentSessionStop | stopAcknowledgement | stop_ack | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | SDK/MCP及Runner宿主生命周期；不冒Pi用户工具 |
| getAgentSessionExecutionResult | getSessionExecutionResult | get_session_execution_result | 宿主/无Pi工具 | API日志无观察；0；其它套件/未实测此MCP组合；0 | SDK/MCP及Runner宿主生命周期；不冒Pi用户工具 |
| publishArtifact | publishArtifact | publish_artifact | workmesh_publish_artifact | 200/400/500；6；其它套件/未实测此MCP组合；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
| listAgentSessionChildren | listChildSessions | list_child_sessions | workmesh_list_child_sessions | 200/403/409；3；298；1 | 按现行资格/资源/feature；manifest不替代命令重验 |
