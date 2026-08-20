'use client'

/**
 * apps/web/app/lib/i18n.tsx — single i18n entry for the WorkMesh web app.
 *
 * This module exports the `LocaleProvider` and the `useLocale` hook. It is
 * the ONLY place web code should read translated copy from.
 *
 * Ten typed `Copy` subsets are exposed via `useLocale()`:
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
 * The default locale is `zh-CN`. The English dictionaries may be left empty
 * for keys that are not yet translated; those fall through to the
 * `packages/ui` English defaults and finally to the page literal as a
 * last resort. The last layer logs a dev-only `console.warn` once per
 * missing key.
 */

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { WorkItemCopy } from '@workmesh/ui'
import type { WorkSurfaceCopy } from '../../features/work-items/work-surfaces'
import type { WorkItemDetailCopy } from '../../features/work-items/detail/work-item-detail'

export type Locale = 'zh-CN' | 'en'

type TranslationKey =
  | 'agents'
  | 'administrationNavigation'
  | 'actionCouldNotComplete'
  | 'cancel'
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
  | 'planningAndOperations'
  | 'projects'
  | 'priority'
  | 'projectName'
  | 'projectOverview'
  | 'reloadLatestWork'
  | 'responsibleHuman'
  | 'reconnecting'
  | 'search'
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

const messages: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': {
    agents: '智能体',
    administrationNavigation: '管理导航',
    actionCouldNotComplete: '操作未能完成',
    cancel: '取消',
    createIssue: '创建 Issue',
    createProject: '创建项目',
    connecting: '正在连接',
    guidance: '指南',
    description: '描述',
    dueDate: '截止日期',
    high: '高',
    inbox: '收件箱',
    issues: 'Issues',
    live: '实时',
    loading: '正在加载',
    loadMore: '加载更多',
    labels: '标签',
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
    planningAndOperations: '规划与运营',
    projects: '项目',
    priority: '优先级',
    projectName: '项目名称',
    projectOverview: '项目概览',
    reloadLatestWork: '重新加载最新数据',
    responsibleHuman: '负责人',
    reconnecting: '正在重新连接',
    search: '搜索',
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
  },
  en: {
    agents: 'Agents',
    administrationNavigation: 'Administration navigation',
    actionCouldNotComplete: 'Action could not be completed',
    cancel: 'Cancel',
    createIssue: 'Create issue',
    createProject: 'Create project',
    connecting: 'Connecting',
    guidance: 'Guidance',
    description: 'Description',
    dueDate: 'Due date',
    high: 'High',
    inbox: 'Inbox',
    issues: 'Issues',
    live: 'Live',
    loading: 'Loading',
    loadMore: 'Load more',
    labels: 'Labels',
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
    planningAndOperations: 'Planning & Operations',
    projects: 'Projects',
    priority: 'Priority',
    projectName: 'Project name',
    projectOverview: 'Project overview',
    reloadLatestWork: 'Reload latest work',
    responsibleHuman: 'Responsible human',
    reconnecting: 'Reconnecting',
    search: 'Search',
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
    documentRevision: revision => `文档版本 ${revision}`, selectScope: '请选择或创建所需作用域后再编辑指南。', loading: '正在加载指南…', markdown: 'Markdown 内容', changeSummary: '变更摘要', publishRevision: '发布不可变版本', currentRevision: '当前版本', author: '作者', published: '发布时间', auditReason: '审计原因', auditPlaceholder: '归档或回滚时必填', archiveCurrent: '归档当前指南', revisionHistory: '版本历史', rollbackPointer: '回滚至此版本', noRevisions: '尚无已发布版本。', compareRevisions: '比较版本', fromRevision: '起始指南版本', toRevision: '目标指南版本', showDiff: '显示差异', pointerAudit: '指针审计', action: action => ({ published: '已发布', archived: '已归档', rolled_back: '已回滚' }[action] ?? action.replaceAll('_', ' ')), by: '操作人', noPointerChanges: '尚无指针变更。', projectDescription: '项目描述（不属于指南）', formatDate: value => new Date(value).toLocaleString('zh-CN'),
  },
  en: {
    intro: 'Versioned instructions for agents. Published revisions are immutable and Session context pins the exact revision and SHA-256 hash it used.',
    scope: 'Scope', scopeLabel: 'Guidance scope', workspace: 'Workspace', team: 'Team', project: 'Project', noTeamSelected: 'No team selected', noProject: 'No project', projectLabel: 'Guidance project',
    status: status => status, documentRevision: revision => `Document revision ${revision}`, selectScope: 'Select or create the required scope before editing Guidance.', loading: 'Loading Guidance…', markdown: 'Markdown', changeSummary: 'Change summary', publishRevision: 'Publish immutable revision', currentRevision: 'Current revision', author: 'Author', published: 'Published', auditReason: 'Audit reason', auditPlaceholder: 'Required for archive or rollback', archiveCurrent: 'Archive current Guidance', revisionHistory: 'Revision history', rollbackPointer: 'Roll back pointer', noRevisions: 'No published revisions.', compareRevisions: 'Compare revisions', fromRevision: 'From Guidance revision', toRevision: 'To Guidance revision', showDiff: 'Show diff', pointerAudit: 'Pointer audit', action: action => action.replaceAll('_', ' '), by: 'by', noPointerChanges: 'No pointer changes yet.', projectDescription: 'Project description (not Guidance)', formatDate: value => new Date(value).toLocaleString('en'),
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
    filterMilestone: '里程碑',
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
  en: {},
}

const surfaceCopies: Record<Locale, Partial<WorkSurfaceCopy>> = {
  'zh-CN': {
    board: '看板视图',
    conflictDescription: '此操作与服务器上的较新版本冲突。请查看最新 Issue 后再次确认移动。',
    conflictTitle: 'Issue 已更新',
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
  en: {},
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
    description: '描述（Markdown）',
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
      draftRestored: '已恢复本地草稿。',
      discardDraft: '放弃草稿',
      revisionDraft: (draftRevision, currentRevision) => `发现版本 ${draftRevision} 的草稿。请先检查，再基于版本 ${currentRevision} 保存。`,
      restoreForReview: '恢复并检查',
      discardOldDraft: '放弃旧草稿',
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
  en: {},
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
  createFirst: string
  teamWorkflow: string
  workflowStates: string
  noStates: string
  statusName: string
  category: string
  color: string
  createStatus: string
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
  confirmDelete: (name: string) => string
  requestFailed: string
  categories: { backlog: string; planned: string; started: string; completed: string; canceled: string }
  settingsTabsLabel: string
  tabWorkspace: string
  tabWorkspaceDescription: string
  tabOperations: string
  tabOperationsDescription: string
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
    deleteHelp: '从当前工作区导航中移除此团队。',
    createFirst: '新建团队后即可配置工作流。',
    teamWorkflow: '团队工作流',
    workflowStates: '工作流状态',
    noStates: '暂无工作流状态。',
    statusName: '状态名称',
    category: '分类',
    color: '颜色',
    createStatus: '新建状态',
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
    confirmDelete: name => `确定删除团队 ${name}？删除后其工作将不可用。`,
    requestFailed: '操作失败。',
    categories: { backlog: '待办', planned: '已规划', started: '进行中', completed: '已完成', canceled: '已取消' },
    settingsTabsLabel: '设置分区',
    tabWorkspace: '工作区',
    tabWorkspaceDescription: '团队、工作流状态与权限',
    tabOperations: '运营与规划',
    tabOperationsDescription: '周期、自动化与运行历史',
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
    deleteHelp: 'Remove this team from active workspace navigation.',
    createFirst: 'Create a team to configure its workflow.',
    teamWorkflow: 'Team workflow',
    workflowStates: 'Workflow states',
    noStates: 'No workflow states yet.',
    statusName: 'Status name',
    category: 'Category',
    color: 'Color',
    createStatus: 'Create status',
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
    confirmDelete: name => `Delete team ${name}? Its work remains unavailable after this action.`,
    requestFailed: 'Something went wrong.',
    categories: { backlog: 'Backlog', planned: 'Planned', started: 'Started', completed: 'Completed', canceled: 'Canceled' },
    settingsTabsLabel: 'Settings sections',
    tabWorkspace: 'Workspace',
    tabWorkspaceDescription: 'Teams, workflow states, and access',
    tabOperations: 'Operations & Planning',
    tabOperationsDescription: 'Cycles, automation, and run history',
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
  // Loading / error / disabled surfaces
  loading: string
  loadingDescription: string
  error: string
  errorDescription: string
  retry: string
  disabledTitle: string
  disabledDescription: string
  // Metrics row
  metricsTitle: string
  metricsKnownCost: string
  metricsNoKnownCost: string
  metricsUnknownCost: string
  metricsNeverTreatedAsZero: string
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
  // Per-state string fields (parallel to the function fields above; the
  // functions read these so call sites can also reference them directly).
  cycleStateActive: string
  cycleStatePlanned: string
  cycleStateCompleted: string
  initiativeHealthOnTrack: string
  initiativeHealthAtRisk: string
  initiativeHealthOffTrack: string
  ruleStateActive: string
  ruleStatePaused: string
  loopStateActive: string
  loopStatePaused: string
  runStateSucceeded: string
  runStateFailed: string
  runStateRunning: string
  runStatePending: string
}

const operationsCopies: Record<Locale, OperationsCopy> = {
  'zh-CN': {
    title: '运营与规划',
    subtitle: '查看长期规划、自动化、健康度与成本',
    backToWork: '返回工作区',
    refresh: '刷新',
    loading: '正在加载运营数据…',
    loadingDescription: '正在获取规划、自动化、健康度与成本数据。',
    error: '运营页面需要关注',
    errorDescription: '请稍后重试或联系工作区管理员。',
    retry: '重试',
    disabledTitle: '运营页面未启用',
    disabledDescription: '本部署未启用 Operations UI 功能。',
    metricsTitle: '使用量与成本',
    metricsKnownCost: '已知成本',
    metricsNoKnownCost: '尚无已知成本',
    metricsUnknownCost: '未知成本',
    metricsNeverTreatedAsZero: '从不当作零处理。',
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
    cycleStateActive: '进行中',
    cycleStatePlanned: '已计划',
    cycleStateCompleted: '已完成',
    initiativeHealthOnTrack: '健康',
    initiativeHealthAtRisk: '存在风险',
    initiativeHealthOffTrack: '偏离轨道',
    ruleStateActive: '已启用',
    ruleStatePaused: '已暂停',
    loopStateActive: '已启用',
    loopStatePaused: '已暂停',
    runStateSucceeded: '已成功',
    runStateFailed: '已失败',
    runStateRunning: '运行中',
    runStatePending: '等待中',
    cycleState: state => ({ active: '进行中', planned: '已计划', completed: '已完成' }[state] ?? state),
    initiativeHealth: health => ({ on_track: '健康', at_risk: '存在风险', off_track: '偏离轨道' }[health] ?? health),
    ruleState: state => ({ active: '已启用', paused: '已暂停' }[state] ?? state),
    loopState: state => ({ active: '已启用', paused: '已暂停' }[state] ?? state),
    runState: status => ({ succeeded: '已成功', failed: '已失败', running: '运行中', pending: '等待中' }[status] ?? status),
    cycleProgress: (done, total) => `${done}/${total} 已完成`,
    notScheduled: '尚未排期',
    initiativeLine: (status, priority) => `${status} · ${priority} 优先级`,
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
    loading: 'Loading Operations',
    loadingDescription: 'Loading durable planning, automation, health, and cost projections.',
    error: 'Operations needs attention',
    errorDescription: 'Unable to load Operations.',
    retry: 'Retry',
    disabledTitle: 'Operations is disabled',
    disabledDescription: 'This deployment has not enabled the Operations UI feature.',
    metricsTitle: 'Usage and cost',
    metricsKnownCost: 'Known cost',
    metricsNoKnownCost: 'No known cost',
    metricsUnknownCost: 'Unknown cost',
    metricsNeverTreatedAsZero: 'Never treated as zero.',
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
    cycleStateActive: 'active',
    cycleStatePlanned: 'planned',
    cycleStateCompleted: 'completed',
    initiativeHealthOnTrack: 'on_track',
    initiativeHealthAtRisk: 'at_risk',
    initiativeHealthOffTrack: 'off_track',
    ruleStateActive: 'active',
    ruleStatePaused: 'paused',
    loopStateActive: 'active',
    loopStatePaused: 'paused',
    runStateSucceeded: 'succeeded',
    runStateFailed: 'failed',
    runStateRunning: 'running',
    runStatePending: 'pending',
    cycleState: state => ({ active: 'active', planned: 'planned', completed: 'completed' }[state] ?? state),
    initiativeHealth: health => ({ on_track: 'on_track', at_risk: 'at_risk', off_track: 'off_track' }[health] ?? health),
    ruleState: state => ({ active: 'active', paused: 'paused' }[state] ?? state),
    loopState: state => ({ active: 'active', paused: 'paused' }[state] ?? state),
    runState: status => ({ succeeded: 'succeeded', failed: 'failed', running: 'running', pending: 'pending' }[status] ?? status),
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
  clientGenericMcp: string
  clientOpencode: string
  clientCodex: string
  clientPi: string
  secretBoundary: string
  copySuccess: string
  transport: string
  profile: string
  skill: string
  environmentChecks: string
  localStdioFallback: (label: string) => string
  loadingStatus: string
  handoffEyebrow: string
  handoffTitle: string
  handoffBody: string
  copyLink: string
  copiedLink: string
  authorityTitle: string
  authorityBody: string
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
    clientGenericMcp: '通用 MCP',
    clientOpencode: 'OpenCode',
    clientCodex: 'Codex',
    clientPi: 'Pi',
    secretBoundary: '凭据边界：模板只包含环境变量名。请把兑换后的安装凭据放入客户端的密钥存储，永远不要写入此文件。',
    copySuccess: '复制成功',
    transport: '传输',
    profile: 'Profile',
    skill: 'Skill',
    environmentChecks: '环境检查',
    localStdioFallback: label => `本地 stdio 兜底：${label}`,
    loadingStatus: '正在加载服务端 MCP 配置…',
    handoffEyebrow: '一次性交接',
    handoffTitle: '配对链接已驻留在浏览器内存中',
    handoffBody: '片段尚未发送到 WorkMesh。请仅把完整链接交给目标智能体，在过期前完成兑换，然后销毁该链接。',
    copyLink: '复制安全连接 URL',
    copiedLink: '已复制',
    authorityTitle: '权限仍在服务端。',
    authorityBody: '人类连接只会创建一个安装身份。普通写入仍需有效的智能体 Session、Delegation、能力与资源范围，并按需配合审批、Lease、版本与幂等键。',
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
    clientGenericMcp: 'Generic MCP',
    clientOpencode: 'OpenCode',
    clientCodex: 'Codex',
    clientPi: 'Pi',
    secretBoundary: 'Secret boundary: the template contains only an environment-variable name. Put the redeemed installation credential in the client secret store, never in this file.',
    copySuccess: 'Copied successfully',
    transport: 'Transport',
    profile: 'Profile',
    skill: 'Skill',
    environmentChecks: 'Environment checks',
    localStdioFallback: label => `Local stdio fallback: ${label}`,
    loadingStatus: 'Loading server-derived MCP configuration…',
    handoffEyebrow: 'One-time handoff',
    handoffTitle: 'Pairing link is present in browser memory',
    handoffBody: 'The fragment has not been sent to WorkMesh. Give the exact link only to the intended Agent, redeem it before expiry, and then discard it.',
    copyLink: 'Copy secure connect URL',
    copiedLink: 'Copied',
    authorityTitle: 'Authority stays server-side.',
    authorityBody: 'A Human Connection creates an installation identity only. Ordinary mutations still require an active Agent Session, Delegation, capability and resource scope, plus approval, lease, revision, and idempotency where applicable.',
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

const agentsCopies: Record<Locale, AgentsCopy> = {
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
    activeAgents: '活跃智能体',
    registered: count => `已注册 ${count} 个`,
    liveSessions: '运行中 Session',
    visible: count => `可见 ${count} 个`,
    pendingApprovals: '待处理审批',
    responseRequired: '需要人类响应',
    queueClear: '队列为空',
    needsAttention: '需要关注',
    blockedOrWaiting: '阻塞、过期或等待中',
    registry: '注册表',
    registryIntro: '先检查定义；仅在需要审阅时展开团队权限。',
    all: '全部',
    active: '活跃',
    inactive: '停用',
    noAgents: '没有符合当前筛选的已注册智能体。',
    humanQueue: '人类队列',
    approvals: '审批',
    openInbox: '打开收件箱',
    noApprovals: '没有待处理审批。',
    execution: '执行',
    sessions: 'Sessions',
    noSessions: '当前没有可见的智能体 Session。',
    durableState: '持久状态',
    diagnostics: '诊断',
    diagnosticsIntro: '健康状态来自服务端 Session 与连接事实；实时更新只触发刷新。',
    allClear: '一切正常',
    allClearDetail: '没有可见 Session 处于过期、失败、阻塞或等待人类的状态。',
    registryStatusActive: '活跃',
    registryStatusInactive: '停用',
    noRegistryDescription: '没有注册表描述。',
    approvedLabel: '已批准',
    capabilitiesLabel: count => `${count} 项能力`,
    concurrency: '并发数',
    heartbeat: '心跳',
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
    sessionLabel: id => `Session ${id}`,
    workItemLabel: id => `Issue ${id}`,
    noWorkItem: '无 Issue',
    heartbeatLabel: date => `心跳 ${date}`,
    loadMoreAgents: '加载更多智能体',
    loadMoreTeams: '加载更多团队',
    loadMoreApprovals: '加载更多审批',
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
    activeAgents: 'Active agents',
    registered: count => `${count} registered`,
    liveSessions: 'Live sessions',
    visible: count => `${count} visible`,
    pendingApprovals: 'Pending approvals',
    responseRequired: 'Human response required',
    queueClear: 'Queue clear',
    needsAttention: 'Needs attention',
    blockedOrWaiting: 'Blocked, stale, or waiting',
    registry: 'Registry',
    registryIntro: 'Scan definitions first; expand Team authority only when it needs review.',
    all: 'All',
    active: 'Active',
    inactive: 'Inactive',
    noAgents: 'No registered agents match this filter.',
    humanQueue: 'Human queue',
    approvals: 'Approvals',
    openInbox: 'Open inbox',
    noApprovals: 'No pending approvals.',
    execution: 'Execution',
    sessions: 'Sessions',
    noSessions: 'No agent session is visible to you.',
    durableState: 'Durable state',
    diagnostics: 'Diagnostics',
    diagnosticsIntro: 'Health comes from server-reported session and Connection facts; realtime updates only prompt a refresh.',
    allClear: 'All clear',
    allClearDetail: 'No visible session is stale, failed, blocked, or waiting for a Human.',
    registryStatusActive: 'active',
    registryStatusInactive: 'inactive',
    noRegistryDescription: 'No registry description.',
    approvedLabel: 'Approved',
    capabilitiesLabel: count => `${count} capabilities`,
    concurrency: 'Concurrency',
    heartbeat: 'Heartbeat',
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
    teamAccessApprovedChipLabel: capability => `Approved ${capability}`,
    teamAccessRequestedChipLabel: capability => `Requested ${capability}`,
    saveAccess: 'Save grant',
    riskLabel: risk => `${risk} risk`,
    reviewSession: 'Review session and evidence',
    sessionLabel: id => `Session ${id}`,
    workItemLabel: id => `Work item ${id}`,
    noWorkItem: 'No work item',
    heartbeatLabel: date => `Heartbeat ${date}`,
    loadMoreAgents: 'Load more agents',
    loadMoreTeams: 'Load more teams',
    loadMoreApprovals: 'Load more approvals',
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
  noSessions: string
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
  noSharedDefinition: string
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
    noSessions: '尚未委派任何智能体 Session。',
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
    noSharedDefinition: '没有同时被定义和本团队批准的能力。',
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
    noSessions: 'No delegated agent session yet.',
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
    noActiveGrant: 'No active agent has an active grant for this work item team.',
    noSharedDefinition: 'No active agent has capabilities approved by both its definition and this team.',
    projectionCurrentStep: 'Current plan step',
    projectionPendingApprovals: 'Pending approvals',
    projectionStatus: 'Projection status',
    projectionFailedHint: 'Plan or approval projection unavailable. Open Details to retry.',
    capabilitiesLine: (provider, capabilities) => `${provider} · ${capabilities}`,
    notReported: 'Not reported',
    unavail: reason => `unavailable: ${reason}`,
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
  legacyHuman: string
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
    legacyHuman: '人类',
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
    legacyAria: 'Legacy comment controls',
    legacyEditPrompt: 'Edit comment',
    legacyReopen: 'Reopen',
    legacyResolve: 'Resolve',
    legacyDelete: 'Delete',
    legacyDeleteConfirm: 'Soft-delete this comment?',
    legacyPostComment: 'Post comment',
    legacyReplyPlaceholder: 'Reply',
    legacyReply: 'Reply',
    legacyMentioned: 'Mentioned',
    legacyHuman: 'Human',
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

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
  issueCopy: Partial<WorkItemCopy>
  surfaceCopy: Partial<WorkSurfaceCopy>
  detailCopy: Partial<WorkItemDetailCopy>
  guidanceCopy: GuidanceCopy
  settingsCopy: SettingsCopy
  loginCopy: LoginCopy
  installCopy: InstallCopy
  operationsCopy: OperationsCopy
  connectCopy: ConnectCopy
  agentsCopy: AgentsCopy
  inboxCopy: InboxCopy
  sessionDetailCopy: SessionDetailCopy
  agentWorkCopy: AgentWorkCopy
  relationsCopy: RelationsCopy
  evidenceCopy: EvidenceCopy
  workRoomCopy: WorkRoomCopy
  projectDeliveryHealthLabel: ProjectDeliveryHealthLabel
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
  }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used within LocaleProvider')
  return context
}

export function LocaleToggle() {
  const { locale, setLocale } = useLocale()
  return <div aria-label={locale === 'zh-CN' ? '语言' : 'Language'} className="locale-toggle" role="group">
    <button aria-pressed={locale === 'zh-CN'} onClick={() => setLocale('zh-CN')} type="button">中</button>
    <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')} type="button">EN</button>
  </div>
}
