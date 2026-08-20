'use client'

/**
 * Internal preview page for the Round 2 redesign.
 *
 * Renders the new Settings tabs, the Team Access chip editor, and the Session
 * card grid without hitting the network. Only used to take screenshots during
 * design review; not linked from anywhere in production navigation.
 */
import { AppShell, Button } from '@workmesh/ui'
import { CheckCircleIcon, EyeIcon, XCircleIcon } from '@phosphor-icons/react'

const sampleRequested = ['work:read', 'work:write', 'comment:write', 'message:write', 'plan:write']
const sampleApproved = ['work:read', 'work:write', 'comment:write']
const sampleTeams = [
  { id: 't1', key: 'GEN', name: 'General' },
  { id: 't2', key: 'ENG', name: 'Engineering' },
  { id: 't3', key: 'OPS', name: 'Operations' },
]
const sampleSessions = [
  { id: 'a1b2c3d4', agent: 'Codex internal production coordinator', state: 'executing' as const, workItem: 'WM-118', heartbeat: '12s ago' },
  { id: '7e5f6789', agent: 'Codex internal production coordinator', state: 'awaiting_approval' as const, workItem: 'WM-92', heartbeat: '2m ago' },
  { id: '063ac920', agent: 'Codex internal production coordinator', state: 'failed' as const, workItem: null, heartbeat: '5m ago' },
  { id: '8a7cceed', agent: 'Codex internal production coordinator', state: 'completed' as const, workItem: 'WM-65', heartbeat: '18m ago' },
  { id: '9e468b95', agent: 'Codex internal production coordinator', state: 'stale' as const, workItem: 'WM-60', heartbeat: '1h ago' },
  { id: '8fb35872', agent: 'Codex internal production coordinator', state: 'canceled' as const, workItem: null, heartbeat: '1h ago' },
]

const stateLabel: Record<string, string> = {
  executing: '执行中', awaiting_approval: '待审批', failed: '失败',
  completed: '已完成', stale: '已过期', canceled: '已取消',
}
const stateClass: Record<string, string> = {
  executing: 'pill is-active', awaiting_approval: 'pill is-warn', failed: 'pill is-danger',
  completed: 'pill is-muted', stale: 'pill is-warn', canceled: 'pill is-muted',
}

export default function PreviewRound2() {
  return (
    <AppShell
      actorName="预览模式"
      contextLabel="Round 2 预览"
      navigation={[]}
      productName="WorkMesh"
      utilityNavigation={[]}
    >
      <main className="content preview-round2">
        <header><div><h1>Round 2 视觉验收预览</h1><p>本页面是内部预览，展示新设计的 Settings tabs、Team access chips、Session 卡片。生产导航中未链接。</p></div></header>

        <section className="preview-section">
          <h2>1. Settings 页 tabs（工作区 / 运营与规划）</h2>
          <div className="settings-card">
            <nav className="settings-tabs" role="tablist" aria-label="设置分区">
              <button aria-controls="settings-tab-workspace" aria-selected={true} className="is-selected" id="settings-tab-workspace-trigger" role="tab" type="button">
                <span className="settings-tab-label">工作区</span>
                <span className="settings-tab-description">团队、工作流状态与权限</span>
              </button>
              <button aria-controls="settings-tab-operations" aria-selected={false} id="settings-tab-operations-trigger" role="tab" type="button">
                <span className="settings-tab-label">运营与规划</span>
                <span className="settings-tab-description">周期、自动化与运行历史</span>
              </button>
            </nav>
          </div>
        </section>

        <section className="preview-section">
          <h2>2. 智能体团队访问（chip + 视图切换）</h2>
          <div className="preview-team-access">
            {sampleTeams.map(team => (
              <article className="team-access-card" key={team.id}>
                <header>
                  <div>
                    <strong>{team.name} <small>({team.key})</small></strong>
                  </div>
                  <span className="pill is-active">已启用</span>
                </header>
                <div className="team-access-form">
                  <div className="team-access-toggle" role="tablist" aria-label="能力视图">
                    <button aria-pressed={false} type="button" role="tab">
                      <EyeIcon aria-hidden size={14} weight="bold" />
                      已申请
                      <span className="team-access-toggle-count">{sampleRequested.length}</span>
                    </button>
                    <button aria-pressed={true} className="is-selected" type="button" role="tab">
                      <CheckCircleIcon aria-hidden size={14} weight="bold" />
                      已批准
                      <span className="team-access-toggle-count">{sampleApproved.length}</span>
                    </button>
                  </div>
                  <div className="team-access-chips" role="tabpanel" aria-label="已批准">
                    {sampleRequested.map(cap => {
                      const selected = sampleApproved.includes(cap)
                      return (
                        <button
                          aria-pressed={selected}
                          className={`chip ${selected ? 'chip-solid' : 'chip-outline'}`}
                          key={cap}
                          type="button"
                        >
                          {selected ? <CheckCircleIcon aria-hidden size={12} weight="bold" /> : null}
                          {`已批准 ${cap}`}
                        </button>
                      )
                    })}
                  </div>
                  <div className="team-access-actions">
                    <small className="team-access-meta">已选 {sampleApproved.length} 项 · 点击 chip 进行切换；点击「保存」写入授权。</small>
                    <div className="team-access-buttons">
                      <Button icon={<CheckCircleIcon aria-hidden size={16} weight="bold" />} type="button" variant="primary">更新授权</Button>
                      <Button icon={<XCircleIcon aria-hidden size={16} weight="bold" />} type="button" variant="danger">撤销</Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="preview-section">
          <h2>3. Sessions 卡片列表</h2>
          <div className="preview-session-list">
            {sampleSessions.map(session => (
              <a className="session-card" href="#" key={session.id}>
                <header>
                  <span className={stateClass[session.state]}>{stateLabel[session.state]}</span>
                  <strong className="session-card-name">{session.agent}</strong>
                </header>
                <dl>
                  <div><dt>Session</dt><dd><code>{session.id}</code></dd></div>
                  <div><dt>Issue</dt><dd>{session.workItem ? <code>{session.workItem}</code> : <span className="muted">无 Issue</span>}</dd></div>
                  <div><dt>心跳</dt><dd>{session.heartbeat}</dd></div>
                </dl>
              </a>
            ))}
          </div>
        </section>

        <style>{`
          .preview-round2 { display: grid; gap: 1.5rem; }
          .preview-round2 h1 { margin: 0; font-size: 1.45rem; letter-spacing: -.025em; }
          .preview-round2 h2 { margin: 0 0 .75rem; font-size: 1rem; }
          .preview-section { padding: 1.1rem 1.2rem; background: var(--wm-surface); border: 1px solid var(--wm-border); border-radius: 12px; box-shadow: 0 1px 2px #11111108; }
          .preview-team-access { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1rem; }
          .preview-session-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .75rem; }
          .preview-round2 .muted { color: var(--wm-muted); }
          .preview-round2 .pill { display: inline-flex; align-items: center; padding: .2rem .55rem; border-radius: 999px; font-size: .72rem; font-weight: 650; letter-spacing: .03em; text-transform: uppercase; border: 1px solid var(--wm-border); white-space: nowrap; flex-shrink: 0; }
          .preview-round2 .pill.is-active { color: #0c6b3f; background: #e8f6ee; border-color: #b6e1c5; }
          .preview-round2 .pill.is-warn { color: #8a5a00; background: #fff4d6; border-color: #f5d791; }
          .preview-round2 .pill.is-danger { color: #8a2433; background: #fde8ec; border-color: #f4b9c4; }
          .preview-round2 .pill.is-muted { color: var(--wm-muted); background: var(--wm-surface-subtle); }
          .preview-round2 .session-card > header { flex-wrap: nowrap; align-items: flex-start; }
          .preview-round2 .session-card-name { flex: 1 1 auto; min-width: 0; }
        `}</style>
      </main>
    </AppShell>
  )
}
