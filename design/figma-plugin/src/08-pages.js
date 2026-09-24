/**
 * WorkMesh Design System — pages.
 *
 * Every authenticated screen is assembled through BF_SURFACES.screen(),
 * so all of them share one sidebar and one header. That is the structural
 * guarantee that these seven pages belong to the same product.
 *
 * Each page is built TWICE — once per mode — because Figma renders
 * variables per node, and a side-by-side comparison is the only way to
 * actually review a dual-mode system.
 */

const BF_PAGES = (() => {
  const D = () => BF_DOMAIN;
  const S = () => BF_SURFACES;

  /* Content column width: page frame minus sidebar minus page padding. */
  const CONTENT_W = (frameWidth) => frameWidth - S().SIDEBAR_W - WM_LAYOUT.pagePadding * 2;

  /* ================= sample data ================= */

  const WORK_ITEMS = [
    { id: 'WM-142', title: '实现 prepare / apply 的一致性哈希规范化', statusTone: 'amber', statusName: '进行中',
      priority: 'high', project: '协作协议', human: '许润鑫', agent: 'atlas', agentState: 'executing',
      budget: 0.62, labels: ['bug', 'p0'] },
    { id: 'WM-139', title: '审批路由：过期策略与自动升级', statusTone: 'violet', statusName: '评审中',
      priority: 'urgent', project: '治理', human: '许润鑫', agent: 'atlas', agentState: 'awaiting_review',
      budget: 0.88, labels: ['governance'] },
    { id: 'WM-151', title: '看板列宽持久化与响应式回退', statusTone: 'red', statusName: '已阻塞',
      priority: 'medium', project: 'Web 界面', human: '陈可', agent: null, agentState: null,
      budget: 0, labels: ['ui'] },
    { id: 'WM-148', title: '租约超时后的工作项回收流程', statusTone: 'amber', statusName: '进行中',
      priority: 'high', project: '协作协议', human: '许润鑫', agent: 'bolt', agentState: 'executing',
      budget: 0.35, labels: ['reliability'] },
    { id: 'WM-155', title: '运行成本采集与用量指标面板', statusTone: 'blue', statusName: '已就绪',
      priority: 'low', project: '运营', human: '林望', agent: null, agentState: null,
      budget: 0, labels: ['metrics'] },
  ];

  const ATTENTION = [
    {
      risk: 'high', kind: '审批', title: '生产环境部署审批', urgent: true, age: '逾期 2 小时',
      desc: '智能体 atlas 请求将 WM-142 的修复发布到生产环境，变更涉及 3 个迁移文件。',
      scope: ['WM-142', 'repo:workmesh/api', 'migration ×3'],
      consequence: ['写操作：生产数据库', '不可逆：是', '影响：全部租户'],
      actions: ['通过', '驳回'],
    },
    {
      risk: 'medium', kind: '澄清', title: '需要确认验收标准', urgent: false, age: '12 分钟前',
      desc: '智能体 bolt 无法判定 WM-148 的「租约回收」是否包含跨团队场景，已暂停 12 分钟。',
      scope: ['WM-148', 'plan:v3'],
      consequence: ['写操作：无', '阻塞：1 个 Session'],
      actions: ['回答', '转派'],
    },
    {
      risk: 'low', kind: '完成评审', title: 'WM-127 待验收', urgent: false, age: '38 分钟前',
      desc: '智能体 atlas 已提交结果摘要与 4 项证据，等待人类确认。',
      scope: ['WM-127', 'artifact ×4', 'PR #88'],
      consequence: ['写操作：无', '已完成：4/4 步'],
      actions: ['验收', '退回'],
    },
  ];

  const SESSIONS = [
    { id: 'ses_8f3a2c', agent: 'atlas', state: 'executing', wi: 'WM-142',
      step: 'normalize-apply-hash', hb: '3s', budget: 0.62 },
    { id: 'ses_2b91d4', agent: 'bolt', state: 'awaiting_input', wi: 'WM-148',
      step: 'lease-reclaim-scope', hb: '12m', budget: 0.35 },
    { id: 'ses_77c1e9', agent: 'atlas', state: 'awaiting_review', wi: 'WM-139',
      step: 'approval-expiry-policy', hb: '48s', budget: 0.88 },
    { id: 'ses_5d0e33', agent: 'scribe', state: 'stale', wi: 'WM-151',
      step: 'column-width-persist', hb: '26m', budget: 0.12 },
  ];

  const PLAN = [
    { n: 1, title: '抽出 normalizeProjectImportPlan', note: '两端共用的规范化入口',
      sid: 'a1f2…9c', state: 'complete', diff: 'same' },
    { n: 2, title: '替换 6 处 localeCompare', note: '改为确定性的 code-unit 比较',
      sid: 'b7c3…41', state: 'complete', diff: 'same' },
    { n: 3, title: '修复 apply 端遗漏的规范化', note: '本轮新增',
      sid: 'c9d4…22', state: 'current', diff: 'add' },
    { n: 4, title: '回归测试：证明修复前失败', note: '本轮新增',
      sid: 'd2e8…70', state: 'pending', diff: 'add' },
    { n: 5, title: '更新 MIGRATION.md', note: '已取消：本变更不涉及迁移',
      sid: 'e5f1…38', state: 'removed', diff: 'remove' },
  ];

  const ACTIVITY = [
    { t: '14:22', tone: 'success', title: '完成步骤', body: 'normalize-apply-hash — 抽出共享规范化函数', tool: null },
    { t: '14:19', tone: 'info', title: '工具调用', body: '在 4 个文件中替换 localeCompare', tool: 'edit ×4 · 118ms' },
    { t: '14:15', tone: 'info', title: '证据', body: '新增回归测试 mcp/hash-consistency.test.ts', tool: 'artifact:test_report' },
    { t: '14:08', tone: 'warning', title: '风险提示', body: 'apply 端仍有一处未规范化，可能导致同类缺陷', tool: null },
    { t: '13:56', tone: 'success', title: '验证通过', body: 'pnpm test — 28 个任务全绿', tool: 'exec · 42s' },
  ];

  /* ================= page builders ================= */

  /**
   * Home. Attention-first: the decisions needing a human sit above the
   * work list, because that is the scarce resource.
   */
  function home(mode, width = 1440) {
    const cw = CONTENT_W(width);

    return S().screen({
      current: 'home',
      width,
      actions: [S().kbd('浅色'), S().kbd('深色')],
      content: [
        S().pageHead('我的工作', '分配给我与由我负责的工作项', [
          D().button('保存视图', 'secondary'),
          D().button('新建工作项', 'primary'),
        ]),
        /* Attention section */
        S().sectionHead('需要你', 3, [D().button('全部处理', 'ghost')]),
        S().rowsContainer('attention-list',
          ATTENTION.flatMap((a, i) => {
            const card = D().attentionCard(a, cw);
            return i === 0 ? [card] : [S().rowDivider(cw), card];
          }),
          cw),
        { t: 'rect', name: 'section-gap', w: 1, h: 28, bg: 'canvas' },
        /* Work items */
        S().sectionHead('我的工作项', 5, []),
        S().rowsContainer('work-items',
          WORK_ITEMS.flatMap((w, i) => {
            const row = D().workItemRow(w, cw, 'comfortable');
            return i === 0 ? [row] : [S().rowDivider(cw), row];
          }),
          cw),
        { t: 'rect', name: 'section-gap', w: 1, h: 28, bg: 'canvas' },
        /* Sessions */
        S().sectionHead('智能体运行', 4, []),
        S().rowsContainer('sessions',
          SESSIONS.flatMap((s, i) => {
            const card = D().sessionCard(s, cw);
            return i === 0 ? [card] : [S().rowDivider(cw), card];
          }),
          cw),
      ],
    });
  }

  /** Inbox — the decision queue, with the autonomy policy banner. */
  function inbox(mode, width = 1440) {
    const cw = CONTENT_W(width);

    return S().screen({
      current: 'inbox',
      width,
      content: [
        S().pageHead('审批中心', '需要你决策的审批、澄清与完成评审', []),
        tabs(['需要你', '消息', '智能体交付', '更新'], 0, cw),
        { t: 'rect', name: 'gap', w: 1, h: 16, bg: 'canvas' },
        /* Autonomy policy — the governance control. */
        {
          t: 'frame',
          name: 'autonomy-banner',
          w: cw,
          bg: 'surface',
          stroke: { color: 'warning-border', weight: 1, align: 'INSIDE' },
          radius: 'md',
          layout: { dir: 'V', gap: 8, pad: 16, sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'head',
              layout: { dir: 'H', gap: 10, align: 'CENTER', sizing: 'FIXED' },
              children: [
                {
                  t: 'frame', name: 'badge',
                  bg: 'warning-bg',
                  stroke: { color: 'warning-border', weight: 1, align: 'INSIDE' },
                  radius: 'sm',
                  layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', sizing: 'HUG' },
                  h: 20,
                  children: [
                    { t: 'ellipse', w: 5, h: 5, bg: 'warning', grow: 0 },
                    { t: 'text', text: '工作区自主策略', style: 'label/xs', color: 'warning' },
                  ],
                },
                { t: 'text', text: 'YOLO 自主推进', style: 'label/lg', color: 'text-strong' },
                { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
                { t: 'text', text: '仅管理员可修改', style: 'body/sm', color: 'text-subtle' },
                D().button('开启', 'secondary'),
              ],
            },
            {
              t: 'text',
              text: '开启后，未排除项目的有效审批会自动通过；身份、授权、资源范围、revision 与 Stop 校验始终生效。',
              style: 'body/sm', color: 'text-muted', w: cw - 40,
            },
          ],
        },
        { t: 'rect', name: 'gap', w: 1, h: 16, bg: 'canvas' },
        S().rowsContainer('attention-list',
          ATTENTION.flatMap((a, i) => {
            const card = D().attentionCard(a, cw);
            return i === 0 ? [card] : [S().rowDivider(cw), card];
          }),
          cw),
      ],
    });
  }

  /** Board — states as columns, colour on the card rail. */
  function board(mode, width = 1440) {
    const cw = CONTENT_W(width);
    const COL_W = Math.floor((cw - 4 * 14) / 5);
    const columns = [
      { tone: 'neutral', name: '待办',     name2: '已就绪', items: [WORK_ITEMS[4]] },
      { tone: 'amber',   name: '进行中',   items: [WORK_ITEMS[0], WORK_ITEMS[3]] },
      { tone: 'violet',  name: '评审中',   items: [WORK_ITEMS[1]] },
      { tone: 'red',     name: '已阻塞',   items: [WORK_ITEMS[2]] },
      { tone: 'green',   name: '已完成',   items: [] },
    ];

    return S().screen({
      current: 'board',
      width,
      content: [
        S().pageHead('看板', '按工作流状态分组', [
          D().button('列表', 'secondary'),
          D().button('新建', 'primary'),
        ]),
        {
          t: 'frame',
          name: 'board',
          w: cw,
          layout: { dir: 'H', gap: 14, sizing: 'FIXED' },
          children: columns.map((col) => ({
            t: 'frame',
            name: `column/${col.name}`,
            w: COL_W,
            layout: { dir: 'V', gap: 8, sizing: 'FIXED' },
            children: [
              {
                t: 'frame',
                name: 'col-head',
                layout: { dir: 'H', gap: 8, padB: 2, align: 'CENTER', sizing: 'FIXED' },
                children: [
                  { t: 'ellipse', w: 6, h: 6, bg: (WM_WORKFLOW[col.tone] || WM_WORKFLOW.neutral).dark, grow: 0 },
                  { t: 'text', text: col.name, style: 'label/md', color: 'text' },
                  { t: 'text', text: String(col.items.length), style: 'code/sm', color: 'text-subtle' },
                ],
              },
              ...(col.items.length
                ? col.items.map((item) => boardCard(item, COL_W, col.tone))
                : [{
                    t: 'text',
                    text: '暂无',
                    style: 'body/xs',
                    color: 'text-subtle',
                  }]),
            ],
          })),
        },
      ],
    });
  }

  function boardCard(item, w, tone) {
    const priHex = (WM_PRIORITY[item.priority] || WM_PRIORITY.none).dark;
    const bars = [4, 7, 10];
    const filled = { urgent: 3, high: 3, medium: 1, low: 0, none: 0 }[item.priority];

    return {
      t: 'frame',
      name: `card/${item.id}`,
      w,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', gap: 0, sizing: 'FIXED' },
      clip: true,
      children: [
        { t: 'rect', name: 'state-rail', w: 2, h: 'fill', bg: (WM_WORKFLOW[tone] || WM_WORKFLOW.neutral).dark },
        {
          t: 'frame',
          name: 'body',
          grow: 1,
          layout: { dir: 'V', gap: 0, pad: 12, sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'top',
              layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'FIXED' },
              children: [
                { t: 'text', text: item.id, style: 'code/sm', color: 'text-subtle' },
                { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
                {
                  t: 'frame',
                  name: 'pri',
                  layout: { dir: 'H', gap: 1.5, align: 'END', sizing: 'HUG' },
                  h: 10,
                  children: bars.map((bh, i) => ({
                    t: 'rect', w: 2.5, h: bh, radius: 1,
                    bg: i < filled ? priHex : 'border-strong',
                  })),
                },
              ],
            },
            { t: 'rect', name: 'gap', w: 1, h: 6, bg: 'surface' },
            { t: 'text', text: item.title, style: 'label/md', color: 'text', w: w - 30 },
            { t: 'rect', name: 'gap', w: 1, h: 9, bg: 'surface' },
            { t: 'rect', name: 'sep', w: w - 24, h: 1, bg: 'border-subtle' },
            { t: 'rect', name: 'gap', w: 1, h: 9, bg: 'surface' },
            {
              t: 'frame',
              name: 'foot',
              layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'FIXED' },
              children: [
                { t: 'icon', icon: 'user', size: 12, color: 'text-subtle' },
                { t: 'text', text: item.human, style: 'body/xs', color: 'text-subtle' },
                { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
                ...item.labels.map((l) => ({
                  t: 'text', text: l, style: 'code/sm', color: 'text-muted',
                })),
              ],
            },
          ],
        },
      ],
    };
  }

  /** Work item list — the filtered surface shared by active / backlog. */
  function listPage(current, title, description, items, mode, width = 1440) {
    const cw = CONTENT_W(width);

    return S().screen({
      current,
      width,
      content: [
        S().pageHead(title, description, [D().button('新建工作项', 'primary')]),
        filterBar(cw),
        { t: 'rect', name: 'gap', w: 1, h: 14, bg: 'canvas' },
        items.length
          ? S().rowsContainer('work-items',
              items.flatMap((w, i) => {
                const row = D().workItemRow(w, cw, 'comfortable');
                return i === 0 ? [row] : [S().rowDivider(cw), row];
              }),
              cw)
          : D().stateSurface('empty', '没有匹配的工作项', '调整筛选条件，或新建一个工作项。', cw, '清除筛选'),
      ],
    });
  }

  function filterBar(w) {
    const field = (label, value) => ({
      t: 'frame',
      name: `filter/${label}`,
      bg: 'surface-inset',
      stroke: { color: 'border-strong', weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', gap: 6, padX: 10, align: 'CENTER', sizing: 'HUG' },
      h: 32,
      children: [
        { t: 'text', text: value, style: 'body/sm', color: 'text-muted' },
        { t: 'icon', icon: 'caret-down', size: 12, color: 'text-subtle' },
      ],
    });

    return {
      t: 'frame',
      name: 'filter-bar',
      w,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'md',
      layout: { dir: 'H', gap: 8, pad: 16, align: 'CENTER', wrap: true, sizing: 'FIXED' },
      children: [
        {
          t: 'frame',
          name: 'search',
          w: 260, h: 32,
          bg: 'surface-inset',
          stroke: { color: 'border-strong', weight: 1, align: 'INSIDE' },
          radius: 'sm',
          layout: { dir: 'H', gap: 8, padX: 10, align: 'CENTER', sizing: 'FIXED' },
          children: [
            { t: 'icon', icon: 'search', size: 14, color: 'text-subtle' },
            { t: 'text', text: '搜索工作项…', style: 'body/sm', color: 'text-subtle', grow: 1 },
          ],
        },
        field('状态', '全部状态'),
        field('优先级', '全部优先级'),
        field('负责人', '全部负责人'),
        field('项目', '全部项目'),
        { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
        D().button('清除筛选', 'ghost'),
      ],
    };
  }

  /** Agents — registry, connections, approvals, enrollment, archive. */
  function agents(mode, width = 1440) {
    const cw = CONTENT_W(width);
    const AGENTS = [
      { name: 'Atlas', slug: 'atlas', state: 'active', caps: 12, conc: 3, hb: '3s',
        desc: '主力实现智能体，负责协议层与迁移。' },
      { name: 'Bolt', slug: 'bolt', state: 'active', caps: 8, conc: 2, hb: '12s',
        desc: '可靠性与并发场景专项。' },
      { name: 'Scribe', slug: 'scribe', state: 'inactive', caps: 5, conc: 1, hb: '26s',
        desc: '文档与内容整理。' },
    ];

    return S().screen({
      current: 'agents',
      width,
      content: [
        S().pageHead('智能体', '注册表、连接、授权与审批', [D().button('注册智能体', 'primary')]),
        tabs(['注册表', '连接', '审批', '纳入策略', '已归档'], 0, cw),
        { t: 'rect', name: 'gap', w: 1, h: 20, bg: 'canvas' },
        S().rowsContainer('registry',
          AGENTS.flatMap((a, i) => {
            const card = agentCard(a, cw);
            return i === 0 ? [card] : [S().rowDivider(cw), card];
          }),
          cw),
        { t: 'rect', name: 'gap', w: 1, h: 28, bg: 'canvas' },
        S().sectionHead('能力分布', undefined, []),
        D().dataTable('capability-table',
          [
            { key: 'cap', label: '能力', width: 0, grow: true, mono: true, muted: true },
            { key: 'n', label: '已批智能体', width: 100 },
          ],
          [
            { cap: 'filesystem:write', n: '3' },
            { cap: 'repo:merge', n: '3' },
            { cap: 'deploy:production', n: '1' },
            { cap: 'secrets:use', n: '0' },
          ],
          cw),
      ],
    });
  }

  function agentCard(a, w) {
    const tone = a.state === 'active' ? 'success' : 'neutral';

    return {
      t: 'frame',
      name: `agent/${a.slug}`,
      w,
      bg: 'surface',
      layout: { dir: 'V', gap: 0, pad: 16, sizing: 'FIXED' },
      children: [
        {
          t: 'frame',
          name: 'head',
          layout: { dir: 'H', gap: 12, align: 'CENTER', sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'avatar',
              w: 28, h: 28,
              bg: 'success-bg',
              stroke: { color: 'success-border', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
              children: [{ t: 'text', text: a.name[0], style: 'label/md', color: 'success' }],
            },
            {
              t: 'frame',
              name: 'name',
              layout: { dir: 'V', gap: 2, sizing: 'HUG' },
              children: [
                {
                  t: 'frame',
                  name: 'name-line',
                  layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
                  children: [
                    { t: 'text', text: a.name, style: 'label/lg', color: 'text-strong' },
                    { t: 'text', text: a.slug, style: 'code/sm', color: 'text-subtle' },
                  ],
                },
                { t: 'text', text: a.desc, style: 'body/xs', color: 'text-muted' },
              ],
            },
            { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
            {
              t: 'frame',
              name: 'state',
              bg: `${tone}-bg`,
              stroke: { color: `${tone}-border`, weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', sizing: 'HUG' },
              h: 20,
              children: [
                { t: 'ellipse', w: 5, h: 5, bg: tone, grow: 0 },
                { t: 'text', text: a.state === 'active' ? '活跃' : '未激活', style: 'label/xs', color: tone },
              ],
            },
          ],
        },
        { t: 'rect', name: 'gap', w: 1, h: 12, bg: 'surface' },
        {
          t: 'frame',
          name: 'facts',
          layout: { dir: 'H', gap: 20, align: 'CENTER', sizing: 'FIXED' },
          children: [
            D().metric('已批能力', a.caps, false),
            D().metric('并发上限', a.conc, false),
            D().metric('心跳', a.hb, true),
            { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
            D().button('管理团队权限', 'secondary'),
          ],
        },
      ],
    };
  }

  /** Session detail — prompt, plan diff, activity, artifacts. */
  function sessionDetail(mode, width = 1440) {
    const cw = CONTENT_W(width);
    const s = SESSIONS[0];

    return S().screen({
      current: 'sessions',
      width,
      content: [
        /* Back + identity */
        {
          t: 'frame',
          name: 'back-row',
          layout: { dir: 'H', gap: 10, padB: 16, align: 'CENTER', sizing: 'HUG' },
          children: [
            { t: 'icon', icon: 'arrow-left', size: 16, color: 'text-muted' },
            { t: 'text', text: '智能体执行', style: 'body/sm', color: 'text-muted' },
          ],
        },
        S().pageHead(`Session ${s.id}`, `${s.agent} · 当前步骤 ${s.step}`, [
          D().button('暂停', 'secondary'),
          D().button('停止', 'secondary'),
        ]),
        /* Facts strip */
        D().dataTable('session-facts',
          [
            { key: 'k', label: '状态', width: 0, grow: true },
            { key: 'k2', label: '负责人类', width: 0, grow: true },
            { key: 'k3', label: '当前步骤', width: 0, grow: true },
            { key: 'k4', label: '心跳', width: 0, grow: true },
            { key: 'k5', label: '预算', width: 0, grow: true },
          ],
          [{
            k: '执行中', k2: '许润鑫', k3: 'normalize-apply-hash', k4: '3s', k5: '62%',
          }],
          cw),
        { t: 'rect', name: 'gap', w: 1, h: 24, bg: 'canvas' },
        /* Plan versions */
        S().sectionHead('计划版本', 'v3', [
          {
            t: 'frame', name: 'invariant-badge',
            bg: 'violet-bg',
            stroke: { color: 'violet-border', weight: 1, align: 'INSIDE' },
            radius: 'sm',
            layout: { dir: 'H', padX: 8, align: 'CENTER', sizing: 'HUG' },
            h: 22,
            children: [{ t: 'text', text: '稳定 ID 跨版本保持', style: 'label/sm', color: 'violet' }],
          },
        ]),
        D().planDiffTable(PLAN, cw),
        { t: 'rect', name: 'gap', w: 1, h: 28, bg: 'canvas' },
        /* Activity */
        S().sectionHead('活动', undefined, [D().button('显示心跳', 'ghost')]),
        D().timeline(ACTIVITY, cw),
      ],
    });
  }

  /** Recovery centre. */
  function recovery(mode, width = 1440) {
    const cw = CONTENT_W(width);

    const ITEMS = [
      { tone: 'danger', badge: '阻塞', title: '陈旧租约未释放',
        desc: 'ses_5d0e33 持有 WM-151 的独占租约已 26 分钟无心跳。', action: '强制释放' },
      { tone: 'warning', badge: '预警', title: '运行失败待重试',
        desc: 'ses_1a44c2 在迁移步骤失败，已保留现场。', action: '重试' },
    ];

    return S().screen({
      current: 'recovery',
      width,
      content: [
        S().pageHead('恢复中心', '陈旧租约、失败运行与需要干预的工作项', []),
        S().rowsContainer('recovery-list',
          ITEMS.flatMap((it, i) => {
            const card = recoveryCard(it, cw);
            return i === 0 ? [card] : [S().rowDivider(cw), card];
          }),
          cw),
      ],
    });
  }

  function recoveryCard(it, w) {
    return {
      t: 'frame',
      name: `recovery/${it.title}`,
      w,
      bg: 'surface',
      layout: { dir: 'H', gap: 0, sizing: 'FIXED' },
      clip: true,
      children: [
        { t: 'rect', name: 'rail', w: 2, h: 'fill', bg: it.tone },
        {
          t: 'frame',
          name: 'body',
          grow: 1,
          layout: { dir: 'V', gap: 6, pad: 16, sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'head',
              layout: { dir: 'H', gap: 10, align: 'CENTER', sizing: 'FIXED' },
              children: [
                {
                  t: 'frame', name: 'badge',
                  bg: `${it.tone}-bg`,
                  stroke: { color: `${it.tone}-border`, weight: 1, align: 'INSIDE' },
                  radius: 'sm',
                  layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', sizing: 'HUG' },
                  h: 20,
                  children: [
                    { t: 'ellipse', w: 5, h: 5, bg: it.tone, grow: 0 },
                    { t: 'text', text: it.badge, style: 'label/xs', color: it.tone },
                  ],
                },
                { t: 'text', text: it.title, style: 'label/lg', color: 'text-strong' },
                { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
                D().button(it.action, 'secondary'),
              ],
            },
            { t: 'text', text: it.desc, style: 'body/sm', color: 'text-muted', w: w - 240 },
          ],
        },
      ],
    };
  }

  /** Operations console. */
  function operations(mode, width = 1440) {
    const cw = CONTENT_W(width);

    const METRICS = [
      { label: '本月运行成本', value: '¥ 1,284', delta: '+12%', tone: 'warning' },
      { label: '智能体 Token 用量', value: '42.8M', delta: '+8%', tone: 'warning' },
      { label: '平均 Session 时长', value: '6m 24s', delta: '−4%', tone: 'success' },
      { label: '待处理审批', value: '3', delta: '—', tone: 'neutral' },
    ];

    return S().screen({
      current: 'ops',
      width,
      content: [
        S().pageHead('运营控制台', '用量、成本、流水线与自动化', []),
        tabs(['用量', '流水线', '自动化', '模板'], 0, cw),
        { t: 'rect', name: 'gap', w: 1, h: 20, bg: 'canvas' },
        /* Metric cards */
        {
          t: 'frame',
          name: 'metrics',
          w: cw,
          layout: { dir: 'H', gap: 16, sizing: 'FIXED' },
          children: METRICS.map((m) => ({
            t: 'frame',
            name: `metric/${m.label}`,
            grow: 1,
            bg: 'surface',
            stroke: { color: 'border', weight: 1, align: 'INSIDE' },
            radius: 'md',
            layout: { dir: 'V', gap: 6, pad: 16, sizing: 'FIXED' },
            children: [
              { t: 'text', text: m.label, style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
              {
                t: 'frame',
                name: 'value',
                layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
                children: [
                  { t: 'text', text: m.value, style: 'display/md', color: 'text-strong' },
                  {
                    t: 'frame', name: 'delta',
                    bg: `${m.tone}-bg`,
                    stroke: { color: `${m.tone}-border`, weight: 1, align: 'INSIDE' },
                    radius: 'sm',
                    layout: { dir: 'H', padX: 6, align: 'CENTER', sizing: 'HUG' },
                    h: 20,
                    children: [{ t: 'text', text: m.delta, style: 'label/xs', color: m.tone }],
                  },
                ],
              },
            ],
          })),
        },
        { t: 'rect', name: 'gap', w: 1, h: 28, bg: 'canvas' },
        S().sectionHead('最近运行', undefined, []),
        D().dataTable('runs-table',
          [
            { key: 'id', label: '运行', width: 80, mono: true, muted: true },
            { key: 'pipe', label: '流水线', width: 0, grow: true, mono: true },
            { key: 'status', label: '状态', width: 110 },
            { key: 'dur', label: '耗时', width: 90, mono: true, muted: true },
            { key: 'when', label: '时间', width: 110, muted: true },
          ],
          [
            { id: '#4821', pipe: 'ci:test:e2e', status: badgeCell('通过', 'success'), dur: '4m 12s', when: '2 分钟前' },
            { id: '#4820', pipe: 'deploy:staging', status: badgeCell('通过', 'success'), dur: '1m 48s', when: '11 分钟前' },
            { id: '#4819', pipe: 'ci:test:integration', status: badgeCell('失败', 'danger'), dur: '2m 03s', when: '26 分钟前' },
            { id: '#4818', pipe: 'db:migrate', status: badgeCell('通过', 'success'), dur: '38s', when: '1 小时前' },
          ],
          cw),
      ],
    });
  }

  function badgeCell(label, tone) {
    return {
      t: 'frame',
      name: `badge/${label}`,
      w: 110,
      layout: { dir: 'H', align: 'CENTER', sizing: 'FIXED' },
      children: [{
        t: 'frame',
        name: 'inner',
        bg: `${tone}-bg`,
        stroke: { color: `${tone}-border`, weight: 1, align: 'INSIDE' },
        radius: 'sm',
        layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', sizing: 'HUG' },
        h: 20,
        children: [
          { t: 'ellipse', w: 5, h: 5, bg: tone, grow: 0 },
          { t: 'text', text: label, style: 'label/xs', color: tone },
        ],
      }],
    };
  }

  /** Settings — workflow states and members. */
  function settings(mode, width = 1440) {
    const cw = CONTENT_W(width);
    const colW = Math.floor((cw - 20) / 2);

    const STATES = [
      { name: '待办', cat: 'backlog', tone: 'neutral', n: '3' },
      { name: '已就绪', cat: 'unstarted', tone: 'blue', n: '2' },
      { name: '进行中', cat: 'started', tone: 'amber', n: '2' },
      { name: '评审中', cat: 'started', tone: 'violet', n: '1' },
      { name: '已完成', cat: 'completed', tone: 'green', n: '4' },
    ];

    return S().screen({
      current: 'settings',
      width,
      content: [
        S().pageHead('设置', '团队结构与工作流状态', []),
        tabs(['工作流', '成员', '团队', '危险操作'], 0, cw),
        { t: 'rect', name: 'gap', w: 1, h: 20, bg: 'canvas' },
        {
          t: 'frame',
          name: 'two-col',
          w: cw,
          layout: { dir: 'H', gap: 20, sizing: 'FIXED' },
          children: [
            /* Workflow states */
            {
              t: 'frame',
              name: 'col-workflow',
              w: colW,
              layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
              children: [
                S().sectionHead('工作流状态', undefined, [D().button('新增状态', 'secondary')]),
                {
                  t: 'frame',
                  name: 'states',
                  w: colW,
                  bg: 'surface',
                  stroke: { color: 'border', weight: 1, align: 'INSIDE' },
                  radius: 'md',
                  clip: true,
                  layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
                  children: STATES.flatMap((s, i) => {
                    const swatch = (WM_WORKFLOW[s.tone] || WM_WORKFLOW.neutral).dark;
                    const row = {
                      t: 'frame',
                      name: `state/${s.name}`,
                      w: colW,
                      layout: { dir: 'H', gap: 10, pad: 12, align: 'CENTER', sizing: 'FIXED' },
                      children: [
                        { t: 'ellipse', w: 8, h: 8, bg: swatch, grow: 0 },
                        { t: 'text', text: s.name, style: 'label/md', color: 'text', w: 70 },
                        { t: 'text', text: s.cat, style: 'code/sm', color: 'text-subtle', grow: 1 },
                        { t: 'text', text: swatch, style: 'code/sm', color: 'text-muted' },
                        { t: 'text', text: s.n, style: 'code/sm', color: 'text-subtle', w: 24 },
                      ],
                    };
                    return i === 0 ? [row] : [S().rowDivider(colW), row];
                  }),
                },
              ],
            },
            /* Members */
            {
              t: 'frame',
              name: 'col-members',
              w: colW,
              layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
              children: [
                S().sectionHead('团队成员', undefined, []),
                {
                  t: 'frame',
                  name: 'members',
                  w: colW,
                  bg: 'surface',
                  stroke: { color: 'border', weight: 1, align: 'INSIDE' },
                  radius: 'md',
                  clip: true,
                  layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
                  children: [
                    memberRow('许润鑫', 'owner', true, colW),
                    S().rowDivider(colW),
                    memberRow('陈可', 'member', false, colW),
                    S().rowDivider(colW),
                    memberRow('林望', 'member', false, colW),
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  }

  function memberRow(name, role, isYou, w) {
    return {
      t: 'frame',
      name: `member/${name}`,
      w,
      layout: { dir: 'H', gap: 10, pad: 12, align: 'CENTER', sizing: 'FIXED' },
      children: [
        {
          t: 'frame', name: 'avatar',
          w: 24, h: 24,
          bg: 'surface-active',
          radius: 'pill',
          layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
          children: [{ t: 'text', text: name[0], style: 'label/xs', color: 'text-muted' }],
        },
        { t: 'text', text: name, style: 'label/md', color: 'text', grow: 1 },
        { t: 'text', text: role, style: 'code/sm', color: 'text-subtle' },
        ...(isYou ? [{
          t: 'frame', name: 'you',
          bg: 'accent-bg',
          stroke: { color: 'accent-border', weight: 1, align: 'INSIDE' },
          radius: 'sm',
          layout: { dir: 'H', padX: 7, align: 'CENTER', sizing: 'HUG' },
          h: 20,
          children: [{ t: 'text', text: '你', style: 'label/xs', color: 'accent' }],
        }] : []),
      ],
    };
  }

  /** Auth — centred card, no shell. */
  function login(mode, width = 1440) {
    return {
      t: 'frame',
      name: 'screen/login',
      w: width,
      h: 900,
      bg: 'canvas',
      layout: { dir: 'V', gap: 0, align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
      children: [
        {
          t: 'frame',
          name: 'auth-card',
          w: 400,
          bg: 'surface',
          stroke: { color: 'border', weight: 1, align: 'INSIDE' },
          radius: 'lg',
          effect: mode === 'light' ? 'elevation/md' : 'elevation/dark/md',
          layout: { dir: 'V', gap: 0, pad: 28, sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'brand',
              layout: { dir: 'H', gap: 10, padB: 20, align: 'CENTER', sizing: 'HUG' },
              children: [
                {
                  t: 'frame', name: 'mark',
                  w: 26, h: 26,
                  bg: 'accent',
                  radius: 7,
                  layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
                  children: [{ t: 'icon', icon: 'git-branch', size: 15, color: 'accent-fg' }],
                },
                { t: 'text', text: 'WorkMesh', style: 'title/sm', color: 'text-strong' },
              ],
            },
            { t: 'text', text: '登录工作区', style: 'title/lg', color: 'text-strong' },
            { t: 'text', text: '使用你的团队账号继续。', style: 'body/sm', color: 'text-muted' },
            { t: 'rect', name: 'gap', w: 1, h: 8, bg: 'surface' },
            field('邮箱', 'xurx@live.com', 344),
            field('密码', '••••••••••••', 344),
            { t: 'rect', name: 'gap', w: 1, h: 20, bg: 'surface' },
            {
              t: 'frame',
              name: 'submit',
              w: 344, h: 40,
              bg: 'accent',
              stroke: { color: 'accent', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
              children: [{ t: 'text', text: '登录', style: 'label/lg', color: 'accent-fg' }],
            },
          ],
        },
      ],
    };
  }

  function field(label, value, w) {
    return {
      t: 'frame',
      name: `field/${label}`,
      w,
      layout: { dir: 'V', gap: 5, padT: 14, sizing: 'FIXED' },
      children: [
        { t: 'text', text: label, style: 'label/sm', color: 'text-muted' },
        {
          t: 'frame',
          name: 'input',
          w, h: 38,
          bg: 'surface-inset',
          stroke: { color: 'border-strong', weight: 1, align: 'INSIDE' },
          radius: 'sm',
          layout: { dir: 'H', padX: 11, align: 'CENTER', sizing: 'FIXED' },
          children: [{ t: 'text', text: value, style: 'body/md', color: 'text', grow: 1 }],
        },
      ],
    };
  }

  /** Tab strip. */
  function tabs(items, activeIndex, w) {
    return {
      t: 'frame',
      name: 'tab-bar',
      w,
      stroke: { color: 'border', weight: 1, align: 'OUTSIDE' },
      layout: { dir: 'H', gap: 2, sizing: 'FIXED' },
      children: items.map((item, i) => ({
        t: 'frame',
        name: `tab/${item}`,
        h: 38,
        layout: { dir: 'H', gap: 6, padX: 11, align: 'CENTER', sizing: 'HUG' },
        children: [
          {
            t: 'text',
            text: item,
            style: i === activeIndex ? 'label/lg' : 'label/md',
            color: i === activeIndex ? 'text-strong' : 'text-muted',
          },
          ...(i === activeIndex ? [{
            t: 'frame', name: 'underline',
            w: 40, h: 2,
            bg: 'accent',
            layout: { dir: 'H', sizing: 'FIXED' },
            children: [],
          }] : []),
        ],
      })),
    };
  }

  /* ================= registry ================= */

  const PAGES = [
    { key: 'home',          label: '我的工作',   build: home },
    { key: 'inbox',         label: '审批中心',   build: inbox },
    { key: 'board',         label: '看板',       build: board },
    { key: 'active',        label: '进行中',
      build: (m, w) => listPage('active', '进行中', '所有已启动的工作项',
        WORK_ITEMS.filter((x) => ['amber', 'violet', 'red'].includes(x.statusTone)), m, w) },
    { key: 'backlog',       label: '待办池',
      build: (m, w) => listPage('backlog', '待办池', '尚未排期的工作',
        WORK_ITEMS.filter((x) => ['neutral', 'blue'].includes(x.statusTone)), m, w) },
    { key: 'agents',        label: '智能体',     build: agents },
    { key: 'sessions',      label: 'Session',    build: sessionDetail },
    { key: 'recovery',      label: '恢复中心',   build: recovery },
    { key: 'ops',           label: '运营控制台', build: operations },
    { key: 'settings',      label: '设置',       build: settings },
    { key: 'login',         label: '登录',       build: login },
  ];

  return { PAGES, WORK_ITEMS, ATTENTION, SESSIONS, PLAN, ACTIVITY };
})();
