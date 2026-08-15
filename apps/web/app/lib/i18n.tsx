'use client'

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

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey) => string
  issueCopy: Partial<WorkItemCopy>
  surfaceCopy: Partial<WorkSurfaceCopy>
  detailCopy: Partial<WorkItemDetailCopy>
  guidanceCopy: GuidanceCopy
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
