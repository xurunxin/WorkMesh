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
    emailPlaceholder: 'name@example.com',
    passwordPlaceholder: 'At least 12 characters',
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
    workspacePlaceholder: 'My Workspace',
    slug: 'Workspace slug',
    slugPlaceholder: 'workspace-slug',
    yourName: 'Your name',
    yourNamePlaceholder: 'Your name',
    email: 'Email',
    emailPlaceholder: 'name@example.com',
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
