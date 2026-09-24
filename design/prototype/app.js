/* ==========================================================================
   WorkMesh Control Room — interactive prototype
   Vanilla JS, no build step. Renders into #app.
   ========================================================================== */

/* ---------------- Data ---------------- */

const STATUS = {
  backlog:     { name: '待办',     color: '#9BA1A9', cat: 'backlog' },
  todo:        { name: '已就绪',   color: '#6BA0FF', cat: 'unstarted' },
  in_progress: { name: '进行中',   color: '#E3B341', cat: 'started' },
  in_review:   { name: '评审中',   color: '#A78BFA', cat: 'started' },
  blocked:     { name: '已阻塞',   color: '#FF6B63', cat: 'started' },
  done:        { name: '已完成',   color: '#3FB950', cat: 'completed' },
};

const WORK_ITEMS = [
  { id: 'WM-142', title: '实现 prepare / apply 的一致性哈希规范化', status: 'in_progress', pri: 'high',
    project: '协作协议', human: '许润鑫', agent: 'atlas', agentState: 'executing',
    budget: 0.62, labels: ['bug', 'p0'], blocked: 0, blocks: 2, sub: [3, 5] },
  { id: 'WM-139', title: '审批路由：过期策略与自动升级', status: 'in_review', pri: 'urgent',
    project: '治理', human: '许润鑫', agent: 'atlas', agentState: 'awaiting_review',
    budget: 0.88, labels: ['governance'], blocked: 0, blocks: 1, sub: [0, 0] },
  { id: 'WM-151', title: '看板列宽持久化与响应式回退', status: 'blocked', pri: 'medium',
    project: 'Web 界面', human: '陈可', agent: null, agentState: null,
    budget: 0, labels: ['ui'], blocked: 1, blocks: 0, sub: [1, 3] },
  { id: 'WM-148', title: '租约超时后的工作项回收流程', status: 'in_progress', pri: 'high',
    project: '协作协议', human: '许润鑫', agent: 'bolt', agentState: 'executing',
    budget: 0.35, labels: ['reliability'], blocked: 0, blocks: 0, sub: [0, 0] },
  { id: 'WM-155', title: '运行成本采集与用量指标面板', status: 'todo', pri: 'low',
    project: '运营', human: '林望', agent: null, agentState: null,
    budget: 0, labels: ['metrics'], blocked: 0, blocks: 0, sub: [0, 4] },
  { id: 'WM-127', title: '富文本编辑器：粘贴与 Markdown 往返', status: 'done', pri: 'medium',
    project: 'Web 界面', human: '陈可', agent: 'atlas', agentState: 'completed',
    budget: 1, labels: ['ui', 'content'], blocked: 0, blocks: 0, sub: [4, 4] },
  { id: 'WM-160', title: '智能体注册表的密钥轮换', status: 'backlog', pri: 'low',
    project: '治理', human: '许润鑫', agent: null, agentState: null,
    budget: 0, labels: ['security'], blocked: 0, blocks: 0, sub: [0, 0] },
];

const ATTENTION = [
  { risk: 'high', kind: '审批', tone: 'danger',
    title: '生产环境部署审批',
    desc: '智能体 <b>atlas</b> 请求将 <b>WM-142</b> 的修复发布到生产环境，变更涉及 3 个迁移文件。',
    age: '逾期 2 小时', urgent: true,
    scope: ['WM-142', 'repo:workmesh/api', 'migration ×3'],
    consequence: ['写操作：生产数据库', '不可逆：是', '影响：全部租户'],
    actions: ['通过', '驳回'] },
  { risk: 'medium', kind: '澄清', tone: 'warning',
    title: '需要确认验收标准',
    desc: '智能体 <b>bolt</b> 无法判定 <b>WM-148</b> 的「租约回收」是否包含跨团队场景，已暂停 12 分钟。',
    age: '12 分钟前', urgent: false,
    scope: ['WM-148', 'plan:v3'],
    consequence: ['写操作：无', '阻塞：1 个 Session'],
    actions: ['回答', '转派'] },
  { risk: 'low', kind: '完成评审', tone: 'info',
    title: 'WM-127 待验收',
    desc: '智能体 <b>atlas</b> 已提交结果摘要与 4 项证据，等待人类确认。',
    age: '38 分钟前', urgent: false,
    scope: ['WM-127', 'artifact ×4', 'PR #88'],
    consequence: ['写操作：无', '已完成：4/4 步'],
    actions: ['验收', '退回'] },
];

const SESSIONS = [
  { id: 'ses_8f3a2c', agent: 'atlas', state: 'executing', wi: 'WM-142',
    step: 'normalize-apply-hash', hb: '3s', budget: 0.62, risk: 'low' },
  { id: 'ses_2b91d4', agent: 'bolt', state: 'awaiting_input', wi: 'WM-148',
    step: 'lease-reclaim-scope', hb: '12m', budget: 0.35, risk: 'medium' },
  { id: 'ses_77c1e9', agent: 'atlas', state: 'awaiting_review', wi: 'WM-139',
    step: 'approval-expiry-policy', hb: '48s', budget: 0.88, risk: 'high' },
  { id: 'ses_5d0e33', agent: 'scribe', state: 'stale', wi: 'WM-151',
    step: 'column-width-persist', hb: '26m', budget: 0.12, risk: 'high' },
];

const AGENTS = [
  { name: 'atlas', display: 'Atlas', state: 'active', caps: 12, conc: 3,
    hb: 3, desc: '主力实现智能体，负责协议层与迁移。' },
  { name: 'bolt', display: 'Bolt', state: 'active', caps: 8, conc: 2,
    hb: 12, desc: '可靠性与并发场景专项。' },
  { name: 'scribe', display: 'Scribe', state: 'inactive', caps: 5, conc: 1,
    hb: 26, desc: '文档与内容整理。' },
];

const ACTIVITY = [
  { t: '14:22', node: 'is-success', title: '完成步骤', body: 'normalize-apply-hash — 抽出共享规范化函数', tool: null },
  { t: '14:19', node: 'is-info', title: '工具调用', body: '在 4 个文件中替换 localeCompare', tool: 'edit ×4 · 118ms' },
  { t: '14:15', node: 'is-info', title: '证据', body: '新增回归测试 mcp/hash-consistency.test.ts', tool: 'artifact:test_report' },
  { t: '14:08', node: 'is-warning', title: '风险提示', body: 'apply 端仍有一处未规范化，可能导致同类缺陷', tool: null },
  { t: '13:56', node: 'is-success', title: '验证通过', body: 'pnpm test — 28 个任务全绿', tool: 'exec · 42s' },
];

const PLAN = [
  { n: 1, title: '抽出 normalizeProjectImportPlan', sub: '两端共用的规范化入口', sid: 'a1f2…9c', state: 'complete', diff: 'same' },
  { n: 2, title: '替换 6 处 localeCompare', sub: '改为确定性的 code-unit 比较', sid: 'b7c3…41', state: 'complete', diff: 'same' },
  { n: 3, title: '修复 apply 端遗漏的规范化', sub: '本轮新增', sid: 'c9d4…22', state: 'current', diff: 'add' },
  { n: 4, title: '回归测试：证明修复前失败', sub: '本轮新增', sid: 'd2e8…70', state: 'pending', diff: 'add' },
  { n: 5, title: '更新 MIGRATION.md', sub: '已取消：本变更不涉及迁移', sid: 'e5f1…38', state: 'blocked', diff: 'remove' },
];

/* ---------------- Utilities ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const icon = (name, size = 15, cls = '') =>
  `<svg class="${cls}" width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const statusPill = (key) => {
  const s = STATUS[key];
  return `<span class="status" style="--swatch:${s.color}">${s.name}</span>`;
};

const priGlyph = (p) => {
  const label = { urgent: '紧急', high: '高', medium: '中', low: '低' }[p] || '无';
  return `<span class="pri" data-p="${p}" title="优先级：${label}">
    <span class="pri-bars"><i></i><i></i><i></i></span>${label}</span>`;
};

const meter = (v, isWarn) => {
  const cls = v >= 0.85 ? 'is-danger' : v >= 0.7 ? 'is-warn' : '';
  return `<span class="meter">
    <span class="meter-track"><span class="meter-fill ${cls}" style="width:${Math.round(v * 100)}%"></span></span>
    <span class="meter-value">${Math.round(v * 100)}%</span>
  </span>`;
};

/* Dense-row budget read-out: a slim bar plus the number, so the row keeps
   its rhythm without a full meter competing with the title. */
const budgetChip = (v) => {
  if (!v) return '';
  const cls = v >= 0.85 ? 'is-danger' : v >= 0.7 ? 'is-warn' : '';
  return `<span class="wi-budget" title="预算消耗 ${Math.round(v * 100)}%">
    <span class="wi-budget-track"><span class="wi-budget-fill ${cls}" style="width:${Math.round(v * 100)}%"></span></span>
    <span class="wi-budget-n">${Math.round(v * 100)}%</span>
  </span>`;
};

const avatar = (name, isAgent) =>
  `<span class="avatar ${isAgent ? 'avatar-agent' : ''}">${name.slice(0, 1).toUpperCase()}</span>`;

/* ---------------- Widget kit (W) ----------------
   统一控件库：纯函数产出 HTML 字符串 + data-* 行为钩子；行为由 initWidgets()
   的一次性事件委托驱动，不随 render 重挂。真实实现（React 等）可按同签名移植，
   w- 前缀类名与 data-* 属性即组件的稳定契约。 */

const W = {
  /* 折叠卡共用 chevron；各容器用 CSS 决定指向与旋转 */
  CHEV: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',

  /* Tab 组。items: {id,label,count}；active 缺省取第一项；small 为紧凑变体。
     id 写入 data-wtabs，作为 W.actions 注册表的组键（可省略）。 */
  tabs: ({ id, items, active, small }) => {
    const on = items.some((it) => it.id === active) ? active : items[0]?.id;
    return `<div class="w-tabs${small ? ' is-sm' : ''}" role="tablist"${id ? ` data-wtabs="${id}"` : ''}>${
      items.map((it) => `<button type="button" class="w-tab${it.id === on ? ' is-on' : ''}" role="tab"
        data-wtab="${it.id}" aria-selected="${it.id === on}">${it.label}${
        it.count != null ? `<span class="w-n">${it.count}</span>` : ''}</button>`).join('')}</div>`;
  },

  /* 折叠卡：统一 chevron 与 marker 隐藏；cls/attrs 承载各处视觉与状态钩子 */
  disc: ({ cls = '', open = false, head = '', body = '', attrs = '' }) =>
    `<details class="${cls}" data-wdisc${attrs}${open ? ' open' : ''}><summary>${head}<span class="w-chev">${W.CHEV}</span></summary>${body}</details>`,

  /* 状态胶囊：tone + 可选圆点（对应旧 badge badge-{tone} badge-dot 结构） */
  pill: ({ tone = 'neutral', dot = false, text = '' }) =>
    `<span class="w-pill is-${tone}">${dot ? '<i class="w-dot"></i>' : ''}${text}</span>`,

  /* 三格置信度信号条（建议卡页脚） */
  meter: (v) => {
    const bars = v >= 0.8 ? 3 : v >= 0.5 ? 2 : 1;
    return `<span class="aw-bars">${[0, 1, 2].map((b) => `<i${b < bars ? ' class="is-on"' : ''}></i>`).join('')}</span>`;
  },

  /* 组动作注册表：W.actions[data-wtabs] = (tabId, tabEl) => …，init 时注册一次 */
  actions: {},
};

/* 控件行为：一次性事件委托（init 时挂一次，防重复标记保证不随 render 重挂；
   动态插入的消息卡如 live think 卡同样被覆盖）。 */
function initWidgets() {
  if (initWidgets._bound) return;
  initWidgets._bound = true;

  /* 成果检查器：切换代码/变更/预览需要重渲染（状态存 AW.tab） */
  W.actions.inspector = (id) => { AW.tab = id; renderAgent(); };

  /* Think 卡阶段过滤：按 data-stage 隐藏不匹配行 —— 纯 hidden 切换，
     不重渲染，保持 details 展开态 */
  W.actions.think = (id, tab) => {
    const card = tab.closest('.aw-think');
    if (!card) return;
    $$('.aw-step', card).forEach((row) => {
      row.hidden = id !== 'all' && row.dataset.stage !== id;
    });
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-wtab]');
    if (!tab) return;
    const group = tab.closest('[data-wtabs]');
    if (!group) return;

    /* 1) 组内视觉选中：is-on + aria-selected 单选 */
    $$('.w-tab', group).forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', String(on));
    });

    /* 2) 面板联动：scope 内 [data-wpanel] 按 data-wtab 切换 hidden */
    const scope = group.closest('[data-wscope]') || group.parentElement;
    $$('[data-wpanel]', scope).forEach((p) => { p.hidden = p.dataset.wpanel !== tab.dataset.wtab; });

    /* 3) 组动作注册表分发 */
    W.actions[group.dataset.wtabs]?.(tab.dataset.wtab, tab);
  });
}

/* ---------------- Shell ---------------- */

const NAV = [
  { group: '工作台', items: [
    { id: 'agent',  label: 'Agent 工作台', icon: 'robot', href: '#/agent' },
    { id: 'home',   label: '我的工作', icon: 'home',   href: '#/home',   count: 7 },
    { id: 'active', label: '进行中',   icon: 'play',   href: '#/active', count: 4 },
    { id: 'board',  label: '看板',     icon: 'kanban', href: '#/board' },
    { id: 'backlog',label: '待办池',   icon: 'stack',  href: '#/backlog',count: 12 },
  ]},
  { group: '治理', items: [
    { id: 'inbox',   label: '审批中心', icon: 'inbox',  href: '#/inbox',   count: 3, tone: 'danger' },
    { id: 'agents',  label: '智能体',   icon: 'robot',  href: '#/agents',  count: 3 },
    { id: 'sessions',label: 'Session',  icon: 'activity',href: '#/sessions',count: 4 },
    { id: 'recovery',label: '恢复中心', icon: 'shield', href: '#/recovery',count: 1 },
    { id: 'connect', label: '接入',     icon: 'key',    href: '#/connect' },
  ]},
  { group: '运营', items: [
    { id: 'ops',      label: '运营控制台', icon: 'chart', href: '#/ops' },
    { id: 'settings', label: '设置',       icon: 'gear',  href: '#/settings' },
  ]},
];

const TITLES = {
  agent: ['Agent 工作台', '内建智能体 · 通过 MCP 直接操作工作区'],
  home: ['我的工作', '分配给我与由我负责的工作项'],
  active: ['进行中', '所有已启动的工作项'],
  board: ['看板', '按工作流状态分组'],
  backlog: ['待办池', '尚未排期的工作'],
  inbox: ['审批中心', '需要你决策的审批、澄清与完成评审'],
  agents: ['智能体', '注册表、连接、授权与审批'],
  sessions: ['Session', '正在执行的智能体会话'],
  recovery: ['恢复中心', '陈旧租约、失败运行与需要干预的工作项'],
  ops: ['运营控制台', '用量、成本、流水线与自动化'],
  settings: ['设置', '团队结构与工作流状态'],
  connect: ['接入 WorkMesh', '将外部编码智能体连接到本工作区'],
  install: ['初始化工作区', '创建第一个团队与管理员账号'],
  detail: ['工作项', '执行工作区、验收标准与关系'],
};

/* Routes that render outside the application shell (no sidebar / header). */
const SHELL_FREE = new Set(['login', 'install']);

function sidebar(current) {
  const groups = NAV.map((g) => `
    <div class="nav-group">
      <div class="nav-label">${g.group}</div>
      ${g.items.map((it) => `
        <a class="nav-item" href="${it.href}" ${it.id === current ? 'aria-current="page"' : ''}>
          ${icon(it.icon, 15)}
          <span>${it.label}</span>
          ${it.count ? `<span class="nav-count">${it.count}</span>` : ''}
        </a>`).join('')}
    </div>`).join('');

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">${icon('branch', 15)}</span>
        <span>
          <span class="brand-name">WorkMesh</span>
          <span class="brand-actor">许润鑫</span>
        </span>
      </div>
      <nav class="nav" aria-label="主导航">${groups}</nav>
      <div class="sidebar-foot">
        <div class="row-2">
          <button class="icon-btn" id="theme-toggle" title="切换主题（浅色 / 深色）">${icon('target', 15)}</button>
          <button class="icon-btn" title="通知">${icon('bell', 15)}</button>
          <span class="spacer"></span>
          <span class="release">v1.4.2 · a3f9c1e</span>
        </div>
      </div>
    </aside>`;
}

function header(current, right = '') {
  const [title] = TITLES[current] || ['', ''];
  const group = NAV.find((g) => g.items.some((i) => i.id === current))?.group || '';

  return `
    <header class="header">
      <button class="mobile-trigger" id="mobile-trigger" aria-label="打开导航菜单" aria-expanded="false" aria-controls="sidebar">
        ${icon('menu', 16)}
      </button>
      <div class="crumb">
        <span>${group}</span>
        <span class="crumb-sep">/</span>
        <b>${title}</b>
      </div>
      <div class="header-actions">
        <button class="search-trigger" id="open-palette">
          ${icon('search', 14)}
          <span>搜索或跳转…</span>
          <span class="spacer"></span>
          <kbd>Ctrl</kbd><kbd>K</kbd>
        </button>
        ${right}
      </div>
    </header>`;
}

function pageHead(current, actions = '') {
  const [title, desc] = TITLES[current] || ['', ''];
  return `
    <div class="page-head">
      <div>
        <h1>${title}</h1>
        <p>${desc}</p>
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </div>`;
}

/* ---------------- Screens ---------------- */

function attentionCard(a) {
  return `
    <article class="attn" data-risk="${a.risk}">
      <span class="attn-rail"></span>
      <div class="attn-body">
        <div class="attn-head">
          <span class="badge badge-${a.tone} badge-dot">${a.kind}</span>
          <span class="attn-title">${a.title}</span>
          <span class="attn-age ${a.urgent ? 'urgent' : ''}">${a.age}</span>
        </div>
        <p class="attn-desc">${a.desc}</p>
        <div class="attn-scope">
          ${a.scope.map((s) => `<span class="chip">${s}</span>`).join('')}
        </div>
        <div class="consequence">
          <span class="label">后果预览</span>
          ${a.consequence.map((c, i) => `${i ? '<span class="sep">·</span>' : ''}<span>${c}</span>`).join('')}
        </div>
        <div class="attn-actions">
          <button class="btn btn-primary btn-sm" data-act="approve" data-id="${a.title}">${a.actions[0]}</button>
          <button class="btn btn-sm" data-act="reject" data-id="${a.title}">${a.actions[1]}</button>
          <button class="btn btn-ghost btn-sm">查看证据</button>
        </div>
      </div>
    </article>`;
}

const SCREENS = {
  /* ---- Home: the attention-first workbench ---- */
  home() {
    return `
      ${pageHead('home', `<button class="btn">${icon('tag', 14)}保存视图</button>
                          <button class="btn btn-primary">${icon('plus', 14)}新建工作项</button>`)}

      <section class="section">
        <div class="section-head">
          <h2>需要你</h2>
          <span class="count">3</span>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm">全部处理</button>
        </div>
        <div class="rows">${ATTENTION.map(attentionCard).join('')}</div>
      </section>

      <div class="split-wide">
        <section class="section">
          <div class="section-head">
            <h2>我的工作项</h2>
            <span class="count">5</span>
          </div>
          <div class="rows">${WORK_ITEMS.slice(0, 5).map(workRow).join('')}</div>
        </section>

        <section class="section">
          <div class="section-head">
            <h2>智能体运行</h2>
            <span class="count">4</span>
          </div>
          <div class="rows">${SESSIONS.map(sessionCard).join('')}</div>
        </section>
      </div>`;
  },

  /* ---- Board ---- */
  board() {
    const cols = [
      ['todo',        WORK_ITEMS.filter((w) => w.status === 'todo')],
      ['in_progress', WORK_ITEMS.filter((w) => w.status === 'in_progress')],
      ['in_review',   WORK_ITEMS.filter((w) => w.status === 'in_review')],
      ['blocked',     WORK_ITEMS.filter((w) => w.status === 'blocked')],
      ['done',        WORK_ITEMS.filter((w) => w.status === 'done')],
    ];
    return `
      ${pageHead('board', `<button class="btn">${icon('list', 14)}列表</button>
                           <button class="btn btn-primary">${icon('plus', 14)}新建</button>`)}
      <div class="board">
        ${cols.map(([key, items]) => `
          <div>
            <div class="col-head">
              <span class="dot" style="background:${STATUS[key].color}"></span>
              <span class="name">${STATUS[key].name}</span>
              <span class="n">${items.length}</span>
            </div>
            <div class="col-body">
              ${items.map(boardCard).join('') || '<p class="subtle t-xs" style="padding:4px 2px">暂无</p>'}
            </div>
          </div>`).join('')}
      </div>`;
  },

  /* ---- Work item list surfaces ---- */
  active() { return listScreen('active', WORK_ITEMS.filter((w) => ['in_progress', 'in_review', 'blocked'].includes(w.status))); },
  backlog() { return listScreen('backlog', WORK_ITEMS.filter((w) => ['backlog', 'todo'].includes(w.status))); },

  /* ---- Inbox / attention center ---- */
  inbox() {
    return `
      ${pageHead('inbox')}
      ${W.tabs({ id: 'inbox', items: [
        { id: 'you', label: '需要你', count: 3 },
        { id: 'messages', label: '消息', count: 5 },
        { id: 'deliveries', label: '智能体交付', count: 2 },
        { id: 'updates', label: '更新' },
      ] })}

      <article class="card card-pad" style="margin-bottom:16px">
        <div class="row">
          <span class="badge badge-warning badge-dot">工作区自主策略</span>
          <span class="spacer"></span>
          <span class="t-xs subtle">仅管理员可修改</span>
          <button class="btn btn-sm" role="switch" aria-checked="false" id="yolo">开启</button>
        </div>
        <p class="t-sm muted" style="margin-top:8px">
          开启后，未排除项目的有效审批会自动通过；身份、授权、资源范围、revision 与 Stop 校验始终生效。
        </p>
      </article>

      <div class="rows">${ATTENTION.map(attentionCard).join('')}</div>`;
  },

  /* ---- Agents ---- */
  agents() {
    return `
      ${pageHead('agents', `<button class="btn btn-primary">${icon('plus', 14)}注册智能体</button>`)}
      ${W.tabs({ id: 'agents', items: [
        { id: 'registry', label: '注册表' },
        { id: 'connections', label: '连接' },
        { id: 'approvals', label: '审批' },
        { id: 'inclusion', label: '纳入策略' },
        { id: 'archived', label: '已归档' },
      ] })}

      <div class="split-wide">
        <div class="rows">${AGENTS.map(agentCard).join('')}</div>
        <div>
          <section class="section">
            <div class="section-head"><h2>能力分布</h2></div>
            <article class="card card-pad stack-2">
              ${['filesystem:write', 'repo:merge', 'deploy:production', 'secrets:use'].map((c) => `
                <div class="row-2">
                  <span class="t-xs mono muted" style="min-width:0;flex:1">${c}</span>
                  <span class="badge badge-neutral">${c === 'deploy:production' ? '1' : c === 'secrets:use' ? '0' : '3'}</span>
                </div>`).join('')}
            </article>
          </section>
        </div>
      </div>`;
  },

  /* ---- Sessions ---- */
  sessions() {
    return `
      ${pageHead('sessions')}
      <div class="rows">${SESSIONS.map(sessionCard).join('')}</div>`;
  },

  /* ---- Recovery ---- */
  recovery() {
    const items = [
      { t: '陈旧租约未释放', d: 'ses_5d0e33 持有 WM-151 的独占租约已 26 分钟无心跳。', tone: 'danger', act: '强制释放' },
      { t: '运行失败待重试', d: 'ses_1a44c2 在迁移步骤失败，已保留现场。', tone: 'warning', act: '重试' },
    ];
    return `
      ${pageHead('recovery')}
      <div class="rows">
        ${items.map((i) => `
          <article class="card card-pad" style="border-radius:0;border:0;border-left:2px solid var(--${i.tone})">
            <div class="row">
              ${W.pill({ tone: i.tone, dot: true, text: i.tone === 'danger' ? '阻塞' : '预警' })}
              <span class="attn-title">${i.t}</span>
              <span class="spacer"></span>
              <button class="btn btn-sm">${i.act}</button>
            </div>
            <p class="t-sm muted" style="margin-top:6px">${i.d}</p>
          </article>`).join('')}
      </div>`;
  },

  /* ---- Operations ---- */
  ops() {
    const runs = [
      ['#4821', 'ci:test:e2e', 'passed', '4m 12s', '2 分钟前'],
      ['#4820', 'deploy:staging', 'passed', '1m 48s', '11 分钟前'],
      ['#4819', 'ci:test:integration', 'failed', '2m 03s', '26 分钟前'],
      ['#4818', 'db:migrate', 'passed', '38s', '1 小时前'],
    ];
    return `
      ${pageHead('ops')}
      ${W.tabs({ id: 'ops', items: [
        { id: 'usage', label: '用量' },
        { id: 'pipelines', label: '流水线' },
        { id: 'automation', label: '自动化' },
        { id: 'templates', label: '模板' },
      ] })}

      <div class="stack-6">
        <div class="split">
          ${['本月运行成本', '智能体 Token 用量', '平均 Session 时长', '待处理审批'].map((label, i) => {
            const vals = ['¥ 1,284', '42.8M', '6m 24s', '3'];
            const delta = ['+12%', '+8%', '−4%', '—'][i];
            const deltaCls = ['up', 'up', 'down', 'flat'][i];
            return `<article class="card card-pad stat-card">
              <div class="eyebrow">${label}</div>
              <div class="row-2" style="margin-top:8px">
                <span class="t-2xl w-semibold strong tnum">${vals[i]}</span>
                <span class="stat-delta ${deltaCls}">${delta}</span>
              </div>
            </article>`;
          }).join('')}
        </div>

        <section>
          <div class="section-head"><h2>最近运行</h2></div>
          <div class="tbl-frame">
            <table class="tbl">
              <thead><tr><th>运行</th><th>流水线</th><th>状态</th><th class="num">耗时</th><th>时间</th></tr></thead>
              <tbody>
                ${runs.map((r) => `<tr>
                  <td class="mono" data-th="运行">${r[0]}</td>
                  <td class="mono" data-th="流水线">${r[1]}</td>
                  <td data-th="状态">${W.pill({
                    tone: r[2] === 'passed' ? 'success' : 'danger', dot: true,
                    text: r[2] === 'passed' ? '通过' : '失败' })}</td>
                  <td class="num mono" data-th="耗时">${r[3]}</td>
                  <td class="muted t-xs" data-th="时间">${r[4]}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>`;
  },

  /* ---- Connect: MCP onboarding ---- */
  connect() {
    const steps = [
      ['01', '安装 CLI', 'npm i -g @workmesh/agent-cli'],
      ['02', '写入配置', 'workmesh connect --token ••••'],
      ['03', '验证连接', 'workmesh doctor'],
    ];
    return `
      ${pageHead('connect')}
      <div class="split-wide">
        <section class="section">
          <div class="section-head"><h2>接入步骤</h2></div>
          <div class="rows">
            ${steps.map((s) => `
              <div class="wi" style="cursor:default;align-items:flex-start">
                <span class="plan-idx" style="margin-top:2px">${s[0]}</span>
                <span class="wi-main">
                  <span class="wi-title">${s[1]}</span>
                  <span class="wi-sub mono" style="display:block;margin-top:4px">${s[2]}</span>
                </span>
              </div>`).join('')}
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>连接凭据</h2></div>
          <article class="card card-pad stack-2">
            <div class="eyebrow cfg-title">MCP 端点</div>
            <div class="row-2 cfg-row">
              <code class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">
                https://workmesh.local/mcp</code>
              <button class="btn btn-sm">${icon('copy', 13)}复制</button>
            </div>
            <div class="eyebrow cfg-title" style="margin-top:8px">安装令牌</div>
            <div class="row-2 cfg-row">
              <code class="mono" style="flex:1">wmi_WZza••••••••••••</code>
              <button class="btn btn-sm">${icon('key', 13)}轮换</button>
            </div>
            <p class="t-xs subtle" style="margin-top:10px">
              令牌仅在创建时完整显示一次。请存放于环境变量，不要写入仓库。
            </p>
          </article>
        </section>
      </div>`;
  },

  /* ---- Install: first-run bootstrap ---- */
  install() {
    const fields2 = [
      ['引导令牌', 'password', 'bootstrap token'],
      ['工作区名称', 'text', 'WorkMesh'],
      ['工作区别名', 'text', 'workmesh'],
      ['管理员邮箱', 'email', 'xurx@live.com'],
      ['管理员密码', 'password', '至少 12 位'],
    ];
    return `
      <div class="auth">
        <div class="auth-card" style="width:min(440px,100%)">
          <div class="row-2" style="margin-bottom:18px">
            <span class="brand-mark">${icon('branch', 15)}</span>
            <span class="brand-name" style="font-size:16px">WorkMesh</span>
          </div>
          <h1 class="t-xl w-semibold strong">初始化工作区</h1>
          <p class="t-sm muted" style="margin-top:4px">创建第一个团队与管理员账号。</p>
          <form id="install-form" style="margin-top:6px">
            ${fields2.map((f) => `
              <label class="field"><span>${f[0]}</span>
                <input class="input" type="${f[1]}" placeholder="${f[2]}"
                  ${f[0] === '管理员密码' ? 'minlength="12"' : ''}></label>`).join('')}
            <button class="btn btn-primary btn-lg" style="width:100%;margin-top:20px">安装</button>
          </form>
          <p class="t-xs subtle" style="margin-top:14px">
            引导令牌由服务端启动时输出，仅用于首次安装。
          </p>
        </div>
      </div>`;
  },

  /* ---- Work item detail / execution workspace ---- */
  detail() {
    const w = WORK_ITEMS[0];
    return `
      ${pageHead('detail')}
      <div class="row-2" style="margin-bottom:16px">
        <span class="wi-ident">${w.id}</span>
        ${statusPill(w.status)}
        ${priGlyph(w.pri)}
        <span class="spacer"></span>
        <button class="btn btn-sm" data-open-workroom="${w.id}">${icon('external', 13)}打开工作间</button>
      </div>

      ${W.tabs({ id: 'detail', items: [
        { id: 'overview', label: '概览' },
        { id: 'info', label: '详情' },
        { id: 'execution', label: '智能体执行', count: 1 },
        { id: 'discussion', label: '讨论' },
      ] })}

      <div class="split-wide">
        <section class="section">
          <div class="section-head">
            <h2>执行工作区</h2>
            <span class="spacer"></span>
            ${W.pill({ tone: 'info', dot: true, text: '执行中' })}
          </div>
          <article class="card" style="overflow:hidden">
            ${[
              ['当前步骤', 'normalize-apply-hash', '进行中'],
              ['已执行步骤', '2 / 5', '完成'],
              ['预算消耗', '62%', '正常'],
              ['剩余预算', '¥ 380', '正常'],
            ].map((r, i) => `
              <div class="plan-step" style="${i ? 'border-top:1px solid var(--border-subtle)' : ''};
                grid-template-columns:minmax(0,1fr) auto auto">
                <span class="plan-title">${r[0]}</span>
                <span class="mono t-xs muted">${r[1]}</span>
                ${W.pill({ tone: r[2] === '正常' ? 'success' : 'info', text: r[2] })}
              </div>`).join('')}
          </article>

          <div class="section-head" style="margin-top:24px"><h2>验收标准</h2></div>
          <article class="card card-pad">
            <ul class="stack-2">
              ${['prepare 与 apply 对同一 plan 产出相同 contentHash',
                 '规范化函数幂等，重复调用结果不变',
                 '回归测试在修复前失败、修复后通过'].map((c) => `
                <li class="row-2" style="align-items:flex-start">
                  ${icon('check-circle', 14, 'muted')}
                  <span class="t-sm muted">${c}</span>
                </li>`).join('')}
            </ul>
          </article>
        </section>

        <section class="section">
          <div class="section-head"><h2>执行智能体</h2></div>
          ${SESSIONS.slice(0, 1).map(sessionCard).join('')}

          <div class="section-head" style="margin-top:24px"><h2>关系</h2></div>
          <article class="card card-pad stack-2">
            <div class="row-2">
              <span class="badge badge-danger">阻塞下游</span>
              <span class="t-xs mono muted">WM-161</span>
            </div>
            <div class="row-2">
              <span class="badge badge-warning">被阻塞</span>
              <span class="t-xs mono muted">WM-133</span>
            </div>
            <div class="row-2">
              <span class="badge badge-neutral">子 Issue</span>
              <span class="t-xs mono muted">3 / 5 完成</span>
            </div>
          </article>
        </section>
      </div>`;
  },

  /* ---- Login: rendered outside the shell by renderAuth() ---- */
  login() { return ''; },

  /* ---- Settings ---- */
  settings() {
    const states = [
      ['待办', '#9BA1A9', 'backlog'], ['已就绪', '#6BA0FF', 'unstarted'],
      ['进行中', '#E3B341', 'started'], ['评审中', '#A78BFA', 'started'],
      ['已完成', '#3FB950', 'completed'],
    ];
    return `
      ${pageHead('settings')}
      ${W.tabs({ id: 'settings', items: [
        { id: 'workflow', label: '工作流' },
        { id: 'members', label: '成员' },
        { id: 'team', label: '团队' },
        { id: 'danger', label: '危险操作' },
      ] })}

      <div class="split-wide">
        <section>
          <div class="section-head"><h2>工作流状态</h2>
            <span class="spacer"></span>
            <button class="btn btn-sm">${icon('plus', 13)}新增状态</button>
          </div>
          <div class="tbl-frame">
            <table class="tbl">
              <thead><tr><th>状态</th><th>类别</th><th>颜色</th><th class="num">工作项</th></tr></thead>
              <tbody>
                ${states.map((s) => `<tr>
                  <td data-th="状态"><span class="status" style="--swatch:${s[1]}">${s[0]}</span></td>
                  <td class="mono muted t-xs" data-th="类别">${s[2]}</td>
                  <td data-th="颜色"><span class="dot" style="background:${s[1]};display:inline-block"></span>
                      <span class="mono t-xs muted" style="margin-left:6px">${s[1]}</span></td>
                  <td class="num mono" data-th="工作项">${[3, 2, 2, 1, 4][states.indexOf(s)]}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div class="section-head"><h2>团队成员</h2></div>
          <div class="rows">
            ${[['许润鑫', 'owner', '你'], ['陈可', 'member', ''], ['林望', 'member', '']].map((m) => `
              <div class="wi" style="cursor:default">
                ${avatar(m[0])}
                <div class="wi-main">
                  <div class="wi-title">${m[0]}</div>
                  <div class="wi-sub"><span class="mono">${m[1]}</span></div>
                </div>
                ${m[2] ? `<span class="badge badge-info">${m[2]}</span>` : ''}
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  },
};

/* ---- Shared row builders ---- */

function workRow(w) {
  return `
    <div class="wi" data-open-workroom="${w.id}" data-open-detail="${w.id}" title="点击打开工作间（抽屉） · 双击进入详情页">
      <span class="wi-ident">${w.id}</span>
      <span class="wi-main">
        <span class="wi-title">${w.title}</span>
        <span class="wi-sub">
          <span class="who">${icon('folder', 12)}${w.project}</span>
          <span class="who">${avatar(w.human)}${w.human}</span>
          ${w.agent ? `<span class="who">${icon('robot', 12)}${w.agent} · ${w.agentState}</span>` : ''}
          ${w.sub[1] ? `<span class="who">${icon('list', 12)}${w.sub[0]}/${w.sub[1]}</span>` : ''}
        </span>
      </span>
      <span class="wi-meta">
        ${w.labels.map((l) => `<span class="chip">${l}</span>`).join('')}
        ${priGlyph(w.pri)}
        ${budgetChip(w.budget)}
        ${statusPill(w.status)}
      </span>
    </div>`;
}

function boardCard(w) {
  return `
    <article class="bcard" style="--swatch:${STATUS[w.status].color}" data-open-workroom="${w.id}">
      <div class="bcard-top">
        <span class="wi-ident">${w.id}</span>
        <span class="spacer"></span>
        ${priGlyph(w.pri)}
      </div>
      <h4>${w.title}</h4>
      <div class="bcard-foot">
        ${avatar(w.human)}
        ${w.agent ? `${icon('robot', 12)}<span>${w.agent}</span>` : '<span class="subtle">未委派</span>'}
        <span class="spacer"></span>
        ${w.labels.map((l) => `<span class="chip">${l}</span>`).join('')}
      </div>
    </article>`;
}

function agentCard(a) {
  return `
    <article class="card card-pad" style="border-radius:0;border:0">
      <div class="row">
        ${avatar(a.display, true)}
        <div style="min-width:0">
          <div class="row-2">
            <span class="attn-title">${a.display}</span>
            <span class="mono t-xs subtle">${a.name}</span>
          </div>
          <p class="t-xs muted" style="margin-top:2px">${a.desc}</p>
        </div>
        <span class="spacer"></span>
        ${W.pill({ tone: a.state === 'active' ? 'success' : 'neutral', dot: true,
          text: a.state === 'active' ? '活跃' : '未激活' })}
      </div>
      <dl class="telemetry">
        <div class="metric"><dt>已批能力</dt><dd>${a.caps}</dd></div>
        <div class="metric"><dt>并发上限</dt><dd>${a.conc}</dd></div>
        <div class="metric"><dt>心跳</dt><dd class="mono">${a.hb}s</dd></div>
        <div class="metric" style="margin-left:auto">
          <button class="btn btn-sm">${icon('users', 13)}管理团队权限</button>
        </div>
      </dl>
    </article>`;
}

function sessionCard(s) {
  const tone = { executing: 'info', awaiting_input: 'warning', awaiting_review: 'violet', stale: 'danger' }[s.state];
  const label = { executing: '执行中', awaiting_input: '等待输入', awaiting_review: '等待评审', stale: '已陈旧' }[s.state];
  return `
    <article class="card card-pad" style="border-radius:0;border:0">
      <div class="row">
        <span class="dot dot-${s.state === 'stale' ? 'danger' : s.state === 'executing' ? 'live' : 'warn'}"></span>
        <span class="mono t-xs muted">${s.id}</span>
        ${W.pill({ tone, text: label })}
        <span class="spacer"></span>
        <span class="t-xs subtle mono">${s.wi}</span>
      </div>
      <div class="row-2" style="margin-top:8px">
        ${icon('robot', 13, 'muted')}
        <span class="t-sm">${s.agent}</span>
        <span class="sep subtle">·</span>
        <span class="t-xs mono muted">${s.step}</span>
      </div>
      <dl class="telemetry">
        <div class="metric"><dt>心跳</dt><dd class="mono">${s.hb}</dd></div>
        <div class="metric"><dt>预算</dt><dd>${meter(s.budget)}</dd></div>
        <div class="metric" style="margin-left:auto">
          <div class="row-2">
            <button class="btn btn-sm" title="暂停">${icon('pause', 13)}</button>
            <button class="btn btn-sm" title="停止">${icon('stop', 13)}</button>
            <button class="btn btn-sm">介入</button>
          </div>
        </div>
      </dl>
    </article>`;
}

function listScreen(key, items) {
  return `
    ${pageHead(key, `<button class="btn btn-primary">${icon('plus', 14)}新建工作项</button>`)}
    <div class="card card-pad row-2 wrap filters-bar" style="margin-bottom:14px">
      <label class="search-trigger" style="min-width:260px;cursor:text">
        ${icon('search', 14)}<input class="input" style="border:0;background:none;height:28px;padding:0" placeholder="搜索工作项…">
      </label>
      <select class="input filter-select" style="width:auto"><option>全部状态</option></select>
      <select class="input filter-select" style="width:auto"><option>全部优先级</option></select>
      <select class="input filter-select" style="width:auto"><option>全部负责人</option></select>
      <select class="input filter-select" style="width:auto"><option>全部项目</option></select>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm">清除筛选</button>
    </div>
    <div class="rows">${items.map(workRow).join('')}</div>`;
}

/* ---------------- WorkRoom drawer ---------------- */

function workRoom(w) {
  return `
    <div class="drawer-head">
      <div style="min-width:0;flex:1">
        <div class="row-2">
          <span class="wi-ident">${w.id}</span>
          ${statusPill(w.status)}
          ${priGlyph(w.pri)}
        </div>
        <h2 class="t-md w-semibold strong" style="margin-top:6px">${w.title}</h2>
      </div>
      <button class="icon-btn" id="close-drawer">${icon('close', 15)}</button>
    </div>

    <div style="padding:0 20px;border-bottom:1px solid var(--border)">
      ${W.tabs({ id: 'workroom', items: [
        { id: 'chat', label: '会话' },
        { id: 'plans', label: '计划', count: 'v3' },
        { id: 'activity', label: '活动' },
        { id: 'artifacts', label: '制品' },
        { id: 'decisions', label: '决策' },
        { id: 'sessions', label: 'Session' },
      ] })}
    </div>

    <div class="drawer-body">
      <section class="section">
        <div class="section-head"><h2>计划版本</h2>
          <span class="count">v3</span>
          <span class="spacer"></span>
          <span class="badge badge-violet">稳定 ID 跨版本保持</span>
        </div>
        <div class="card" style="overflow:hidden">
          <div class="plan-step plan-head" style="background:var(--surface-subtle);font-size:11px">
            <span></span>
            <span class="eyebrow">步骤</span>
            <span class="eyebrow">稳定 ID</span>
            <span class="eyebrow">相对 v2</span>
            <span class="eyebrow">状态</span>
          </div>
          ${PLAN.map((p) => `
            <div class="plan-step" data-state="${p.state}">
              <span class="plan-idx">${p.n}</span>
              <span class="plan-title plan-title-cell">${p.title}<small>${p.sub}</small></span>
              <span class="stable-id">${p.sid}</span>
              <span class="plan-diff diff-${p.diff === 'same' ? 'same' : p.diff === 'add' ? 'add' : 'remove'}">
                ${p.diff === 'same' ? '无变化' : p.diff === 'add' ? '+ 新增' : '− 已移除'}</span>
              <span class="plan-state badge badge-${
                p.state === 'complete' ? 'success' : p.state === 'current' ? 'info'
                : p.state === 'blocked' ? 'danger' : 'neutral'}">
                ${p.state === 'complete' ? '完成' : p.state === 'current' ? '进行中'
                  : p.state === 'blocked' ? '已取消' : '待办'}</span>
            </div>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>活动</h2>
          <span class="spacer"></span>
          <button class="btn btn-ghost btn-sm">显示心跳</button>
        </div>
        <div class="tl">
          ${ACTIVITY.map((a) => `
            <div class="tl-item">
              <span class="tl-time">${a.t}</span>
              <span class="tl-spine"><span class="tl-node ${a.node}"></span></span>
              <span class="tl-body">
                <h5>${a.title}</h5>
                <p>${a.body}</p>
                ${a.tool ? `<span class="tl-tool">${icon('activity', 12)}${a.tool}</span>` : ''}
              </span>
            </div>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>执行事实</h2></div>
        <article class="card card-pad">
          <dl class="telemetry" style="margin-top:0;padding-top:0;border-top:0">
            <div class="metric"><dt>负责人类</dt><dd>${w.human}</dd></div>
            <div class="metric"><dt>执行智能体</dt><dd>${w.agent || '未委派'}</dd></div>
            <div class="metric"><dt>执行状态</dt><dd>${w.agentState || '—'}</dd></div>
            <div class="metric"><dt>预算消耗</dt><dd>${meter(w.budget)}</dd></div>
            <div class="metric"><dt>阻塞</dt><dd>${w.blocked}</dd></div>
            <div class="metric"><dt>阻塞下游</dt><dd>${w.blocks}</dd></div>
          </dl>
        </article>
      </section>

      <section>
        <div class="section-head"><h2>指令</h2></div>
        <article class="card card-pad">
          <textarea class="input" rows="3" style="height:auto;padding:10px"
            placeholder="给智能体补充上下文或方向…"></textarea>
          <div class="row-2" style="margin-top:10px">
            <span class="t-xs subtle">发送后进入 append-only 活动流，对授权人类可见</span>
            <span class="spacer"></span>
            <button class="btn btn-primary btn-sm">${icon('send', 13)}发送指令</button>
          </div>
        </article>
      </section>
    </div>`;
}

/* ---------------- Command palette ---------------- */

function palette() {
  const groups = [
    ['跳转', [
      ['Agent 工作台', 'robot', 'g w'],
      ['我的工作', 'home', 'g h'], ['审批中心', 'inbox', 'g i'],
      ['智能体', 'agents', 'g a'], ['运营控制台', 'ops', 'g o'],
    ]],
    ['工作项', [
      ['WM-142 实现 prepare / apply 的一致性哈希规范化', 'file', ''],
      ['WM-139 审批路由：过期策略与自动升级', 'file', ''],
      ['WM-151 看板列宽持久化与响应式回退', 'file', ''],
    ]],
    ['操作', [
      ['新建工作项', 'plus', 'c'], ['暂停所有运行', 'pause', ''],
      ['切换主题', 'target', 't'],
    ]],
  ];
  return `
    <div class="palette-input">
      ${icon('search', 16, 'subtle')}
      <input id="palette-input" placeholder="搜索工作项、智能体、命令…" autocomplete="off">
      <kbd>Esc</kbd>
    </div>
    <div class="palette-list">
      ${groups.map(([name, items]) => `
        <div class="palette-group-label">${name}</div>
        ${items.map(([label, ic, k], i) => `
          <button class="palette-item" data-nav="${name === '跳转' ? items[i][1] : ''}">
            ${icon(ic, 15)}<span>${label}</span>
            ${k ? `<span class="k"><kbd>${k}</kbd></span>` : ''}
          </button>`).join('')}`).join('')}
    </div>`;
}

/* ---------------- Router & interactions ---------------- */

const app = $('#app');

function currentRoute() {
  /* The agent workbench is the default entry of the redesigned console.
     Fall back to the classic home if the screen is not registered, so a
     partial load never blanks the whole console. */
  const hash = location.hash.replace(/^#\//, '') || 'agent';
  if (SCREENS[hash]) return hash;
  return SCREENS.agent ? 'agent' : 'home';
}

function render() {
  const route = currentRoute();

  /* Auth-style routes render standalone; everything else gets the shell. */
  if (SHELL_FREE.has(route)) {
    app.innerHTML = `<div class="scrim" id="scrim"></div>
      <aside class="drawer" id="drawer" role="dialog" aria-label="工作间"></aside>
      <div class="scrim" id="scrim2"></div>
      <div class="palette" id="palette" role="dialog" aria-label="命令面板">${palette()}</div>`;

    const host = document.createElement('div');
    host.innerHTML = SCREENS[route]();
    app.insertBefore(host.firstElementChild, app.firstChild);

    bindShellFree();
    return;
  }

  const screen = SCREENS[route];
  app.innerHTML = `
    <div class="shell">
      ${sidebar(route)}
      <div class="main">
        ${header(route)}
        <main class="content${route === 'agent' ? ' content-agent' : ''}">${screen()}</main>
      </div>
    </div>
    <div class="scrim" id="mobile-scrim"></div>
    <div class="scrim" id="scrim"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="工作间"></aside>
    <div class="scrim" id="scrim2"></div>
    <div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="命令面板">${palette()}</div>`;

  bind();
  if (route === 'agent') bindAgent();
}

/* Auth screens have no sidebar, but the palette and drawer still work. */
function bindShellFree() {
  const form = $('#login-form') || $('#install-form');
  form?.addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/home'; });
  bindPalette();
}

function bindPalette() {
  const pal = $('#palette');
  if (!pal) return;

  $('#scrim2')?.addEventListener('click', () => {
    pal.classList.remove('is-open');
    $('#scrim2').classList.remove('is-open');
  });

  $$('#palette .palette-item').forEach((item) => {
    item.addEventListener('click', () => {
      const nav = item.dataset.nav;
      pal.classList.remove('is-open');
      $('#scrim2').classList.remove('is-open');
      if (nav) location.hash = `#/${nav}`;
    });
  });
}

function bind() {
  /* Mobile navigation drawer. The sidebar stays in the DOM on small
     viewports and slides in over a scrim, exactly like the WorkRoom. */
  const sidebarEl = $('.sidebar');
  const mobileTrigger = $('#mobile-trigger');
  const mobileScrim = $('#mobile-scrim');

  const closeMobileNav = () => {
    sidebarEl?.classList.remove('is-open');
    mobileScrim?.classList.remove('is-open');
    mobileTrigger?.setAttribute('aria-expanded', 'false');
  };

  mobileTrigger?.addEventListener('click', () => {
    const open = !sidebarEl.classList.contains('is-open');
    sidebarEl.classList.toggle('is-open', open);
    mobileScrim?.classList.toggle('is-open', open);
    mobileTrigger.setAttribute('aria-expanded', String(open));
  });

  mobileScrim?.addEventListener('click', closeMobileNav);

  /* Navigating from the drawer closes it, so the destination is visible. */
  $$('.sidebar .nav-item').forEach((link) => {
    link.addEventListener('click', closeMobileNav);
  });

  /* Theme */
  $('#theme-toggle')?.addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('wm-theme', next);
  });

  /* WorkRoom drawer (single click) */
  $$('[data-open-workroom]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.openWorkroom;
      const w = WORK_ITEMS.find((x) => x.id === id);
      if (!w) return;
      $('#drawer').innerHTML = workRoom(w);
      $('#drawer').classList.add('is-open');
      $('#scrim').classList.add('is-open');
      $('#drawer').querySelector('#close-drawer').addEventListener('click', closeDrawer);
    });
  });

  /* Detail page (double click) */
  $$('[data-open-detail]').forEach((el) => {
    el.addEventListener('dblclick', () => {
      location.hash = '#/detail';
    });
  });

  /* Drawer tabs / page tabs 的视觉切换已由 initWidgets() 的控件事件委托接管。 */
  $('#scrim').addEventListener('click', closeDrawer);

  /* YOLO switch */
  $('#yolo')?.addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-checked') === 'true';
    e.currentTarget.setAttribute('aria-checked', String(!on));
    e.currentTarget.textContent = on ? '开启' : '已开启';
    e.currentTarget.classList.toggle('btn-primary', !on);
  });

  /* Approve / reject */
  $$('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.attn');
      const ok = btn.dataset.act === 'approve';
      card.style.transition = 'opacity .2s, transform .2s';
      card.style.opacity = '0';
      card.style.transform = 'translateX(12px)';
      setTimeout(() => {
        card.outerHTML = `<div class="wi" style="cursor:default">
          <span class="badge badge-${ok ? 'success' : 'danger'} badge-dot">${ok ? '已通过' : '已驳回'}</span>
          <span class="t-sm muted">${btn.dataset.id}</span></div>`;
      }, 200);
    });
  });

  /* Command palette */
  const pal = $('#palette');
  const openPalette = () => {
    pal.classList.add('is-open');
    $('#scrim2').classList.add('is-open');
    $('#palette-input').value = '';
    $('#palette-input').focus();
  };

  $('#open-palette')?.addEventListener('click', openPalette);
  bindPalette();

  document.addEventListener('keydown', globalKeys);
}

function closeDrawer() {
  $('#drawer').classList.remove('is-open');
  $('#scrim').classList.remove('is-open');
}

function globalKeys(e) {
  const pal = $('#palette');
  if (!pal) return;

  const isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);

  if (e.key === 'Escape') {
    pal.classList.remove('is-open');
    $('#scrim2')?.classList.remove('is-open');
    closeDrawer();
    /* Escape also dismisses the mobile nav — deepest layer first is not
       required here since they are mutually exclusive in practice. */
    $('.sidebar')?.classList.remove('is-open');
    $('#mobile-scrim')?.classList.remove('is-open');
    $('#mobile-trigger')?.setAttribute('aria-expanded', 'false');
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    pal.classList.toggle('is-open');
    $('#scrim2')?.classList.toggle('is-open');
    if (pal.classList.contains('is-open')) $('#palette-input').focus();
    return;
  }

  if (e.key === '/' && !isTyping) {
    e.preventDefault();
    pal.classList.add('is-open');
    $('#scrim2').classList.add('is-open');
    $('#palette-input').focus();
  }
}

/* ---------------- Boot ---------------- */

/* Theme precedence: explicit ?theme= wins (so any surface can be linked
   directly in a given mode), then the stored preference, then dark — the
   hero mode for this control-room design. */
(function bootTheme() {
  const forced = new URLSearchParams(location.search).get('theme');
  const stored = (() => {
    try { return localStorage.getItem('wm-theme'); } catch (e) { return null; }
  })();
  document.documentElement.dataset.theme =
    forced === 'light' || forced === 'dark' ? forced : (stored || 'dark');
})();

/* Boot is deferred to the end of the file: the agent workbench (default
   route) registers its screen and data below. */

/* ==========================================================================
   Agent Workbench — native-agent entry, default route (#/agent)
   The built-in agent connects to this workspace over MCP; the transcript is
   rendered as AI-native components (thinking traces, tool chips, approval
   cards, acceptance evidence) and every artifact stays editable in the
   inspector, with edits handed back to the agent as follow-up instructions.
   ========================================================================== */

/* ---------------- Agent workbench data ---------------- */

const AW_ARTIFACTS = {
  code: {
    name: 'src/domain/plan/normalize.ts',
    lang: 'ts', rev: 'r1', stat: '+38 −12',
    desc: '共享排序比较器 + apply 端 invariant',
    code: `// packages/domain/src/plan/normalize.ts — r1 (agent)
import { sha256 } from '../crypto';
import { invariant } from '../assert';

export interface PlanStep {
  readonly id: string;          // stable across plan revisions
  readonly title: string;
}

export interface ImportPlan {
  readonly steps: readonly PlanStep[];
  readonly contentHash: string;
}

/** Code-unit ordering shared by prepare and apply — localeCompare is
    locale-dependent and drifts between the two ends. */
export function compareStepIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalizeProjectImportPlan(plan: ImportPlan): ImportPlan {
  const steps = [...plan.steps].sort((x, y) => compareStepIds(x.id, y.id));
  return { ...plan, steps, contentHash: hashSteps(steps) };
}

export function hashSteps(steps: readonly PlanStep[]): string {
  return sha256(steps.map((s) => s.id).join('\\u0000')).slice(0, 32);
}`,
    diff: [
      { t: 'h',   s: '@@ -12,9 +12,14 @@ export function prepareImport(raw: RawPlan) {' },
      { t: 'ctx', s: '  const plan = parseImport(raw);' },
      { t: 'del', s: '  const steps = [...raw.steps].sort((a, b) => a.id.localeCompare(b.id));' },
      { t: 'add', s: '  const steps = [...raw.steps].sort((a, b) => compareStepIds(a.id, b.id));' },
      { t: 'ctx', s: '  return { ...raw, steps };' },
      { t: 'h',   s: '@@ -31,7 +36,12 @@ export function applyImport(plan: ImportPlan) {' },
      { t: 'del', s: '  const ordered = [...plan.steps].sort((a, b) => a.id.localeCompare(b.id)); // 遗漏点' },
      { t: 'add', s: '  const ordered = [...plan.steps].sort((a, b) => compareStepIds(a.id, b.id));' },
      { t: 'add', s: "  invariant(hashSteps(ordered) === plan.contentHash, 'plan drifted');" },
      { t: 'ctx', s: '  return persist(ordered);' },
    ],
  },
  md: {
    name: 'docs/evidence/WM-142-验收报告.md',
    lang: 'md', rev: 'r1', stat: '摘要 ×1 · 证据 ×4',
    desc: '结果摘要、证据清单与已知限制',
    body: `# WM-142 验收报告 — prepare/apply 一致性哈希

## 结果摘要
prepare 与 apply 现在对同一 plan 产出相同 **contentHash**；共享比较器 \`compareStepIds\` 以码元序排序，两端复用，修复前回归测试失败、修复后通过。

## 证据
- 回归测试 \`mcp/hash-consistency.test.ts\` ×3 全部通过
- \`pnpm test\` — 28 个任务全绿（42s）
- PR #88 · 变更 +38 −12 · 2 files
- 已知限制：apply 端历史数据未回填，已建 follow-up WM-163`,
  },
};

const AW_THREADS = [
  {
    id: 'thr_01', title: '修复 WM-142 prepare/apply 哈希不一致',
    agent: 'atlas', state: 'awaiting_review', stateLabel: '等待验收', tone: 'violet',
    live: 'ses_8f3a2c · 心跳 3s',
    msgs: [
      { k: 'user', t: '14:02', text: 'WM-142 的回归测试为什么在修复前失败？把 prepare 和 apply 两端修成同一套口径，修完给我验收材料。',
        refs: ['WM-142', 'repo:workmesh/domain'] },
      { k: 'think', t: '14:02', dur: '2.8s', steps: [
        ['get_work_room', '读取 WM-142 执行工作区与计划 v3', '0.4s'],
        ['search', '在 packages/domain 检索 localeCompare 引用 ×6', '0.6s'],
        ['reason', 'prepare 已规范化，apply 端遗漏 → contentHash 漂移', '—'],
        ['publish_plan', '计划 v4：新增步骤 c9d4…22（修复 apply 端）', '0.3s'],
      ]},
      { k: 'tools', t: '14:03', chips: [
        { ic: 'read',  label: 'get_work_item · WM-142' },
        { ic: 'write', label: 'edit · normalize.ts', stat: '+38 −12' },
        { ic: 'run',   label: 'exec · pnpm test', stat: '✓ 42s' },
        { ic: 'read',  label: 'list_events · +4 条' },
      ]},
      { k: 'agent', t: '14:04',
        html: '根因是 <b>apply 端</b>直接使用 <code>localeCompare</code>，与 prepare 端排序口径不一致，导致同一 plan 的 <code>contentHash</code> 漂移。已抽出共享比较器 <code>compareStepIds</code> 供两端复用，并在 apply 端补上 drift 断言（见 <a class="src" data-art="code">normalize.ts</a>）。',
        follow: ['为什么 localeCompare 不稳定？', '顺手给 apply 端补上 invariant 断言', '更新 MIGRATION.md'] },
      { k: 'artifact', t: '14:04', art: 'code', name: AW_ARTIFACTS.code.name, stat: '+38 −12 · r1', desc: AW_ARTIFACTS.code.desc },
      { k: 'accept', t: '14:05', wi: 'WM-142',
        summary: 'prepare 与 apply 现在对同一 plan 产出相同 contentHash；规范化函数幂等；回归测试在修复前失败、修复后通过。',
        evidence: [
          { name: 'mcp/hash-consistency.test.ts', meta: '回归 ×3 通过', art: 'code' },
          { name: 'pnpm test', meta: '28 全绿 · 42s', art: null },
          { name: 'PR #88', meta: '+38 −12 · 2 files', art: null },
          { name: 'WM-142-验收报告.md', meta: '摘要与限制', art: 'md' },
        ]},
    ],
  },
  {
    id: 'thr_02', title: '排期 WM-155：拆解、预算与委派',
    agent: 'atlas', state: 'executing', stateLabel: '执行中', tone: 'info',
    live: 'ses_2b91d4 · 等待决策',
    msgs: [
      { k: 'user', t: '15:10', text: '把「运行成本采集与用量指标面板」排期：拆成子任务、定预算，并委派给最合适的智能体。',
        refs: ['WM-155', 'project:运营'] },
      { k: 'think', t: '15:10', dur: '1.9s', steps: [
        ['get_work_item', '读取 WM-155 与 4 个子任务', '0.3s'],
        ['list_claimable_work_items', '扫描可认领工作项与智能体并发', '0.5s'],
        ['reason', 'SSE 面板偏可靠性场景 → Bolt 空闲 2/2', '—'],
      ]},
      { k: 'tasks', t: '15:11', rows: [
        { n: 1, t: '采集运行成本事件', meta: '消费 outbox · 每日聚合', sid: 'f3a1…77', state: 'complete', sl: '完成' },
        { n: 2, t: '用量指标面板 API', meta: 'SSE 增量推送', sid: 'b8e2…10', state: 'current', sl: '执行中' },
        { n: 3, t: '前端指标卡片与筛选', meta: '复用运营控制台', sid: 'c5d9…8e', state: 'pending', sl: '待办' },
      ]},
      { k: 'approval', t: '15:12', q: '三个子任务的预算上限怎么定？',
        opts: ['各 ¥300（推荐）', '共享 ¥800 池', '先不设限'],
        cons: ['写操作：创建 3 个工作项', '不可逆：否', '影响：运营项目'] },
      { k: 'rec', t: '15:12', title: '建议将「用量指标面板 API」委派给 Bolt',
        reason: '可靠性专项智能体，当前并发 2/2 空闲；SSE 心跳与租约实现与其能力直接匹配。',
        conf: 0.86, alts: [['Atlas', '主力实现，但当前 3/3 满载'], ['Scribe', '偏文档整理，不匹配']] },
      { k: 'ctx', t: '15:12', cards: [
        { title: 'WM-155 · 运行成本采集与用量指标面板', body: '状态 todo · 优先级 low · 4 个子任务 · 无人认领', src: ['get_work_item', 'WM-155'] },
        { title: '运营控制台 · 本月成本', body: '¥ 1,284（+12%）· 待处理审批 3 · 平均 Session 6m24s', src: ['get_control_center', '运营'] },
      ]},
    ],
  },
  {
    id: 'thr_03', title: '新会话', agent: null, state: 'idle', stateLabel: '空闲', tone: 'neutral',
    live: null,
    msgs: [
      { k: 'agent', t: '—',
        html: '已接入 <b>WorkMesh MCP</b>（12 个工具可用：工作项、项目、里程碑、Session、审批、制品…）。可以从一句话开始，我会读取工作区上下文并直接执行；关键写操作会先请求你的确认。',
        follow: ['今天有哪些需要我处理的事项？', '把 WM-160 的密钥轮换排期', '总结本周治理进展'] },
    ],
    suggestions: ['查看今天需要我处理的事项', '新建项目：原型验收', '把 WM-151 从阻塞中恢复并重新委派', '生成运营周报并发布到审批中心'],
  },
];

/* Workbench state survives in-route interactions; re-created on page load. */
const AW = { thread: 'thr_01', art: null, tab: 'code', draft: null, dirty: false, sources: new Set(['工作项']), reply: 0 };

const awThread = () => AW_THREADS.find((t) => t.id === AW.thread) || AW_THREADS[0];
const awNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const awEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Think 卡步骤的阶段分类：推理 / 编码有明确工具名特征，检索兜底
   （get_/list_/search 及未识别工具都按检索处理）。 */
const awStageOf = (tool) =>
  /reason/.test(tool) ? 'reasoning'
    : /^(edit|write|publish_|apply)/.test(tool) ? 'coding'
      : 'retrieval';

const AW_STAGE_LABEL = { all: '步骤', retrieval: '检索', reasoning: '推理', coding: '编码' };

/* Inline glyphs for the AI-native message components (ported from beautifului
   primitives). The sprite has no chevron/spinner/pencil, and the source markup
   needs per-context sizing, so these are literal SVGs. */
const AW_SVG = {
  spark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>',
  /* chevron 由 W.disc 的 W.CHEV 统一输出；仅保留 chevDown 供非折叠按钮使用 */
  chevDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  reply: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>',
  lines: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  ext: '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M7 7h10v10"/></svg>',
  tool: {
    read: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    write: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
    run: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17l6-5-6-5M12 19h8"/></svg>',
    think: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>',
  },
};

/* ---------------- Message renderers ---------------- */

function awMsgHead(kind, t, name) {
  if (kind === 'user') {
    return `<div class="aw-msg-head"><span>许润鑫</span><span class="mono">${t}</span></div>`;
  }
  return `<div class="aw-msg-head"><b>${name || awThread().agent || 'WorkMesh Agent'}</b>
    <span class="badge badge-neutral">内建 · MCP</span><span class="mono">${t}</span></div>`;
}

function awRenderMsg(m) {
  switch (m.k) {
    case 'user':
      return `<div class="aw-msg is-user"><div class="aw-msg-body">
        <div class="aw-bubble">${awMsgHead('user', m.t)}<p class="aw-text">${awEsc(m.text)}</p>
          ${m.refs?.length ? `<div class="aw-refs">${m.refs.map((r) => `<span class="chip">@${r}</span>`).join('')}</div>` : ''}
        </div></div></div>`;

    case 'agent':
      return `<div class="aw-msg is-agent"><span class="avatar avatar-agent">A</span><div class="aw-msg-body">
        <div class="aw-bubble">${awMsgHead('agent', m.t)}<div class="aw-text">${m.html}</div>
          ${m.follow ? `<div class="aw-follow">${m.follow.map((f) => `<button data-fill="${awEsc(f)}">${AW_SVG.reply}${awEsc(f)}</button>`).join('')}</div>` : ''}
        </div></div></div>`;

    case 'think': {
      /* beautifului #02 ThinkingState: sparkle summary + shimmer while live,
         vertical trace line, per-step status glyph (spinner → check).
         阶段 tab 从 steps 数据推导：恒有「步骤」，检索/推理/编码仅当存在
         该分类步骤时出现；行上的 data-stage 供 W.actions.think 过滤。 */
      const rows = m.steps.map(([tool, desc, dur], i) => {
        const live = m.live && i === m.steps.length - 1;
        return `<div class="aw-step${live ? ' is-live' : ''}" data-stage="${awStageOf(tool)}" style="animation-delay:${i * 70}ms">
          <span class="aw-step-ic">${live ? '<i class="aw-spin"></i>' : AW_SVG.check}</span>
          <span class="aw-step-desc">${desc}</span>
          <span class="aw-step-tool mono">${tool}</span>
          <i class="aw-step-dur">${dur}</i>
        </div>`;
      }).join('');
      const present = new Set(m.steps.map(([tool]) => awStageOf(tool)));
      const stageTabs = [{ id: 'all', label: AW_STAGE_LABEL.all },
        ...['retrieval', 'reasoning', 'coding'].filter((s) => present.has(s))
          .map((s) => ({ id: s, label: AW_STAGE_LABEL[s] }))];
      return W.disc({
        cls: 'aw-think',
        open: m.live,
        head: `<span class="aw-think-ic">${AW_SVG.spark}</span>
          <span class="aw-think-label${m.live ? ' is-live' : ''}">${m.live ? '正在思考' : '思考过程'}</span>
          <span class="aw-think-meta mono">${m.steps.length} 步 · ${m.dur || '—'}</span>`,
        body: `${W.tabs({ id: 'think', small: true, items: stageTabs })}
          <div class="aw-think-body"><div class="aw-trace"><span class="aw-trace-line" aria-hidden="true"></span>${rows}</div></div>`,
      });
    }

    case 'tools':
      /* beautifului #04 ToolChips: pill chip = tool glyph + label + status dot;
         running dots pulse, done chips flip the dot to a green check. */
      return `<div class="aw-tools">${m.chips.map((c, i) => {
        const stat = c.stat || '';
        const done = stat.indexOf('✓') > -1;
        const busy = !done && stat !== '' && /审批|等待|运行|执行中/.test(stat);
        return `<span class="tool-chip is-${c.ic}${done ? ' is-done' : busy ? ' is-busy' : ''}" style="animation-delay:${i * 60}ms">
          ${AW_SVG.tool[c.ic] || AW_SVG.tool.read}
          <span class="tool-chip-label">${c.label}</span>
          <span class="tool-chip-dot">${done ? AW_SVG.check : ''}</span>
          ${stat ? `<span class="tool-chip-stat">${stat}</span>` : ''}
        </span>`;
      }).join('')}</div>`;

    case 'tasks':
      /* beautifului #05 TaskRows: badge ring/check + status pill + chevron,
         rows expand to a line-connected detail list. */
      return `<div class="aw-tasks">${m.rows.map((r, i) => W.disc({
        cls: 'aw-task',
        attrs: ` data-state="${r.state}" style="animation-delay:${i * 80}ms"`,
        head: `<span class="aw-task-badge">${r.state === 'complete'
          ? `<i class="aw-task-check">${AW_SVG.check}</i>`
          : `<i class="aw-task-ring${r.state === 'current' ? ' is-live' : ''}">${r.n}</i>`}</span>
          <span class="aw-task-title">${r.t}</span>
          <span class="aw-task-pill">${r.sl}</span>`,
        body: `<div class="aw-task-detail"><span class="aw-task-line" aria-hidden="true"></span>
            <div class="aw-task-detail-body">
              <div class="aw-task-li"><span>${r.meta}</span><span class="mono">稳定 ID ${r.sid}</span></div>
            </div>
          </div>`,
      })).join('')}</div>`;

    case 'approval':
      /* beautifului #03 ApprovalCard: heading body + radio rows with a filling
         ink circle + bottom meta row; picking stays bound in bindAgent(). */
      return `<div class="aw-card aw-approval"><div class="aw-card-pad">
        <div class="aw-card-head"><span class="badge badge-warning badge-dot">审批</span>
          <span class="mono">request_approval</span><span class="spacer"></span><span class="t-xs subtle">${m.t}</span></div>
        <p class="aw-q">${m.q}</p>
        <div class="aw-opts">${m.opts.map((o) => `<button class="aw-opt"><span class="aw-opt-ic"><i></i></span><span>${o}</span></button>`).join('')}
          <button class="aw-opt" data-other><span class="aw-opt-ic"><i></i></span><span>其他…</span></button></div>
        <div class="aw-other-row"><input class="input" placeholder="或者输入你的要求…">
          <button class="btn btn-sm btn-primary" data-other-send>发送</button></div>
        <div class="aw-cons"><span class="aw-cons-label">${icon('warn', 12)}后果预览</span>
          ${m.cons.map((c, i) => `${i ? '<span class="sep">·</span>' : ''}<span>${c}</span>`).join('')}</div>
      </div></div>`;

    case 'rec': {
      /* beautifului #08 RecommendationCard: body block + signal meter footer
         with a collapsible "other options" drawer. */
      return `<div class="aw-card aw-rec"><div class="aw-card-pad">
        <div class="aw-card-head"><span class="badge badge-violet badge-dot">建议</span>
          <span class="mono">delegate_work_item</span></div>
        <p class="aw-q">${m.title}</p>
        <div class="aw-rec-main"><span class="avatar avatar-agent">${(awThread().agent || 'A')[0].toUpperCase()}</span>
          <div><div class="t-sm w-semibold">${awThread().agent || 'agent'}</div><p>${m.reason}</p></div></div>
      </div>
      <div class="aw-rec-alts"><p class="aw-rec-alts-label">其他选项</p>
        ${m.alts.map(([n, why]) => `<button class="aw-alt" data-alt="${n}"><span>${n}</span><span class="why">${why}</span></button>`).join('')}
      </div>
      <div class="aw-card-foot aw-rec-foot">
        <span class="aw-rec-sig">${W.meter(m.conf)}置信度 ${Math.round(m.conf * 100)}%</span>
        <span class="aw-rec-actions"><button class="btn btn-sm" data-alt-toggle>其他选项 ${AW_SVG.chevDown}</button>
          <button class="btn btn-primary btn-sm" data-rec-accept>采纳并委派</button></span>
      </div></div>`;
    }

    case 'ctx':
      /* beautifului #09 ContextCards: header with count, card bar with title,
         body, and source pills with tone badge + external glyph. */
      return `<div class="aw-ctxs">
        <div class="aw-ctxs-head">引用上下文<span class="aw-ctxs-count">${m.cards.length}</span></div>
        ${m.cards.map((c, i) => `
        <div class="aw-ctx" style="animation-delay:${i * 90}ms">
          <div class="aw-ctx-bar">${AW_SVG.lines}<span class="aw-ctx-title">${c.title}</span></div>
          <p class="aw-ctx-body">${c.body}</p>
          <div class="aw-ctx-src">${c.src.map((s) => `<span class="aw-ctx-pill"><i class="aw-ctx-badge">${s[0]}</i>${s}${AW_SVG.ext}</span>`).join('')}</div>
        </div>`).join('')}</div>`;

    case 'artifact': {
      const a = AW_ARTIFACTS[m.art];
      return `<button class="aw-art" data-art="${m.art}">
        <span class="aw-art-ic">${icon('file', 15)}</span>
        <span class="aw-art-main"><div class="aw-art-name">${m.name}</div><div class="aw-art-desc">${m.desc}</div></span>
        <span class="aw-art-stat">${m.stat}</span>
      </button>`;
    }

    case 'accept':
      return `<div class="aw-card aw-accept" data-state="pending"><div class="aw-card-pad">
        <div class="aw-card-head"><span class="badge badge-violet badge-dot">成果验收</span>
          <span class="mono">${m.wi}</span><span class="spacer"></span><span class="t-xs subtle">证据 ×${m.evidence.length}</span></div>
        <p class="aw-text" style="margin-top:8px">${m.summary}</p>
        <div class="aw-card-foot aw-foot-end"><button class="btn btn-ghost btn-sm" data-accept-iterate>继续迭代</button>
          <button class="btn btn-sm" data-accept-reject>退回修改</button>
          <button class="btn btn-primary btn-sm" data-accept-pass>验收通过</button></div>
      </div>
      ${m.evidence.map((e) => `<button class="aw-ev" ${e.art ? `data-art="${e.art}"` : 'disabled style="cursor:default"'}>
        ${icon('check-circle', 14)}<span class="aw-ev-name">${e.name}</span><span class="aw-ev-meta">${e.meta}</span>
      </button>`).join('')}
      </div>`;

    case 'note':
      return `<div class="aw-note">${icon('user', 12)}<span>${m.html}</span></div>`;

    default:
      return '';
  }
}

function awPushMsg(m) {
  const thread = awThread();
  thread.msgs.push(m);
  const stream = $('.aw-stream');
  if (!stream) return;
  stream.insertAdjacentHTML('beforeend', awRenderMsg(m));
  /* StreamingText flourish: only the freshly pushed agent message gets the
     fade-up + blinking caret; re-renders of old messages stay static. */
  if (m.k === 'agent') {
    const text = stream.lastElementChild?.querySelector('.aw-text');
    if (text) {
      text.classList.add('is-streaming');
      const caret = document.createElement('span');
      caret.className = 'aw-caret';
      text.appendChild(caret);
      setTimeout(() => { caret.remove(); text.classList.remove('is-streaming'); }, 1600);
    }
  }
  stream.scrollTop = stream.scrollHeight;
}

function awPushTyping() {
  const stream = $('.aw-stream');
  if (!stream) return;
  stream.insertAdjacentHTML('beforeend',
    `<div class="aw-msg is-agent" data-typing><span class="avatar avatar-agent">A</span>
     <div class="aw-bubble aw-typing"><i></i><i></i><i></i><span class="aw-typing-label">正在思考</span></div></div>`);
  stream.scrollTop = stream.scrollHeight;
}

function awDropTyping() {
  $(`[data-typing]`)?.remove();
}

/* ---------------- Layout ---------------- */

function awRail() {
  return `
    <aside class="aw-rail" id="aw-rail">
      <div class="aw-rail-head">
        <button class="btn btn-primary" id="aw-new">${icon('plus', 13)}新会话</button>
        <button class="icon-btn aw-rail-toggle" id="aw-rail-close" aria-label="关闭会话列表">${icon('close', 15)}</button>
      </div>
      <div class="aw-rail-scroll">
        <div class="aw-rail-label">会话</div>
        ${AW_THREADS.map((t) => `
          <button class="aw-thr${t.id === AW.thread ? ' is-on' : ''}" data-thr="${t.id}">
            <span class="aw-thr-title">${t.title}</span>
            <span class="aw-thr-meta">
              <span class="dot ${t.state === 'executing' ? 'dot-live' : t.state === 'awaiting_review' ? 'dot-warn' : ''}"></span>
              ${t.agent ? `${t.agent}` : '未开始'} · ${t.msgs.length} 条
            </span>
          </button>`).join('')}
        <div class="aw-rail-label" style="margin-top:16px">上下文来源</div>
      </div>
      <div class="aw-conn">
        <div class="aw-conn-row"><span class="dot dot-live"></span><b>WorkMesh MCP</b><span class="mono">12 工具</span></div>
        <div class="aw-conn-row"><span class="dot dot-live"></span><b>Git 仓库</b><span class="mono">workmesh</span></div>
        <div class="aw-conn-row"><span class="dot dot-info"></span><b>终端执行器</b><span class="mono">沙箱</span></div>
      </div>
    </aside>`;
}

function awStreamCol() {
  const t = awThread();
  return `
    <div class="aw-stream-col">
      <div class="aw-stream-head">
        <button class="icon-btn aw-rail-toggle" id="aw-rail-open" aria-label="打开会话列表">${icon('menu', 16)}</button>
        <span class="aw-stream-title">${t.title}</span>
        <span class="badge badge-${t.tone === 'violet' ? 'violet' : t.tone === 'info' ? 'info' : 'neutral'}">${t.stateLabel}</span>
        <span class="spacer"></span>
        ${t.live ? `<span class="aw-live"><span class="dot dot-live"></span>${t.live}</span>` : ''}
        <button class="icon-btn aw-insp-toggle" id="aw-insp-open" aria-label="打开成果检查器">${icon('file', 15)}</button>
      </div>
      <div class="aw-stream">
        ${t.msgs.map(awRenderMsg).join('')}
        ${t.suggestions ? `
          <div class="aw-empty" style="padding:8px 0 0">
            <div class="aw-rail-label" style="padding:0">试试这样开始</div>
            <div class="aw-empty-sug">${t.suggestions.map((s) => `<button data-fill="${awEsc(s)}">${icon('target', 13)}${s}</button>`).join('')}</div>
          </div>` : ''}
      </div>
      ${awComposer()}
    </div>`;
}

function awComposer() {
  const SOURCES = ['工作项', '项目', '文件', '终端'];
  const COMMANDS = [
    ['/新建工作项', '创建并排期一个工作项', 'create_work_item'],
    ['/委派', '把工作项委派给智能体', 'delegate_work_item'],
    ['/审批', '查看并处理待办审批', 'list_inbox_items'],
    ['/状态', '查询工作项或 Session 状态', 'get_work_item'],
    ['/总结', '生成执行摘要并发到活动流', 'append_activity'],
  ];
  return `
    <div class="aw-composer">
      <div class="aw-inputbox">
        <div class="aw-cmd" id="aw-cmd" role="listbox" aria-label="斜杠命令">
          <div class="aw-cmd-list">
            ${COMMANDS.map(([c, d, tool]) => `
              <button class="aw-cmd-item" data-cmd="${c}" role="option">
                <span class="aw-cmd-ic">${icon('target', 13)}</span>
                <span class="aw-cmd-name">${c}</span>
                <span class="aw-cmd-desc">${d}</span>
                <span class="mono">${tool}</span>
              </button>`).join('')}
          </div>
          <div class="aw-cmd-foot"><kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 补全 · <kbd>Esc</kbd> 关闭</div>
        </div>
        <div class="aw-srcrow">
          ${SOURCES.map((s) => `
            <button class="aw-src${AW.sources.has(s) ? ' is-on' : ''}" data-src="${s}" title="${AW.sources.has(s) ? `移除 @${s}` : `添加 @${s}`}">
              <span class="aw-src-mark aw-src-plus">${icon('plus', 10)}</span>
              <span class="aw-src-mark aw-src-x">${icon('close', 10)}</span>
              <span class="aw-src-name">@ ${s}</span>
            </button>`).join('')}
        </div>
        <textarea id="aw-input" rows="1" placeholder="给 Agent 下达指令… / 唤起命令 · @ 引用上下文"></textarea>
        <div class="aw-input-actions">
          <button class="aw-agent-pick">${icon('robot', 12)}内建 Agent · Atlas ${icon('play', 9, 'chev')}</button>
          <span class="aw-stat"><span class="dot dot-live"></span>MCP 已连接</span>
          <span class="spacer"></span>
          <span class="aw-keys"><kbd>Enter</kbd> 发送 <kbd>Shift+Enter</kbd> 换行</span>
          <button class="aw-send" id="aw-send" disabled>${icon('send', 13)}<span>发送</span></button>
        </div>
      </div>
      <div class="aw-foot">
        <span>幂等键自动生成</span>
        <span>写操作需审批</span>
        <span class="spacer"></span>
        <span class="mono">mcp/1.0.0 · agent-protocol/1.0</span>
      </div>
    </div>`;
}

function awInspector() {
  const a = AW.art ? AW_ARTIFACTS[AW.art] : null;
  if (!a) {
    return `
      <aside class="aw-inspector" id="aw-inspector">
        <div class="aw-insp-head"><span class="eyebrow">成果检查器</span><span class="spacer"></span></div>
        <div class="aw-empty">
          ${icon('package', 26)}
          <p class="t-sm">暂无打开的制品<br><span class="t-xs subtle">点击对话中的文件卡片或证据行，在这里阅读、编辑并交回 Agent</span></p>
        </div>
      </aside>`;
  }
  const isCode = a.lang === 'ts';
  const value = AW.draft ?? a.code ?? a.body ?? '';
  const tabs = isCode
    ? [{ id: 'code', label: '代码' }, { id: 'diff', label: '变更', count: a.stat }]
    : [{ id: 'preview', label: '预览' }, { id: 'code', label: '源码' }];
  const inDiff = isCode && AW.tab === 'diff';
  const adds = inDiff ? a.diff.filter((l) => l.t === 'add').length : 0;
  const dels = inDiff ? a.diff.filter((l) => l.t === 'del').length : 0;
  /* Shared CodeBlock-style card header: file · language · (rev | diff stat | copy) */
  const head = `
      <div class="aw-code-head">
        ${icon(inDiff ? 'branch' : 'file', 14)}
        <span class="aw-insp-name">${a.name}</span>
        <span class="aw-lang">${inDiff ? 'diff' : a.lang}</span>
        ${inDiff ? '' : `<span class="badge badge-info">${a.rev}</span>`}
        <span class="spacer"></span>
        ${inDiff
          ? `<span class="aw-diffstat"><span class="add">+${adds}</span><span class="del">−${dels}</span></span>`
          : `<button class="aw-copy" id="aw-copy" title="复制内容">${icon('file', 12)}<span>复制</span></button>`}
      </div>`;
  const body = inDiff
    ? `<div class="aw-codecard">${head}<div class="aw-diff">${a.diff.map((l, i) => `
        <div class="aw-dl ${l.t}"><span class="ln">${l.t === 'h' ? '…' : i}</span><span class="s">${awEsc(l.s)}</span></div>`).join('')}</div></div>`
    : AW.tab === 'preview' && !isCode
      ? `<div class="aw-codecard">${head}<div class="aw-preview">${awMd(a.body)}</div></div>`
      : `<div class="aw-codecard">${head}<div class="aw-code-shell">
          <pre class="aw-code-hl" aria-hidden="true"><code id="aw-code-hl"></code></pre>
          <textarea class="aw-code" id="aw-code" spellcheck="false">${awEsc(value)}</textarea>
        </div></div>`;
  return `
    <aside class="aw-inspector is-open" id="aw-inspector">
      <div class="aw-insp-head"><span class="eyebrow">成果检查器</span><span class="spacer"></span>
        <button class="icon-btn" id="aw-insp-close" aria-label="关闭检查器">${icon('close', 14)}</button>
      </div>
      ${W.tabs({ id: 'inspector', small: true, active: AW.tab, items: tabs })}
      <div class="aw-insp-body">${body}<div class="aw-selbar" id="aw-selbar"><div class="aw-selbar-in">
        <button class="aw-selbtn is-primary" data-sel-rewrite>${icon('robot', 12)}让 Agent 改写选中</button>
        <span class="aw-selbar-sep" aria-hidden="true"></span>
        <button class="aw-selbtn" data-sel-close>取消</button>
      </div></div></div>
      <div class="aw-insp-foot">
        <div class="aw-unsaved" id="aw-unsaved">${icon('warn', 13)}<span>有未保存的修改</span><span class="spacer"></span>
          <button class="btn btn-sm" data-discard>放弃</button>
          <button class="btn btn-sm btn-primary" data-save>保存修订</button>
          <button class="btn btn-sm" data-handback>交回 Agent</button>
        </div>
        <div class="row-2">
          <span class="t-xs subtle">你的编辑会生成新修订并同步给 Agent 继续执行</span>
          <span class="spacer"></span>
          <button class="btn btn-sm" data-art-diff>${icon('branch', 12)}查看变更</button>
        </div>
      </div>
    </aside>`;
}

function awMd(src) {
  const inline = (s) => awEsc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
  return src.split('\n').map((line) => {
    if (line.startsWith('# ')) return `<h2>${inline(line.slice(2))}</h2>`;
    if (line.startsWith('## ')) return `<h3>${inline(line.slice(3))}</h3>`;
    if (line.startsWith('- ')) return `<li>${inline(line.slice(2))}</li>`;
    if (!line.trim()) return '';
    return `<p>${inline(line)}</p>`;
  }).join('');
}

/* Lightweight tokenizer for the inspector code pane (beautifului #17 CodeBlock
   syntax coloring, no highlight lib): comments, strings/numbers, keywords and
   call expressions — token colours only, painted into the <pre> under the
   transparent textarea. */
function awHighlight(src) {
  const KW = new Set(['import', 'from', 'export', 'default', 'async', 'await', 'function', 'return',
    'const', 'let', 'var', 'if', 'else', 'for', 'while', 'new', 'throw', 'try', 'catch',
    'class', 'extends', 'interface', 'type', 'readonly', 'typeof', 'null', 'true', 'false', 'undefined']);
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += awEsc(src.slice(last, m.index));
    const tok = m[0];
    if (m[1]) out += `<i class="tk-c">${awEsc(tok)}</i>`;
    else if (m[2] || m[3]) out += `<i class="tk-s">${awEsc(tok)}</i>`;
    else if (KW.has(tok)) out += `<i class="tk-k">${awEsc(tok)}</i>`;
    else if (/^\s*\(/.test(src.slice(m.index + tok.length))) out += `<i class="tk-f">${awEsc(tok)}</i>`;
    else out += awEsc(tok);
    last = m.index + tok.length;
  }
  return out + awEsc(src.slice(last));
}

function awLayout() {
  return `${awRail()}${awStreamCol()}${awInspector()}`;
}

/* Register the workbench as a routed screen (default entry). */
SCREENS.agent = awLayout;

/* Re-render just the workbench panes (state-preserving, no full reload). */
function renderAgent() {
  $('.content').innerHTML = awLayout();
  bindAgent();
}

/* ---------------- Simulated agent turn ---------------- */

const AW_CANNED = [
  '收到。我已读取工作区上下文并更新执行计划；过程与证据会以 append-only 方式追加到活动流，你随时可以在右侧检查器查看与修改——你的修改会作为新修订同步给我继续。',
  '明白。这一步涉及写操作，我已生成幂等键并按最小资源范围执行；如需中断随时说「停」，服务端会立即冻结会话写入。',
];

function awAgentTurn(userText) {
  const refs = [...AW.sources];
  awPushMsg({ k: 'user', t: awNow(), text: userText, refs });
  awPushTyping();

  setTimeout(() => {
    awDropTyping();
    awPushMsg({ k: 'think', t: awNow(), dur: '1.6s', live: true, steps: [
      ['resolve_identifier', `解析引用 ${refs.map((r) => '@' + r).join(' ') || '（无）'}`, '0.2s'],
      ['get_workmesh_context', '读取工作区上下文与当前身份', '0.4s'],
      ['plan', '草拟执行步骤，标注需审批的写操作', '—'],
    ]});
  }, 700);

  setTimeout(() => {
    awPushMsg({ k: 'tools', t: awNow(), chips: [
      { ic: 'read', label: 'get_current_identity' },
      { ic: 'read', label: 'list_work_items · 全部状态' },
      { ic: 'write', label: 'draft · 等待确认', stat: '审批中' },
    ]});
  }, 1600);

  setTimeout(() => {
    awDropTyping();
    awPushMsg({ k: 'agent', t: awNow(), html: AW_CANNED[AW.reply++ % AW_CANNED.length],
      follow: ['先给我看计划再执行', '直接执行，写操作走审批', '取消这次操作'] });
  }, 2500);
}

/* ---------------- Bindings ---------------- */

function bindAgent() {
  /* Session rail */
  $$('.aw-thr').forEach((b) => b.addEventListener('click', () => {
    AW.thread = b.dataset.thr; AW.art = null; AW.tab = 'code'; AW.draft = null; AW.dirty = false;
    renderAgent();
  }));

  $('#aw-new')?.addEventListener('click', () => {
    const t = AW_THREADS.find((x) => x.id === 'thr_03');
    AW.thread = t.id; AW.art = null; AW.tab = 'preview'; AW.draft = null; AW.dirty = false;
    renderAgent();
  });

  $('#aw-rail-open')?.addEventListener('click', () => $('.aw-rail').classList.add('is-open'));
  $('#aw-rail-close')?.addEventListener('click', () => $('.aw-rail').classList.remove('is-open'));
  $('#aw-insp-open')?.addEventListener('click', () => $('#aw-inspector')?.classList.add('is-open'));
  $('#aw-insp-close')?.addEventListener('click', () => $('#aw-inspector')?.classList.remove('is-open'));

  /* Think 卡阶段 tab 由 initWidgets() 委托接管（视觉选中 + data-stage 过滤）。 */

  /* Open artifacts in the inspector (file cards, inline sources, evidence). */
  $$('[data-art]').forEach((el) => el.addEventListener('click', (e) => {
    e.stopPropagation();
    AW.art = el.dataset.art;
    AW.tab = AW.art === 'code' ? 'code' : 'preview';
    AW.draft = null; AW.dirty = false;
    renderAgent();
  }));

  /* Inspector tabs 由 initWidgets() 委托接管（W.actions.inspector → renderAgent）。 */

  /* Editor: track edits, expose the unsaved bar, hand back to the agent. */
  const code = $('#aw-code');
  if (code) {
    const original = AW.art ? (AW_ARTIFACTS[AW.art].code ?? AW_ARTIFACTS[AW.art].body) : '';

    /* CodeBlock-style inline coloring: the <pre> sits under the transparent
       textarea; repainting it on input keeps the two layers in lockstep. */
    const hl = $('#aw-code-hl');
    const isTs = AW.art ? AW_ARTIFACTS[AW.art].lang === 'ts' : false;
    const paintHl = () => { if (hl) hl.innerHTML = (isTs ? awHighlight(code.value) : awEsc(code.value)) + '\n'; };
    /* the <pre> (code's parent) is the scroll container; keep it in lockstep */
    const syncScroll = () => {
      const pre = hl?.parentElement;
      if (pre) { pre.scrollTop = code.scrollTop; pre.scrollLeft = code.scrollLeft; }
    };
    paintHl();

    code.addEventListener('input', () => {
      AW.draft = code.value;
      AW.dirty = code.value !== original;
      $('#aw-unsaved')?.classList.toggle('is-open', AW.dirty);
      paintHl();
    });

    /* Selection actions: hand the highlighted passage to the agent. */
    const bar = $('#aw-selbar');
    const maybeShow = () => {
      if (!bar) return;
      if (code.selectionStart !== code.selectionEnd) {
        const r = code.getBoundingClientRect();
        bar.style.top = `${Math.max(8, r.top + 8)}px`;
        bar.style.left = `${r.left + r.width / 2}px`;
        bar.classList.add('is-open');
      } else {
        bar.classList.remove('is-open');
      }
    };
    code.addEventListener('select', maybeShow);
    code.addEventListener('mouseup', maybeShow);
    code.addEventListener('keyup', maybeShow);
    code.addEventListener('blur', () => setTimeout(() => bar?.classList.remove('is-open'), 150));
    code.addEventListener('scroll', () => { bar?.classList.remove('is-open'); syncScroll(); });

    $('[data-sel-rewrite]')?.addEventListener('click', () => {
      const sel = code.value.slice(code.selectionStart, code.selectionEnd).trim();
      bar?.classList.remove('is-open');
      if (sel) awAgentTurn(`改写这段代码，保持两端口径一致：\n${sel.slice(0, 160)}`);
    });
    $('[data-sel-close]')?.addEventListener('click', () => bar?.classList.remove('is-open'));

    $('[data-save]')?.addEventListener('click', () => {
      AW.dirty = false;
      $('#aw-unsaved')?.classList.remove('is-open');
      const a = AW_ARTIFACTS[AW.art];
      a.rev = 'r2'; a.stat = '你编辑 · r2';
      awPushMsg({ k: 'note', t: awNow(), html: `你直接编辑了 <b>${a.name}</b>，已保存为修订 <b>r2</b> 并同步给 Agent` });
      setTimeout(() => awPushMsg({ k: 'agent', t: awNow(),
        html: '已读取你的 r2 修订，我会在下一次验证中把你的修改纳入回归范围。', follow: ['基于 r2 继续验证', '对比 r1 与 r2 的差异'] }), 500);
    });

    $('[data-handback]')?.addEventListener('click', () => {
      const a = AW_ARTIFACTS[AW.art];
      AW.dirty = false;
      $('#aw-unsaved')?.classList.remove('is-open');
      a.rev = 'r2';
      awPushMsg({ k: 'note', t: awNow(), html: `你直接编辑了 <b>${a.name}</b>（未保存草稿已交回）` });
      awPushTyping();
      setTimeout(() => {
        awDropTyping();
        awPushMsg({ k: 'think', t: awNow(), dur: '0.8s', steps: [
          ['diff_artifact', '对比 r1 → r2，定位你的修改点', '0.3s'],
          ['publish_artifact', '将 r2 登记为当前版本并追加活动', '0.4s'],
        ]});
        awPushMsg({ k: 'agent', t: awNow(),
          html: '已收到你的修改并继续执行：我会基于 <code>r2</code> 重跑回归并更新验收材料。', follow: ['只重跑受影响的测试', '全部重跑'] });
      }, 900);
    });

    $('[data-discard]')?.addEventListener('click', () => {
      AW.draft = null; AW.dirty = false;
      code.value = original;
      $('#aw-unsaved')?.classList.remove('is-open');
      paintHl();
    });
  }

  /* CodeBlock-style copy button with a transient "已复制" state. */
  const copyBtn = $('#aw-copy');
  if (copyBtn) {
    const raw = AW.art ? (AW_ARTIFACTS[AW.art].code ?? AW_ARTIFACTS[AW.art].body ?? '') : '';
    let copyTimer = null;
    copyBtn.addEventListener('click', () => {
      try { navigator.clipboard?.writeText(raw); } catch { /* prototype: visual feedback only */ }
      copyBtn.classList.add('is-copied');
      copyBtn.querySelector('span').textContent = '已复制';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        copyBtn.querySelector('span').textContent = '复制';
      }, 1500);
    });
  }

  $('[data-art-diff]')?.addEventListener('click', () => {
    if (AW_ARTIFACTS[AW.art]?.lang === 'ts') { AW.tab = 'diff'; renderAgent(); }
  });

  /* Approval card */
  $$('.aw-opt').forEach((opt) => opt.addEventListener('click', () => {
    const card = opt.closest('.aw-approval');
    card.querySelectorAll('.aw-opt').forEach((o) => o.classList.remove('is-picked'));
    opt.classList.add('is-picked');
    awPushMsg({ k: 'user', t: awNow(), text: `选择：${opt.textContent.trim()}` });
    awPushMsg({ k: 'agent', t: awNow(),
      html: '已按你的选择更新预算并创建 3 个工作项，关系（blocks）已串联，等待委派确认。' });
    setTimeout(() => awPushMsg({ k: 'tools', t: awNow(), chips: [
      { ic: 'write', label: 'create_work_item ×3', stat: '✓' },
      { ic: 'write', label: 'add_work_item_relation · blocks ×2', stat: '✓' },
    ]}), 600);
  }));

  $$('[data-other]').forEach((b) => b.addEventListener('click', () => {
    const row = b.closest('.aw-approval').querySelector('.aw-other-row');
    row?.classList.add('is-open');
    row?.querySelector('input')?.focus();
  }));
  $$('[data-other-send]').forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.closest('.aw-other-row').querySelector('input');
    if (!input.value.trim()) return;
    awPushMsg({ k: 'user', t: awNow(), text: input.value.trim() });
    input.value = '';
    awPushMsg({ k: 'agent', t: awNow(), html: '收到自定义要求，已更新预算方案，确认后我会创建工作项。' });
  }));

  /* Recommendation card */
  $$('[data-alt-toggle]').forEach((b) => b.addEventListener('click', () => {
    b.closest('.aw-rec')?.querySelector('.aw-rec-alts')?.classList.toggle('is-open');
    b.classList.toggle('is-open');
  }));
  $$('[data-rec-accept]').forEach((b) => b.addEventListener('click', () => {
    awPushMsg({ k: 'user', t: awNow(), text: '采纳建议，委派给 Bolt。' });
    setTimeout(() => awPushMsg({ k: 'tools', t: awNow(), chips: [
      { ic: 'write', label: 'delegate_work_item · b8e2…10 → bolt', stat: '✓' },
    ]}), 500);
  }));
  $$('[data-alt]').forEach((b) => b.addEventListener('click', () => {
    awAgentTurn(`改用 ${b.dataset.alt} 执行这个任务。`);
  }));

  /* Acceptance card */
  $$('[data-accept-pass]').forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.aw-accept');
    card.dataset.state = 'done';
    card.querySelector('.aw-card-head').insertAdjacentHTML('afterbegin',
      '<span class="badge badge-success badge-dot">已验收</span>');
    awPushMsg({ k: 'note', t: awNow(), html: '验收通过 · <b>complete_session</b> 已携带结果摘要与证据调用' });
    setTimeout(() => awPushMsg({ k: 'tools', t: awNow(), chips: [
      { ic: 'write', label: 'complete_session · ses_8f3a2c', stat: '✓ 已归档' },
    ]}), 500);
  }));
  $$('[data-accept-reject]').forEach((b) => b.addEventListener('click', () => {
    awAgentTurn('退回：跨团队场景未覆盖，请补充用例后再次提交验收。');
  }));
  $$('[data-accept-iterate]').forEach((b) => b.addEventListener('click', () => {
    awAgentTurn('继续迭代：把 invariant 抽到共享断言模块，保持行为不变。');
  }));

  /* Composer — PromptBar behaviors: send gating, / command palette with
     ↑↓ + Enter selection, @ source chips with a removable × state. */
  const input = $('#aw-input');
  const cmd = $('#aw-cmd');
  const sendBtn = $('#aw-send');

  const autosize = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px`; };
  const syncSend = () => { if (sendBtn) sendBtn.disabled = !input.value.trim(); };
  const openCmd = (open) => {
    if (!cmd) return;
    cmd.classList.toggle('is-open', open);
    if (open) {
      $$('.aw-cmd-item', cmd).forEach((x, i) => x.classList.toggle('is-active', i === 0));
      const list = $('.aw-cmd-list', cmd);
      if (list) list.scrollTop = 0;
    }
  };
  const moveCmdSel = (dir) => {
    if (!cmd) return;
    const items = $$('.aw-cmd-item', cmd);
    if (!items.length) return;
    const cur = items.findIndex((x) => x.classList.contains('is-active'));
    if (cur >= 0) items[cur].classList.remove('is-active');
    const el = items[((cur < 0 ? 0 : cur + dir) + items.length) % items.length];
    el.classList.add('is-active');
    el.scrollIntoView({ block: 'nearest' });
  };

  input?.addEventListener('input', () => {
    autosize();
    syncSend();
    openCmd(input.value.startsWith('/'));
  });

  input?.addEventListener('keydown', (e) => {
    const open = cmd?.classList.contains('is-open');
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); moveCmdSel(e.key === 'ArrowDown' ? 1 : -1); return;
    }
    if (open && e.key === 'Enter' && !e.shiftKey) {
      const act = cmd.querySelector('.aw-cmd-item.is-active');
      if (act) { e.preventDefault(); act.click(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') cmd?.classList.remove('is-open');
  });

  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; autosize(); syncSend(); cmd?.classList.remove('is-open');
    awAgentTurn(text);
  };
  sendBtn?.addEventListener('click', send);

  $$('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    input.value = `${b.dataset.cmd} `;
    cmd?.classList.remove('is-open');
    syncSend();
    input.focus(); autosize();
  }));

  $$('[data-src]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset.src;
    if (AW.sources.has(s)) AW.sources.delete(s); else AW.sources.add(s);
    b.classList.toggle('is-on', AW.sources.has(s));
    b.title = AW.sources.has(s) ? `移除 @${s}` : `添加 @${s}`;
  }));

  /* Follow-up chips + empty-state suggestions fill the composer. */
  $$('[data-fill]').forEach((b) => b.addEventListener('click', () => {
    input.value = b.dataset.fill;
    syncSend();
    input.focus(); autosize();
  }));
}

/* ---------------- Boot ---------------- */

/* Widget kit：一次性委托挂载 + 动作注册（先于首次 render，覆盖动态消息卡）。 */
initWidgets();

window.addEventListener('hashchange', render);
render();
