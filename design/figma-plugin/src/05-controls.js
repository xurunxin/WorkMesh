/**
 * WorkMesh Design System — control library.
 *
 * Every control is a real Figma Component (or ComponentSet with variants),
 * so the library is usable in the editor, not just a picture of a library.
 *
 * Variant naming convention: `Property=Value` joined by ", " — Figma's own
 * syntax for `combineAsVariants`, so the axes resolve into real props.
 *
 * The signatures here mirror the components that already exist in
 * packages/ui, so a designer reading Figma sees the component a developer
 * will import.
 */

const BF_CONTROLS = (() => {
  /* ================= primitives ================= */

  /**
   * Build one component from a spec, then apply its own props to the node.
   * `figma.createComponent()` returns a COMPONENT frame that is itself the
   * auto-layout container, so we never wrap it in extra chrome.
   */
  async function component(name, spec, mode) {
    const node = figma.createComponent();
    BF.stats.components += 1;

    /* Merge so the component carries the spec's layout, not a child frame. */
    const merged = { ...spec, t: 'frame', name };
    BF.applyProps(node, merged, mode);

    if (spec.children && spec.children.length) {
      for (const child of spec.children) {
        await BF.render(child, node, mode);
      }
    }
    return node;
  }

  /**
   * Assemble a variant set.
   * `rows` is an array of { props: {size:'md',...}, spec } — each becomes a
   * COMPONENT named with Figma variant syntax, then all are combined.
   */
  async function variantSet(name, rows, mode) {
    const built = [];
    for (const row of rows) {
      const variantName = Object.entries(row.props)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const c = await component(variantName, row.spec, mode);
      built.push(c);
      BF.stats.variants += 1;
    }

    if (built.length < 2) return built[0] || null;

    const set = figma.combineAsVariants(built, figma.currentPage);
    set.name = name;
    set.layoutMode = 'VERTICAL';
    set.primaryAxisSizingMode = 'AUTO';
    set.counterAxisSizingMode = 'AUTO';
    set.itemSpacing = 20;
    set.paddingLeft = set.paddingRight = 20;
    set.paddingTop = set.paddingBottom = 20;
    set.fills = [];
    return set;
  }

  /* ================= button ================= */

  /**
   * Button — mirrors packages/ui `Button`.
   * Axes: variant (primary | secondary | ghost | danger) × size (sm | md | lg)
   *        × state (default | hover | disabled)
   */
  function buttonSpec(variant, size, state, label) {
    const H = { sm: WM_CONTROL_HEIGHT.sm, md: WM_CONTROL_HEIGHT.md, lg: WM_CONTROL_HEIGHT.lg }[size];
    const PAD = { sm: 8, md: 11, lg: 16 }[size];
    const FS = { sm: 'xs', md: 'sm', lg: 'base' }[size];

    /* Variant paints */
    const P = {
      primary:   { bg: 'accent',   fg: 'accent-fg',        bd: 'accent' },
      secondary: { bg: 'surface-subtle', fg: 'text',       bd: 'border' },
      ghost:     { bg: null,       fg: 'text-muted',       bd: null },
      danger:    { bg: 'danger',   fg: 'text-inverse',     bd: 'danger' },
    }[variant];

    /* State overrides resolve to different tokens, never to opacity tricks
       — except disabled, which is genuinely a reduced-emphasis state. */
    let bg = P.bg, fg = P.fg, bd = P.bd, opacity = 1;
    if (state === 'hover') {
      if (variant === 'primary') bg = 'accent-hover';
      else if (variant === 'secondary') bg = 'surface-hover';
      else if (variant === 'ghost') bg = 'surface-subtle';
      else bg = 'danger';
    }
    if (state === 'disabled') opacity = 0.45;

    return {
      h: H,
      opacity,
      bg: bg || undefined,
      stroke: bd ? { color: bd, weight: 1, align: 'INSIDE' } : undefined,
      radius: 'sm',
      layout: {
        dir: 'H', gap: 6, padX: PAD, align: 'CENTER', justify: 'CENTER',
        sizing: 'HUG',
      },
      children: [
        { t: 'text', text: label, style: `label/${size === 'lg' ? 'lg' : 'md'}`, color: fg },
      ],
      __fs: FS,
    };
  }

  async function buildButtons(parent, mode, copied) {
    /* A compact but honest matrix: 4 variants × 3 sizes × 3 states. */
    const variants = ['primary', 'secondary', 'ghost', 'danger'];
    const sizes = ['sm', 'md', 'lg'];
    const states = ['default', 'hover', 'disabled'];
    const LABEL = { primary: '新建工作项', secondary: '保存视图', ghost: '清除筛选', danger: '删除' };

    const rows = [];
    for (const variant of variants) {
      for (const size of sizes) {
        for (const state of states) {
          rows.push({
            props: { variant, size, state },
            spec: buttonSpec(variant, size, state, copied[`btn.${variant}`] || LABEL[variant]),
          });
        }
      }
    }

    const set = await variantSet('Button', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= badge ================= */

  /**
   * Badge — status pill. Mirrors the `wm-semantic-*` grammar:
   * the tone is chosen from the semantic family, not by the caller's taste.
   */
  function badgeSpec(tone, withDot, label) {
    return {
      bg: `${tone}-bg`,
      stroke: { color: `${tone}-border`, weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
      minH: 20,
      children: [
        ...(withDot ? [{ t: 'ellipse', w: 5, h: 5, bg: tone, grow: 0 }] : []),
        { t: 'text', text: label, style: 'label/xs', color: tone },
      ],
    };
  }

  async function buildBadges(parent, mode, copied) {
    const tones = ['info', 'success', 'warning', 'danger', 'violet', 'neutral'];
    const LABEL = {
      info: copied['badge.info'] || '待处理',
      success: copied['badge.success'] || '已完成',
      warning: copied['badge.warning'] || '需关注',
      danger: copied['badge.danger'] || '已阻塞',
      violet: copied['badge.violet'] || '人工输入',
      neutral: copied['badge.neutral'] || '已取消',
    };

    const rows = [];
    for (const tone of tones) {
      for (const withDot of ['true', 'false']) {
        rows.push({
          props: { tone, dot: withDot },
          spec: {
            bg: 'surface',
            layout: { dir: 'V', gap: 0, pad: 8, sizing: 'HUG' },
            children: [badgeSpec(tone, withDot === 'true', LABEL[tone])],
          },
        });
      }
    }

    const set = await variantSet('Badge', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= status pill (workflow) ================= */

  /**
   * StatusPill — driven by the user-configurable workflow colour.
   * Colour is applied as a literal because the value is runtime data,
   * which is exactly how the frontend does it (`workflowStatusStyle`).
   */
  function statusSpec(colorHex, name) {
    return {
      bg: 'surface-subtle',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', gap: 5, padX: 8, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
      minH: 22,
      children: [
        { t: 'ellipse', w: 6, h: 6, bg: colorHex, grow: 0 },
        { t: 'text', text: name, style: 'label/sm', color: 'text-muted' },
      ],
    };
  }

  async function buildStatusPills(parent, mode, copied) {
    const rows = Object.entries(WM_WORKFLOW).map(([key, pair]) => ({
      props: { status: key },
      spec: statusSpec(
        mode === 'light' ? pair.light : pair.dark,
        copied[`status.${key}`] || key,
      ),
    }));

    const set = await variantSet('StatusPill', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= priority ================= */

  /**
   * Priority — ordinal, so it encodes magnitude in bar height as well as
   * hue. This is the accessibility redundancy that keeps the ramp readable
   * without colour.
   */
  function prioritySpec(level, label, mode) {
    const pair = WM_PRIORITY[level];
    const filled = { urgent: 3, high: 3, medium: 1, low: 0, none: 0 }[level];
    const fillHex = pair[mode === 'light' ? 'light' : 'dark'];
    const bars = [4, 7, 10];

    return {
      layout: { dir: 'H', gap: 5, align: 'CENTER', sizing: 'HUG' },
      h: 16,
      children: [
        {
          t: 'frame',
          name: 'bars',
          layout: { dir: 'H', gap: 1.5, align: 'END', sizing: 'HUG' },
          h: 10,
          children: bars.map((bh, i) => ({
            t: 'rect',
            w: 2.5,
            h: bh,
            radius: 1,
            bg: i < filled ? fillHex : 'border-strong',
          })),
        },
        { t: 'text', text: label, style: 'label/sm', color: 'text-muted' },
      ],
    };
  }

  async function buildPriorities(parent, mode, copied) {
    const labels = { urgent: '紧急', high: '高', medium: '中', low: '低', none: '无' };
    const rows = ['urgent', 'high', 'medium', 'low', 'none'].map((level) => ({
      props: { level },
      spec: prioritySpec(level, copied[`pri.${level}`] || labels[level], mode),
    }));

    const set = await variantSet('Priority', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= input ================= */

  function inputSpec(state, label) {
    const borderToken = state === 'error' ? 'danger' : state === 'focus' ? 'accent' : 'border-strong';

    return {
      w: 260,
      layout: { dir: 'V', gap: 5, sizing: 'FIXED' },
      children: [
        { t: 'text', text: label, style: 'label/sm', color: 'text-muted' },
        {
          t: 'frame',
          name: 'field',
          h: 38,
          w: 260,
          bg: 'surface-inset',
          stroke: { color: borderToken, weight: state === 'focus' ? 2 : 1, align: 'INSIDE' },
          radius: 'sm',
          layout: { dir: 'H', padX: 11, align: 'CENTER', sizing: 'FIXED' },
          children: [
            {
              t: 'text',
              text: state === 'filled' ? 'WM-142' : '搜索工作项…',
              style: 'body/md',
              color: state === 'filled' ? 'text' : 'text-subtle',
              grow: 1,
            },
          ],
        },
      ],
    };
  }

  async function buildInputs(parent, mode, copied) {
    const rows = [
      { props: { state: 'default' }, spec: inputSpec('default', '搜索') },
      { props: { state: 'focus' },   spec: inputSpec('focus', '搜索') },
      { props: { state: 'filled' },  spec: inputSpec('filled', '搜索') },
      { props: { state: 'error' },   spec: inputSpec('error', '校验失败') },
    ];

    const set = await variantSet('Input', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= tabs ================= */

  function tabSpec(items, activeIndex) {
    return {
      layout: { dir: 'H', gap: 2, sizing: 'HUG' },
      children: items.map((item, i) => ({
        t: 'frame',
        name: `tab/${item}`,
        layout: { dir: 'H', gap: 6, padX: 11, align: 'CENTER', sizing: 'HUG' },
        h: 38,
        bg: 'surface',
        stroke: i === activeIndex
          ? { color: 'accent', weight: 2, align: 'OUTSIDE' }
          : undefined,
        children: [
          {
            t: 'text',
            text: item,
            style: 'label/md',
            color: i === activeIndex ? 'text-strong' : 'text-muted',
          },
        ],
      })),
    };
  }

  async function buildTabs(parent, mode, copied) {
    const items = ['需要你', '消息', '智能体交付', '更新'];
    const rows = items.map((_, i) => ({
      props: { active: String(i) },
      spec: tabSpec(items, i),
    }));

    const set = await variantSet('TabBar', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= avatar ================= */

  function avatarSpec(kind, initial) {
    const isAgent = kind === 'agent';
    return {
      w: 20,
      h: 20,
      bg: isAgent ? 'success-bg' : 'surface-active',
      stroke: isAgent ? { color: 'success-border', weight: 1, align: 'INSIDE' } : undefined,
      radius: isAgent ? 'sm' : 'pill',
      layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
      children: [
        {
          t: 'text',
          text: initial,
          style: 'label/xs',
          color: isAgent ? 'success' : 'text-muted',
        },
      ],
    };
  }

  async function buildAvatars(parent, mode) {
    const rows = [
      { props: { kind: 'human', size: 'md' }, spec: avatarSpec('human', '许') },
      { props: { kind: 'agent', size: 'md' }, spec: avatarSpec('agent', 'A') },
    ];

    const set = await variantSet('Avatar', rows, mode);
    if (set && parent) parent.appendChild(set);
    return set;
  }

  /* ================= icon tile ================= */

  async function buildIconTile(parent, mode) {
    const spec = {
      w: 38, h: 38,
      bg: 'surface-subtle',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'md',
      layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
      children: [{ t: 'icon', icon: 'inbox', size: 18, color: 'text-subtle' }],
    };
    const c = await component('IconTile', spec);
    if (parent) parent.appendChild(c);
    return c;
  }

  /* ================= build all ================= */

  /**
   * `copied` lets a caller override every visible label so the library can
   * be rendered in the product's actual language.
   */
  async function buildAll(parent, mode, copied = {}) {
    const built = [];
    const steps = [
      ['buttons', () => buildButtons(parent, mode, copied)],
      ['badges', () => buildBadges(parent, mode, copied)],
      ['statusPills', () => buildStatusPills(parent, mode, copied)],
      ['priorities', () => buildPriorities(parent, mode, copied)],
      ['inputs', () => buildInputs(parent, mode, copied)],
      ['tabs', () => buildTabs(parent, mode, copied)],
      ['avatars', () => buildAvatars(parent, mode, copied)],
      ['iconTile', () => buildIconTile(parent, mode)],
    ];

    for (const [name, fn] of steps) {
      try {
        built.push([name, await fn()]);
      } catch (err) {
        BF.fail(`control/${name}`, err);
      }
    }
    return built;
  }

  return {
    buildAll,
    buildButtons, buildBadges, buildStatusPills, buildPriorities,
    buildInputs, buildTabs, buildAvatars, buildIconTile,
    component, variantSet,
  };
})();
