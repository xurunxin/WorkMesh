/**
 * WorkMesh Design System — surfaces.
 *
 * The domain components that sit above the primitives: the app shell,
 * work-item rows, attention cards, session telemetry, plan diff, timeline.
 *
 * These are the pieces that carry WorkMesh's actual product model, so they
 * are built once here and consumed by every page in 07-pages.js. Building
 * the shell here (rather than inside each page) is what keeps seven screens
 * from drifting apart.
 */

const BF_SURFACES = (() => {
  /* ================= app shell ================= */

  /** The navigation model, mirrored from app/lib/workspace-navigation.tsx. */
  const NAV = [
    { group: '工作台', items: [
      { id: 'home',    label: '我的工作', icon: 'home',   count: 7 },
      { id: 'active',  label: '进行中',   icon: 'play',   count: 4 },
      { id: 'board',   label: '看板',     icon: 'kanban' },
      { id: 'backlog', label: '待办池',   icon: 'stack',  count: 12 },
    ]},
    { group: '治理', items: [
      { id: 'inbox',    label: '审批中心', icon: 'inbox',    count: 3, tone: 'danger' },
      { id: 'agents',   label: '智能体',   icon: 'robot',    count: 3 },
      { id: 'sessions', label: 'Session',  icon: 'activity', count: 4 },
      { id: 'recovery', label: '恢复中心', icon: 'shield',   count: 1 },
    ]},
    { group: '运营', items: [
      { id: 'ops',      label: '运营控制台', icon: 'chart' },
      { id: 'settings', label: '设置',       icon: 'gear' },
    ]},
  ];

  const SIDEBAR_W = WM_LAYOUT.sidebarWidth;
  const HEADER_H = WM_LAYOUT.headerHeight;

  /**
   * Sidebar. A fixed-width column: brand, grouped nav, footer facts.
   * `current` marks the active item with the accent rail.
   */
  function sidebar(current) {
    const groups = NAV.map((g) => ({
      t: 'frame',
      name: `nav-group/${g.group}`,
      layout: { dir: 'V', gap: 1, sizing: 'HUG' },
      children: [
        {
          t: 'frame',
          name: 'group-label',
          layout: { dir: 'H', padL: 8, padB: 6, sizing: 'HUG' },
          children: [
            { t: 'text', text: g.group, style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
          ],
        },
        ...g.items.map((it) => navItem(it, current)),
      ],
    }));

    return {
      t: 'frame',
      name: 'sidebar',
      w: SIDEBAR_W,
      h: 900,
      bg: 'canvas-subtle',
      stroke: { color: 'border', weight: 1, align: 'OUTSIDE' },
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children: [
        /* Brand */
        {
          t: 'frame',
          name: 'brand',
          w: SIDEBAR_W,
          h: HEADER_H,
          layout: { dir: 'H', gap: 10, padX: 16, align: 'CENTER', sizing: 'FIXED' },
          children: [
            {
              t: 'frame',
              name: 'brand-mark',
              w: 26,
              h: 26,
              bg: 'accent',
              radius: 7,
              layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
              children: [{ t: 'icon', icon: 'git-branch', size: 15, color: 'accent-fg' }],
            },
            {
              t: 'frame',
              name: 'brand-text',
              layout: { dir: 'V', gap: 0, sizing: 'HUG' },
              children: [
                { t: 'text', text: 'WorkMesh', style: 'label/lg', color: 'text-strong' },
                { t: 'text', text: '许润鑫', style: 'body/xs', color: 'text-subtle' },
              ],
            },
          ],
        },
        /* Nav */
        {
          t: 'frame',
          name: 'nav',
          grow: 1,
          w: SIDEBAR_W,
          layout: { dir: 'V', gap: 18, padX: 8, padT: 12, sizing: 'FIXED' },
          children: groups,
        },
        /* Footer */
        {
          t: 'frame',
          name: 'sidebar-footer',
          w: SIDEBAR_W,
          layout: { dir: 'V', gap: 8, pad: 12, sizing: 'FIXED' },
          children: [
            {
              t: 'text',
              text: 'v1.4.2 · a3f9c1e',
              style: 'code/sm',
              color: 'text-subtle',
            },
          ],
        },
      ],
    };
  }

  /** A single navigation row. The active one gets an accent rail. */
  function navItem(item, current) {
    const isActive = item.id === current;
    const tone = item.tone === 'danger' && !isActive ? 'danger' : (isActive ? 'text-strong' : 'text-muted');

    const row = {
      t: 'frame',
      name: `nav-item/${item.id}`,
      w: SIDEBAR_W - 16,
      h: 32,
      bg: isActive ? 'surface-hover' : undefined,
      radius: 'sm',
      layout: { dir: 'H', gap: 10, padX: 8, align: 'CENTER', sizing: 'FIXED' },
      children: [
        { t: 'icon', icon: item.icon, size: 15, color: isActive ? 'accent' : 'text-muted' },
        { t: 'text', text: item.label, style: 'label/md', color: tone, grow: 1 },
        ...(item.count ? [{
          t: 'frame',
          name: 'count',
          bg: isActive ? 'accent-bg' : 'surface-hover',
          radius: 'pill',
          layout: { dir: 'H', padX: 6, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
          h: 16,
          children: [{
            t: 'text',
            text: String(item.count),
            style: 'code/sm',
            color: isActive ? 'accent' : 'text-muted',
          }],
        }] : []),
      ],
    };

    if (!isActive) return row;

    /* Active rail: a 2px accent bar bled to the sidebar edge. */
    return {
      t: 'frame',
      name: `nav-active/${item.id}`,
      layout: { dir: 'H', gap: 0, sizing: 'HUG' },
      children: [
        { t: 'rect', w: 2, h: 16, bg: 'accent', radius: 1 },
        row,
      ],
    };
  }

  /**
   * Top header. Sticky in the browser; a fixed row here.
   * `actions` is an array of specs appended on the right.
   */
  function header(current, actions = []) {
    const flat = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));
    const item = flat.find((i) => i.id === current);
    const group = item ? item.group : '';
    const title = item ? item.label : '';

    return {
      t: 'frame',
      name: 'header',
      h: HEADER_H,
      grow: 1,
      bg: 'canvas',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      layout: { dir: 'H', gap: 12, padX: 20, align: 'CENTER', sizing: 'FIXED' },
      children: [
        {
          t: 'frame',
          name: 'breadcrumb',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
          children: [
            { t: 'text', text: group, style: 'body/sm', color: 'text-muted' },
            { t: 'text', text: '/', style: 'body/sm', color: 'text-subtle' },
            { t: 'text', text: title, style: 'label/md', color: 'text-strong' },
          ],
        },
        { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
        searchTrigger(),
        ...actions,
      ],
    };
  }

  /** The command-palette affordance. Mirrors the `Cmd/Ctrl+K` entry. */
  function searchTrigger() {
    return {
      t: 'frame',
      name: 'search-trigger',
      w: 240,
      h: 32,
      bg: 'surface-subtle',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', gap: 8, padX: 10, align: 'CENTER', sizing: 'FIXED' },
      children: [
        { t: 'icon', icon: 'search', size: 14, color: 'text-subtle' },
        { t: 'text', text: '搜索或跳转…', style: 'body/sm', color: 'text-subtle', grow: 1 },
        kbd('Ctrl'), kbd('K'),
      ],
    };
  }

  function kbd(label) {
    return {
      t: 'frame',
      name: `kbd/${label}`,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 4,
      layout: { dir: 'H', padX: 4, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
      h: 18,
      children: [{ t: 'text', text: label, style: 'code/sm', color: 'text-subtle' }],
    };
  }

  /**
   * Full application frame: sidebar + header + content column.
   * EVERY authenticated screen composes this, which is what guarantees the
   * seven pages share one shell instead of seven approximations of it.
   */
  function screen(opts) {
    const { current, content, actions = [], width = 1440, height = 900 } = opts;
    const contentW = width - SIDEBAR_W;

    return {
      t: 'frame',
      name: `screen/${current}`,
      w: width,
      h: height,
      bg: 'canvas',
      layout: { dir: 'H', gap: 0, sizing: 'FIXED' },
      clip: true,
      children: [
        sidebar(current),
        {
          t: 'frame',
          name: 'main',
          w: contentW,
          h: height,
          layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
          children: [
            header(current, actions),
            {
              t: 'frame',
              name: 'content',
              grow: 1,
              w: contentW,
              layout: { dir: 'V', gap: 0, pad: WM_LAYOUT.pagePadding, sizing: 'FIXED' },
              children: content,
            },
          ],
        },
      ],
    };
  }

  /** Page title block: h1 + supporting line, with optional right actions. */
  function pageHead(title, description, actions = []) {
    return {
      t: 'frame',
      name: 'page-head',
      w: 'fill',
      layout: { dir: 'H', gap: 16, padB: 24, align: 'START', sizing: 'FIXED' },
      children: [
        {
          t: 'frame',
          name: 'text',
          grow: 1,
          layout: { dir: 'V', gap: 3, sizing: 'FIXED' },
          children: [
            { t: 'text', text: title, style: 'title/lg', color: 'text-strong' },
            { t: 'text', text: description, style: 'body/sm', color: 'text-muted' },
          ],
        },
        ...(actions.length ? [{
          t: 'frame',
          name: 'actions',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
          children: actions,
        }] : []),
      ],
    };
  }

  /** Section header: uppercase label + count. */
  function sectionHead(label, count, right = []) {
    return {
      t: 'frame',
      name: `section-head/${label}`,
      layout: { dir: 'H', gap: 10, padB: 12, align: 'CENTER', sizing: 'FIXED' },
      children: [
        { t: 'text', text: label, style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
        ...(count !== undefined ? [{
          t: 'frame',
          name: 'count',
          bg: 'surface-subtle',
          radius: 'pill',
          layout: { dir: 'H', padX: 7, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
          h: 18,
          children: [{ t: 'text', text: String(count), style: 'code/sm', color: 'text-muted' }],
        }] : []),
        { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
        ...right,
      ],
    };
  }

  /** A bordered, clipped stack — the container for rows. */
  function rowsContainer(name, children, width) {
    return {
      t: 'frame',
      name,
      w: width,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'md',
      clip: true,
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children,
    };
  }

  /** 1px horizontal rule used between rows inside a container. */
  function rowDivider(width) {
    return { t: 'rect', name: 'divider', w: width, h: 1, bg: 'border-subtle' };
  }

  return {
    NAV, SIDEBAR_W, HEADER_H,
    sidebar, navItem, header, searchTrigger, kbd,
    screen, pageHead, sectionHead, rowsContainer, rowDivider,
  };
})();
