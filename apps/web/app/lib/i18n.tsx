'use client'

/**
 * apps/web/app/lib/i18n.tsx — single i18n entry for the WorkMesh web app.
 *
 * This module exports the `LocaleProvider` and the `useLocale` hook. It is
 * the ONLY place web code should read translated copy from.
 *
 * Typed `Copy` subsets are exposed via `useLocale()`:
 *   - `t(key)`             — flat dictionary for short labels (nav, buttons, status)
 *   - `issueCopy`          — Work Item list / board copy
 *   - `surfaceCopy`        — Work Surface (loading / empty / error) copy
 *   - `detailCopy`         — Work Item detail copy
 *   - `guidanceCopy`       — Guidance revision history copy
 *   - `settingsCopy`       — Settings page copy
 *   - `loginCopy`          — /login page copy
 *   - `installCopy`        — /install page copy
 *   - `operationsCopy`     — /operations page copy
 *   - `connectCopy`        — /connect onboarding page copy
 *   - `agentsCopy`         — /agents page copy
 *   - `inboxCopy`          — Inbox panel copy
 *   - `workRoomCopy`       — Work Room panel copy (session tree, leases, handoffs, decisions)
 *
 * The default locale is `zh-CN`. Both locale dictionaries are complete and
 * non-empty. Imported Partial Copy contracts may omit only exact documented
 * downstream defaults; empty or whitespace strings never fall back.
 */

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { WorkItemCopy } from '@workmesh/ui'
import type { WorkSurfaceCopy } from '../../features/work-items/work-surfaces'
import type { WorkItemDetailCopy } from '../../features/work-items/detail/work-item-detail'
import type { WorkItemArtifactsCopy } from '../../features/rich-content/artifacts'
import type { McpClientType, McpGuideCopyFacts } from './mcp-onboarding'

export type Locale = 'zh-CN' | 'en'

type TranslationKey =
  | 'agents'
  | 'administrationNavigation'
  | 'actionCouldNotComplete'
  | 'build'
  | 'cancel'
  | 'close'
  | 'createIssue'
  | 'createProject'
  | 'connecting'
  | 'guidance'
  | 'description'
  | 'dueDate'
  | 'high'
  | 'inbox'
  | 'issues'
  | 'live'
  | 'loading'
  | 'loadMore'
  | 'labels'
  | 'language'
  | 'lead'
  | 'low'
  | 'medium'
  | 'mainNavigation'
  | 'menu'
  | 'mobileNavigation'
  | 'newIssue'
  | 'newProject'
  | 'noLead'
  | 'noPriority'
  | 'noProject'
  | 'noProjects'
  | 'noTeam'
  | 'offline'
  | 'operations'
  | 'planningAndOperations'
  | 'projects'
  | 'priority'
  | 'projectName'
  | 'projectOverview'
  | 'reloadLatestWork'
  | 'responsibleHuman'
  | 'reconnecting'
  | 'search'
  | 'schema'
  | 'settings'
  | 'signOut'
  | 'status'
  | 'skipToContent'
  | 'summary'
  | 'team'
  | 'targetDate'
  | 'title'
  | 'unassigned'
  | 'urgent'
  | 'workViewCouldNotRefresh'
  | 'workspaceNavigation'
  | 'currentTeam'
  | 'backToHome'
  | 'notFoundDescription'
  | 'notFoundTitle'
  | 'pageLoadError'
  | 'retry'

const messages: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': {
    agents: '智能体',
    administrationNavigation: '管理导航',
    actionCouldNotComplete: '操作未能完成',
    build: '构建',
    cancel: '取消',
    close: '关闭',
    createIssue: '创建 Issue',
    createProject: '创建项目',
    connecting: '正在连接',
    guidance: '指南',
    description: '描述',
    dueDate: '截止日期',
    high: '高',
    inbox: '需要我处理',
    issues: 'Issues',
    live: '实时',
    loading: '正在加载',
    loadMore: '加载更多',
    labels: '标签',
    language: '语言',
    lead: '负责人',
    low: '低',
    medium: '中',
    mainNavigation: '主导航',
    menu: '菜单',
    mobileNavigation: '移动端导航',
    newIssue: '新建 Issue',
    newProject: '新建项目',
    noLead: '无负责人',
    noPriority: '无优先级',
    noProject: '无项目',
    noProjects: '尚无项目。',
    noTeam: '无团队',
    offline: '离线',
    operations: '运营',
    planningAndOperations: '规划与运营',
    projects: '项目',
    priority: '优先级',
    projectName: '项目名称',
    projectOverview: '项目概览',
    reloadLatestWork: '重新加载最新数据',
    responsibleHuman: '负责人',
    reconnecting: '正在重新连接',
    search: '搜索',
    schema: '数据库架构',
    settings: '设置',
    signOut: '退出登录',
    status: '状态',
    skipToContent: '跳到主要内容',
    summary: '摘要',
    team: '团队',
    targetDate: '目标日期',
    title: '标题',
    unassigned: '未分配',
    urgent: '紧急',
    workViewCouldNotRefresh: '当前工作视图无法刷新',
    workspaceNavigation: '工作区导航',
    currentTeam: '当前团队',
    backToHome: '返回首页',
    notFoundDescription: '你查找的页面不存在或已被移动。',
    notFoundTitle: '未找到页面',
    pageLoadError: '页面加载出错',
    retry: '重试',
  },
  en: {
    agents: 'Agents',
    administrationNavigation: 'Administration navigation',
    actionCouldNotComplete: 'Action could not be completed',
    build: 'build',
    cancel: 'Cancel',
    close: 'Close',
    createIssue: 'Create issue',
    createProject: 'Create project',
    connecting: 'Connecting',
    guidance: 'Guidance',
    description: 'Description',
    dueDate: 'Due date',
    high: 'High',
    inbox: 'Needs You',
    issues: 'Issues',
    live: 'Live',
    loading: 'Loading',
    loadMore: 'Load more',
    labels: 'Labels',
    language: 'Language',
    lead: 'Lead',
    low: 'Low',
    medium: 'Medium',
    mainNavigation: 'Main navigation',
    menu: 'Menu',
    mobileNavigation: 'Mobile navigation',
    newIssue: 'New issue',
    newProject: 'New project',
    noLead: 'No lead',
    noPriority: 'No priority',
    noProject: 'No project',
    noProjects: 'No projects yet.',
    noTeam: 'No team',
    offline: 'Offline',
    operations: 'Operations',
    planningAndOperations: 'Planning & Operations',
    projects: 'Projects',
    priority: 'Priority',
    projectName: 'Project name',
    projectOverview: 'Project overview',
    reloadLatestWork: 'Reload latest work',
    responsibleHuman: 'Responsible human',
    reconnecting: 'Reconnecting',
    search: 'Search',
    schema: 'schema',
    settings: 'Settings',
    signOut: 'Sign out',
    status: 'Status',
    skipToContent: 'Skip to content',
    summary: 'Summary',
    team: 'Team',
    targetDate: 'Target date',
    title: 'Title',
    unassigned: 'Unassigned',
    urgent: 'Urgent',
    workViewCouldNotRefresh: 'This work view could not refresh',
    workspaceNavigation: 'Workspace navigation',
    currentTeam: 'Current team',
    backToHome: 'Back to home',
    notFoundDescription: 'The page you are looking for does not exist or has been moved.',
    notFoundTitle: 'Page not found',
    pageLoadError: 'Page failed to load',
    retry: 'Retry',
  },
}

export type ToastCopy = {
  notifications: string
  dismiss: string
  dismissLabel: (title: string, position: number, total: number) => string
  issueCreatedTitle: string
  issueCreatedDescription: (title: string) => string
  issueCreateFailedTitle: string
  issueCreateFailedDescription: string
  approvalsApprovedTitle: (count: number) => string
  approvalsRejectedTitle: (count: number) => string
  approvalsDecisionDescription: string
  approvalsPartialTitle: string
  approvalsPartialDescription: (succeeded: number, failed: number) => string
  approvalsFailedTitle: string
  approvalsFailedDescription: string
  dryRunStartedTitle: string
  dryRunStartedDescription: (name: string) => string
  dryRunFailedTitle: string
  dryRunFailedDescription: string
  teamCreatedTitle: string
  teamCreatedDescription: (name: string) => string
  workflowStateCreatedTitle: string
  workflowStateCreatedDescription: (name: string) => string
  teamDeletedTitle: string
  teamDeletedDescription: (name: string) => string
}

const toastCopies: Record<Locale, ToastCopy> = {
  'zh-CN': {
    notifications: '通知',
    dismiss: '关闭',
    dismissLabel: (title, position, total) => `关闭通知：${title}（${position}/${total}）`,
    issueCreatedTitle: 'Issue 已创建',
    issueCreatedDescription: title => `已创建「${title}」。`,
    issueCreateFailedTitle: '无法创建 Issue',
    issueCreateFailedDescription: '请检查连接后重试；表单内容仍保留。',
    approvalsApprovedTitle: count => `已批准 ${count} 项请求`,
    approvalsRejectedTitle: count => `已拒绝 ${count} 项请求`,
    approvalsDecisionDescription: '审批收件箱已更新。',
    approvalsPartialTitle: '部分审批未完成',
    approvalsPartialDescription: (succeeded, failed) => `已完成 ${succeeded} 项，${failed} 项仍保留供重试。`,
    approvalsFailedTitle: '审批操作未完成',
    approvalsFailedDescription: '所选请求仍保留，请检查连接后重试。',
    dryRunStartedTitle: '试运行已启动',
    dryRunStartedDescription: name => `已为「${name}」创建试运行。`,
    dryRunFailedTitle: '无法启动试运行',
    dryRunFailedDescription: '请检查连接后重试。',
    teamCreatedTitle: '团队已创建',
    teamCreatedDescription: name => `团队「${name}」已可使用。`,
    workflowStateCreatedTitle: '工作流状态已创建',
    workflowStateCreatedDescription: name => `状态「${name}」已可使用。`,
    teamDeletedTitle: '团队已删除',
    teamDeletedDescription: name => `团队「${name}」已从活动导航中移除。`,
  },
  en: {
    notifications: 'Notifications',
    dismiss: 'Dismiss',
    dismissLabel: (title, position, total) => `Dismiss notification: ${title} (${position}/${total})`,
    issueCreatedTitle: 'Issue created',
    issueCreatedDescription: title => `Created “${title}”.`,
    issueCreateFailedTitle: 'Issue could not be created',
    issueCreateFailedDescription: 'Check your connection and try again; the form is still intact.',
    approvalsApprovedTitle: count => `Approved ${count} request${count === 1 ? '' : 's'}`,
    approvalsRejectedTitle: count => `Rejected ${count} request${count === 1 ? '' : 's'}`,
    approvalsDecisionDescription: 'The approval inbox is up to date.',
    approvalsPartialTitle: 'Some approvals were not completed',
    approvalsPartialDescription: (succeeded, failed) => `Completed ${succeeded}; ${failed} remain selected for retry.`,
    approvalsFailedTitle: 'Approval action could not be completed',
    approvalsFailedDescription: 'The selected requests remain available. Check your connection and try again.',
    dryRunStartedTitle: 'Dry run started',
    dryRunStartedDescription: name => `Started a dry run for “${name}”.`,
    dryRunFailedTitle: 'Dry run could not be started',
    dryRunFailedDescription: 'Check your connection and try again.',
    teamCreatedTitle: 'Team created',
    teamCreatedDescription: name => `Team “${name}” is ready to use.`,
    workflowStateCreatedTitle: 'Workflow state created',
    workflowStateCreatedDescription: name => `State “${name}” is ready to use.`,
    teamDeletedTitle: 'Team deleted',
    teamDeletedDescription: name => `Team “${name}” was removed from active navigation.`,
  },
}

export type GuidanceCopy = {
  intro: string
  scope: string
  scopeLabel: string
  workspace: string
  team: string
  project: string
  noTeamSelected: string
  noProject: string
  projectLabel: string
  status: (status: string) => string
  documentRevision: (revision: number) => string
  selectScope: string
  loading: string
  markdown: string
  edit: string
  preview: string
  characterCount: (count: number) => string
  renderedPreviewLabel: string
  previewEmpty: string
  changeSummary: string
  publishRevision: string
  currentRevision: string
  author: string
  published: string
  auditReason: string
  auditPlaceholder: string
  archiveCurrent: string
  revisionHistory: string
  rollbackPointer: string
  noRevisions: string
  compareRevisions: string
  fromRevision: string
  toRevision: string
  showDiff: string
  pointerAudit: string
  action: (action: string) => string
  by: string
  noPointerChanges: string
  projectDescription: string
  formatDate: (value: string) => string
}

const guidanceCopies: Record<Locale, GuidanceCopy> = {
  'zh-CN': {
    intro: '为智能体维护可追溯、版本化的工作指南。已发布版本不可变，会话上下文会固定其准确版本与 SHA-256 哈希。',
    scope: '作用域', scopeLabel: '指南作用域', workspace: '工作区', team: '团队', project: '项目', noTeamSelected: '未选择团队', noProject: '请选择项目', projectLabel: '指南项目',
    status: status => ({ unpublished: '未发布', active: '已生效', archived: '已归档', unavailable: '不可用' }[status] ?? status),
    documentRevision: revision => `文档版本 ${revision}`, selectScope: '请选择或创建所需作用域后再编辑指南。', loading: '正在加载指南…', markdown: 'Markdown 内容', edit: '编辑', preview: '预览', characterCount: count => `${count} 个字符`, renderedPreviewLabel: 'Markdown 渲染预览', previewEmpty: '在编辑模式下撰写 Markdown，切换到预览即可查看渲染结果。', changeSummary: '变更摘要', publishRevision: '发布不可变版本', currentRevision: '当前版本', author: '作者', published: '发布时间', auditReason: '审计原因', auditPlaceholder: '归档或回滚时必填', archiveCurrent: '归档当前指南', revisionHistory: '版本历史', rollbackPointer: '回滚至此版本', noRevisions: '尚无已发布版本。', compareRevisions: '比较版本', fromRevision: '起始指南版本', toRevision: '目标指南版本', showDiff: '显示差异', pointerAudit: '指针审计', action: action => ({ published: '已发布', archived: '已归档', rolled_back: '已回滚' }[action] ?? action.replaceAll('_', ' ')), by: '操作人', noPointerChanges: '尚无指针变更。', projectDescription: '项目描述（不属于指南）', formatDate: value => new Date(value).toLocaleString('zh-CN'),
  },
  en: {
    intro: 'Versioned instructions for agents. Published revisions are immutable and Session context pins the exact revision and SHA-256 hash it used.',
    scope: 'Scope', scopeLabel: 'Guidance scope', workspace: 'Workspace', team: 'Team', project: 'Project', noTeamSelected: 'No team selected', noProject: 'No project', projectLabel: 'Guidance project',
    status: status => status, documentRevision: revision => `Document revision ${revision}`, selectScope: 'Select or create the required scope before editing Guidance.', loading: 'Loading Guidance…', markdown: 'Markdown', edit: 'Edit', preview: 'Preview', characterCount: count => `${count} characters`, renderedPreviewLabel: 'Rendered Markdown preview', previewEmpty: 'Write Markdown in edit mode, then switch to preview to see the rendered result.', changeSummary: 'Change summary', publishRevision: 'Publish immutable revision', currentRevision: 'Current revision', author: 'Author', published: 'Published', auditReason: 'Audit reason', auditPlaceholder: 'Required for archive or rollback', archiveCurrent: 'Archive current Guidance', revisionHistory: 'Revision history', rollbackPointer: 'Roll back pointer', noRevisions: 'No published revisions.', compareRevisions: 'Compare revisions', fromRevision: 'From Guidance revision', toRevision: 'To Guidance revision', showDiff: 'Show diff', pointerAudit: 'Pointer audit', action: action => action.replaceAll('_', ' '), by: 'by', noPointerChanges: 'No pointer changes yet.', projectDescription: 'Project description (not Guidance)', formatDate: value => new Date(value).toLocaleString('en'),
  },
}

const issueCopies: Record<Locale, Partial<WorkItemCopy>> = {
  'zh-CN': {
    agentExecutionState: state => ({ queued: '排队中', acknowledged: '已确认', planning: '规划中', executing: '执行中', awaiting_input: '等待输入', awaiting_approval: '等待审批', blocked: '被阻塞', paused: '已暂停', stopping: '停止中', stale: '连接已过期', completed: '已完成', failed: '失败', canceled: '已取消' }[state] ?? state),
    allHumans: '全部负责人',
    allMilestones: '全部里程碑',
    allPriorities: '全部优先级',
    allProjects: '全部项目',
    allStatuses: '全部状态',
    boardColumn: name => `${name} 列`,
    clearFilters: '清除筛选',
    completedSubIssues: (completed, total) => `子问题 ${completed}/${total}`,
    dropWorkHere: '拖放 Issue 至此',
    filterLabel: '标签',
    filterLess: '收起筛选',
    filterMilestone: '里程碑',
    filterMore: '更多筛选',
    filterPriority: '优先级',
    filterProject: '项目',
    filterResponsibleHuman: '负责人',
    filterStatus: '状态',
    filtersLabel: 'Issue 筛选器',
    labelAddPlaceholder: '添加或修改标签…',
    labelMenuAriaLabel: title => `${title} · 标签菜单`,
    labelMenuEmpty: '没有可用的标签。',
    labelMenuHeading: '标签',
    labelMenuRemoveAll: '移除所有标签',
    labelMenuSuggestions: '建议',
    labelMoreCount: count => `+${count} 个标签`,
    loadMore: '加载更多 Issue',
    loading: '加载中…',
    moveItem: title => `移动 ${title}`,
    noActiveAgent: '没有运行中的智能体',
    noResponsibleHuman: '未分配负责人',
    openProject: name => `打开项目 ${name}`,
    priorityName: priority => ({ none: '无优先级', urgent: '紧急', high: '高', medium: '中', low: '低' }[priority] ?? priority),
    boardColumnsLabel: 'Issue 看板列',
    boardLabel: 'Issue 看板',
    listLabel: 'Issue 列表',
    savedView: '保存的视图',
    saveView: '保存视图',
    saveViewName: '保存视图名称',
    search: '搜索',
    searchPlaceholder: '搜索 Issue 标题或编号',
    selectProjectFirst: '请先选择项目',
  },
  en: {
    agentExecutionState: state => ({ queued: 'queued', acknowledged: 'acknowledged', planning: 'planning', executing: 'executing', awaiting_input: 'awaiting input', awaiting_approval: 'awaiting approval', blocked: 'blocked', paused: 'paused', stopping: 'stopping', stale: 'stale', completed: 'completed', failed: 'failed', canceled: 'canceled' }[state] ?? state),
    allHumans: 'All responsible',
    allMilestones: 'All milestones',
    allPriorities: 'All priorities',
    allProjects: 'All projects',
    allStatuses: 'All statuses',
    boardColumn: name => `${name} column`,
    clearFilters: 'Clear filters',
    completedSubIssues: (completed, total) => `sub-issues ${completed}/${total}`,
    dropWorkHere: 'Drop Issue here',
    filterLabel: 'Label',
    filterLess: 'Fewer filters',
    filterMilestone: 'Milestone',
    filterMore: 'More filters',
    filterPriority: 'Priority',
    filterProject: 'Project',
    filterResponsibleHuman: 'Responsible Human',
    filterStatus: 'Status',
    filtersLabel: 'Issue filters',
    labelAddPlaceholder: 'Add or edit labels...',
    labelMenuAriaLabel: title => `${title} \u00b7 label menu`,
    labelMenuEmpty: 'No labels available.',
    labelMenuHeading: 'Labels',
    labelMenuRemoveAll: 'Remove all labels',
    labelMenuSuggestions: 'Suggestions',
    labelMoreCount: count => `+${count} labels`,
    loadMore: 'Load more work items',
    loading: 'Loading…',
    moveItem: title => `Move ${title}`,
    noActiveAgent: 'No running agent',
    noResponsibleHuman: 'No responsible human',
    openProject: name => `Open project ${name}`,
    priorityName: priority => ({ none: 'no priority', urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' }[priority] ?? priority),
    boardColumnsLabel: 'Issue board columns',
    boardLabel: 'Issue board',
    listLabel: 'Issue list',
    savedView: 'Saved view',
    saveView: 'Save view',
    saveViewName: 'Save view name',
    search: 'Search',
    searchPlaceholder: 'Search Issue title or number',
    selectProjectFirst: 'Select a project first',
  },
}

const surfaceCopies: Record<Locale, Partial<WorkSurfaceCopy>> = {
  'zh-CN': {
    ariaLabel: '工作项视图',
    board: '看板视图',
    conflictDescription: '此操作与服务器上的较新版本冲突。请查看最新 Issue 后再次确认移动。',
    conflictTitle: 'Issue 已更新',
    densityCompact: '紧凑',
    densityComfortable: '舒适',
    densityLabel: 'Issue 密度',
    emptyDescription: '当前筛选条件下没有可访问的 Issue。',
    emptyTitle: '没有 Issue',
    errorDescription: '无法完成 Issue 查询。',
    errorTitle: '无法刷新 Issues',
    forbiddenDescription: '服务器未授权此 Issue 查询，未显示任何缓存记录。',
    forbiddenTitle: 'Issues 暂不可用',
    layoutLabel: 'Issue 视图布局',
    list: '列表视图',
    loadingDescription: '正在加载有权限访问的 Issue 数据。',
    loadingTitle: '正在加载 Issues',
    loadingViews: '正在加载保存的视图…',
    offlineDescription: '离线时无法获取最近一次有权限的 Issue 数据，已禁用编辑操作。',
    offlineTitle: 'WorkMesh 当前离线',
    refreshingDescription: '正在从服务器的权威数据中刷新此查询。',
    refreshingTitle: '正在刷新 Issues',
    retry: '重试',
    savedViewsDescription: '当前负责人无法使用保存的视图，偏好未被保留或应用。',
    savedViewsTitle: '保存的视图暂不可用',
  },
  en: {
    ariaLabel: 'Work surfaces',
    board: 'Board',
    conflictDescription: 'This action conflicts with a newer version on the server. Review the latest Issue and confirm the move again.',
    conflictTitle: 'Issue was updated',
    densityCompact: 'Compact',
    densityComfortable: 'Comfortable',
    densityLabel: 'Issue density',
    emptyDescription: 'No accessible Issues match the current filters.',
    emptyTitle: 'No Work Items',
    errorDescription: 'Could not complete the Issue query.',
    errorTitle: 'Could not refresh Issues',
    forbiddenDescription: 'The server did not authorize this Issue query, so no cached entries are shown.',
    forbiddenTitle: 'Issues are not available',
    layoutLabel: 'Issue layout',
    list: 'List',
    loadingDescription: 'Loading accessible Issue data.',
    loadingTitle: 'Loading Issues',
    loadingViews: 'Loading saved views...',
    offlineDescription: 'Offline: cannot fetch the latest accessible Issue data, so editing is disabled.',
    offlineTitle: 'WorkMesh is currently offline',
    refreshingDescription: 'Refreshing this query from authoritative server data.',
    refreshingTitle: 'Refreshing Issues',
    retry: 'Retry',
    savedViewsDescription: 'Saved views are not available for the current responsible human; preferences were not retained or applied.',
    savedViewsTitle: 'Saved views are not available',
  },
}

const detailCopies: Record<Locale, Partial<WorkItemDetailCopy>> = {
  'zh-CN': {
    agentExecutions: '智能体执行',
    accessDenied: '无权访问此 Issue',
    allChangesSaved: '所有更改已保存',
    close: '关闭',
    conflictIntentPreserved: '在你选择加载服务器最新版本前，未保存的修改会继续保留。',
    couldNotLoad: '无法加载 Issue',
    correlation: '关联 ID',
    delegation: '委派',
    delegateToAgent: '交给智能体',
    viewAgentOptions: '选择智能体',
    description: '描述（Markdown）',
    detailTabsAriaLabel: 'Issue 区块',
    detailTabOverview: '概览',
    detailTabDetails: '详情',
    detailTabDiscussion: '讨论',
    detailTabResponsibility: '责任',
    detailTabAgentExecutions: '智能体执行',
    discardChanges: '放弃未保存的 Issue 更改？',
    dueDate: '截止日期',
    editProjection: '编辑有权限访问的 Issue 数据。',
    editorCopy: {
      formatting: label => `${label}格式工具`,
      undo: '撤销',
      redo: '重做',
      heading: '标题',
      bold: '粗体',
      italic: '斜体',
      strike: '删除线',
      bullets: '项目符号列表',
      numbered: '编号列表',
      quote: '引用',
      code: '行内代码',
      codeBlock: '代码块',
      link: '链接',
      preview: '预览',
      edit: '编辑',
      draftRestored: '已恢复本地草稿。',
      discardDraft: '放弃草稿',
      revisionDraft: (draftRevision, currentRevision) => `发现版本 ${draftRevision} 的草稿。请先检查，再基于版本 ${currentRevision} 保存。`,
      restoreForReview: '恢复并检查',
      discardOldDraft: '放弃旧草稿',
      notSaved: '尚未保存',
      savedAgo: seconds => `${seconds} 秒前已保存`,
    },
    executionState: '执行状态',
    fullWorkItem: '完整 Issue',
    heartbeat: '心跳',
    humanResponsibility: '人类负责人',
    labels: '标签',
    milestone: '里程碑',
    noActiveAgent: '当前没有智能体持有执行或审阅租约。',
    noMilestone: '无里程碑',
    noParent: '无父 Issue',
    noProject: '无项目',
    notFound: 'Issue 不存在或已删除',
    offline: 'Issue 当前离线',
    openFullPage: '打开完整页面',
    ownsOutcome: '负责结果与工作流决策。',
    parentWorkItem: '父 Issue',
    priority: '优先级',
    priorityName: priority => ({ none: '无优先级', urgent: '紧急', high: '高', medium: '中', low: '低' }[priority] ?? priority),
    project: '项目',
    properties: '属性',
    quickView: '快速查看',
    reloadLatest: '重新加载最新版本',
    retry: '重试',
    responsibleHuman: '负责人',
    responsibleHumanHelp: '对结果负责；这不是智能体分配。',
    revision: revision => `版本 ${revision}`,
    saveChanges: '保存更改',
    saving: '正在保存…',
    serverConflictTitle: '服务器上的 Issue 已发生变化',
    session: sessionId => `会话 ${sessionId}`,
    title: '标题',
    unassigned: '未分配',
    unsavedChanges: '有未保存的更改',
    unavailableDescription: '请求的 Issue 数据当前不可用或无权访问。',
    workItem: 'Issue',
    workflowHelp: 'Issue 生命周期独立于智能体执行状态。',
    workflowStatus: '工作流状态',
  },
  en: {
    agentExecutions: 'Agent executions',
    accessDenied: 'No access to this Issue',
    allChangesSaved: 'All changes saved',
    close: 'Close',
    conflictIntentPreserved: 'Your unsaved changes are preserved until you load the latest server version.',
    couldNotLoad: 'Could not load Issue',
    correlation: 'Correlation ID',
    delegation: 'Delegation',
    delegateToAgent: 'Delegate to Agent',
    viewAgentOptions: 'Choose an Agent',
    description: 'Description (Markdown)',
    detailTabsAriaLabel: 'Issue sections',
    detailTabOverview: 'Overview',
    detailTabDetails: 'Details',
    detailTabDiscussion: 'Discussion',
    detailTabResponsibility: 'Responsibility',
    detailTabAgentExecutions: 'Agent executions',
    discardChanges: 'Discard unsaved Issue changes?',
    dueDate: 'Due date',
    editProjection: 'Edit the authorized Issue projection.',
    editorCopy: {
      formatting: label => `${label} formatting`,
      undo: 'Undo',
      redo: 'Redo',
      heading: 'Heading',
      bold: 'Bold',
      italic: 'Italic',
      strike: 'Strikethrough',
      bullets: 'Bulleted list',
      numbered: 'Numbered list',
      quote: 'Quote',
      code: 'Inline code',
      codeBlock: 'Code block',
      link: 'Link',
      preview: 'Preview',
      edit: 'Edit',
      draftRestored: 'Local draft restored.',
      discardDraft: 'Discard draft',
      revisionDraft: (draftRevision, currentRevision) => `Found a draft from revision ${draftRevision}. Review first, then save against revision ${currentRevision}.`,
      restoreForReview: 'Restore for review',
      discardOldDraft: 'Discard old draft',
      notSaved: 'Not saved yet',
      savedAgo: seconds => `Saved ${seconds}s ago`,
    },
    executionState: 'Execution state',
    fullWorkItem: 'Full Issue',
    heartbeat: 'Heartbeat',
    humanResponsibility: 'Human responsibility',
    labels: 'Labels',
    milestone: 'Milestone',
    noActiveAgent: 'No agent currently holds an execution or review lease.',
    noMilestone: 'No milestone',
    noParent: 'No parent Issue',
    noProject: 'No project',
    notFound: 'Issue not found or deleted',
    offline: 'Issue is offline',
    openFullPage: 'Open full page',
    ownsOutcome: 'Owns the outcome and workflow decision.',
    parentWorkItem: 'Parent Work Item',
    priority: 'Priority',
    priorityName: priority => ({ none: 'no priority', urgent: 'urgent', high: 'high', medium: 'medium', low: 'low' }[priority] ?? priority),
    project: 'Project',
    properties: 'Properties',
    quickView: 'Quick view',
    reloadLatest: 'Reload latest',
    retry: 'Retry',
    responsibleHuman: 'Responsible Human',
    responsibleHumanHelp: 'Accountable for the outcome; never an Agent assignment.',
    revision: revision => `Revision ${revision}`,
    saveChanges: 'Save changes',
    saving: 'Saving...',
    serverConflictTitle: 'The Work Item changed on the server',
    session: sessionId => `Session ${sessionId}`,
    title: 'Title',
    unassigned: 'Unassigned',
    unsavedChanges: 'Unsaved changes',
    unavailableDescription: 'The requested Issue projection is unavailable or not authorized.',
    workItem: 'Work Item',
    workflowHelp: 'Work Item lifecycle is independent from agent execution state.',
    workflowStatus: 'Workflow status',
  },
}

// ---------------------------------------------------------------------------
// Six new Copy subsets for the page-level migrations (Tasks 2–5).
// zh-CN is the source of truth; en may be empty for keys that have not yet
// been translated. The last-layer fall-through (and its dev-only console.warn)
// is implemented in `fallbackCopy` below.
// ---------------------------------------------------------------------------

export type SettingsCopy = {
  loading: string
  loadFailed: string
  retry: string
  back: string
  team: string
  currentTeam: string
  noTeam: string
  settings: string
  title: string
  workspace: string
  subtitle: string
  reviewOnly: string
  workspaceStructure: string
  teams: string
  teamName: string
  teamKey: string
  createTeam: string
  selectedTeam: string
  teamDetails: string
  saveChanges: string
  deleteTeam: string
  deleteHelp: string
  deleteDialogTitle: string
  deleteDescription: string
  deleteConstraint: string
  deleteCancel: string
  deleteClose: string
  deletingTeam: string
  deleteRevisionConflict: string
  deleteLastActiveTeamConflict: string
  deleteFailed: string
  createFirst: string
  teamWorkflow: string
  workflowStates: string
  noStates: string
  statusName: string
  category: string
  color: string
  workflowColorLegend: string
  workflowColorPresets: { neutral: string; blue: string; green: string; amber: string; red: string }
  customColor: string
  customColorInput: string
  colorValue: string
  createStatus: string
  statusCreated: (name: string) => string
  selectTeam: string
  loadingMore: string
  loadMoreTeams: string
  loadMoreStates: string
  mainNavigation: string
  workspaceNavigation: string
  administrationNavigation: string
  mobileNavigation: string
  menu: string
  skip: string
  deleteConfirmAccessible: (name: string) => string
  requestFailed: string
  teamUnavailable: string
  categories: { backlog: string; planned: string; started: string; completed: string; canceled: string }
  settingsTabsLabel: string
  tabWorkspace: string
  tabOperations: string
}

const settingsCopies: Record<Locale, SettingsCopy> = {
  'zh-CN': {
    loading: '正在加载设置…',
    loadFailed: '无法加载设置。',
    retry: '重试',
    back: '返回 Issues',
    team: '团队',
    currentTeam: '当前团队',
    noTeam: '无团队',
    settings: '设置',
    title: '设置',
    workspace: '工作区',
    subtitle: '工作区管理与日常规划保持分离。',
    reviewOnly: '你可以查看团队设置；工作区管理员负责管理团队和工作流状态。',
    workspaceStructure: '工作区结构',
    teams: '团队',
    teamName: '团队名称',
    teamKey: '团队标识',
    createTeam: '新建团队',
    selectedTeam: '已选团队',
    teamDetails: '团队详情',
    saveChanges: '保存更改',
    deleteTeam: '删除团队',
    deleteHelp: '从活动导航中移除此团队；关联工作将保留，但不可用。',
    deleteDialogTitle: '删除团队',
    deleteDescription: '该团队将从活动导航中移除；关联工作会保留，但将不可用。',
    deleteConstraint: '至少必须保留一个活动团队。',
    deleteCancel: '取消',
    deleteClose: '关闭',
    deletingTeam: '正在删除…',
    deleteRevisionConflict: '团队已被其他操作更新。请关闭对话框、刷新后重试。',
    deleteLastActiveTeamConflict: '无法删除最后一个活动团队。请先创建另一个活动团队。',
    deleteFailed: '无法删除团队。请检查连接后重试。',
    createFirst: '新建团队后即可配置工作流。',
    teamWorkflow: '团队工作流',
    workflowStates: '工作流状态',
    noStates: '暂无工作流状态。',
    statusName: '状态名称',
    category: '分类',
    color: '颜色',
    workflowColorLegend: '状态颜色',
    workflowColorPresets: { neutral: '中性', blue: '蓝色', green: '绿色', amber: '琥珀色', red: '红色' },
    customColor: '自定义',
    customColorInput: '自定义颜色',
    colorValue: '颜色值',
    createStatus: '新建状态',
    statusCreated: name => `已创建工作流状态 ${name}。`,
    selectTeam: '请选择团队以管理工作流。',
    loadingMore: '正在加载…',
    loadMoreTeams: '加载更多团队',
    loadMoreStates: '加载更多工作流状态',
    mainNavigation: '主导航',
    workspaceNavigation: '工作区导航',
    administrationNavigation: '管理导航',
    mobileNavigation: '移动端导航',
    menu: '菜单',
    skip: '跳到主要内容',
    deleteConfirmAccessible: name => `确认删除团队 ${name}`,
    requestFailed: '操作失败。',
    teamUnavailable: '所选团队不可用或你已无权访问。请重试以恢复工作区设置。',
    categories: { backlog: '待办', planned: '已规划', started: '进行中', completed: '已完成', canceled: '已取消' },
    settingsTabsLabel: '设置分区',
    tabWorkspace: '工作区',
    tabOperations: '运营与规划',
  },
  en: {
    loading: 'Loading Settings…',
    loadFailed: 'Unable to load Settings.',
    retry: 'Retry',
    back: 'Back to Issues',
    team: 'Team',
    currentTeam: 'Current team',
    noTeam: 'No team',
    settings: 'Settings',
    title: 'Settings',
    workspace: 'Workspace',
    subtitle: 'Workspace administration stays separate from daily planning.',
    reviewOnly: 'You can review team settings. Workspace admins manage teams and workflow states.',
    workspaceStructure: 'Workspace structure',
    teams: 'Teams',
    teamName: 'Team name',
    teamKey: 'Team key',
    createTeam: 'Create team',
    selectedTeam: 'Selected team',
    teamDetails: 'Team details',
    saveChanges: 'Save changes',
    deleteTeam: 'Delete team',
    deleteHelp: 'Remove this Team from active navigation; associated work is retained but unavailable.',
    deleteDialogTitle: 'Delete Team',
    deleteDescription: 'This Team leaves active navigation; associated work is retained but unavailable.',
    deleteConstraint: 'At least one active Team must remain.',
    deleteCancel: 'Cancel',
    deleteClose: 'Close',
    deletingTeam: 'Deleting…',
    deleteRevisionConflict: 'This Team changed in another operation. Close this dialog, refresh, and try again.',
    deleteLastActiveTeamConflict: 'The last active Team cannot be deleted. Create another active Team first.',
    deleteFailed: 'Unable to delete this Team. Check your connection and try again.',
    createFirst: 'Create a team to configure its workflow.',
    teamWorkflow: 'Team workflow',
    workflowStates: 'Workflow states',
    noStates: 'No workflow states yet.',
    statusName: 'Status name',
    category: 'Category',
    color: 'Color',
    workflowColorLegend: 'Status color',
    workflowColorPresets: { neutral: 'Neutral', blue: 'Blue', green: 'Green', amber: 'Amber', red: 'Red' },
    customColor: 'Custom',
    customColorInput: 'Custom color',
    colorValue: 'Color value',
    createStatus: 'Create status',
    statusCreated: name => `Created workflow state ${name}.`,
    selectTeam: 'Select a team to manage its workflow.',
    loadingMore: 'Loading…',
    loadMoreTeams: 'Load more teams',
    loadMoreStates: 'Load more workflow states',
    mainNavigation: 'Main navigation',
    workspaceNavigation: 'Workspace navigation',
    administrationNavigation: 'Administration navigation',
    mobileNavigation: 'Mobile navigation',
    menu: 'Menu',
    skip: 'Skip to content',
    deleteConfirmAccessible: name => `Delete Team ${name}`,
    requestFailed: 'Something went wrong.',
    teamUnavailable: 'The selected team is unavailable or no longer accessible. Retry to restore Workspace settings.',
    categories: { backlog: 'Backlog', planned: 'Planned', started: 'Started', completed: 'Completed', canceled: 'Canceled' },
    settingsTabsLabel: 'Settings sections',
    tabWorkspace: 'Workspace',
    tabOperations: 'Planning & Operations',
  },
}

export type LoginCopy = {
  title: string
  subtitle: string
  email: string
  password: string
  emailPlaceholder: string
  passwordPlaceholder: string
  signIn: string
  signingIn: string
  signInFailed: string
  retry: string
  installPrompt: string
}

const loginCopies: Record<Locale, LoginCopy> = {
  'zh-CN': {
    title: '登录',
    subtitle: '使用工作区账号登录',
    email: '邮箱',
    password: '密码',
    emailPlaceholder: 'name@example.com',
    passwordPlaceholder: '至少 12 个字符',
    signIn: '登录',
    signingIn: '正在登录…',
    signInFailed: '登录失败。',
    retry: '重试',
    installPrompt: '工作区尚未安装。',
  },
  en: {
    title: 'Sign in',
    subtitle: 'Sign in with your workspace account',
    email: 'Email',
    password: 'Password',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    signInFailed: 'Sign in failed.',
    retry: 'Retry',
    installPrompt: 'Workspace is not installed yet.',
  },
}

export type InstallCopy = {
  title: string
  subtitle: string
  workspace: string
  workspacePlaceholder: string
  slug: string
  slugPlaceholder: string
  yourName: string
  yourNamePlaceholder: string
  email: string
  emailPlaceholder: string
  password: string
  passwordPlaceholder: string
  bootstrapToken: string
  bootstrapTokenPlaceholder: string
  bootstrapHelp: string
  install: string
  installing: string
  installFailed: string
  retry: string
}

const installCopies: Record<Locale, InstallCopy> = {
  'zh-CN': {
    title: '安装 WorkMesh',
    subtitle: '首次启动时初始化工作区与管理员账号',
    workspace: '工作区名称',
    workspacePlaceholder: 'My Workspace',
    slug: '工作区标识',
    slugPlaceholder: 'workspace-slug',
    yourName: '管理员姓名',
    yourNamePlaceholder: '管理员姓名',
    email: '邮箱',
    emailPlaceholder: 'name@example.com',
    password: '密码',
    passwordPlaceholder: '至少 12 个字符',
    bootstrapToken: '启动令牌',
    bootstrapTokenPlaceholder: '部署启动令牌',
    bootstrapHelp: '除非 API 处于显式 loopback-only 开发启动模式，否则必填。令牌仅发送一次，本页不保存。',
    install: '安装',
    installing: '正在安装…',
    installFailed: '安装失败。',
    retry: '重试',
  },
  en: {
    title: 'Install WorkMesh',
    subtitle: 'Initialize the workspace and admin account on first launch',
    workspace: 'Workspace name',
    workspacePlaceholder: 'Workspace',
    slug: 'Workspace slug',
    slugPlaceholder: 'workspace-slug',
    yourName: 'Your name',
    yourNamePlaceholder: 'Your name',
    email: 'Email',
    emailPlaceholder: 'Email',
    password: 'Password',
    passwordPlaceholder: 'At least 12 characters',
    bootstrapToken: 'Bootstrap token',
    bootstrapTokenPlaceholder: 'Deployment bootstrap token',
    bootstrapHelp: 'Required unless the API is in explicit loopback-only development bootstrap mode. The token is sent once and is not stored by this page.',
    install: 'Install',
    installing: 'Installing…',
    installFailed: 'Installation failed.',
    retry: 'Retry',
  },
}

export type OperationsCopy = {
  // Page-level chrome
  title: string
  subtitle: string
  backToWork: string
  refresh: string
  noScript: string
  // Loading / error / disabled surfaces
  loading: string
  loadingDescription: string
  error: string
  errorDescription: string
  retry: string
  disabledTitle: string
  disabledDescription: string
  sectionNavigation: string
  noSectionsTitle: string
  noSectionsDescription: string
  searchLabel: string
  searchDescription: string
  searchPlaceholder: string
  collectionLoading: (collection: string) => string
  collectionLoadingDescription: (collection: string) => string
  noMatchesTitle: (collection: string) => string
  noMatchesDescription: (query: string) => string
  // Metrics row
  metricsTitle: string
  metricsKnownCost: string
  metricsNoKnownCost: string
  metricsUnknownCost: string
  metricsNeverTreatedAsZero: string
  metricsUnavailable: string
  metricsRecords: string
  metricsMinorUnits: (currency: string) => string
  metricsDurationHourUnit: string
  metricsDurationMinuteUnit: string
  metricsDurationSecondUnit: string
  metricsTokens: string
  metricsRuntime: string
  metricsToolCalls: string
  // Section panel headings
  cycles: string
  initiatives: string
  automation: string
  loops: string
  runs: string
  templates: string
  // Recent-runs table column headers
  run: string
  kind: string
  status: string
  attempts: string
  session: string
  created: string
  // Display-text functions
  cycleState: (state: string) => string
  initiativeStatus: (status: string) => string
  initiativePriority: (priority: string) => string
  initiativeHealth: (health: string) => string
  ruleState: (state: string) => string
  loopState: (state: string) => string
  runState: (status: string) => string
  cycleProgress: (done: number, total: number) => string
  notScheduled: string
  initiativeLine: (status: string, priority: string) => string
  ruleTrigger: (version: number, type: string, cron: string | null | undefined) => string
  dryRun: string
  pause: string
  resume: string
  loopNext: (next: string) => string
  noOverlap: string
  overlapAllowed: string
  runKindDryRun: string
  runKindLoop: string
  runKindRule: string
  templateKind: (kind: string) => string
  templateStatus: (status: string) => string
  templateLine: (kind: string, version: number, status: string) => string
  noCyclesTitle: string
  noCyclesDescription: string
  noInitiativesTitle: string
  noInitiativesDescription: string
  noRulesTitle: string
  noRulesDescription: string
  noLoopsTitle: string
  noLoopsDescription: string
  noRunsTitle: string
  noRunsDescription: string
  noTemplatesTitle: string
  noTemplatesDescription: string
}

const operationsCopies: Record<Locale, OperationsCopy> = {
  'zh-CN': {
    title: '运营与规划',
    subtitle: '查看长期规划、自动化、健康度与成本',
    backToWork: '返回工作区',
    refresh: '刷新',
    noScript: '请使用支持 JavaScript 的浏览器查看运营与规划。',
    loading: '正在加载运营数据…',
    loadingDescription: '正在获取规划、自动化、健康度与成本数据。',
    error: '运营页面需要关注',
    errorDescription: '请稍后重试或联系工作区管理员。',
    retry: '重试',
    disabledTitle: '运营页面未启用',
    disabledDescription: '本部署未启用 Operations UI 功能。',
    sectionNavigation: '运营分区',
    noSectionsTitle: '尚无可用运营模块',
    noSectionsDescription: '此部署已启用运营页面，但尚未启用任何运营模块。',
    searchLabel: '搜索已加载的运营记录',
    searchDescription: '仅筛选当前已加载的运营记录；加载更多后结果可能增加。',
    searchPlaceholder: '搜索名称、状态、日期或错误',
    collectionLoading: collection => `正在加载${collection}`,
    collectionLoadingDescription: collection => `正在获取${collection}。`,
    noMatchesTitle: collection => `已加载的${collection}中没有匹配项`,
    noMatchesDescription: query => `当前已加载的记录均不匹配“${query}”。可加载更多记录后继续搜索。`,
    metricsTitle: '使用量与成本',
    metricsKnownCost: '已知成本',
    metricsNoKnownCost: '尚无已知成本',
    metricsUnknownCost: '未知成本',
    metricsNeverTreatedAsZero: '从不当作零处理。',
    metricsUnavailable: '使用量数据不可用',
    metricsRecords: '条记录',
    metricsMinorUnits: currency => `${currency} 最小货币单位`,
    metricsDurationHourUnit: '小时',
    metricsDurationMinuteUnit: '分',
    metricsDurationSecondUnit: '秒',
    metricsTokens: 'Tokens',
    metricsRuntime: '运行时长',
    metricsToolCalls: '工具调用次数',
    cycles: '规划周期',
    initiatives: '主题',
    automation: '自动化规则',
    loops: 'Agent 循环',
    runs: '近期运行',
    templates: '模板与剧本',
    run: '运行',
    kind: '类型',
    status: '状态',
    attempts: '尝试次数',
    session: '会话',
    created: '创建时间',
    cycleState: state => ({ current: '当前', upcoming: '即将开始', history: '历史' }[state] ?? state),
    initiativeStatus: status => ({ planned: '已计划', active: '进行中', paused: '已暂停', completed: '已完成', canceled: '已取消' }[status] ?? status),
    initiativePriority: priority => ({ none: '无', low: '低', medium: '中', high: '高', urgent: '紧急' }[priority] ?? priority),
    initiativeHealth: health => ({ on_track: '健康', at_risk: '存在风险', off_track: '偏离轨道', unknown: '未知' }[health] ?? health),
    ruleState: state => ({ active: '已启用', paused: '已暂停', disabled: '已禁用' }[state] ?? state),
    loopState: state => ({ active: '已启用', paused: '已暂停', disabled: '已禁用' }[state] ?? state),
    runState: status => ({ pending: '等待中', claimed: '已领取', running: '运行中', succeeded: '已成功', failed: '已失败', dead: '已终止', canceled: '已取消', dry_run: '试运行' }[status] ?? status),
    cycleProgress: (done, total) => `${done}/${total} 已完成`,
    notScheduled: '尚未排期',
    initiativeLine: (status, priority) => `${status} · ${priority}优先级`,
    ruleTrigger: (version, type, cron) => `v${version} · ${type}${cron ? ` ${cron}` : ''}`,
    dryRun: '试运行',
    pause: '暂停',
    resume: '继续',
    loopNext: next => `下次：${next}`,
    noOverlap: '不允许重叠',
    overlapAllowed: '允许重叠',
    runKindDryRun: '试运行',
    runKindLoop: '循环',
    runKindRule: '规则',
    templateKind: kind => ({ work_item: '工作项', project: '项目', agent_run: 'Agent 运行', handoff: '交接', automation: '自动化' }[kind] ?? kind),
    templateStatus: status => ({ draft: '草稿', active: '已启用', archived: '已归档' }[status] ?? status),
    templateLine: (kind, version, status) => `${kind} · v${version} · ${status}`,
    noCyclesTitle: '尚未配置规划周期',
    noCyclesDescription: '当规划窗口就绪时，新建一个 Cycle。',
    noInitiativesTitle: '尚未配置主题',
    noInitiativesDescription: '主题产生持久数据后会出现在这里。',
    noRulesTitle: '尚未配置规则',
    noRulesDescription: '通过授权命令创建规则后，自动化规则会显示在此。',
    noLoopsTitle: '尚未配置 Loop',
    noLoopsDescription: '通过授权命令创建 Loop 后，Agent Loop 会显示在此。',
    noRunsTitle: '尚无运行历史',
    noRunsDescription: '当自动化或 Loop 真正执行后，运行历史会出现在这里。',
    noTemplatesTitle: '尚未配置模板',
    noTemplatesDescription: '模板与剧本在工作区可用后会显示在此。',
  },
  en: {
    title: 'Planning & Operations',
    subtitle: 'Durable planning, automation, health, and cost observability.',
    backToWork: 'Back to work',
    refresh: 'Refresh',
    noScript: 'Use a browser with JavaScript support to view Planning & Operations.',
    loading: 'Loading Operations',
    loadingDescription: 'Loading durable planning, automation, health, and cost projections.',
    error: 'Operations needs attention',
    errorDescription: 'Unable to load Operations.',
    retry: 'Retry',
    disabledTitle: 'Operations is disabled',
    disabledDescription: 'This deployment has not enabled the Operations UI feature.',
    sectionNavigation: 'Operations sections',
    noSectionsTitle: 'No Operations modules are available',
    noSectionsDescription: 'This deployment enables the Operations page, but no Operations modules are enabled yet.',
    searchLabel: 'Search loaded Operations records',
    searchDescription: 'Filters only Operations records already loaded in this view. Load more to expand the searchable set.',
    searchPlaceholder: 'Search names, statuses, dates, or errors',
    collectionLoading: collection => `Loading ${collection}`,
    collectionLoadingDescription: collection => `Fetching ${collection}.`,
    noMatchesTitle: collection => `No loaded ${collection} match`,
    noMatchesDescription: query => `No loaded records match “${query}”. Load more records to continue searching.`,
    metricsTitle: 'Usage and cost',
    metricsKnownCost: 'Known cost',
    metricsNoKnownCost: 'No known cost',
    metricsUnknownCost: 'Unknown cost',
    metricsNeverTreatedAsZero: 'Never treated as zero.',
    metricsUnavailable: 'Usage data unavailable',
    metricsRecords: 'records',
    metricsMinorUnits: currency => `${currency} minor units`,
    metricsDurationHourUnit: 'h',
    metricsDurationMinuteUnit: 'm',
    metricsDurationSecondUnit: 's',
    metricsTokens: 'Tokens',
    metricsRuntime: 'Runtime',
    metricsToolCalls: 'Tool calls',
    cycles: 'Cycles',
    initiatives: 'Initiatives',
    automation: 'Automation rules',
    loops: 'Loops',
    runs: 'Recent runs',
    templates: 'Templates & playbooks',
    run: 'Run',
    kind: 'Kind',
    status: 'Status',
    attempts: 'Attempts',
    session: 'Session',
    created: 'Created',
    cycleState: state => ({ current: 'Current', upcoming: 'Upcoming', history: 'History' }[state] ?? state),
    initiativeStatus: status => ({ planned: 'Planned', active: 'Active', paused: 'Paused', completed: 'Completed', canceled: 'Canceled' }[status] ?? status),
    initiativePriority: priority => ({ none: 'None', low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }[priority] ?? priority),
    initiativeHealth: health => ({ on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', unknown: 'Unknown' }[health] ?? health),
    ruleState: state => ({ active: 'Enabled', paused: 'Paused', disabled: 'Disabled' }[state] ?? state),
    loopState: state => ({ active: 'Enabled', paused: 'Paused', disabled: 'Disabled' }[state] ?? state),
    runState: status => ({ pending: 'Pending', claimed: 'Claimed', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', dead: 'Dead', canceled: 'Canceled', dry_run: 'Dry run' }[status] ?? status),
    cycleProgress: (done, total) => `${done}/${total} completed`,
    notScheduled: 'Not scheduled',
    initiativeLine: (status, priority) => `${status} · ${priority} priority`,
    ruleTrigger: (version, type, cron) => `v${version} · ${type}${cron ? ` ${cron}` : ''}`,
    dryRun: 'Dry run',
    pause: 'Pause',
    resume: 'Resume',
    loopNext: next => `Next: ${next}`,
    noOverlap: 'No overlap',
    overlapAllowed: 'Overlap allowed',
    runKindDryRun: 'Dry run',
    runKindLoop: 'Loop',
    runKindRule: 'Rule',
    templateKind: kind => ({ work_item: 'Work item', project: 'Project', agent_run: 'Agent run', handoff: 'Handoff', automation: 'Automation' }[kind] ?? kind),
    templateStatus: status => ({ draft: 'Draft', active: 'Active', archived: 'Archived' }[status] ?? status),
    templateLine: (kind, version, status) => `${kind} · v${version} · ${status}`,
    noCyclesTitle: 'No Cycles configured',
    noCyclesDescription: 'Create a Cycle when a planning window is ready.',
    noInitiativesTitle: 'No Initiatives configured',
    noInitiativesDescription: 'Initiatives will appear here when the feature has durable data.',
    noRulesTitle: 'No Rules configured',
    noRulesDescription: 'Automation rules will appear after they are created through an authorized command.',
    noLoopsTitle: 'No Loops configured',
    noLoopsDescription: 'Agent Loops will appear after they are created through an authorized command.',
    noRunsTitle: 'No run history yet',
    noRunsDescription: 'Durable run history will appear after an automation or loop executes.',
    noTemplatesTitle: 'No Templates configured',
    noTemplatesDescription: 'Templates and playbooks will appear when they are available to this workspace.',
  },
}

export type ConnectCopy = {
  eyebrow: string
  title: string
  healthPill: string
  fragmentMissingTitle: string
  fragmentMissingBody: string
  step1: string
  step2: string
  step3: string
  mcpClient: string
  discovery: string
  sha256: string
  chooseClient: string
  bootstrapChecklist: string
  copyConfig: string
  copied: string
  clientDescription: (type: McpClientType) => string
  clientConfiguration: (label: string) => string
  configurationStatus: string
  configRegionLabel: (label: string) => string
  configCopiedAnnouncement: string
  linkCopiedAnnouncement: string
  secretBoundary: string
  copySuccess: string
  transport: string
  profile: string
  skill: string
  environmentChecks: string
  environmentCheckItems: (facts: McpGuideCopyFacts) => readonly string[]
  bootstrapCheckItems: (facts: McpGuideCopyFacts) => readonly string[]
  localStdioFallback: (label: string) => string
  loadingStatus: string
  handoffEyebrow: string
  handoffTitle: string
  handoffBody: string
  copyLink: string
  copiedLink: string
  authorityTitle: string
  authorityBody: string
  stateReadyLabel: string
  stateReadySummary: string
  stateReadyNextAction: string
  stateUnsupportedClientLabel: string
  stateUnsupportedClientSummary: string
  stateUnsupportedClientNextAction: string
  stateCoordinationFeatureDisabledLabel: string
  stateCoordinationFeatureDisabledSummary: string
  stateCoordinationFeatureDisabledNextAction: string
  stateNetworkUnavailableLabel: string
  stateNetworkUnavailableSummary: string
  stateNetworkUnavailableNextAction: string
  stateDiscoveryUnavailableLabel: string
  stateDiscoveryUnavailableSummary: string
  stateDiscoveryUnavailableNextAction: string
  stateMcpUnavailableLabel: string
  stateMcpUnavailableSummary: string
  stateMcpUnavailableNextAction: string
}

const connectCopies: Record<Locale, ConnectCopy> = {
  'zh-CN': {
    eyebrow: '安全智能体设置',
    title: '连接智能体到 WorkMesh',
    healthPill: '配对一次 · 实时验证',
    fragmentMissingTitle: '缺少配对片段',
    fragmentMissingBody: '请工作区管理员生成新的智能体连接。配对片段仅可使用一次并会过期；它不是智能体 Session 令牌。',
    step1: '1 · 客户端',
    step2: '2 · 配置',
    step3: '3 · 验证',
    mcpClient: 'MCP 客户端',
    discovery: '发现',
    sha256: 'SHA-256',
    chooseClient: '选择支持的客户端',
    bootstrapChecklist: '受控启动检查',
    copyConfig: '复制配置',
    copied: '已复制',
    clientDescription: type => ({
      codex: '通过 TOML MCP server 配置使用环境变量支持的请求头。',
      opencode: '通过远程 JSON 配置使用环境变量支持的请求头。',
      pi: '通过扩展配置连接 Streamable HTTP 服务。',
      generic_mcp: '通过标准兼容的 Streamable HTTP 配置连接。',
    })[type],
    clientConfiguration: label => `配置模板：${label}`,
    configurationStatus: 'MCP 配置状态',
    configRegionLabel: label => `配置预览：${label}`,
    configCopiedAnnouncement: '配置已复制到剪贴板。',
    linkCopiedAnnouncement: '安全连接链接已复制到剪贴板。',
    secretBoundary: '凭据边界：模板只包含环境变量名。请把兑换后的安装凭据放入客户端的密钥存储，永远不要写入此文件。',
    copySuccess: '复制成功',
    transport: '传输',
    profile: 'Profile',
    skill: 'Skill',
    environmentChecks: '环境检查',
    environmentCheckItems: facts => [
      `把兑换得到的安装凭据保存为 ${facts.tokenEnvironmentName}，不要粘贴到配置文件里。`,
      `只通过 ${facts.tokenHeader} 头发送到上方展示的精确服务端 URL。`,
      `要求 Client Profile ${facts.profileVersion} 与 Skill ${facts.skillVersion}（${facts.skillSha256}）。`,
    ],
    bootstrapCheckItems: facts => [
      `拉取公共发现文档，并确认服务端声明 ${facts.clientLabel}；拒绝协议、客户端、Profile 或技能选择器中的未知值。`,
      '在一次性配对片段过期前完成兑换，并把得到的凭据仅保存在客户端密钥库中。',
      '调用 verify_connection，并要求存在一个活跃的 Team、匹配的 Profile / Skill / 能力范围以及负责人。',
      '在选择工作前先调用 get_workmesh_context；工具存在并不授予任何写权限。',
      '当发现已撤销、过期、范围不符、停用或实时事实不一致时立即停止。',
    ],
    localStdioFallback: command => `本地 stdio 兜底：在本地密钥环境中设置 WORKMESH_API_URL 和 WORKMESH_INSTALLATION_TOKEN，然后运行 ${command}。`,
    loadingStatus: '正在加载服务端 MCP 配置…',
    handoffEyebrow: '一次性交接',
    handoffTitle: '配对链接已驻留在浏览器内存中',
    handoffBody: '片段尚未发送到 WorkMesh。请仅把完整链接交给目标智能体，在过期前完成兑换，然后销毁该链接。',
    copyLink: '复制安全连接 URL',
    copiedLink: '已复制',
    authorityTitle: '权限仍在服务端。',
    authorityBody: '人类连接只会创建一个安装身份。普通写入仍需有效的智能体 Session、Delegation、能力与资源范围，并按需配合审批、Lease、版本与幂等键。',
    stateReadyLabel: '配置就绪',
    stateReadySummary: '所选客户端、服务端、Profile 与固定版本的技能选择器彼此一致。',
    stateReadyNextAction: '配对一次后，把凭据存入客户端密钥库，然后运行 verify_connection。',
    stateUnsupportedClientLabel: '不支持的客户端',
    stateUnsupportedClientSummary: '此服务端未声明所选的 MCP 客户端。',
    stateUnsupportedClientNextAction: '请选择已声明的客户端，或先升级 WorkMesh 部署再进行配对。',
    stateCoordinationFeatureDisabledLabel: '协调功能未启用',
    stateCoordinationFeatureDisabledSummary: '基础发现可用，但此部署报告 Coordination MCP beta 功能被关闭。',
    stateCoordinationFeatureDisabledNextAction: '暂时只作为审阅使用；配对前需由运维开启并验证该功能。',
    stateNetworkUnavailableLabel: '网络不可用',
    stateNetworkUnavailableSummary: '无法从当前 WorkMesh 部署刷新实时接入事实。',
    stateNetworkUnavailableNextAction: '恢复网络后重试。请勿重用旧的凭据或端点。',
    stateDiscoveryUnavailableLabel: '发现不可用',
    stateDiscoveryUnavailableSummary: 'WorkMesh 无法提供服务端派生的 MCP 和技能选择器。',
    stateDiscoveryUnavailableNextAction: '重试发现流程；请勿推测端点或重用旧配对说明。',
    stateMcpUnavailableLabel: 'MCP 不可用',
    stateMcpUnavailableSummary: '发现成功，但已声明的 MCP 服务未通过就绪检查。',
    stateMcpUnavailableNextAction: '保留已有凭据不变，待服务恢复后再重试。',
  },
  en: {
    eyebrow: 'Secure Agent setup',
    title: 'Connect an Agent to WorkMesh',
    healthPill: 'Pair once · verify live',
    fragmentMissingTitle: 'Pairing fragment missing',
    fragmentMissingBody: 'Ask a Workspace Admin to generate a new Agent Connection. A fragment is single-use and expires; it is not an Agent Session token.',
    step1: '1 · Client',
    step2: '2 · Configuration',
    step3: '3 · Verify',
    mcpClient: 'MCP client',
    discovery: 'Discovery',
    sha256: 'SHA-256',
    chooseClient: 'Choose a supported client',
    bootstrapChecklist: 'Bounded bootstrap checklist',
    copyConfig: 'Copy config',
    copied: 'Copied',
    clientDescription: type => ({
      codex: 'Use TOML MCP server configuration with environment-backed request headers.',
      opencode: 'Use remote JSON configuration with environment-backed request headers.',
      pi: 'Use extension configuration over Streamable HTTP.',
      generic_mcp: 'Use a standards-compatible Streamable HTTP configuration.',
    })[type],
    clientConfiguration: label => `Configuration template: ${label}`,
    configurationStatus: 'MCP configuration status',
    configRegionLabel: label => `Configuration preview: ${label}`,
    configCopiedAnnouncement: 'Configuration copied to the clipboard.',
    linkCopiedAnnouncement: 'Secure connection link copied to the clipboard.',
    secretBoundary: 'Secret boundary: the template contains only an environment-variable name. Put the redeemed installation credential in the client secret store, never in this file.',
    copySuccess: 'Copied successfully',
    transport: 'Transport',
    profile: 'Profile',
    skill: 'Skill',
    environmentChecks: 'Environment checks',
    environmentCheckItems: facts => [
      `Store the redeemed installation credential as ${facts.tokenEnvironmentName}; never paste it into a configuration file.`,
      `Send it only through the ${facts.tokenHeader} header to the exact server URL shown above.`,
      `Require Client Profile ${facts.profileVersion} and Skill ${facts.skillVersion} (${facts.skillSha256}).`,
    ],
    bootstrapCheckItems: facts => [
      `Fetch public discovery and confirm the server advertises ${facts.clientLabel}; reject unknown protocol, client, Profile, or Skill selectors.`,
      'Redeem before the one-time pairing fragment expires and keep the resulting credential only in the client secret store.',
      'Call verify_connection and require an active Team, matching Profile / Skill / capability scope, and responsible Human.',
      'Call get_workmesh_context before selecting work; tool availability never grants write authority.',
      'Stop when discovery reports revocation, expiry, scope mismatch, disablement, or inconsistent live facts.',
    ],
    localStdioFallback: command => `Local stdio fallback: set WORKMESH_API_URL and WORKMESH_INSTALLATION_TOKEN in the local secret environment, then run ${command}.`,
    loadingStatus: 'Loading server-derived MCP configuration…',
    handoffEyebrow: 'One-time handoff',
    handoffTitle: 'Pairing link is present in browser memory',
    handoffBody: 'The fragment has not been sent to WorkMesh. Give the exact link only to the intended Agent, redeem it before expiry, and then discard it.',
    copyLink: 'Copy secure connect URL',
    copiedLink: 'Copied',
    authorityTitle: 'Authority stays server-side.',
    authorityBody: 'A Human Connection creates an installation identity only. Ordinary mutations still require an active Agent Session, Delegation, capability and resource scope, plus approval, lease, revision, and idempotency where applicable.',
    stateReadyLabel: 'Configuration ready',
    stateReadySummary: 'Selected client, server, profile, and pinned-version skill selectors all agree.',
    stateReadyNextAction: 'After pairing once, store the credential in the client secret store, then run verify_connection.',
    stateUnsupportedClientLabel: 'Unsupported client',
    stateUnsupportedClientSummary: 'This server does not advertise the selected MCP client.',
    stateUnsupportedClientNextAction: 'Pick an advertised client, or upgrade the WorkMesh deployment before pairing.',
    stateCoordinationFeatureDisabledLabel: 'Coordination feature disabled',
    stateCoordinationFeatureDisabledSummary: 'Discovery is reachable, but this deployment reports the Coordination MCP beta as disabled.',
    stateCoordinationFeatureDisabledNextAction: 'Review only for now; operations must enable and verify the feature before pairing.',
    stateNetworkUnavailableLabel: 'Network unavailable',
    stateNetworkUnavailableSummary: 'Cannot refresh live onboarding facts from the current WorkMesh deployment.',
    stateNetworkUnavailableNextAction: 'Retry once the network is back. Do not reuse old credentials or endpoints.',
    stateDiscoveryUnavailableLabel: 'Discovery unavailable',
    stateDiscoveryUnavailableSummary: 'WorkMesh cannot serve the server-derived MCP and skill selectors.',
    stateDiscoveryUnavailableNextAction: 'Retry discovery. Do not infer endpoints or reuse old pairing instructions.',
    stateMcpUnavailableLabel: 'MCP unavailable',
    stateMcpUnavailableSummary: 'Discovery succeeded, but the advertised MCP service did not pass its readiness check.',
    stateMcpUnavailableNextAction: 'Keep existing credentials; retry once the service is back.',
  },
}

export type AgentsCopy = {
  agents: string
  loadingDescription: string
  loadingTitle: string
  context: string
  loadError: string
  selectCapability: string
  updateAccessError: string
  revokeAccessError: string
  refresh: string
  eyebrow: string
  title: string
  intro: string
  retry: string
  attentionTitle: string
  attentionDescription: string
  activeAgents: string
  registered: (count: number) => string
  liveSessions: string
  visible: (count: number) => string
  pendingApprovals: string
  responseRequired: string
  queueClear: string
  needsAttention: string
  blockedOrWaiting: string
  registry: string
  registryIntro: string
  all: string
  active: string
  inactive: string
  noAgents: string
  humanQueue: string
  approvals: string
  openInbox: string
  noApprovals: string
  execution: string
  sessions: string
  noSessions: string
  // Top-level section tabs (Phase 3 Task 3.1)
  tabsAriaLabel: string
  tabAgents: string
  tabSessions: string
  tabApprovals: string
  // Agents registry filter row (Phase 3 Task 3.2)
  filterAriaLabel: string
  filterName: string
  filterNamePlaceholder: string
  filterTeam: string
  allTeams: string
  filterCapability: string
  allCapabilities: string
  filterStatus: string
  // Team access drawer affordance (Phase 3 Task 3.3)
  openTeamAccess: string
  durableState: string
  diagnostics: string
  diagnosticsIntro: string
  allClear: string
  allClearDetail: string
  // Agent registry card
  registryStatusActive: string
  registryStatusInactive: string
  noRegistryDescription: string
  approvedLabel: string
  capabilitiesLabel: (count: number) => string
  concurrency: string
  heartbeat: string
  // Team access details
  teamAccessAndCapabilities: string
  requestedLabel: string
  definitionApprovedLabel: string
  none: string
  noTeamsAvailable: string
  accessStatusActive: string
  accessStatusRevoked: string
  accessStatusNotGranted: string
  accessApprovedLabel: string
  revokedAt: (date: string) => string
  approvedCapabilitySubset: string
  updateGrant: string
  grantAccess: string
  revoke: string
  // Team access chip view
  teamAccessViewRequested: string
  teamAccessViewApproved: string
  teamAccessViewLabel: string
  teamAccessEmptyRequested: string
  teamAccessNoSelection: string
  teamAccessSelectedCount: (count: number) => string
  teamAccessToggleHint: string
  teamAccessApprovedChipLabel: (capability: string) => string
  teamAccessRequestedChipLabel: (capability: string) => string
  saveAccess: string
  // Approval inbox panel
  riskLabel: (risk: string) => string
  reviewSession: string
  // Bulk approval table (Phase 3 Task 3.4)
  selectAllApprovals: string
  approvalRowCheckbox: (actionName: string) => string
  selectedApprovalsCount: (count: number) => string
  clearSelection: string
  approveSelected: string
  rejectSelected: string
  bulkApproveError: string
  bulkRejectError: string
  approvalTableAriaLabel: string
  approvalColumnAction: string
  approvalColumnRisk: string
  approvalColumnRationale: string
  approvalColumnExpires: string
  approvalColumnSession: string
  // Sessions panel
  sessionLabel: (id: string) => string
  workItemLabel: (id: string) => string
  noWorkItem: string
  heartbeatLabel: (date: string) => string
  // Load-more controls (visible text in the "Load more <resource>" button)
  loadMoreAgents: string
  loadMoreTeams: string
  loadMoreApprovals: string
  loadMoreSessions: string
  // Agent Connections panel
  connectionsEyebrow: string
  connectionsTitle: string
  connectionsIntro: string
  refreshConnections: string
  newConnection: string
  adminRequiredHint: string
  unableToLoadConnections: string
  retryLoadHint: string
  loadingConnections: string
  noConnectionsTitle: string
  noConnectionsHint: string
  existingConnections: string
  unavailableTeam: string
  // Connection diagnostic facts
  teamScope: string
  principalHuman: string
  credential: string
  lastUsed: string
  capabilities: string
  noCapabilities: string
  skill: string
  credentialSafety: string
  rotateCredential: string
  confirmRotation: string
  revokeConnection: string
  // MCP onboarding panel
  mcpOnboardingEyebrow: string
  mcpOnboardingTitle: string
  mcpOnboardingIntro: (client: string) => string
  mcpLoading: string
  mcpEndpoint: string
  mcpDiscovery: string
  mcpTransport: string
  mcpProfile: string
  mcpAuthReadiness: string
  mcpAuthActive: string
  mcpAuthPending: string
  mcpCapabilitySummary: string
  mcpSkillSelector: string
  secretSafeConfig: (file: string) => string
  localStdioFallback: string
  copyConfig: string
  configCopied: string
  bootstrapChecklist: string
  // Handoff instructions
  handoffEyebrow: string
  handoffTitle: string
  handoffIntro: string
  copyFullInstructions: string
  handoffExpiryNote: string
  // Create dialog
  newConnectionTitle: string
  fieldClient: string
  fieldAgentName: string
  fieldAgentSlug: string
  fieldTeam: string
  fieldPrincipal: string
  fieldAgentDelegate: string
  fieldNotes: string
  cancel: string
  generateConnection: string
  // Item kind labels
  intentLabel: (kind: string) => string
  unavailable: string
  notReported: string
  // Status pills
  connectionStatusActive: string
  connectionStatusPending: string
  connectionStatusRotating: string
  connectionStatusRevoked: string
  credentialPending: string
}

export type ApprovalHistoryLocaleCopy = {
  approvalViewsAriaLabel: string
  approvalViewPending: string
  approvalViewHistory: string
  approvalHistoryStatus: string
  approvalStatusApproved: string
  approvalStatusRejected: string
  approvalStatusExpired: string
  approvalStatusConsumed: string
  approvalStatusCanceled: string
  noApprovalHistory: string
  approvalHistoryTableAriaLabel: string
  approvalHistoryLoading: string
  approvalColumnStatus: string
  approvalColumnRequested: string
  loadMoreApprovalHistory: string
}

export type AgentDetailLocaleCopy = {
  agentDetailEyebrow: string
  agentDetailIntro: string
  agentDetailFacts: string
  agentSlug: string
  agentDescription: string
  agentProvider: string
  agentVersion: string
  agentStatus: string
  agentSupportedProtocols: string
  agentRequestedCapabilities: string
  agentApprovedCapabilities: string
  heartbeatSeconds: (seconds: number) => string
  openAgentDetailsLabel: string
  openAgentDetails: (name: string) => string
  peekShortcutHint: string
  peekTitle: (name: string) => string
  peekDescription: string
  closePeek: string
  manageTeamAccessLabel: string
  manageTeamAccess: (name: string) => string
  backToAgentRegistry: string
  agentNotFoundTitle: string
  agentNotFoundDescription: string
  agentDetailErrorTitle: string
  agentDetailErrorDescription: string
  teamAccessProjection: string
  teamAccessLoadedEmpty: string
  teamAccessTeam: string
}

export type AgentControlLocaleCopy = {
  controlSummaryAriaLabel: string
  fieldAgentNamePlaceholder: string
}

const agentsCopies: Record<Locale, AgentsCopy & ApprovalHistoryLocaleCopy & AgentDetailLocaleCopy & AgentControlLocaleCopy> = {
  'zh-CN': {
    agents: '智能体',
    loadingDescription: '正在加载智能体、Session、审批和连接信息。',
    loadingTitle: '正在加载智能体工作区',
    context: '人类控制面',
    loadError: '无法加载智能体。',
    selectCapability: '请至少选择一项要授予的能力。',
    updateAccessError: '无法更新团队访问权限。',
    revokeAccessError: '无法撤销团队访问权限。',
    refresh: '刷新',
    eyebrow: '人类控制面',
    title: '智能体',
    intro: '监控委派工作、处理审批，并在不接触凭据的情况下诊断连接。',
    retry: '重试',
    attentionTitle: '智能体工作区需要关注',
    attentionDescription: '无法加载智能体工作区。',
    controlSummaryAriaLabel: '智能体控制摘要',
    activeAgents: '活跃智能体',
    registered: count => `已注册 ${count} 个`,
    liveSessions: '运行中 Session',
    visible: count => `可见 ${count} 个`,
    pendingApprovals: '待处理审批',
    responseRequired: '需要人类响应',
    queueClear: '队列为空',
    needsAttention: '需要关注',
    blockedOrWaiting: '需要人类响应',
    registry: '注册表',
    registryIntro: '先检查定义；仅在需要审阅时展开团队权限。',
    all: '全部',
    active: '活跃',
    inactive: '停用',
    noAgents: '没有符合当前筛选的已注册智能体。',
    humanQueue: '人类队列',
    tabsAriaLabel: '智能体工作区分区',
    tabAgents: '智能体',
    tabSessions: 'Session',
    tabApprovals: '审批',
    filterAriaLabel: '智能体筛选',
    filterName: '名称',
    filterNamePlaceholder: '按名称、Slug 搜索',
    filterTeam: '团队',
    allTeams: '全部团队',
    filterCapability: '能力',
    allCapabilities: '全部能力',
    filterStatus: '状态',
    openTeamAccess: '查看团队访问',
    approvals: '审批',
    openInbox: '打开收件箱',
    noApprovals: '没有待处理审批。',
    execution: '执行',
    sessions: 'Sessions',
    noSessions: '当前没有可见的智能体 Session。',
    durableState: '持久状态',
    diagnostics: '诊断',
    diagnosticsIntro: '关注项来自服务端强类型投影；实时更新只触发刷新。',
    allClear: '一切正常',
    allClearDetail: '当前没有授权范围内的开放关注项。',
    registryStatusActive: '活跃',
    registryStatusInactive: '停用',
    noRegistryDescription: '没有注册表描述。',
    approvedLabel: '已批准',
    capabilitiesLabel: count => `${count} 项能力`,
    concurrency: '并发数',
    heartbeat: '心跳',
    agentDetailEyebrow: '智能体定义',
    agentDetailIntro: '查看稳定身份、运行合同与能力事实；团队授权由注册表中的权威聚合数据管理。',
    agentDetailFacts: '智能体事实',
    agentSlug: '标识',
    agentDescription: '描述',
    agentProvider: '提供方',
    agentVersion: '版本',
    agentStatus: '状态',
    agentSupportedProtocols: '支持的协议',
    agentRequestedCapabilities: '申请的能力',
    agentApprovedCapabilities: '定义已批准的能力',
    heartbeatSeconds: seconds => `${seconds} 秒`,
    openAgentDetailsLabel: '打开详情',
    openAgentDetails: name => `打开 ${name} 的详情`,
    peekShortcutHint: '按空格键快速查看',
    peekTitle: name => `快速查看 ${name}`,
    peekDescription: '只读定义事实；关闭后返回注册表中的原位置。',
    closePeek: '关闭',
    manageTeamAccessLabel: '管理团队访问',
    manageTeamAccess: name => `管理 ${name} 的团队访问`,
    backToAgentRegistry: '返回智能体注册表',
    agentNotFoundTitle: '找不到智能体',
    agentNotFoundDescription: '该智能体不存在，或你无权查看其定义。',
    agentDetailErrorTitle: '无法加载智能体详情',
    agentDetailErrorDescription: '无法读取当前智能体定义，请重试。',
    teamAccessProjection: '已加载的团队访问',
    teamAccessLoadedEmpty: '当前注册表结果确认没有团队授权。',
    teamAccessTeam: '团队',
    teamAccessAndCapabilities: '团队访问与能力',
    requestedLabel: '请求的能力：',
    definitionApprovedLabel: '定义已批准：',
    none: '无',
    noTeamsAvailable: '暂无可用团队。',
    accessStatusActive: '已启用',
    accessStatusRevoked: '已撤销',
    accessStatusNotGranted: '未授予',
    accessApprovedLabel: '已批准：',
    revokedAt: date => `撤销于 ${date}`,
    approvedCapabilitySubset: '已批准的能力子集',
    updateGrant: '更新授权',
    grantAccess: '授予访问',
    revoke: '撤销',
    teamAccessViewRequested: '已申请',
    teamAccessViewApproved: '已批准',
    teamAccessViewLabel: '能力视图',
    teamAccessEmptyRequested: '该智能体尚未声明任何能力。',
    teamAccessNoSelection: '未选择任何能力，点击上方 chip 进行切换。',
    teamAccessSelectedCount: count => `已选 ${count} 项`,
    teamAccessToggleHint: '点击 chip 进行切换；点击「保存」写入授权。',
    teamAccessApprovedChipLabel: capability => `已批准 ${capability}`,
    teamAccessRequestedChipLabel: capability => `已申请 ${capability}`,
    saveAccess: '保存授权',
    riskLabel: risk => `${risk} 级风险`,
    reviewSession: '查看 Session 与证据',
    selectAllApprovals: '全选当前页',
    approvalRowCheckbox: actionName => `选择审批：${actionName}`,
    selectedApprovalsCount: count => `已选 ${count} 项`,
    clearSelection: '清空选择',
    approveSelected: '通过所选',
    rejectSelected: '驳回所选',
    bulkApproveError: '无法批量通过所选审批。',
    bulkRejectError: '无法批量驳回所选审批。',
    approvalTableAriaLabel: '待处理审批表',
    approvalColumnAction: '操作',
    approvalColumnRisk: '风险',
    approvalColumnRationale: '理由',
    approvalColumnExpires: '过期时间',
    approvalColumnSession: 'Session',
    approvalViewsAriaLabel: '审批视图',
    approvalViewPending: '待处理',
    approvalViewHistory: '历史记录',
    approvalHistoryStatus: '结果',
    approvalStatusApproved: '已通过',
    approvalStatusRejected: '已驳回',
    approvalStatusExpired: '已过期',
    approvalStatusConsumed: '已使用',
    approvalStatusCanceled: '已取消',
    noApprovalHistory: '没有此结果的审批记录。',
    approvalHistoryTableAriaLabel: '审批历史记录',
    approvalHistoryLoading: '正在加载审批历史记录…',
    approvalColumnStatus: '结果',
    approvalColumnRequested: '请求时间',
    sessionLabel: id => `Session ${id}`,
    workItemLabel: id => `Issue ${id}`,
    noWorkItem: '无 Issue',
    heartbeatLabel: date => `心跳 ${date}`,
    loadMoreAgents: '加载更多智能体',
    loadMoreTeams: '加载更多团队',
    loadMoreApprovals: '加载更多审批',
    loadMoreApprovalHistory: '加载更多历史审批',
    loadMoreSessions: '加载更多 Session',
    // Agent Connections panel
    connectionsEyebrow: '智能体访问',
    connectionsTitle: '连接',
    connectionsIntro: '可审计的 MCP 身份；显式的人类所有权与可撤销的团队权限。',
    refreshConnections: '刷新连接',
    newConnection: '新建连接',
    adminRequiredHint: '需要工作区管理员权限才能创建或轮换连接。',
    unableToLoadConnections: '无法加载连接。',
    retryLoadHint: '现有连接可能仍然有效，请重试后再考虑新建。',
    loadingConnections: '正在加载连接…',
    noConnectionsTitle: '暂无连接',
    noConnectionsHint: '新建一个连接以查看其生命周期诊断。凭据永远不会在此页面渲染。',
    existingConnections: '现有连接',
    unavailableTeam: '团队不可用',
    teamScope: '团队作用域',
    principalHuman: '负责人',
    credential: '凭据',
    lastUsed: '最近使用',
    capabilities: '已授予能力',
    noCapabilities: '未授予任何能力',
    skill: '技能',
    credentialSafety: '凭据安全：会话与安装令牌始终留在服务端。此页面仅暴露非敏感的指纹供支持与审计使用。',
    rotateCredential: '轮换凭据',
    confirmRotation: '确认完成轮换',
    revokeConnection: '撤销连接',
    mcpOnboardingEyebrow: 'MCP 接入',
    mcpOnboardingTitle: '配置与实时检查',
    mcpOnboardingIntro: client => `${client} 的服务端接入事实。不会渲染任何 bearer 或安装凭据。`,
    mcpLoading: '正在检查',
    mcpEndpoint: 'MCP 端点',
    mcpDiscovery: '发现端点',
    mcpTransport: '传输',
    mcpProfile: '客户端 Profile',
    mcpAuthReadiness: '认证就绪',
    mcpAuthActive: '安装凭据已激活',
    mcpAuthPending: '等待配对',
    mcpCapabilitySummary: '能力摘要',
    mcpSkillSelector: '技能选择器',
    secretSafeConfig: file => `仅含环境变量名的 ${file}`,
    localStdioFallback: '本地 stdio 回退：',
    copyConfig: '复制配置',
    configCopied: '已复制',
    bootstrapChecklist: '智能体引导清单',
    handoffEyebrow: '一次性接入',
    handoffTitle: '智能体接入步骤',
    handoffIntro: '将完整流程复制到目标智能体。文档区分一次性配对码与长期安装令牌，并包含必要的验证门禁。',
    copyFullInstructions: '复制完整步骤',
    handoffExpiryNote: '配对 URL 十分钟内有效，且只在此浏览器会话显示。过期后请生成新的轮换。',
    newConnectionTitle: '新建智能体连接',
    fieldClient: '客户端',
    fieldAgentName: '智能体名称',
    fieldAgentNamePlaceholder: '规划协调员',
    fieldAgentSlug: '智能体标识',
    fieldTeam: '团队',
    fieldPrincipal: '负责人',
    fieldAgentDelegate: '允许此协调员启动已批准的智能体',
    fieldNotes: '备注',
    cancel: '取消',
    generateConnection: '生成连接语句',
    intentLabel: kind => ({ ask: '提问', answer: '回答', propose: '提议', decide: '决策', claim: '认领', handoff: '交接', blocker: '阻塞', review_request: '审阅请求', review_result: '审阅结果', status: '状态', inform: '通知' }[kind] ?? kind),
    unavailable: '不可用',
    notReported: '未提供',
    connectionStatusActive: '已启用',
    connectionStatusPending: '等待中',
    connectionStatusRotating: '轮换中',
    connectionStatusRevoked: '已撤销',
    credentialPending: '等待中',
  },
  en: {
    agents: 'Agents',
    loadingDescription: 'Loading Agents, Sessions, approvals, and Connection facts.',
    loadingTitle: 'Loading Agent workspace',
    context: 'Human control plane',
    loadError: 'Unable to load agents.',
    selectCapability: 'Select at least one capability to grant.',
    updateAccessError: 'Unable to update team access.',
    revokeAccessError: 'Unable to revoke team access.',
    refresh: 'Refresh',
    eyebrow: 'Human control plane',
    title: 'Agents',
    intro: 'Monitor delegated work, respond to approvals, and diagnose Connections without handling credentials.',
    retry: 'Retry',
    attentionTitle: 'Agent workspace needs attention',
    attentionDescription: 'Unable to load the Agent workspace.',
    controlSummaryAriaLabel: 'Agent control summary',
    activeAgents: 'Active agents',
    registered: count => `${count} registered`,
    liveSessions: 'Live sessions',
    visible: count => `${count} visible`,
    pendingApprovals: 'Pending approvals',
    responseRequired: 'Human response required',
    queueClear: 'Queue clear',
    needsAttention: 'Needs attention',
    blockedOrWaiting: 'Human response required',
    registry: 'Registry',
    registryIntro: 'Scan definitions first; expand Team authority only when it needs review.',
    all: 'All',
    active: 'Active',
    inactive: 'Inactive',
    noAgents: 'No registered agents match this filter.',
    humanQueue: 'Human queue',
    tabsAriaLabel: 'Agent workspace sections',
    tabAgents: 'Agents',
    tabSessions: 'Sessions',
    tabApprovals: 'Approvals',
    filterAriaLabel: 'Agent filters',
    filterName: 'Name',
    filterNamePlaceholder: 'Search by name or slug',
    filterTeam: 'Team',
    allTeams: 'All teams',
    filterCapability: 'Capability',
    allCapabilities: 'All capabilities',
    filterStatus: 'Status',
    openTeamAccess: 'Open team access',
    approvals: 'Approvals',
    openInbox: 'Open inbox',
    noApprovals: 'No pending approvals.',
    execution: 'Execution',
    sessions: 'Sessions',
    noSessions: 'No agent session is visible to you.',
    durableState: 'Durable state',
    diagnostics: 'Diagnostics',
    diagnosticsIntro: 'Attention items come from the typed server projection; realtime updates only prompt a refresh.',
    allClear: 'All clear',
    allClearDetail: 'There are no open attention items in the authorized scope.',
    registryStatusActive: 'active',
    registryStatusInactive: 'inactive',
    noRegistryDescription: 'No registry description.',
    approvedLabel: 'Approved',
    capabilitiesLabel: count => `${count} capabilities`,
    concurrency: 'Concurrency',
    heartbeat: 'Heartbeat',
    agentDetailEyebrow: 'Agent definition',
    agentDetailIntro: 'Review stable identity, runtime contracts, and capability facts. Team authority is managed from the registry’s authoritative aggregate.',
    agentDetailFacts: 'Agent facts',
    agentSlug: 'Slug',
    agentDescription: 'Description',
    agentProvider: 'Provider',
    agentVersion: 'Version',
    agentStatus: 'Status',
    agentSupportedProtocols: 'Supported protocols',
    agentRequestedCapabilities: 'Requested capabilities',
    agentApprovedCapabilities: 'Definition-approved capabilities',
    heartbeatSeconds: seconds => `${seconds} seconds`,
    openAgentDetailsLabel: 'Open details',
    openAgentDetails: name => `Open details for ${name}`,
    peekShortcutHint: 'Press Space to Peek',
    peekTitle: name => `Peek at ${name}`,
    peekDescription: 'Read-only definition facts. Closing returns focus to the registry.',
    closePeek: 'Close',
    manageTeamAccessLabel: 'Manage team access',
    manageTeamAccess: name => `Manage team access for ${name}`,
    backToAgentRegistry: 'Back to Agent registry',
    agentNotFoundTitle: 'Agent not found',
    agentNotFoundDescription: 'This Agent does not exist or its definition is not available to you.',
    agentDetailErrorTitle: 'Could not load Agent details',
    agentDetailErrorDescription: 'The current Agent definition could not be loaded. Try again.',
    teamAccessProjection: 'Loaded Team access',
    teamAccessLoadedEmpty: 'The current registry result confirms that there are no Team grants.',
    teamAccessTeam: 'Team',
    teamAccessAndCapabilities: 'Team access and capabilities',
    requestedLabel: 'Requested:',
    definitionApprovedLabel: 'Definition approved:',
    none: 'None',
    noTeamsAvailable: 'No teams are available.',
    accessStatusActive: 'active',
    accessStatusRevoked: 'revoked',
    accessStatusNotGranted: 'not granted',
    accessApprovedLabel: 'Approved:',
    revokedAt: date => `Revoked ${date}`,
    approvedCapabilitySubset: 'Approved capability subset',
    updateGrant: 'Update grant',
    grantAccess: 'Grant access',
    revoke: 'Revoke',
    teamAccessViewRequested: 'Requested',
    teamAccessViewApproved: 'Approved',
    teamAccessViewLabel: 'Capability view',
    teamAccessEmptyRequested: 'This agent has not declared any capabilities yet.',
    teamAccessNoSelection: 'No capabilities selected. Tap a chip to toggle.',
    teamAccessSelectedCount: count => `${count} selected`,
    teamAccessToggleHint: 'Tap a chip to toggle; press Save to commit the grant.',
    teamAccessApprovedChipLabel: capability => `Approved: ${capability}`,
    teamAccessRequestedChipLabel: capability => `Requested ${capability}`,
    saveAccess: 'Save grant',
    riskLabel: risk => `${risk} risk`,
    reviewSession: 'Review session and evidence',
    selectAllApprovals: 'Select all on this page',
    approvalRowCheckbox: actionName => `Select approval: ${actionName}`,
    selectedApprovalsCount: count => `${count} selected`,
    clearSelection: 'Clear selection',
    approveSelected: 'Approve selected',
    rejectSelected: 'Reject selected',
    bulkApproveError: 'Unable to approve the selected approvals.',
    bulkRejectError: 'Unable to reject the selected approvals.',
    approvalTableAriaLabel: 'Pending approvals table',
    approvalColumnAction: 'Action',
    approvalColumnRisk: 'Risk',
    approvalColumnRationale: 'Rationale',
    approvalColumnExpires: 'Expires',
    approvalColumnSession: 'Session',
    approvalViewsAriaLabel: 'Approval views',
    approvalViewPending: 'Pending',
    approvalViewHistory: 'History',
    approvalHistoryStatus: 'Outcome',
    approvalStatusApproved: 'Approved',
    approvalStatusRejected: 'Rejected',
    approvalStatusExpired: 'Expired',
    approvalStatusConsumed: 'Consumed',
    approvalStatusCanceled: 'Canceled',
    noApprovalHistory: 'No approvals have this outcome.',
    approvalHistoryTableAriaLabel: 'Approval history',
    approvalHistoryLoading: 'Loading approval history…',
    approvalColumnStatus: 'Outcome',
    approvalColumnRequested: 'Requested',
    sessionLabel: id => `Session ${id}`,
    workItemLabel: id => `Work item ${id}`,
    noWorkItem: 'No work item',
    heartbeatLabel: date => `Heartbeat ${date}`,
    loadMoreAgents: 'Load more agents',
    loadMoreTeams: 'Load more teams',
    loadMoreApprovals: 'Load more approvals',
    loadMoreApprovalHistory: 'Load more approval history',
    loadMoreSessions: 'Load more sessions',
    connectionsEyebrow: 'Agent access',
    connectionsTitle: 'Connections',
    connectionsIntro: 'Scoped MCP identities with visible Human ownership and revocable Team authority.',
    refreshConnections: 'Refresh connections',
    newConnection: 'New connection',
    adminRequiredHint: 'Workspace Admin access is required to create or rotate Connections.',
    unableToLoadConnections: 'Unable to load Connections.',
    retryLoadHint: 'Existing Connections may still be active. Retry before creating a replacement.',
    loadingConnections: 'Loading Connections…',
    noConnectionsTitle: 'No Connections yet',
    noConnectionsHint: 'Create a Connection to see safe lifecycle diagnostics here. Credentials are never rendered in this dashboard.',
    existingConnections: 'Existing Connections',
    unavailableTeam: 'Unavailable Team',
    teamScope: 'Team scope',
    principalHuman: 'Principal Human',
    credential: 'Credential',
    lastUsed: 'Last used',
    capabilities: 'Capabilities',
    noCapabilities: 'None granted',
    skill: 'Skill',
    credentialSafety: 'Credential safety: session and installation tokens stay server-side. This screen exposes only a non-secret fingerprint for support and audit.',
    rotateCredential: 'Rotate credential',
    confirmRotation: 'Confirm verified rotation',
    revokeConnection: 'Revoke connection',
    mcpOnboardingEyebrow: 'MCP onboarding',
    mcpOnboardingTitle: 'Configuration and live checks',
    mcpOnboardingIntro: client => `Server-derived setup facts for ${client}. No bearer or installation credential is rendered.`,
    mcpLoading: 'Loading',
    mcpEndpoint: 'MCP endpoint',
    mcpDiscovery: 'Discovery',
    mcpTransport: 'Transport',
    mcpProfile: 'Client Profile',
    mcpAuthReadiness: 'Auth readiness',
    mcpAuthActive: 'Installation credential active',
    mcpAuthPending: 'Awaiting pairing',
    mcpCapabilitySummary: 'Capability summary',
    mcpSkillSelector: 'Skill selector',
    secretSafeConfig: file => `Secret-safe ${file}`,
    localStdioFallback: 'Local stdio fallback:',
    copyConfig: 'Copy config',
    configCopied: 'Copied',
    bootstrapChecklist: 'Agent bootstrap checklist',
    handoffEyebrow: 'One-time setup',
    handoffTitle: 'Agent handoff instructions',
    handoffIntro: 'Copy the complete procedure to the selected Agent. It distinguishes the one-time pairing code from the long-lived Installation Token and includes the required verification gates.',
    copyFullInstructions: 'Copy full instructions',
    handoffExpiryNote: 'The pairing URL expires in ten minutes and is shown only in this browser session. Generate a new rotation instead of reusing an expired or previously redeemed URL.',
    newConnectionTitle: 'New Agent Connection',
    fieldClient: 'Client',
    fieldAgentName: 'Agent name',
    fieldAgentNamePlaceholder: 'Planning coordinator',
    fieldAgentSlug: 'Agent slug',
    fieldTeam: 'Team',
    fieldPrincipal: 'Principal Human',
    fieldAgentDelegate: 'Allow this coordinator to start approved Agents',
    fieldNotes: 'Notes',
    cancel: 'Cancel',
    generateConnection: 'Generate connection sentence',
    intentLabel: kind => kind.replaceAll('_', ' '),
    unavailable: 'Unavailable',
    notReported: 'not reported',
    connectionStatusActive: 'active',
    connectionStatusPending: 'pending',
    connectionStatusRotating: 'rotating',
    connectionStatusRevoked: 'revoked',
    credentialPending: 'Pending',
  },
}

export type InboxCopy = {
  title: string
  intro: string
  status: string
  statusOpen: string
  statusResolved: string
  empty: string
  loadError: string
  acknowledgeError: string
  acknowledging: string
  acknowledge: string
  openWorkRoom: string
  // Item fact labels
  source: string
  risk: string
  deadline: string
  itemStatus: string
  responsibleHuman: string
  context: string
  currentHuman: string
  inspectCanonical: string
  notReported: string
  intentLabel: (kind: string) => string
  // Notification feedback panel
  feedbackTitle: string
  feedbackIntro: string
  refresh: string
  noFeedbackTitle: string
  noFeedbackHint: string
  preferencesTitle: string
  preferencesRevision: (revision: number) => string
  channels: string
  digest: string
  minimumPriority: string
  webhook: string
  webhookUnavailable: string
  webhookConfigured: string
  revisionFallback: string
  credentialPending: string
  // Collaboration state panel (status copy)
  stateLoadingTitle: string
  stateLoadingBody: string
  stateEmptyTitle: string
  stateEmptyBody: string
  stateForbiddenTitle: string
  stateForbiddenBody: string
  stateErrorTitle: string
  stateErrorBody: string
  stateConflictTitle: string
  stateConflictBody: string
  stateExpiredTitle: string
  stateExpiredBody: string
  stateReconnectingTitle: string
  stateReconnectingBody: string
  preferencesLoadError: string
  noDeliveryChannel: string
  deliveryFailed: string
  deliveryRecordedError: string
  deliveryHealthLabel: (title: string) => string
}

const inboxCopies: Record<Locale, InboxCopy> = {
  'zh-CN': {
    title: '收件箱',
    intro: '需要人类响应或审阅的请求。',
    status: '状态',
    statusOpen: '待处理',
    statusResolved: '已处理',
    empty: '当前没有待处理的提问、审阅请求、阻塞或交接。',
    loadError: '无法加载收件箱。',
    acknowledgeError: '无法确认此收件箱条目。',
    acknowledging: '确认中…',
    acknowledge: '确认',
    openWorkRoom: '打开工作会话',
    source: '来源',
    risk: '风险',
    deadline: '截止 / 过期',
    itemStatus: '状态',
    responsibleHuman: '负责人',
    context: '上下文',
    currentHuman: '当前人类',
    inspectCanonical: '打开权威源以查看记录上下文。',
    notReported: '未提供',
    intentLabel: kind => ({ ask: '提问', answer: '回答', propose: '提议', decide: '决策', claim: '认领', handoff: '交接', blocker: '阻塞', review_request: '审阅请求', review_result: '审阅结果', status: '状态', inform: '通知' }[kind] ?? kind),
    feedbackTitle: '通知反馈',
    feedbackIntro: '偏好与投递结果分别由服务端持久化。',
    refresh: '刷新',
    noFeedbackTitle: '暂无投递反馈',
    noFeedbackHint: '协作请求仍会出现在上方的收件箱中。',
    preferencesTitle: '投递偏好',
    preferencesRevision: revision => `版本 ${revision}`,
    channels: '渠道',
    digest: '摘要',
    minimumPriority: '最低优先级',
    webhook: 'Webhook',
    webhookUnavailable: '不可用 / 已停用',
    webhookConfigured: '已配置（密钥已隐藏）',
    revisionFallback: '未知',
    credentialPending: '等待中',
    stateLoadingTitle: '正在加载协作信号',
    stateLoadingBody: '读取持久化的通知与偏好事实。',
    stateEmptyTitle: '暂无投递反馈',
    stateEmptyBody: '协作请求仍会出现在上方的收件箱中。',
    stateForbiddenTitle: '协作反馈不可访问',
    stateForbiddenBody: '当前人类 Session 没有读取这些事实的权限。',
    stateErrorTitle: '无法加载协作反馈',
    stateErrorBody: '重试权威读取；不会重放任何写入。',
    stateConflictTitle: '协作事实已变更',
    stateConflictBody: '在做出下一次决策前重新加载当前服务端事实。',
    stateExpiredTitle: '审批已过期',
    stateExpiredBody: '重新加载收件箱以查看持久化的当前状态。',
    stateReconnectingTitle: '正在重连持久化协作事实',
    stateReconnectingBody: '重连期间既有服务端事实保持可见。',
    preferencesLoadError: '无法加载通知偏好。',
    noDeliveryChannel: '未配置投递渠道',
    deliveryFailed: '投递失败。保存偏好不会让本次投递成功；重试仍由服务端控制。',
    deliveryRecordedError: '已记录错误',
    deliveryHealthLabel: title => `${title} 的投递状态`,
  },
  en: {
    title: 'Inbox',
    intro: 'Requests that require a human response or review.',
    status: 'Status',
    statusOpen: 'Open',
    statusResolved: 'Resolved',
    empty: 'No open asks, review requests, blockers, or handoffs.',
    loadError: 'Unable to load the Inbox.',
    acknowledgeError: 'Unable to acknowledge this Inbox item.',
    acknowledging: 'Acknowledging…',
    acknowledge: 'Acknowledge',
    openWorkRoom: 'Open Work Room',
    source: 'Source',
    risk: 'Risk',
    deadline: 'Deadline / expiry',
    itemStatus: 'Status',
    responsibleHuman: 'Responsible Human',
    context: 'Context',
    currentHuman: 'current Human',
    inspectCanonical: 'Inspect the canonical source.',
    notReported: 'not reported',
    intentLabel: kind => kind.replaceAll('_', ' '),
    feedbackTitle: 'Notification feedback',
    feedbackIntro: 'Preferences and delivery outcomes are separate server facts.',
    refresh: 'Refresh',
    noFeedbackTitle: 'No delivery feedback yet',
    noFeedbackHint: 'Collaboration requests still appear in the Inbox above.',
    preferencesTitle: 'Delivery preferences',
    preferencesRevision: revision => `Revision ${revision}`,
    channels: 'Channels',
    digest: 'Digest',
    minimumPriority: 'Minimum priority',
    webhook: 'Webhook',
    webhookUnavailable: 'Unavailable / disabled',
    webhookConfigured: 'Configured (secret hidden)',
    revisionFallback: 'unknown',
    credentialPending: 'Pending',
    stateLoadingTitle: 'Loading collaboration signals',
    stateLoadingBody: 'Reading durable notification and preference facts.',
    stateEmptyTitle: 'No delivery feedback yet',
    stateEmptyBody: 'Collaboration requests still appear in the Inbox above.',
    stateForbiddenTitle: 'Collaboration feedback is unavailable',
    stateForbiddenBody: 'This Human session is not authorized to read these facts.',
    stateErrorTitle: 'Unable to load collaboration feedback',
    stateErrorBody: 'Retry the canonical reads; no mutation will be replayed.',
    stateConflictTitle: 'Collaboration facts changed',
    stateConflictBody: 'Reload current server facts before making another decision.',
    stateExpiredTitle: 'The approval expired',
    stateExpiredBody: 'Reload the Inbox to see its durable current status.',
    stateReconnectingTitle: 'Reconnecting to durable collaboration facts',
    stateReconnectingBody: 'Existing server facts remain visible while the connection recovers.',
    preferencesLoadError: 'Unable to load notification preferences.',
    noDeliveryChannel: 'No delivery channel',
    deliveryFailed: 'Delivery failed. Saving preferences did not make this delivery successful; retry remains server-owned.',
    deliveryRecordedError: 'error recorded',
    deliveryHealthLabel: title => `Delivery health for ${title}`,
  },
}

export type SessionDetailCopy = {
  loading: string
  headerTitle: (id: string) => string
  compactTitle: string
  resume: string
  pause: string
  retry: string
  stop: string
  details: string
  factState: string
  factPrincipal: string
  factSession: string
  factCurrentStep: string
  factHeartbeat: string
  factBudget: string
  notReported: string
  maxRuntimeSeconds: (seconds: number) => string
  defaultPolicy: string
  promptTitle: string
  promptPlaceholder: string
  sendPrompt: string
  approvalInboxTitle: string
  approvalInboxEmpty: string
  approvalExpires: (date: string) => string
  approvalRisk: (level: string) => string
  approve: string
  reject: string
  planVersionsTitle: string
  planCurrent: string
  planCompareWith: string
  planNoPlan: string
  planStepChangedTitle: (from: number, to: number) => string
  planAdded: (title: string) => string
  planRemoved: (title: string) => string
  planChanged: (previous: string, status: string) => string
  planRenamed: (previous: string, next: string) => string
  acceptanceCriteria: (criteria: string) => string
  activityTitle: string
  showHeartbeats: string
  activityFilterAll: string
  activityFilterActions: string
  activityFilterQuestions: string
  activityFilterEvidence: string
  activityFilterErrors: string
  activityEmpty: string
  activityTool: (tool: string, status: string) => string
  artifactsTitle: string
  artifactsEmpty: string
  loadError: string
  updateError: string
  promptError: string
  decideError: string
  retryError: string
  loadMoreApprovals: string
  loadMorePlans: string
  loadMoreActivities: string
  loadMoreArtifacts: string
  planStepStatus: (status: string) => string
  activityKind: (kind: string) => string
}

const sessionDetailCopies: Record<Locale, SessionDetailCopy> = {
  'zh-CN': {
    loading: '正在加载智能体 Session…',
    headerTitle: id => `Session ${id}`,
    compactTitle: '智能体执行',
    resume: '继续',
    pause: '暂停',
    retry: '重试',
    stop: '停止',
    details: '详情',
    factState: '状态',
    factPrincipal: '负责人类',
    factSession: 'Session',
    factCurrentStep: '当前步骤',
    factHeartbeat: '心跳',
    factBudget: '预算',
    notReported: '未提供',
    maxRuntimeSeconds: seconds => `${seconds}s 最大运行时长`,
    defaultPolicy: '默认策略',
    promptTitle: '向智能体发送指令',
    promptPlaceholder: '给智能体补充上下文或方向',
    sendPrompt: '发送指令',
    approvalInboxTitle: '审批收件箱',
    approvalInboxEmpty: '暂无待处理审批。',
    approvalExpires: date => `${date} 过期`,
    approvalRisk: level => `${level} 级风险`,
    approve: '通过',
    reject: '驳回',
    planVersionsTitle: '计划版本',
    planCurrent: '当前',
    planCompareWith: '对比',
    planNoPlan: '尚未发布计划。',
    planStepChangedTitle: (from, to) => `v${from} 与 v${to} 之间没有步骤变化。`,
    planAdded: title => `已新增：${title}`,
    planRemoved: title => `已删除：${title}`,
    planChanged: (previous, status) => `已变更：${previous} · 状态 ${status}`,
    planRenamed: (previous, next) => `已重命名：${previous} → ${next}`,
    acceptanceCriteria: criteria => `验收标准：${criteria}`,
    activityTitle: '活动',
    showHeartbeats: '显示心跳',
    activityFilterAll: '全部',
    activityFilterActions: '动作',
    activityFilterQuestions: '提问',
    activityFilterEvidence: '证据',
    activityFilterErrors: '错误',
    activityEmpty: '暂无匹配活动。心跳默认隐藏。',
    activityTool: (tool, status) => `工具：${tool} · ${status}`,
    artifactsTitle: '制品与证据',
    artifactsEmpty: '尚未发布制品。',
    loadError: '无法加载此 Session。',
    updateError: '无法更新此 Session。',
    promptError: '无法发送指令。',
    decideError: '无法处理审批。',
    retryError: '无法重试此 Session。',
    loadMoreApprovals: '加载更多审批',
    loadMorePlans: '加载更多计划',
    loadMoreActivities: '加载更多活动',
    loadMoreArtifacts: '加载更多制品',
    planStepStatus: status => status.replaceAll('_', ' '),
    activityKind: kind => kind.replaceAll('_', ' '),
  },
  en: {
    loading: 'Loading agent session…',
    headerTitle: id => `Session ${id}`,
    compactTitle: 'Agent execution',
    resume: 'Resume',
    pause: 'Pause',
    retry: 'Retry',
    stop: 'Stop',
    details: 'Details',
    factState: 'State',
    factPrincipal: 'Principal Human',
    factSession: 'Session',
    factCurrentStep: 'Current step',
    factHeartbeat: 'Heartbeat',
    factBudget: 'Budget',
    notReported: 'Not reported',
    maxRuntimeSeconds: seconds => `${seconds}s max runtime`,
    defaultPolicy: 'Default policy',
    promptTitle: 'Prompt the agent',
    promptPlaceholder: 'Give the agent additional context or direction',
    sendPrompt: 'Send prompt',
    approvalInboxTitle: 'Approval inbox',
    approvalInboxEmpty: 'No pending approvals.',
    approvalExpires: date => `Expires ${date}`,
    approvalRisk: level => `${level} risk`,
    approve: 'Approve',
    reject: 'Reject',
    planVersionsTitle: 'Plan versions',
    planCurrent: 'Current',
    planCompareWith: 'Compare with',
    planNoPlan: 'No plan has been published.',
    planStepChangedTitle: (from, to) => `No step changes between v${from} and v${to}.`,
    planAdded: title => `Added: ${title}`,
    planRemoved: title => `Removed: ${title}`,
    planChanged: (previous, status) => `Changed: ${previous} · ${status}`,
    planRenamed: (previous, next) => `Renamed: ${previous} → ${next}`,
    acceptanceCriteria: criteria => `Acceptance: ${criteria}`,
    activityTitle: 'Activity',
    showHeartbeats: 'Show heartbeats',
    activityFilterAll: 'All',
    activityFilterActions: 'Actions',
    activityFilterQuestions: 'Questions',
    activityFilterEvidence: 'Evidence',
    activityFilterErrors: 'Errors',
    activityEmpty: 'No matching activity. Heartbeats are hidden by default.',
    activityTool: (tool, status) => `Tool: ${tool} · ${status}`,
    artifactsTitle: 'Artifacts & evidence',
    artifactsEmpty: 'No artifacts published yet.',
    loadError: 'Unable to load this session.',
    updateError: 'Unable to update this session.',
    promptError: 'Unable to send prompt.',
    decideError: 'Unable to decide approval.',
    retryError: 'Unable to retry this session.',
    loadMoreApprovals: 'Load more approvals',
    loadMorePlans: 'Load more plan versions',
    loadMoreActivities: 'Load more activities',
    loadMoreArtifacts: 'Load more artifacts',
    planStepStatus: status => status.replaceAll('_', ' '),
    activityKind: kind => kind.replaceAll('_', ' '),
  },
}

export type AgentWorkCopy = {
  liveAgents: string
  liveAgentsHint: string
  delegate: string
  delegateUnavailableReason: (reason: string) => string
  delegateFormAgent: string
  delegateFormAgentPlaceholder: string
  delegateFormInitialPrompt: string
  delegateFormInitialPromptPlaceholder: string
  delegateFormStart: string
  oneClickDelegate: string
  oneClickPrompt: (title: string) => string
  forceAssign: string
  forcedAssignmentPolicy: string
  replacementHint: (agent: string) => string
  advancedOptions: string
  chooseAgent: string
  openAgents: string
  reloadIssue: string
  errorCode: (code: string) => string
  capacitySummary: (active: string, max: string, states: string) => string
  diagnosticId: (id: string) => string
  delegateSuccess: (agent: string, state: string) => string
  noResponsible: string
  refresh: string
  noSessions: string
  loadingSessions: string
  blockingReasonMissing: string
  heartbeat: (date: string) => string
  resume: string
  pause: string
  retry: string
  stop: string
  details: string
  availableAgentsLabel: string
  workItemSessionsLabel: string
  updateError: string
  delegateError: string
  retryError: string
  noActiveAgents: string
  noActiveGrant: string
  missingExecutionCapabilities: string
  projectionCurrentStep: string
  projectionPendingApprovals: string
  projectionStatus: string
  projectionFailedHint: string
  capabilitiesLine: (provider: string, capabilities: string) => string
  notReported: string
  unavail: (reason: string) => string
  badgeAria: (state: string) => string
  projectionFailedStatus: string
}

const agentWorkCopies: Record<Locale, AgentWorkCopy> = {
  'zh-CN': {
    liveAgents: '在线智能体',
    liveAgentsHint: 'Session 从持久化服务端状态刷新。',
    delegate: '委派',
    delegateUnavailableReason: reason => `无可用智能体：${reason}`,
    delegateFormAgent: '智能体',
    delegateFormAgentPlaceholder: '选择本团队已批准的智能体',
    delegateFormInitialPrompt: '初始指令',
    delegateFormInitialPromptPlaceholder: '该智能体应当做什么？',
    delegateFormStart: '启动 Session',
    oneClickDelegate: '一键强制委派',
    oneClickPrompt: title => `请接手这个 Issue${title ? `“${title}”` : ''}，先检查上下文和验收条件，然后推进到可交付状态。`,
    forceAssign: '强制分配并启动',
    forcedAssignmentPolicy: '人类委派始终是强制任务分配，会替换已有智能体分配；未被委派的 Issue 可由智能体自行接手。',
    replacementHint: agent => `当前任务已分配给 ${agent}；强制委派会结束其仍在运行的执行，并由你选择的智能体接手。`,
    advancedOptions: '高级配置',
    chooseAgent: '选择强制委派智能体',
    openAgents: '打开智能体管理',
    reloadIssue: '重新加载 Issue',
    errorCode: code => `错误 ${code}`,
    capacitySummary: (active, max, states) => `执行容量：${active}/${max}${states ? `（${states}）` : ''}`,
    diagnosticId: id => `诊断 ID：${id}`,
    delegateSuccess: (agent, state) => `已将任务交给 ${agent}，Session 当前为 ${state}。`,
    noResponsible: '请先设置人类负责人；负责人对结果负责，智能体负责执行。',
    refresh: '刷新状态',
    noSessions: '尚未委派任何智能体 Session。',
    loadingSessions: '正在加载智能体执行记录…',
    blockingReasonMissing: '未报告阻塞原因。',
    heartbeat: date => `心跳：${date}`,
    resume: '继续',
    pause: '暂停',
    retry: '重试',
    stop: '停止',
    details: '详情',
    availableAgentsLabel: '加载更多智能体',
    workItemSessionsLabel: '加载更多 Session',
    updateError: '无法更新 Session。',
    delegateError: '无法委派工作。',
    retryError: '无法重试此 Session。',
    noActiveAgents: '没有已注册的活跃智能体。',
    noActiveGrant: '没有智能体对本 Issue 团队持有活跃授权。',
    missingExecutionCapabilities: '智能体需要同时获批 work:read 与 work:write。',
    projectionCurrentStep: '当前计划步骤',
    projectionPendingApprovals: '待处理审批',
    projectionStatus: '预测状态',
    projectionFailedHint: '计划或审批预测不可用，请打开详情页重试。',
    capabilitiesLine: (provider, capabilities) => `${provider} · ${capabilities}`,
    notReported: '未提供',
    unavail: reason => `不可用：${reason}`,
    badgeAria: state => `智能体 Session 状态：${state}`,
    projectionFailedStatus: '预测失败',
  },
  en: {
    liveAgents: 'Live agents',
    liveAgentsHint: 'Sessions are refreshed from durable server state.',
    delegate: 'Delegate',
    delegateUnavailableReason: reason => `No delegatable agent: ${reason}`,
    delegateFormAgent: 'Agent',
    delegateFormAgentPlaceholder: 'Choose an agent approved for this team',
    delegateFormInitialPrompt: 'Initial prompt',
    delegateFormInitialPromptPlaceholder: 'What should this agent do?',
    delegateFormStart: 'Start session',
    oneClickDelegate: 'Force assign now',
    oneClickPrompt: title => `Take over this Issue${title ? ` “${title}”` : ''}, review its context and acceptance criteria, then move it toward a deliverable state.`,
    forceAssign: 'Force assign and start',
    forcedAssignmentPolicy: 'Human delegation is always a forced assignment and replaces any existing Agent assignment. Unassigned Issues remain available for agents to claim.',
    replacementHint: agent => `This Issue is assigned to ${agent}. Force assignment ends any non-terminal execution and hands the Issue to the Agent you choose.`,
    advancedOptions: 'Advanced options',
    chooseAgent: 'Choose an Agent to force assign',
    openAgents: 'Open Agent management',
    reloadIssue: 'Reload Issue',
    errorCode: code => `Error ${code}`,
    capacitySummary: (active, max, states) => `Execution capacity: ${active}/${max}${states ? ` (${states})` : ''}`,
    diagnosticId: id => `Diagnostic ID: ${id}`,
    delegateSuccess: (agent, state) => `Assigned to ${agent}; the session is ${state}.`,
    noResponsible: 'Set a responsible Human first. The Human owns the outcome; the Agent owns execution.',
    refresh: 'Refresh status',
    noSessions: 'No delegated agent session yet.',
    loadingSessions: 'Loading agent executions…',
    blockingReasonMissing: 'No blocking reason reported.',
    heartbeat: date => `Heartbeat: ${date}`,
    resume: 'Resume',
    pause: 'Pause',
    retry: 'Retry',
    stop: 'Stop',
    details: 'Details',
    availableAgentsLabel: 'available agents',
    workItemSessionsLabel: 'work item sessions',
    updateError: 'Unable to update session.',
    delegateError: 'Unable to delegate work.',
    retryError: 'Unable to retry this session.',
    noActiveAgents: 'No active agents are registered.',
    noActiveGrant: 'No active grant for this team',
    missingExecutionCapabilities: 'The Agent requires both work:read and work:write approval.',
    projectionCurrentStep: 'Current plan step',
    projectionPendingApprovals: 'Pending approvals',
    projectionStatus: 'Projection status',
    projectionFailedHint: 'Plan or approval projection unavailable. Open Details to retry.',
    capabilitiesLine: (provider, capabilities) => `${provider} · ${capabilities}`,
    notReported: 'Not reported',
    unavail: reason => reason,
    badgeAria: state => `Agent session ${state}`,
    projectionFailedStatus: 'Projection failed',
  },
}

export type RelationsCopy = {
  eyebrow: string
  title: string
  empty: string
  related: string
  blocks: string
  blockedBy: string
  remove: string
  fieldKind: string
  kindBlocks: string
  kindRelated: string
  fieldWorkItem: string
  fieldWorkItemPlaceholder: string
  add: string
  loadMore: string
  reload: string
  conflictTitle: string
  conflictAction: string
}

const relationsCopies: Record<Locale, RelationsCopy> = {
  'zh-CN': {
    eyebrow: '依赖',
    title: '阻塞与关联工作',
    empty: '暂无阻塞或关联 Work Item。',
    related: '关联到',
    blocks: '阻塞',
    blockedBy: '被阻塞于',
    remove: '移除',
    fieldKind: '关系',
    kindBlocks: '阻塞',
    kindRelated: '关联',
    fieldWorkItem: 'Work Item',
    fieldWorkItemPlaceholder: '选择 Work Item',
    add: '添加关系',
    loadMore: '加载更多关系',
    reload: '重新加载关系',
    conflictTitle: '关系已变更',
    conflictAction: '服务端已写入新版本，重新加载后重试。',
  },
  en: {
    eyebrow: 'Dependencies',
    title: 'Blockers and related work',
    empty: 'No blockers or related Work Items.',
    related: 'Related to',
    blocks: 'Blocks',
    blockedBy: 'Blocked by',
    remove: 'Remove',
    fieldKind: 'Relationship',
    kindBlocks: 'Blocks',
    kindRelated: 'Related',
    fieldWorkItem: 'Work Item',
    fieldWorkItemPlaceholder: 'Select Work Item',
    add: 'Add relationship',
    loadMore: 'Load more relations',
    reload: 'Reload relations',
    conflictTitle: 'Relations changed',
    conflictAction: 'A newer version was written server-side. Reload to continue.',
  },
}

export type EvidenceCopy = {
  metaTitle: string
  eyebrow: string
  title: string
  intro: string
  nav: string
  conflict: string
  expired: string
  returnHome: string
  navAria: string
}

const evidenceCopies: Record<Locale, EvidenceCopy> = {
  'zh-CN': {
    metaTitle: '协作状态证据 · WorkMesh',
    eyebrow: '只读证据夹具',
    title: '协作状态展示',
    intro: '此未链接页面仅用于模拟展示。它不会发送任何服务端请求或写入，也不代表真实的服务端故障。',
    nav: '协作证据状态',
    conflict: '冲突',
    expired: '过期',
    returnHome: '返回 WorkMesh',
    navAria: '协作证据状态',
  },
  en: {
    metaTitle: 'Collaboration state evidence · WorkMesh',
    eyebrow: 'Read-only evidence fixture',
    title: 'Collaboration state presentation',
    intro: 'This unlinked page simulates presentation only. It performs no server request or mutation and does not claim that a real server fault occurred.',
    nav: 'Collaboration evidence states',
    conflict: 'Conflict',
    expired: 'Expired',
    returnHome: 'Return to WorkMesh',
    navAria: 'Collaboration evidence states',
  },
}

export type ProjectDeliveryHealthLabel = (state: string) => string

const projectDeliveryHealthLabels: Record<Locale, ProjectDeliveryHealthLabel> = {
  'zh-CN': state => ({ on_track: '进展顺利', at_risk: '存在风险', off_track: '已偏离轨道' }[state] ?? state),
  en: state => ({ on_track: 'on track', at_risk: 'at risk', off_track: 'off track' }[state] ?? state),
}

// Work Room copy (apps/web/app/work-room.tsx) covers the SessionTree,
// LeaseCard, HandoffCard, DecisionCard, and the main WorkRoom panel.
export type WorkRoomCopy = {
  // Page-level chrome
  title: string
  intro: string
  refresh: string
  loadError: string
  decisionsLoadError: string
  sendError: string
  resolveError: string
  forceReleaseError: string
  handoffActionError: string
  decisionActionError: string
  sessionControlError: string
  notReported: string
  unknownActor: string
  unknownHolder: string
  resourceNotReported: string
  // Summary stats
  agentParticipants: string
  principalHumans: string
  sessionsStat: string
  pendingResponses: string
  evidenceStat: string
  decisionsHandoffs: string
  noneReported: string
  // Tabs
  tabAria: string
  tabConversation: string
  tabPlan: string
  tabActivity: string
  tabArtifacts: string
  tabDecisions: string
  tabSessions: string
  // Message form
  messageIntentLabel: string
  messageIntentComment: string
  messageIntentAsk: string
  messageIntentAnswer: string
  messageIntentReviewRequest: string
  messageIntentBlocker: string
  messageIntentHandoff: string
  messageBodyLabel: string
  messageBodyPlaceholder: string
  messageSend: string
  noTimeline: string
  roomUnavailable: string
  // Session tree
  sessionTreeAria: string
  sessionTreeTitle: string
  sessionTreeEmpty: string
  sessionStatePlanAttached: string
  sessionStateNoPlan: string
  sessionStateHeartbeat: string
  sessionStateBudget: string
  sessionStateBudgetDefault: string
  sessionActionInterrupt: string
  sessionActionStop: string
  sessionInterruptReason: string
  sessionStopReason: string
  sessionInterruptMessage: string
  // Lease card
  leaseTitle: string
  leaseConflictTitle: string
  leaseHolderAgent: string
  leaseSession: string
  leasePlanStep: string
  leaseExpires: string
  leaseConflictHint: string
  leaseRefresh: string
  leaseForceRelease: string
  leaseForceReleaseConfirm: string
  leaseForceReleaseReason: string
  // Handoff card
  handoffTitle: string
  handoffSummaryMissing: string
  handoffRequestedAction: string
  handoffTo: string
  handoffScope: string
  handoffContextSnapshot: string
  handoffArtifacts: string
  handoffLeasePolicy: string
  handoffRouting: string
  selectedLabel: string
  handoffRoutingCandidates: (count: number) => string
  handoffRejection: string
  handoffCompletedWork: string
  handoffRemainingWork: string
  handoffOpenQuestions: string
  handoffRisks: string
  handoffAcceptanceCriteria: string
  handoffRequest: string
  handoffAccept: string
  handoffReject: string
  handoffCancel: string
  handoffComplete: string
  handoffAcceptReason: string
  handoffRejectReason: string
  handoffCancelReason: string
  handoffCompleteReason: string
  // Decision card
  decisionTitle: string
  decisionFinal: string
  decisionProposal: string
  decisionQuestionMissing: string
  decisionSelected: string
  decisionRationale: string
  decisionProposedBy: string
  decisionFinalizedBy: string
  decisionAffected: string
  decisionLineage: string
  decisionFinalize: string
  decisionSupersede: string
  decisionReverse: string
  decisionSupersedeReason: string
  // Activity / Artifacts tabs
  activityAria: string
  activityFilterSession: string
  activityFilterAll: string
  activityShowHeartbeats: string
  activityEmpty: string
  artifactsAria: string
  artifactsEmpty: string
  artifactsAttribution: string
  artifactAttachments: WorkItemArtifactsCopy
  // Plans tab
  planAria: string
  planEmpty: string
  planStepFallback: string
  planOwner: string
  planDependencies: string
  planRequired: string
  planAssignment: string
  planClaim: string
  planStepComment: string
  // Decisions tab
  decisionsEmpty: string
  // Sessions tab
  leasesEmpty: string
  // Legacy comments
  legacyAria: string
  legacyEditPrompt: string
  legacyReopen: string
  legacyResolve: string
  legacyDelete: string
  legacyDeleteConfirm: string
  legacyPostComment: string
  legacyReplyPlaceholder: string
  legacyReply: string
  legacyMentioned: string
  legacyMentionLabel: string
  legacyHuman: string
  resolved: string
  open: string
  // Timeline card
  timelineActor: string
  timelineIntent: string
  timelineSession: string
  timelinePlanStep: string
  timelineBodyMissing: string
  timelineContextDelta: string
  timelineContextDeltaBase: string
  timelineContextDeltaNew: string
  timelineContextDeltaHash: string
  timelineContextDeltaAddedBy: string
  timelineContextDeltaSource: string
  timelineContextDeltaSourceFallback: string
  timelineContextDeltaHashFallback: string
  timelineResolveRequest: string
  // Agent message controls
  viewSession: string
  agentPrompt: string
  agentPromptPlaceholder: string
  agentPause: string
  agentStop: string
  agentPauseReason: string
  agentStopReason: string
  // Empty / loading strings
  notFinalized: string
  notSelected: string
  notClaimed: string
  unassigned: string
  noMessage: string
  noQuestion: string
  noHandoffSummary: string
  noArtifacts: string
  none: string
}

const workRoomCopies: Record<Locale, WorkRoomCopy> = {
  'zh-CN': {
    title: 'Work Room',
    intro: '持久、人类可见的协作状态。智能体之间的消息从不隐藏。',
    refresh: '刷新',
    loadError: '无法加载 Work Room。',
    decisionsLoadError: '无法加载决策。',
    sendError: '无法发送消息。',
    resolveError: '无法解决该消息。',
    forceReleaseError: '无法强制释放租约。',
    handoffActionError: '无法更新交接。',
    decisionActionError: '无法更新决策。',
    sessionControlError: '无法控制该智能体执行。',
    notReported: '未上报',
    unknownActor: '未知参与者',
    unknownHolder: '未知持有者',
    resourceNotReported: '资源未上报',
    agentParticipants: '参与的智能体',
    principalHumans: '责任人类',
    sessionsStat: 'Sessions',
    pendingResponses: '待回复',
    evidenceStat: '证据',
    decisionsHandoffs: '决策 / 交接',
    noneReported: '未上报',
    tabAria: 'Work Room 标签',
    tabConversation: '会话',
    tabPlan: '计划',
    tabActivity: '活动',
    tabArtifacts: '证据',
    tabDecisions: '决策',
    tabSessions: 'Sessions',
    messageIntentLabel: '消息意图',
    messageIntentComment: '评论',
    messageIntentAsk: '提问',
    messageIntentAnswer: '回答',
    messageIntentReviewRequest: '请求评审',
    messageIntentBlocker: '阻塞',
    messageIntentHandoff: '交接',
    messageBodyLabel: '消息',
    messageBodyPlaceholder: '编写人类可见的协作消息',
    messageSend: '发送消息',
    noTimeline: '暂无人类或智能体消息。',
    roomUnavailable: '本服务的 Work Room API 不可用；已回退到 REST v1 Work Item 评论。',
    sessionTreeAria: 'Session 树',
    sessionTreeTitle: 'Session 树',
    sessionTreeEmpty: '本 Work Item 还没有任何智能体执行。',
    sessionStatePlanAttached: '已附加计划',
    sessionStateNoPlan: '无计划',
    sessionStateHeartbeat: '心跳',
    sessionStateBudget: '预算',
    sessionStateBudgetDefault: '策略默认',
    sessionActionInterrupt: '中断',
    sessionActionStop: '停止',
    sessionInterruptReason: '人类在 Work Room 中要求中断 agent-to-agent 通信。',
    sessionStopReason: '人类在 Work Room 中停止了该 Session。',
    sessionInterruptMessage: '人类中断了 Session {id}。',
    leaseTitle: '租约',
    leaseConflictTitle: '租约冲突',
    leaseHolderAgent: '持有智能体',
    leaseSession: 'Session',
    leasePlanStep: '计划步骤',
    leaseExpires: '过期时间',
    leaseConflictHint: '该资源当前被另一个活跃 Session 持有。刷新以在过期后重试认领。',
    leaseRefresh: '刷新 / 重试',
    leaseForceRelease: '强制释放',
    leaseForceReleaseConfirm: '强制释放该租约？可能中断另一个智能体 Session。',
    leaseForceReleaseReason: '人类在 Work Room 中强制释放。',
    handoffTitle: '交接',
    handoffSummaryMissing: '未上报交接摘要。',
    handoffRequestedAction: '请求的操作',
    handoffTo: '接收方',
    handoffScope: '范围',
    handoffContextSnapshot: '上下文快照',
    handoffArtifacts: '证据',
    handoffLeasePolicy: '租约策略',
    handoffRouting: '路由',
    selectedLabel: '已选择',
    handoffRoutingCandidates: (count) => `从 ${count} 个候选中选中。`,
    handoffRejection: '拒绝原因',
    handoffCompletedWork: '已完成的工作',
    handoffRemainingWork: '剩余工作',
    handoffOpenQuestions: '未决问题',
    handoffRisks: '风险',
    handoffAcceptanceCriteria: '验收标准',
    handoffRequest: '请求交接',
    handoffAccept: '接受',
    handoffReject: '拒绝',
    handoffCancel: '取消',
    handoffComplete: '完成交接',
    handoffAcceptReason: '人类在 Work Room 中接受交接。',
    handoffRejectReason: '人类在 Work Room 中拒绝交接。',
    handoffCancelReason: '人类在 Work Room 中取消交接。',
    handoffCompleteReason: '人类在 Work Room 中完成交接。',
    decisionTitle: '决策',
    decisionFinal: '人类定稿',
    decisionProposal: '智能体提案',
    decisionQuestionMissing: '未记录问题。',
    decisionSelected: '选定',
    decisionRationale: '理由',
    decisionProposedBy: '提案方',
    decisionFinalizedBy: '定稿方',
    decisionAffected: '影响的资源',
    decisionLineage: '决策谱系',
    decisionFinalize: '由人类定稿',
    decisionSupersede: '取代',
    decisionReverse: '撤销',
    decisionSupersedeReason: '人类在 Work Room 中取代该决策。',
    activityAria: '协作活动',
    activityFilterSession: 'Session',
    activityFilterAll: '全部 Sessions',
    activityShowHeartbeats: '显示心跳',
    activityEmpty: '没有匹配的活动。默认折叠心跳。',
    artifactsAria: '证据与上下文增量',
    artifactsEmpty: '暂无智能体证据或上下文增量。',
    artifactsAttribution: '证据归属于对应的人类或智能体、确切 Session 以及适用的计划步骤。',
    artifactAttachments: {
      ariaLabel: 'Work Item 附件',
      title: '附件',
      provenance: '文件不可变，并保留其人类或智能体来源。',
      attachFile: '附加文件',
      inputLabel: '选择要附加的文件',
      cancel: '取消',
      retryUpload: '重试上传',
      cancelUpload: '取消上传',
      formatBytes: bytes => `${bytes} 字节`,
      empty: '暂无附件。',
      fileFallback: '文件',
      verificationTimedOut: '上传验证超时。',
      loadErrorFallback: '无法加载附件。',
      objectUploadFailed: status => `对象上传失败（${status}）。`,
      uploadStatusError: status => `上传未通过验证（${status}）。`,
      uploadErrorFallback: '上传失败。',
      cancelErrorFallback: '无法取消上传。',
      phases: { preparing: '准备', uploading: '上传', verifying: '验证' },
      phaseAnnouncement: phase => `正在${phase}附件…`,
    },
    planAria: '计划归属与依赖',
    planEmpty: '暂无已发布的计划步骤分配或认领。',
    planStepFallback: '计划步骤',
    planOwner: '负责人',
    planDependencies: '依赖',
    planRequired: '需要',
    planAssignment: '分配',
    planClaim: '认领',
    planStepComment: '步骤备注',
    decisionsEmpty: '暂无决策记录。',
    leasesEmpty: '暂无活跃或冲突的租约。',
    legacyAria: '旧版评论控件',
    legacyEditPrompt: '编辑评论',
    legacyReopen: '重新打开',
    legacyResolve: '解决',
    legacyDelete: '删除',
    legacyDeleteConfirm: '软删除该评论？',
    legacyPostComment: '发布评论',
    legacyReplyPlaceholder: '回复',
    legacyReply: '回复',
    legacyMentioned: '提及',
    legacyMentionLabel: '提及人员',
    legacyHuman: '人类',
    resolved: '已解决',
    open: '待处理',
    timelineActor: '参与者',
    timelineIntent: '意图',
    timelineSession: 'Session',
    timelinePlanStep: '计划步骤',
    timelineBodyMissing: '未记录消息正文。',
    timelineContextDelta: '上下文增量',
    timelineContextDeltaBase: '基线快照',
    timelineContextDeltaNew: '新快照',
    timelineContextDeltaHash: '增量哈希',
    timelineContextDeltaAddedBy: '添加人',
    timelineContextDeltaSource: '来源',
    timelineContextDeltaSourceFallback: '来源',
    timelineContextDeltaHashFallback: '哈希未上报',
    timelineResolveRequest: '解决请求',
    viewSession: '查看 Session',
    agentPrompt: '提示',
    agentPromptPlaceholder: '提示该智能体',
    agentPause: '暂停',
    agentStop: '停止',
    agentPauseReason: '人类在 Work Room 中中断了 agent-to-agent 通信。',
    agentStopReason: '人类在 Work Room 中停止了 agent-to-agent 通信。',
    notFinalized: '未定稿',
    notSelected: '未选择',
    notClaimed: '未认领',
    unassigned: '未分配',
    noMessage: '暂无消息。',
    noQuestion: '未记录问题。',
    noHandoffSummary: '未上报交接摘要。',
    noArtifacts: '无',
    none: '无',
  },
  en: {
    title: 'Work Room',
    intro: 'Durable, human-visible collaboration state. Agent-to-agent messages are never hidden.',
    refresh: 'Refresh',
    loadError: 'Unable to load the Work Room.',
    decisionsLoadError: 'Unable to load decisions.',
    sendError: 'Unable to send message.',
    resolveError: 'Unable to resolve the message.',
    forceReleaseError: 'Unable to force release lease.',
    handoffActionError: 'Unable to update handoff.',
    decisionActionError: 'Unable to update decision.',
    sessionControlError: 'Unable to control this agent session.',
    notReported: 'not reported',
    unknownActor: 'Unknown actor',
    unknownHolder: 'Unknown holder',
    resourceNotReported: 'Resource not reported',
    agentParticipants: 'Agent participants',
    principalHumans: 'Principal Humans',
    sessionsStat: 'Sessions',
    pendingResponses: 'Pending responses',
    evidenceStat: 'Evidence',
    decisionsHandoffs: 'Decisions / handoffs',
    noneReported: 'None reported',
    tabAria: 'Work Room tabs',
    tabConversation: 'Conversation',
    tabPlan: 'Plan',
    tabActivity: 'Activity',
    tabArtifacts: 'Artifacts',
    tabDecisions: 'Decisions',
    tabSessions: 'Sessions',
    messageIntentLabel: 'Message intent',
    messageIntentComment: 'Comment',
    messageIntentAsk: 'Ask',
    messageIntentAnswer: 'Answer',
    messageIntentReviewRequest: 'Review request',
    messageIntentBlocker: 'Blocker',
    messageIntentHandoff: 'Handoff',
    messageBodyLabel: 'Message',
    messageBodyPlaceholder: 'Write a human-visible collaboration message',
    messageSend: 'Send typed message',
    noTimeline: 'No human or agent messages yet.',
    roomUnavailable: 'The Work Room API is unavailable on this server; showing the REST v1 compatible Work Item comments fallback.',
    sessionTreeAria: 'Session tree',
    sessionTreeTitle: 'Session tree',
    sessionTreeEmpty: 'No agent session is attached to this work item.',
    sessionStatePlanAttached: 'Plan attached',
    sessionStateNoPlan: 'No plan',
    sessionStateHeartbeat: 'Heartbeat',
    sessionStateBudget: 'Budget',
    sessionStateBudgetDefault: 'policy default',
    sessionActionInterrupt: 'Interrupt',
    sessionActionStop: 'Stop',
    sessionInterruptReason: 'Human interrupted agent-to-agent communication from the Work Room.',
    sessionStopReason: 'Human stopped the session from the Work Room.',
    sessionInterruptMessage: 'Human interrupted session {id}.',
    leaseTitle: 'Lease',
    leaseConflictTitle: 'Lease conflict',
    leaseHolderAgent: 'Holder agent',
    leaseSession: 'Session',
    leasePlanStep: 'Plan step',
    leaseExpires: 'Expires',
    leaseConflictHint: 'This resource is currently held by another active session. Refresh to retry the claim after expiry.',
    leaseRefresh: 'Refresh / retry',
    leaseForceRelease: 'Force release',
    leaseForceReleaseConfirm: 'Force release this lease? This may interrupt another agent session.',
    leaseForceReleaseReason: 'Human force released from Work Room.',
    handoffTitle: 'Handoff',
    handoffSummaryMissing: 'No handoff summary reported.',
    handoffRequestedAction: 'Requested action',
    handoffTo: 'To',
    handoffScope: 'Scope',
    handoffContextSnapshot: 'Context snapshot',
    handoffArtifacts: 'Artifacts',
    handoffLeasePolicy: 'Lease policy',
    handoffRouting: 'Routing',
    selectedLabel: 'selected',
    handoffRoutingCandidates: (count) => `selected from ${count} eligible candidates.`,
    handoffRejection: 'Rejection reason',
    handoffCompletedWork: 'Completed work',
    handoffRemainingWork: 'Remaining work',
    handoffOpenQuestions: 'Open questions',
    handoffRisks: 'Risks',
    handoffAcceptanceCriteria: 'Acceptance criteria',
    handoffRequest: 'Request handoff',
    handoffAccept: 'Accept',
    handoffReject: 'Reject',
    handoffCancel: 'Cancel',
    handoffComplete: 'Complete handoff',
    handoffAcceptReason: 'Human accepted the handoff from the Work Room.',
    handoffRejectReason: 'Human rejected the handoff from the Work Room.',
    handoffCancelReason: 'Human cancelled the handoff from the Work Room.',
    handoffCompleteReason: 'Human completed the handoff from the Work Room.',
    decisionTitle: 'Decision',
    decisionFinal: 'Human final',
    decisionProposal: 'Agent proposal',
    decisionQuestionMissing: 'No question recorded.',
    decisionSelected: 'Decision',
    decisionRationale: 'Rationale',
    decisionProposedBy: 'Proposed by',
    decisionFinalizedBy: 'Finalized by',
    decisionAffected: 'Affected resources',
    decisionLineage: 'Decision lineage',
    decisionFinalize: 'Finalize as human',
    decisionSupersede: 'Supersede',
    decisionReverse: 'Reverse',
    decisionSupersedeReason: 'Human superseded this decision from the Work Room.',
    activityAria: 'Collaboration activity',
    activityFilterSession: 'Session',
    activityFilterAll: 'All sessions',
    activityShowHeartbeats: 'Show heartbeats',
    activityEmpty: 'No matching activity. Heartbeats are collapsed by default.',
    artifactsAria: 'Artifacts and context deltas',
    artifactsEmpty: 'No Agent artifacts or context deltas recorded yet.',
    artifactsAttribution: 'Artifacts are attributed to the Human or Agent, exact session, and plan-step when applicable.',
    artifactAttachments: {
      ariaLabel: 'Work Item attachments',
      title: 'Attachments',
      provenance: 'Files remain immutable and keep their Human or Agent provenance.',
      attachFile: 'Attach file',
      inputLabel: 'Choose a file to attach',
      cancel: 'Cancel',
      retryUpload: 'Retry upload',
      cancelUpload: 'Cancel upload',
      formatBytes: bytes => `${bytes} bytes`,
      empty: 'No attachments yet.',
      fileFallback: 'file',
      verificationTimedOut: 'Upload verification timed out.',
      loadErrorFallback: 'Unable to load attachments.',
      objectUploadFailed: status => `Object upload failed (${status}).`,
      uploadStatusError: status => `Upload did not verify (${status}).`,
      uploadErrorFallback: 'Upload failed.',
      cancelErrorFallback: 'Unable to cancel upload.',
      phases: { preparing: 'Preparing', uploading: 'Uploading', verifying: 'Verifying' },
      phaseAnnouncement: phase => `${phase} attachment…`,
    },
    planAria: 'Plan ownership and dependencies',
    planEmpty: 'No published plan-step assignments or claims yet.',
    planStepFallback: 'Plan step',
    planOwner: 'Owner',
    planDependencies: 'Dependencies',
    planRequired: 'Required',
    planAssignment: 'Assignment',
    planClaim: 'Claim',
    planStepComment: 'Step comment',
    decisionsEmpty: 'No decisions recorded yet.',
    leasesEmpty: 'No active or conflicting leases.',
    legacyAria: 'Work item comment',
    legacyEditPrompt: 'Edit comment',
    legacyReopen: 'Reopen',
    legacyResolve: 'Resolve',
    legacyDelete: 'Delete',
    legacyDeleteConfirm: 'Soft-delete this comment?',
    legacyPostComment: 'Post comment',
    legacyReplyPlaceholder: 'Reply',
    legacyReply: 'Reply',
    legacyMentioned: 'Mentioned',
    legacyMentionLabel: 'Mention people',
    legacyHuman: 'Human',
    resolved: 'Resolved',
    open: 'Open',
    timelineActor: 'Actor',
    timelineIntent: 'Intent',
    timelineSession: 'Session',
    timelinePlanStep: 'Plan step',
    timelineBodyMissing: 'No message body was recorded.',
    timelineContextDelta: 'Context delta',
    timelineContextDeltaBase: 'Base snapshot',
    timelineContextDeltaNew: 'New snapshot',
    timelineContextDeltaHash: 'Delta hash',
    timelineContextDeltaAddedBy: 'Added by',
    timelineContextDeltaSource: 'source',
    timelineContextDeltaSourceFallback: 'source',
    timelineContextDeltaHashFallback: 'hash not reported',
    timelineResolveRequest: 'Resolve request',
    viewSession: 'View session',
    agentPrompt: 'Prompt',
    agentPromptPlaceholder: 'Prompt this agent',
    agentPause: 'Pause',
    agentStop: 'Stop',
    agentPauseReason: 'Human interrupted agent-to-agent communication from the Work Room.',
    agentStopReason: 'Human stopped agent-to-agent communication from the Work Room.',
    notFinalized: 'not finalized',
    notSelected: 'not selected',
    notClaimed: 'not claimed',
    unassigned: 'unassigned',
    noMessage: 'No message recorded.',
    noQuestion: 'No question recorded.',
    noHandoffSummary: 'No handoff summary reported.',
    noArtifacts: 'none',
    none: 'none',
  },
}

// Last-layer fallback for the new Copy subsets. We keep the keys stable so
// downstream pages do not need to null-check; the warning is dev-only.
// Task 7 Step 1 wires the `packages/ui` defaults in through the call site
// (i.e., the LocaleProvider value). The helper is exported so callers can
// opt in once the upstream defaults are in place.
const warnedMissingKeys = new Set<string>()
export function fallbackCopy<T extends Record<string, unknown>>(key: string, primary: T, fallback: T, locale: Locale): T {
  if (locale === 'zh-CN') return primary
  // For non-zh-CN locales, merge the English `primary` over the `fallback`
  // (English defaults). Empty / nullish fields in `primary` are filled from
  // `fallback`, and the dev console.warn fires once per missing key.
  const merged: Record<string, unknown> = { ...fallback }
  for (const k of Object.keys(primary) as Array<keyof T>) {
    const kName = String(k)
    const value = primary[k]
    if (value == null || value === '') {
      if (!warnedMissingKeys.has(`${key}.${kName}`)) {
        warnedMissingKeys.add(`${key}.${kName}`)
        if (typeof console !== 'undefined') console.warn(`[workmesh/i18n] missing copy: ${key}.${kName} for locale=${locale}`)
      }
      merged[kName] = fallback[k]
    } else {
      merged[kName] = value
    }
  }
  return merged as T
}

export type HumanControlPlaneCopy = {
  activeAgent: string
  affectedResources: string
  agentRelationship: string
  atRisk: string
  atRiskDescription: string
  attention: string
  attentionKind: string
  beta: string
  blocked: string
  close: string
  completionReview: string
  consequenceDescription: string
  consequenceImpact: { stop: string; lease: string; resume: string }
  consequenceTitle: string
  continueReview: string
  decision: string
  evidence: string
  evidenceDescription: string
  evidenceLabel: string
  evidenceType: string
  freshness: string
  freshNow: string
  graph: string
  health: string
  lifecycle: string
  needsYou: string
  needsYouDescription: string
  overview: string
  pauseRun: string
  planSteps: string
  projectDescription: string
  projectNavigation: string
  projectSettings: string
  ready: string
  reasonCodes: string
  recentlyVerified: string
  recentlyVerifiedDescription: string
  resync: string
  responsibleHuman: string
  risk: string
  riskHigh: string
  runDescription: string
  runHealthy: string
  running: string
  runningDescription: string
  runs: string
  stale: string
  staleDescription: string
  statusOpen: string
  statusVerified: string
  summaryLabel: string
  stepImplement: string
  stepReview: string
  stepVerify: string
  technicalDetails: string
  timeline: string
  title: string
  urgency: string
  urgencySoon: string
  verifiedDescription: string
  verifiedTitle: string
  viewEvidence: string
  viewWork: string
  work: string
  activity: string
}

const humanControlPlaneCopies: Record<Locale, HumanControlPlaneCopy> = {
  'zh-CN': {
    activeAgent: '运行中的智能体', affectedResources: '受影响资源', agentRelationship: '智能体代表负责人执行', atRisk: '存在风险', atRiskDescription: '需要恢复或重新同步的执行。', attention: '关注事项', attentionKind: '关注类型', beta: 'Beta', blocked: '阻塞', close: '关闭', completionReview: '完成审阅', consequenceDescription: '暂停前请确认对当前执行和后续步骤的影响。', consequenceImpact: { stop: '当前步骤将在安全边界停止。', lease: '租约仍由服务端规则处理，不会因预览而改变。', resume: '恢复执行需要重新验证权限和 Session revision。' }, consequenceTitle: '暂停这次运行？', continueReview: '继续审阅', decision: '决策', evidence: '证据', evidenceDescription: '本次运行的可追溯产物与因果记录。', evidenceLabel: '证据引用', evidenceType: '测试证据', freshness: '新鲜度', freshNow: '刚刚更新', graph: '图谱', health: '执行健康度', lifecycle: '生命周期', needsYou: '需要我处理', needsYouDescription: '等待负责人决策或审阅的事项。', overview: '概览', pauseRun: '暂停运行', planSteps: '计划步骤', projectDescription: 'Agent 运行可靠性、恢复与可验证交付。', projectNavigation: '项目导航', projectSettings: '项目设置', ready: '就绪', reasonCodes: '原因代码', recentlyVerified: '最近已验证', recentlyVerifiedDescription: '已完成验证并留有证据的工作。', resync: '重新同步', responsibleHuman: '负责人', risk: '风险', riskHigh: '高风险', runDescription: '将 Session 恢复规则应用到稳定执行路径。', runHealthy: '健康', running: '运行中', runningDescription: 'Agent 当前正在执行的工作。', runs: '运行', stale: '已过期', staleDescription: '心跳已过期，投影需要重新同步。', statusOpen: '待处理', statusVerified: '已验证', summaryLabel: '项目运行摘要', stepImplement: '实现恢复规则', stepReview: '审阅变更', stepVerify: '验证集成路径', technicalDetails: '技术详情', timeline: '因果时间线', title: 'Runtime Reliability', urgency: '紧迫度', urgencySoon: '尽快', verifiedDescription: '本地集成验证通过，证据已关联。', verifiedTitle: '连接恢复验证', viewEvidence: '查看证据', viewWork: '查看工作', work: '工作', activity: '活动',
  },
  en: {
    activeAgent: 'Active Agent Executor', affectedResources: 'Affected resources', agentRelationship: 'Agent acting on behalf of Human', atRisk: 'At Risk', atRiskDescription: 'Execution that needs recovery or resynchronization.', attention: 'Attention', attentionKind: 'Attention kind', beta: 'Beta', blocked: 'Blocked', close: 'Close', completionReview: 'Completion review', consequenceDescription: 'Review the effect on the current execution and later steps before pausing.', consequenceImpact: { stop: 'The current step will stop at a safe boundary.', lease: 'Lease behavior remains server-controlled and is not changed by this preview.', resume: 'Resume will revalidate authority and the Session revision.' }, consequenceTitle: 'Pause this run?', continueReview: 'Continue review', decision: 'Decision', evidence: 'Evidence', evidenceDescription: 'Traceable artifacts and causal records for this run.', evidenceLabel: 'Evidence references', evidenceType: 'Test evidence', freshness: 'Freshness', freshNow: 'Updated just now', graph: 'Graph', health: 'Execution health', lifecycle: 'Lifecycle', needsYou: 'Needs You', needsYouDescription: 'Items waiting for the responsible Human to decide or review.', overview: 'Overview', pauseRun: 'Pause run', planSteps: 'Plan steps', projectDescription: 'Agent runtime reliability, recovery, and verifiable delivery.', projectNavigation: 'Project navigation', projectSettings: 'Project Settings', ready: 'Ready', reasonCodes: 'Reason codes', recentlyVerified: 'Recently Verified', recentlyVerifiedDescription: 'Work with completed verification and linked evidence.', resync: 'Resync', responsibleHuman: 'Responsible Human', risk: 'Risk', riskHigh: 'High risk', runDescription: 'Apply Session recovery rules to the stable execution path.', runHealthy: 'Healthy', running: 'Running', runningDescription: 'Work currently being executed by Agents.', runs: 'Runs', stale: 'Stale', staleDescription: 'Heartbeat is stale and the projection needs resynchronization.', statusOpen: 'Open', statusVerified: 'Verified', summaryLabel: 'Project operational summary', stepImplement: 'Implement recovery rule', stepReview: 'Review changes', stepVerify: 'Verify integration path', technicalDetails: 'Technical details', timeline: 'Causal timeline', title: 'Runtime Reliability', urgency: 'Urgency', urgencySoon: 'Soon', verifiedDescription: 'Local integration verification passed and evidence is linked.', verifiedTitle: 'Connection recovery verification', viewEvidence: 'View evidence', viewWork: 'View Work', work: 'Work', activity: 'Activity',
  },
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
  toastCopy: ToastCopy
  issueCopy: Partial<WorkItemCopy>
  surfaceCopy: Partial<WorkSurfaceCopy>
  detailCopy: Partial<WorkItemDetailCopy>
  guidanceCopy: GuidanceCopy
  settingsCopy: SettingsCopy
  loginCopy: LoginCopy
  installCopy: InstallCopy
  operationsCopy: OperationsCopy
  connectCopy: ConnectCopy
  agentsCopy: AgentsCopy & ApprovalHistoryLocaleCopy & AgentDetailLocaleCopy & AgentControlLocaleCopy
  inboxCopy: InboxCopy
  sessionDetailCopy: SessionDetailCopy
  agentWorkCopy: AgentWorkCopy
  relationsCopy: RelationsCopy
  evidenceCopy: EvidenceCopy
  workRoomCopy: WorkRoomCopy
  projectDeliveryHealthLabel: ProjectDeliveryHealthLabel
  humanControlPlaneCopy: HumanControlPlaneCopy
}

const LocaleContext = createContext<LocaleContextValue | null>(null)
const localeCookie = 'workmesh_locale'

function readSavedLocale(): Locale | null {
  const cookieLocale = document.cookie.split('; ').find(value => value.startsWith(`${localeCookie}=`))?.split('=')[1]
  if (cookieLocale === 'zh-CN' || cookieLocale === 'en') return cookieLocale
  const stored = window.localStorage.getItem(localeCookie)
  return stored === 'zh-CN' || stored === 'en' ? stored : null
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setCurrentLocale] = useState<Locale>('zh-CN')
  useEffect(() => { setCurrentLocale(readSavedLocale() ?? 'zh-CN') }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    document.cookie = `${localeCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
    window.localStorage.setItem(localeCookie, locale)
  }, [locale])
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: setCurrentLocale,
    t: key => messages[locale][key],
    toastCopy: toastCopies[locale],
    issueCopy: issueCopies[locale],
    surfaceCopy: surfaceCopies[locale],
    detailCopy: detailCopies[locale],
    guidanceCopy: guidanceCopies[locale],
    settingsCopy: settingsCopies[locale],
    loginCopy: loginCopies[locale],
    installCopy: installCopies[locale],
    operationsCopy: operationsCopies[locale],
    connectCopy: connectCopies[locale],
    agentsCopy: agentsCopies[locale],
    inboxCopy: inboxCopies[locale],
    sessionDetailCopy: sessionDetailCopies[locale],
    agentWorkCopy: agentWorkCopies[locale],
    relationsCopy: relationsCopies[locale],
    evidenceCopy: evidenceCopies[locale],
    workRoomCopy: workRoomCopies[locale],
    projectDeliveryHealthLabel: projectDeliveryHealthLabels[locale],
    humanControlPlaneCopy: humanControlPlaneCopies[locale],
  }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider')
  return context
}

export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale()
  return <div aria-label={t('language')} className="locale-toggle" role="group">
    <button aria-pressed={locale === 'zh-CN'} onClick={() => setLocale('zh-CN')} type="button">中</button>
    <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')} type="button">EN</button>
  </div>
}
