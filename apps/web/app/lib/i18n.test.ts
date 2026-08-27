// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider, useLocale } from './i18n'

afterEach(() => {
  cleanup()
  document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
  window.localStorage.removeItem('workmesh_locale')
})

const mcpGuideFacts = {
  clientLabel: 'OpenCode',
  tokenEnvironmentName: 'WORKMESH_INSTALLATION_TOKEN',
  tokenHeader: 'X-WorkMesh-Installation-Token',
  profileVersion: '1.0',
  skillVersion: '1.1.0',
  skillSha256: 'sha256:safe-public-hash',
}

function Probe() {
  const ctx = useLocale()
  return createElement('pre', null, JSON.stringify({
    keys: Object.keys(ctx).sort(),
    toastZh: {
      notifications: ctx.toastCopy.notifications,
      dismiss: ctx.toastCopy.dismiss,
      dismissLabel: ctx.toastCopy.dismissLabel('团队已创建', 2, 3),
      partial: ctx.toastCopy.approvalsPartialDescription(2, 1),
      issue: ctx.toastCopy.issueCreatedDescription('宽屏验收'),
    },
    settingsLoadingZh: ctx.settingsCopy.loading,
    closeZh: ctx.t('close'),
    settingsTabsZh: [
      ctx.settingsCopy.settingsTabsLabel,
      ctx.settingsCopy.tabWorkspace,
      ctx.settingsCopy.tabOperations,
    ],
    settingsTeamUnavailableZh: ctx.settingsCopy.teamUnavailable,
    settingsDeleteZh: {
      title: ctx.settingsCopy.deleteDialogTitle,
      description: ctx.settingsCopy.deleteDescription,
      constraint: ctx.settingsCopy.deleteConstraint,
      cancel: ctx.settingsCopy.deleteCancel,
      close: ctx.settingsCopy.deleteClose,
      deleting: ctx.settingsCopy.deletingTeam,
      revision: ctx.settingsCopy.deleteRevisionConflict,
      lastTeam: ctx.settingsCopy.deleteLastActiveTeamConflict,
      failed: ctx.settingsCopy.deleteFailed,
      confirm: ctx.settingsCopy.deleteConfirmAccessible('Runtime'),
    },
    settingsWorkflowColorsZh: {
      legend: ctx.settingsCopy.workflowColorLegend,
      presets: ctx.settingsCopy.workflowColorPresets,
      custom: ctx.settingsCopy.customColor,
      customInput: ctx.settingsCopy.customColorInput,
      value: ctx.settingsCopy.colorValue,
      created: ctx.settingsCopy.statusCreated('评审'),
    },
    loginTitleZh: ctx.loginCopy.title,
    installTitleZh: ctx.installCopy.title,
    operationsTitleZh: ctx.operationsCopy.title,
    operationsNavigationZh: ctx.operationsCopy.sectionNavigation,
    operationsEmptyZh: ctx.operationsCopy.noSectionsTitle,
    operationsSearchZh: ctx.operationsCopy.searchLabel,
    operationsMetricsZh: {
      unavailable: ctx.operationsCopy.metricsUnavailable,
      records: ctx.operationsCopy.metricsRecords,
      minorUnits: ctx.operationsCopy.metricsMinorUnits('ZZZ'),
      durationUnits: [
        ctx.operationsCopy.metricsDurationHourUnit,
        ctx.operationsCopy.metricsDurationMinuteUnit,
        ctx.operationsCopy.metricsDurationSecondUnit,
      ],
    },
    operationsEnumsZh: {
      cycle: ['current', 'upcoming', 'history'].map(ctx.operationsCopy.cycleState),
      initiativeStatus: ['planned', 'active', 'paused', 'completed', 'canceled'].map(ctx.operationsCopy.initiativeStatus),
      initiativePriority: ['none', 'low', 'medium', 'high', 'urgent'].map(ctx.operationsCopy.initiativePriority),
      initiativeHealth: ['on_track', 'at_risk', 'off_track', 'unknown'].map(ctx.operationsCopy.initiativeHealth),
      rule: ['active', 'paused', 'disabled'].map(ctx.operationsCopy.ruleState),
      loop: ['active', 'paused', 'disabled'].map(ctx.operationsCopy.loopState),
      run: ['pending', 'claimed', 'running', 'succeeded', 'failed', 'dead', 'canceled', 'dry_run'].map(ctx.operationsCopy.runState),
      templateKind: ['work_item', 'project', 'agent_run', 'handoff', 'automation'].map(ctx.operationsCopy.templateKind),
      templateStatus: ['draft', 'active', 'archived'].map(ctx.operationsCopy.templateStatus),
    },
    connectTitleZh: ctx.connectCopy.title,
    connectMcpZh: {
      descriptions: ['codex', 'opencode', 'pi', 'generic_mcp'].map(type => ctx.connectCopy.clientDescription(type as 'codex' | 'opencode' | 'pi' | 'generic_mcp')),
      configuration: ctx.connectCopy.clientConfiguration('OpenCode remote MCP configuration'),
      region: ctx.connectCopy.configRegionLabel('OpenCode remote MCP configuration'),
      announcements: [ctx.connectCopy.configCopiedAnnouncement, ctx.connectCopy.linkCopiedAnnouncement],
      environment: ctx.connectCopy.environmentCheckItems(mcpGuideFacts),
      bootstrap: ctx.connectCopy.bootstrapCheckItems(mcpGuideFacts),
      fallback: ctx.connectCopy.localStdioFallback('pnpm --filter @workmesh/mcp start:stdio'),
    },
    agentsLabelZh: ctx.agentsCopy.agents,
    agentPeekTitleZh: ctx.agentsCopy.peekTitle('Codex'),
    manageAgentAccessZh: ctx.agentsCopy.manageTeamAccess('Codex'),
    completenessContractZh: {
      flat: [ctx.t('language'), ctx.t('build'), ctx.t('schema')],
      surfaceAriaLabel: ctx.surfaceCopy.ariaLabel,
      agents: [ctx.agentsCopy.controlSummaryAriaLabel, ctx.agentsCopy.fieldAgentNamePlaceholder],
      guidance: [
        ctx.guidanceCopy.edit,
        ctx.guidanceCopy.preview,
        ctx.guidanceCopy.characterCount(3),
        ctx.guidanceCopy.renderedPreviewLabel,
        ctx.guidanceCopy.previewEmpty,
      ],
      operationsNoScript: ctx.operationsCopy.noScript,
      deliveryHealth: ctx.inboxCopy.deliveryHealthLabel('Runtime'),
      workRoom: [ctx.workRoomCopy.selectedLabel, ctx.workRoomCopy.resolved, ctx.workRoomCopy.open],
      attachments: {
        labels: [ctx.workRoomCopy.artifactAttachments.ariaLabel, ctx.workRoomCopy.artifactAttachments.title, ctx.workRoomCopy.artifactAttachments.provenance, ctx.workRoomCopy.artifactAttachments.attachFile, ctx.workRoomCopy.artifactAttachments.inputLabel, ctx.workRoomCopy.artifactAttachments.cancel, ctx.workRoomCopy.artifactAttachments.retryUpload, ctx.workRoomCopy.artifactAttachments.cancelUpload, ctx.workRoomCopy.artifactAttachments.empty, ctx.workRoomCopy.artifactAttachments.fileFallback],
        bytes: ctx.workRoomCopy.artifactAttachments.formatBytes(8),
        errors: [ctx.workRoomCopy.artifactAttachments.verificationTimedOut, ctx.workRoomCopy.artifactAttachments.loadErrorFallback, ctx.workRoomCopy.artifactAttachments.objectUploadFailed(503), ctx.workRoomCopy.artifactAttachments.uploadStatusError('rejected'), ctx.workRoomCopy.artifactAttachments.uploadErrorFallback, ctx.workRoomCopy.artifactAttachments.cancelErrorFallback],
        phases: ctx.workRoomCopy.artifactAttachments.phases,
        announcement: ctx.workRoomCopy.artifactAttachments.phaseAnnouncement(ctx.workRoomCopy.artifactAttachments.phases.uploading),
      },
    },
    inboxTitleZh: ctx.inboxCopy.title,
    sessionLoadingZh: ctx.sessionDetailCopy.loading,
    liveAgentsZh: ctx.agentWorkCopy.liveAgents,
    relationsTitleZh: ctx.relationsCopy.title,
    evidenceTitleZh: ctx.evidenceCopy.title,
    workRoomTitleZh: ctx.workRoomCopy.title,
    healthOnTrackZh: ctx.projectDeliveryHealthLabel('on_track'),
    humanControlPlaneZh: [ctx.humanControlPlaneCopy.needsYou, ctx.humanControlPlaneCopy.running, ctx.humanControlPlaneCopy.atRisk],
  }))
}

function EnglishOperationsProbe() {
  const { agentsCopy, connectCopy, guidanceCopy, inboxCopy, operationsCopy, settingsCopy, surfaceCopy, t, toastCopy, workRoomCopy } = useLocale()
  return createElement('pre', { 'data-testid': 'english-operations-copy' }, JSON.stringify({
    overlayCopy: {
      close: t('close'),
      closeAgentOverlay: agentsCopy.closePeek,
      teamAccessName: agentsCopy.manageTeamAccess('Codex'),
    },
    completenessContract: {
      flat: [t('language'), t('build'), t('schema')],
      surfaceAriaLabel: surfaceCopy.ariaLabel,
      agents: [agentsCopy.controlSummaryAriaLabel, agentsCopy.fieldAgentNamePlaceholder],
      guidance: [guidanceCopy.edit, guidanceCopy.preview, guidanceCopy.characterCount(3), guidanceCopy.renderedPreviewLabel, guidanceCopy.previewEmpty],
      operationsNoScript: operationsCopy.noScript,
      deliveryHealth: inboxCopy.deliveryHealthLabel('Runtime'),
      workRoom: [workRoomCopy.selectedLabel, workRoomCopy.resolved, workRoomCopy.open],
      attachments: {
        labels: [workRoomCopy.artifactAttachments.ariaLabel, workRoomCopy.artifactAttachments.title, workRoomCopy.artifactAttachments.provenance, workRoomCopy.artifactAttachments.attachFile, workRoomCopy.artifactAttachments.inputLabel, workRoomCopy.artifactAttachments.cancel, workRoomCopy.artifactAttachments.retryUpload, workRoomCopy.artifactAttachments.cancelUpload, workRoomCopy.artifactAttachments.empty, workRoomCopy.artifactAttachments.fileFallback],
        bytes: workRoomCopy.artifactAttachments.formatBytes(8),
        errors: [workRoomCopy.artifactAttachments.verificationTimedOut, workRoomCopy.artifactAttachments.loadErrorFallback, workRoomCopy.artifactAttachments.objectUploadFailed(503), workRoomCopy.artifactAttachments.uploadStatusError('rejected'), workRoomCopy.artifactAttachments.uploadErrorFallback, workRoomCopy.artifactAttachments.cancelErrorFallback],
        phases: workRoomCopy.artifactAttachments.phases,
        announcement: workRoomCopy.artifactAttachments.phaseAnnouncement(workRoomCopy.artifactAttachments.phases.uploading),
      },
    },
    toast: {
      notifications: toastCopy.notifications,
      dismiss: toastCopy.dismiss,
      dismissLabel: toastCopy.dismissLabel('Team created', 2, 3),
      partial: toastCopy.approvalsPartialDescription(2, 1),
      issue: toastCopy.issueCreatedDescription('Wide-screen acceptance'),
    },
    settingsTabs: [settingsCopy.settingsTabsLabel, settingsCopy.tabWorkspace, settingsCopy.tabOperations],
    settingsTeamUnavailable: settingsCopy.teamUnavailable,
    settingsDelete: {
      title: settingsCopy.deleteDialogTitle,
      description: settingsCopy.deleteDescription,
      constraint: settingsCopy.deleteConstraint,
      cancel: settingsCopy.deleteCancel,
      close: settingsCopy.deleteClose,
      deleting: settingsCopy.deletingTeam,
      revision: settingsCopy.deleteRevisionConflict,
      lastTeam: settingsCopy.deleteLastActiveTeamConflict,
      failed: settingsCopy.deleteFailed,
      confirm: settingsCopy.deleteConfirmAccessible('Runtime'),
    },
    settingsWorkflowColors: {
      legend: settingsCopy.workflowColorLegend,
      presets: settingsCopy.workflowColorPresets,
      custom: settingsCopy.customColor,
      customInput: settingsCopy.customColorInput,
      value: settingsCopy.colorValue,
      created: settingsCopy.statusCreated('Review'),
    },
    connectMcp: {
      descriptions: ['codex', 'opencode', 'pi', 'generic_mcp'].map(type => connectCopy.clientDescription(type as 'codex' | 'opencode' | 'pi' | 'generic_mcp')),
      configuration: connectCopy.clientConfiguration('OpenCode remote MCP configuration'),
      region: connectCopy.configRegionLabel('OpenCode remote MCP configuration'),
      announcements: [connectCopy.configCopiedAnnouncement, connectCopy.linkCopiedAnnouncement],
      environment: connectCopy.environmentCheckItems(mcpGuideFacts),
      bootstrap: connectCopy.bootstrapCheckItems(mcpGuideFacts),
      fallback: connectCopy.localStdioFallback('pnpm --filter @workmesh/mcp start:stdio'),
    },
    search: operationsCopy.searchLabel,
    metrics: {
      unavailable: operationsCopy.metricsUnavailable,
      records: operationsCopy.metricsRecords,
      minorUnits: operationsCopy.metricsMinorUnits('ZZZ'),
      durationUnits: [
        operationsCopy.metricsDurationHourUnit,
        operationsCopy.metricsDurationMinuteUnit,
        operationsCopy.metricsDurationSecondUnit,
      ],
    },
    cycle: ['current', 'upcoming', 'history'].map(operationsCopy.cycleState),
    initiativeStatus: ['planned', 'active', 'paused', 'completed', 'canceled'].map(operationsCopy.initiativeStatus),
    initiativePriority: ['none', 'low', 'medium', 'high', 'urgent'].map(operationsCopy.initiativePriority),
    initiativeHealth: ['on_track', 'at_risk', 'off_track', 'unknown'].map(operationsCopy.initiativeHealth),
    rule: ['active', 'paused', 'disabled'].map(operationsCopy.ruleState),
    loop: ['active', 'paused', 'disabled'].map(operationsCopy.loopState),
    run: ['pending', 'claimed', 'running', 'succeeded', 'failed', 'dead', 'canceled', 'dry_run'].map(operationsCopy.runState),
    templateKind: ['work_item', 'project', 'agent_run', 'handoff', 'automation'].map(operationsCopy.templateKind),
    templateStatus: ['draft', 'active', 'archived'].map(operationsCopy.templateStatus),
  }))
}

function ApprovalCopyProbe() {
  const { agentsCopy, locale } = useLocale()
  return createElement('pre', { 'data-testid': 'approval-copy' }, JSON.stringify({
    locale,
    actions: [agentsCopy.approvalApprove, agentsCopy.approvalReject, agentsCopy.approvalOtherFeedback],
    feedback: [agentsCopy.approvalApproveWithRequirements, agentsCopy.approvalRejectWithFeedback, agentsCopy.approvalFeedbackRequired],
    blocked: ['viewer_already_decided', 'expired', 'session_inactive', 'authority_revoked', 'already_decided'].map(agentsCopy.approvalBlockedReason),
    failures: ['forbidden', 'conflict', 'expired', 'authority_inactive', 'network', 'server'].map(agentsCopy.approvalDecisionFailure),
    quorum: agentsCopy.approvalDecisionQuorum(1, 2),
  }))
}

describe('web i18n entry', () => {
  it('exposes every typed Copy subset and the primary t helper', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(Probe)))
    const stripped = html
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    const payload = JSON.parse(stripped)
    expect(payload.keys).toEqual([
      'agentWorkCopy',
      'agentsCopy',
      'connectCopy',
      'detailCopy',
      'evidenceCopy',
      'guidanceCopy',
      'humanControlPlaneCopy',
      'inboxCopy',
      'installCopy',
      'issueCopy',
      'locale',
      'loginCopy',
      'operationsCopy',
      'projectDeliveryHealthLabel',
      'relationsCopy',
      'sessionDetailCopy',
      'setLocale',
      'settingsCopy',
      'surfaceCopy',
      't',
      'toastCopy',
      'workRoomCopy',
    ])
    expect(payload.toastZh).toEqual({
      notifications: '通知',
      dismiss: '关闭',
      dismissLabel: '关闭通知：团队已创建（2/3）',
      partial: '已完成 2 项，1 项仍保留供重试。',
      issue: '已创建「宽屏验收」。',
    })
    expect(payload.settingsLoadingZh).toBe('正在加载设置…')
    expect(payload.closeZh).toBe('关闭')
    expect(payload.settingsTabsZh).toEqual(['设置分区', '工作区', '运营与规划'])
    expect(payload.settingsTeamUnavailableZh).toBe('所选团队不可用或你已无权访问。请重试以恢复工作区设置。')
    expect(payload.settingsDeleteZh).toEqual({
      title: '删除团队',
      description: '该团队将从活动导航中移除；关联工作会保留，但将不可用。',
      constraint: '至少必须保留一个活动团队。',
      cancel: '取消',
      close: '关闭',
      deleting: '正在删除…',
      revision: '团队已被其他操作更新。请关闭对话框、刷新后重试。',
      lastTeam: '无法删除最后一个活动团队。请先创建另一个活动团队。',
      failed: '无法删除团队。请检查连接后重试。',
      confirm: '确认删除团队 Runtime',
    })
    expect(payload.settingsWorkflowColorsZh).toEqual({
      legend: '状态颜色',
      presets: { neutral: '中性', blue: '蓝色', green: '绿色', amber: '琥珀色', red: '红色' },
      custom: '自定义',
      customInput: '自定义颜色',
      value: '颜色值',
      created: '已创建工作流状态 评审。',
    })
    expect(payload.loginTitleZh).toBe('登录')
    expect(payload.installTitleZh).toBe('安装 WorkMesh')
    expect(payload.operationsTitleZh).toBe('运营与规划')
    expect(payload.operationsNavigationZh).toBe('运营分区')
    expect(payload.operationsEmptyZh).toBe('尚无可用运营模块')
    expect(payload.operationsSearchZh).toBe('搜索已加载的运营记录')
    expect(payload.operationsMetricsZh).toEqual({
      unavailable: '使用量数据不可用',
      records: '条记录',
      minorUnits: 'ZZZ 最小货币单位',
      durationUnits: ['小时', '分', '秒'],
    })
    expect(payload.operationsEnumsZh).toEqual({
      cycle: ['当前', '即将开始', '历史'],
      initiativeStatus: ['已计划', '进行中', '已暂停', '已完成', '已取消'],
      initiativePriority: ['无', '低', '中', '高', '紧急'],
      initiativeHealth: ['健康', '存在风险', '偏离轨道', '未知'],
      rule: ['已启用', '已暂停', '已禁用'],
      loop: ['已启用', '已暂停', '已禁用'],
      run: ['等待中', '已领取', '运行中', '已成功', '已失败', '已终止', '已取消', '试运行'],
      templateKind: ['工作项', '项目', 'Agent 运行', '交接', '自动化'],
      templateStatus: ['草稿', '已启用', '已归档'],
    })
    expect(payload.connectTitleZh).toBe('连接智能体到 WorkMesh')
    expect(payload.connectMcpZh).toEqual({
      descriptions: [
        '通过 TOML MCP server 配置使用环境变量支持的请求头。',
        '通过远程 JSON 配置使用环境变量支持的请求头。',
        '通过扩展配置连接 Streamable HTTP 服务。',
        '通过标准兼容的 Streamable HTTP 配置连接。',
      ],
      configuration: '配置模板：OpenCode remote MCP configuration',
      region: '配置预览：OpenCode remote MCP configuration',
      announcements: ['配置已复制到剪贴板。', '安全连接链接已复制到剪贴板。'],
      environment: [
        '把兑换得到的安装凭据保存为 WORKMESH_INSTALLATION_TOKEN，不要粘贴到配置文件里。',
        '只通过 X-WorkMesh-Installation-Token 头发送到上方展示的精确服务端 URL。',
        '要求 Client Profile 1.0 与 Skill 1.1.0（sha256:safe-public-hash）。',
      ],
      bootstrap: [
        '拉取公共发现文档，并确认服务端声明 OpenCode；拒绝协议、客户端、Profile 或技能选择器中的未知值。',
        '在一次性配对片段过期前完成兑换，并把得到的凭据仅保存在客户端密钥库中。',
        '调用 verify_connection，并要求存在一个活跃的 Team、匹配的 Profile / Skill / 能力范围以及负责人。',
        '在选择工作前先调用 get_workmesh_context；工具存在并不授予任何写权限。',
        '当发现已撤销、过期、范围不符、停用或实时事实不一致时立即停止。',
      ],
      fallback: '本地 stdio 兜底：在本地密钥环境中设置 WORKMESH_API_URL 和 WORKMESH_INSTALLATION_TOKEN，然后运行 pnpm --filter @workmesh/mcp start:stdio。',
    })
    expect(payload.agentsLabelZh).toBe('智能体')
    expect(payload.agentPeekTitleZh).toBe('快速查看 Codex')
    expect(payload.manageAgentAccessZh).toBe('管理 Codex 的团队访问')
    expect(payload.completenessContractZh).toEqual({
      flat: ['语言', '构建', '数据库架构'],
      surfaceAriaLabel: '工作项视图',
      agents: ['智能体控制摘要', '规划协调员'],
      guidance: ['编辑', '预览', '3 个字符', 'Markdown 渲染预览', '在编辑模式下撰写 Markdown，切换到预览即可查看渲染结果。'],
      operationsNoScript: '请使用支持 JavaScript 的浏览器查看运营与规划。',
      deliveryHealth: 'Runtime 的投递状态',
      workRoom: ['已选择', '已解决', '待处理'],
      attachments: {
        labels: ['Work Item 附件', '附件', '文件不可变，并保留其人类或智能体来源。', '附加文件', '选择要附加的文件', '取消', '重试上传', '取消上传', '暂无附件。', '文件'],
        bytes: '8 字节',
        errors: ['上传验证超时。', '无法加载附件。', '对象上传失败（503）。', '上传未通过验证（rejected）。', '上传失败。', '无法取消上传。'],
        phases: { preparing: '准备', uploading: '上传', verifying: '验证' },
        announcement: '正在上传附件…',
      },
    })
    expect(payload.inboxTitleZh).toBe('收件箱')
    expect(payload.sessionLoadingZh).toBe('正在加载智能体 Session…')
    expect(payload.liveAgentsZh).toBe('在线智能体')
    expect(payload.relationsTitleZh).toBe('阻塞与关联工作')
    expect(payload.evidenceTitleZh).toBe('协作状态展示')
    expect(payload.workRoomTitleZh).toBe('Work Room')
    expect(payload.healthOnTrackZh).toBe('进展顺利')
  })

  it('maps every Operations API enum to complete English display copy', async () => {
    document.cookie = 'workmesh_locale=en; Path=/'
    render(createElement(LocaleProvider, null, createElement(EnglishOperationsProbe)))
    const probe = screen.getByTestId('english-operations-copy')
    await waitFor(() => expect(JSON.parse(probe.textContent ?? '{}').search).toBe('Search loaded Operations records'))
    expect(JSON.parse(probe.textContent ?? '{}')).toEqual({
      overlayCopy: {
        close: 'Close',
        closeAgentOverlay: 'Close',
        teamAccessName: 'Manage team access for Codex',
      },
      completenessContract: {
        flat: ['Language', 'build', 'schema'],
        surfaceAriaLabel: 'Work surfaces',
        agents: ['Agent control summary', 'Planning coordinator'],
        guidance: ['Edit', 'Preview', '3 characters', 'Rendered Markdown preview', 'Write Markdown in edit mode, then switch to preview to see the rendered result.'],
        operationsNoScript: 'Use a browser with JavaScript support to view Planning & Operations.',
        deliveryHealth: 'Delivery health for Runtime',
        workRoom: ['selected', 'Resolved', 'Open'],
        attachments: {
          labels: ['Work Item attachments', 'Attachments', 'Files remain immutable and keep their Human or Agent provenance.', 'Attach file', 'Choose a file to attach', 'Cancel', 'Retry upload', 'Cancel upload', 'No attachments yet.', 'file'],
          bytes: '8 bytes',
          errors: ['Upload verification timed out.', 'Unable to load attachments.', 'Object upload failed (503).', 'Upload did not verify (rejected).', 'Upload failed.', 'Unable to cancel upload.'],
          phases: { preparing: 'Preparing', uploading: 'Uploading', verifying: 'Verifying' },
          announcement: 'Uploading attachment…',
        },
      },
      toast: {
        notifications: 'Notifications',
        dismiss: 'Dismiss',
        dismissLabel: 'Dismiss notification: Team created (2/3)',
        partial: 'Completed 2; 1 remain selected for retry.',
        issue: 'Created “Wide-screen acceptance”.',
      },
      settingsTabs: ['Settings sections', 'Workspace', 'Planning & Operations'],
      settingsTeamUnavailable: 'The selected team is unavailable or no longer accessible. Retry to restore Workspace settings.',
      settingsDelete: {
        title: 'Delete Team',
        description: 'This Team leaves active navigation; associated work is retained but unavailable.',
        constraint: 'At least one active Team must remain.',
        cancel: 'Cancel',
        close: 'Close',
        deleting: 'Deleting…',
        revision: 'This Team changed in another operation. Close this dialog, refresh, and try again.',
        lastTeam: 'The last active Team cannot be deleted. Create another active Team first.',
        failed: 'Unable to delete this Team. Check your connection and try again.',
        confirm: 'Delete Team Runtime',
      },
      settingsWorkflowColors: {
        legend: 'Status color',
        presets: { neutral: 'Neutral', blue: 'Blue', green: 'Green', amber: 'Amber', red: 'Red' },
        custom: 'Custom',
        customInput: 'Custom color',
        value: 'Color value',
        created: 'Created workflow state Review.',
      },
      connectMcp: {
        descriptions: [
          'Use TOML MCP server configuration with environment-backed request headers.',
          'Use remote JSON configuration with environment-backed request headers.',
          'Use extension configuration over Streamable HTTP.',
          'Use a standards-compatible Streamable HTTP configuration.',
        ],
        configuration: 'Configuration template: OpenCode remote MCP configuration',
        region: 'Configuration preview: OpenCode remote MCP configuration',
        announcements: ['Configuration copied to the clipboard.', 'Secure connection link copied to the clipboard.'],
        environment: [
          'Store the redeemed installation credential as WORKMESH_INSTALLATION_TOKEN; never paste it into a configuration file.',
          'Send it only through the X-WorkMesh-Installation-Token header to the exact server URL shown above.',
          'Require Client Profile 1.0 and Skill 1.1.0 (sha256:safe-public-hash).',
        ],
        bootstrap: [
          'Fetch public discovery and confirm the server advertises OpenCode; reject unknown protocol, client, Profile, or Skill selectors.',
          'Redeem before the one-time pairing fragment expires and keep the resulting credential only in the client secret store.',
          'Call verify_connection and require an active Team, matching Profile / Skill / capability scope, and responsible Human.',
          'Call get_workmesh_context before selecting work; tool availability never grants write authority.',
          'Stop when discovery reports revocation, expiry, scope mismatch, disablement, or inconsistent live facts.',
        ],
        fallback: 'Local stdio fallback: set WORKMESH_API_URL and WORKMESH_INSTALLATION_TOKEN in the local secret environment, then run pnpm --filter @workmesh/mcp start:stdio.',
      },
      search: 'Search loaded Operations records',
      metrics: {
        unavailable: 'Usage data unavailable',
        records: 'records',
        minorUnits: 'ZZZ minor units',
        durationUnits: ['h', 'm', 's'],
      },
      cycle: ['Current', 'Upcoming', 'History'],
      initiativeStatus: ['Planned', 'Active', 'Paused', 'Completed', 'Canceled'],
      initiativePriority: ['None', 'Low', 'Medium', 'High', 'Urgent'],
      initiativeHealth: ['On track', 'At risk', 'Off track', 'Unknown'],
      rule: ['Enabled', 'Paused', 'Disabled'],
      loop: ['Enabled', 'Paused', 'Disabled'],
      run: ['Pending', 'Claimed', 'Running', 'Succeeded', 'Failed', 'Dead', 'Canceled', 'Dry run'],
      templateKind: ['Work item', 'Project', 'Agent run', 'Handoff', 'Automation'],
      templateStatus: ['Draft', 'Active', 'Archived'],
    })
  })

  it('provides concise Chinese and English approval decisions, authority states, and recovery copy', async () => {
    const { unmount } = render(createElement(LocaleProvider, null, createElement(ApprovalCopyProbe)))
    const probe = screen.getByTestId('approval-copy')
    let payload = JSON.parse(probe.textContent ?? '{}')
    expect(payload.actions).toEqual(['通过', '驳回', '其他意见'])
    expect(payload.feedback).toEqual(['通过并附带要求', '驳回并附带反馈', '请先填写要留给 Agent 的意见。'])
    expect(payload.blocked).toHaveLength(5)
    expect(payload.failures).toHaveLength(6)
    expect(payload.quorum).toContain('1/2')

    unmount()
    document.cookie = 'workmesh_locale=en; Path=/'
    render(createElement(LocaleProvider, null, createElement(ApprovalCopyProbe)))
    await waitFor(() => expect(JSON.parse(screen.getByTestId('approval-copy').textContent ?? '{}').locale).toBe('en'))
    payload = JSON.parse(screen.getByTestId('approval-copy').textContent ?? '{}')
    expect(payload.actions).toEqual(['Approve', 'Reject', 'Other feedback'])
    expect(payload.feedback).toEqual(['Approve with requirements', 'Reject with feedback', 'Enter the feedback that should be sent to the Agent.'])
    expect(payload.failures.every((message: string) => message.length > 20)).toBe(true)
    expect(payload.quorum).toContain('1/2')
  })
})
