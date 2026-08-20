'use client'

/**
 * Internal preview page for the Round 6 board redesign.
 *
 * Shows the WorkItemList and WorkItemBoard with sample data covering
 * all five status categories (ready / in_progress / review / done / closed)
 * with the new color theme. The board uses full width and supports
 * bidirectional scroll + drag-to-pan + per-column resizable widths.
 * Not linked from production navigation.
 */
import { useCallback, useState } from 'react'
import { AppShell, Button, type WorkItemCardData, type WorkItemStatusOption, WorkItemBoard, WorkItemList } from '@workmesh/ui'
import { KanbanIcon, RowsIcon } from '@phosphor-icons/react'
import { useLocale } from '../lib/i18n'

const columns: WorkItemStatusOption[] = [
  { id: 'ready', name: 'Ready', category: 'ready' },
  { id: 'in_progress', name: 'In Progress', category: 'in_progress' },
  { id: 'review', name: 'In Review', category: 'review' },
  { id: 'done', name: 'Done', category: 'done' },
  { id: 'closed', name: 'Closed', category: 'closed' },
]

// Mock label pool shown as suggestions inside the Linear-style popover.
const availableLabels = [
  'enhancement', 'bug', 'css', 'ux', 'i18n', 'chore', 'frontend', 'backend',
  'api', 'idempotency', 'concurrency', 'security', 'regression', 'flaky',
  'a11y', 'performance', 'i18n:zh-CN', 'docs', 'type:enhancement', 'type:bug',
  'area:web', 'area:api', 'area:worker', 'module:auth', 'module:billing',
  'priority:high', 'priority:urgent',
]

const baseItems: WorkItemCardData[] = [
  // Ready
  { id: 'r1', identifier: 'WM-201', title: '为 Issues 看板添加拖动平移能力', statusId: 'ready', statusName: 'Ready', statusCategory: 'ready', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'area:web'], activeAgent: 'Codex', activeAgentState: 'idle' },
  { id: 'r2', identifier: 'WM-202', title: '为每列添加可调整宽度的拖动把手', statusId: 'ready', statusName: 'Ready', statusCategory: 'ready', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'css', 'area:web', 'frontend'] },
  { id: 'r3', identifier: 'WM-203', title: '把看板状态色调整到 Ready=蓝 / In Progress=黄 / In Review=绿', statusId: 'ready', statusName: 'Ready', statusCategory: 'ready', priority: 'low', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'css', 'a11y', 'docs', 'area:web'] },
  { id: 'r4', identifier: 'WM-204', title: '调查看板视图的滚动行为差异', statusId: 'ready', statusName: 'Ready', statusCategory: 'ready', priority: 'none', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'regression', 'flaky', 'area:web', 'module:auth', 'priority:high'] },
  // In Progress
  { id: 'i1', identifier: 'WM-118', title: '集成拉起 web UI 并完成本轮视觉验收', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'urgent', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'frontend', 'ux', 'area:web'], activeAgent: 'Codex', activeAgentState: 'executing', blockedByCount: 0, blockingCount: 2, subIssueCount: 3, completedSubIssueCount: 1 },
  { id: 'i2', identifier: 'WM-119', title: '为看板列添加分类色与拖拽提示', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'high', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'a11y', 'css'], activeAgent: 'Codex', activeAgentState: 'awaiting_approval', blockedByCount: 1, blockingCount: 0, subIssueCount: 2, completedSubIssueCount: 0 },
  { id: 'i3', identifier: 'WM-120', title: '为 issue 卡片增加左侧状态条与优先级徽标', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'css', 'area:web'], activeAgent: 'Codex', activeAgentState: 'executing' },
  { id: 'i4', identifier: 'WM-60', title: '修复 session 卡片 pill 在窄列宽下文字换行问题', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['bug', 'css', 'area:web', 'frontend'], activeAgent: 'Codex', activeAgentState: 'executing' },
  { id: 'i5', identifier: 'WM-205', title: '把看板视图内容填充满 app-content 容器', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'high', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'css', 'area:web', 'frontend', 'ux'], activeAgent: 'Codex', activeAgentState: 'executing' },
  { id: 'i6', identifier: 'WM-206', title: '看板启用上下与左右双向滚动并支持拖动平移', statusId: 'in_progress', statusName: 'In Progress', statusCategory: 'in_progress', priority: 'high', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'css', 'a11y', 'area:web', 'performance', 'docs'] },
  // In Review
  { id: 'r1v', identifier: 'WM-92', title: 'API 路由批量评审请求加入幂等键', statusId: 'review', statusName: 'In Review', statusCategory: 'review', priority: 'high', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['api', 'idempotency', 'area:api', 'backend', 'concurrency'], activeAgent: 'Codex', activeAgentState: 'awaiting_approval', blockingCount: 1 },
  { id: 'r2v', identifier: 'WM-207', title: '状态机迁移校验：人工撤销应当落 revision', statusId: 'review', statusName: 'In Review', statusCategory: 'review', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p2', projectName: 'WorkMesh Core', labels: ['backend', 'concurrency', 'area:api', 'module:auth'], blockedByCount: 0, blockingCount: 0, subIssueCount: 0, completedSubIssueCount: 0 },
  { id: 'r3v', identifier: 'WM-208', title: '审批 inbox 长描述换行优化', statusId: 'review', statusName: 'In Review', statusCategory: 'review', priority: 'low', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'css', 'area:web'] },
  // Done
  { id: 'd1', identifier: 'WM-65', title: '为 work room 卡片补齐中文翻译', statusId: 'done', statusName: 'Done', statusCategory: 'done', priority: 'medium', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['i18n', 'enhancement', 'i18n:zh-CN', 'area:web'], activeAgent: 'Codex', activeAgentState: 'completed', subIssueCount: 1, completedSubIssueCount: 1 },
  { id: 'd2', identifier: 'WM-70', title: '会话详情页 plan step diff 对比', statusId: 'done', statusName: 'Done', statusCategory: 'done', priority: 'low', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['enhancement', 'ux', 'area:web', 'frontend'] },
  { id: 'd3', identifier: 'WM-209', title: '替换老旧 session-card 文字颜色 token', statusId: 'done', statusName: 'Done', statusCategory: 'done', priority: 'low', responsibleHuman: '许润鑫', projectId: 'p1', projectName: 'WorkMesh Web', labels: ['chore', 'css', 'area:web'] },
  // Closed
  { id: 'c1', identifier: 'WM-5', title: '已废弃的旧 schema 同步任务', statusId: 'closed', statusName: 'Closed', statusCategory: 'closed', priority: 'none', responsibleHuman: '许润鑫', projectId: 'p2', projectName: 'WorkMesh Core', labels: ['chore', 'docs'] },
  { id: 'c2', identifier: 'WM-210', title: '一次性迁移脚本（已下线）', statusId: 'closed', statusName: 'Closed', statusCategory: 'closed', priority: 'none', responsibleHuman: '许润鑫', projectId: 'p2', projectName: 'WorkMesh Core', labels: ['chore', 'security'] },
]

export default function PreviewIssues() {
  const [layout, setLayout] = useState<'list' | 'board'>('board')
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [items, setItems] = useState<WorkItemCardData[]>(baseItems)
  const { issueCopy } = useLocale()
  const onLabelsChange = useCallback((item: WorkItemCardData, nextLabels: string[]) => {
    setItems(current => current.map(existing => (existing.id === item.id ? { ...existing, labels: nextLabels } : existing)))
  }, [])
  return (
    <AppShell
      actorName="预览模式"
      contextLabel="Round 6 看板视觉"
      navigation={[]}
      productName="WorkMesh"
      utilityNavigation={[]}
    >
      <main className="content content--full preview-issues">
        <header className="preview-issues-header">
          <div>
            <h1>Issues 视觉与交互迭代 · Round 6</h1>
            <p>本页面是内部预览，看板视图演示：双向滚动 / 拖动平移 / 每列宽度可调 / Ready=蓝 In Progress=黄 In Review=绿 / Linear 风格标签溢出。生产导航中未链接。</p>
          </div>
          <div className="work-surface-layout-toggle" aria-label="视图切换">
            <Button aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} icon={<RowsIcon aria-hidden size={16} weight="bold" />} onClick={() => setLayout('list')} type="button" variant="ghost">列表</Button>
            <Button aria-pressed={layout === 'board'} className={layout === 'board' ? 'selected' : undefined} icon={<KanbanIcon aria-hidden size={16} weight="bold" />} onClick={() => setLayout('board')} type="button" variant="ghost">看板</Button>
          </div>
        </header>

        {layout === 'list' ? (
          <section className="preview-section preview-section--list">
            <h2>1. 列表视图</h2>
            <WorkItemList
              availableLabels={availableLabels}
              copy={issueCopy}
              items={items}
              maxVisibleLabels={5}
              statusOptions={columns}
              onLabelsChange={onLabelsChange}
              onMove={() => undefined}
              onOpen={() => undefined}
              onOpenProject={() => undefined}
            />
          </section>
        ) : (
          <section className="preview-section preview-section--board">
            <h2>2. 看板视图（拖动空白处平移 / 列右边把手调整宽度）</h2>
            <WorkItemBoard
              availableLabels={availableLabels}
              copy={issueCopy}
              items={items}
              columns={columns}
              columnWidths={columnWidths}
              maxVisibleLabels={3}
              minColumnWidth={240}
              maxColumnWidth={520}
              onColumnWidthChange={(id, width) => setColumnWidths(current => ({ ...current, [id]: width }))}
              onLabelsChange={onLabelsChange}
              onMove={() => undefined}
              onOpen={() => undefined}
              onOpenProject={() => undefined}
            />
          </section>
        )}
      </main>
    </AppShell>
  )
}
