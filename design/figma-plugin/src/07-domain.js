/**
 * WorkMesh Design System — domain components.
 *
 * The pieces that encode WorkMesh's product model rather than generic UI:
 * work-item rows, attention cards with consequence preview, session
 * telemetry, the plan-version diff table, and the causal timeline.
 *
 * Colours come from the semantic ramps so Light/Dark flip automatically.
 */

const BF_DOMAIN = (() => {
  const S = () => BF_SURFACES;

  /* ================= work item row ================= */

  /**
   * One work-item row.
   * Facts carried: identifier, title, responsible human, active agent,
   * labels, priority, budget, workflow status.
   *
   * `density` mirrors the `--compact` variant the frontend already ships.
   */
  function workItemRow(item, width, density = 'comfortable') {
    const compact = density === 'compact';
    const padY = compact ? 8 : 10;
    const status = WM_WORKFLOW[item.statusTone] || WM_WORKFLOW.neutral;
    const bars = [4, 7, 10];
    const filled = { urgent: 3, high: 3, medium: 1, low: 0, none: 0 }[item.priority];
    const priHex = (WM_PRIORITY[item.priority] || WM_PRIORITY.none).dark;

    return {
      t: 'frame',
      name: `work-item/${item.id}`,
      w: width,
      layout: { dir: 'H', gap: 12, padX: 16, padY, align: 'CENTER', sizing: 'FIXED' },
      children: [
        /* Identifier — monospace so the column reads as a key. */
        {
          t: 'text',
          text: item.id,
          style: 'code/sm',
          color: 'text-subtle',
          w: 58,
        },
        /* Main column: title + facts */
        {
          t: 'frame',
          name: 'main',
          grow: 1,
          layout: { dir: 'V', gap: 3, sizing: 'FIXED' },
          children: [
            { t: 'text', text: item.title, style: 'label/md', color: 'text', w: width - 420 },
            {
              t: 'frame',
              name: 'facts',
              layout: { dir: 'H', gap: 10, align: 'CENTER', sizing: 'HUG' },
              children: [
                fact('folder', item.project),
                fact('user', item.human),
                ...(item.agent ? [fact('robot', `${item.agent} · ${item.agentState}`)] : []),
              ],
            },
          ],
        },
        /* Right meta: labels, priority, budget, status */
        {
          t: 'frame',
          name: 'meta',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
          children: [
            ...item.labels.map((l) => ({
              t: 'frame',
              name: `label/${l}`,
              bg: 'surface-subtle',
              stroke: { color: 'border', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', padX: 8, align: 'CENTER', sizing: 'HUG' },
              h: 22,
              children: [{ t: 'text', text: l, style: 'code/sm', color: 'text-muted' }],
            })),
            /* Priority: bars carry magnitude, not just hue. */
            {
              t: 'frame',
              name: 'priority',
              layout: { dir: 'H', gap: 5, align: 'CENTER', sizing: 'HUG' },
              children: [
                {
                  t: 'frame',
                  name: 'bars',
                  layout: { dir: 'H', gap: 1.5, align: 'END', sizing: 'HUG' },
                  h: 10,
                  children: bars.map((bh, i) => ({
                    t: 'rect', w: 2.5, h: bh, radius: 1,
                    bg: i < filled ? priHex : 'border-strong',
                  })),
                },
              ],
            },
            /* Budget micro-meter */
            ...(item.budget ? [{
              t: 'frame',
              name: 'budget',
              layout: { dir: 'H', gap: 6, align: 'CENTER', sizing: 'HUG' },
              children: [
                {
                  t: 'frame',
                  name: 'track',
                  w: 44, h: 3,
                  bg: 'surface-active',
                  radius: 'pill',
                  layout: { dir: 'H', sizing: 'FIXED' },
                  children: [{
                    t: 'rect',
                    w: Math.max(2, Math.round(44 * item.budget)),
                    h: 3,
                    radius: 'pill',
                    bg: item.budget >= 0.85 ? 'danger' : item.budget >= 0.7 ? 'warning' : 'accent',
                  }],
                },
                { t: 'text', text: `${Math.round(item.budget * 100)}%`, style: 'code/sm', color: 'text-subtle' },
              ],
            }] : []),
            /* Workflow status */
            {
              t: 'frame',
              name: 'status',
              bg: 'surface-subtle',
              stroke: { color: 'border', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', gap: 5, padX: 8, align: 'CENTER', sizing: 'HUG' },
              h: 22,
              children: [
                { t: 'ellipse', w: 6, h: 6, bg: status.dark, grow: 0 },
                { t: 'text', text: item.statusName, style: 'label/sm', color: 'text-muted' },
              ],
            },
          ],
        },
      ],
    };
  }

  /** A small icon+text fact inside a row. */
  function fact(iconName, text) {
    return {
      t: 'frame',
      name: `fact/${text}`,
      layout: { dir: 'H', gap: 5, align: 'CENTER', sizing: 'HUG' },
      children: [
        { t: 'icon', icon: iconName, size: 12, color: 'text-subtle' },
        { t: 'text', text, style: 'body/xs', color: 'text-subtle' },
      ],
    };
  }

  /* ================= attention card ================= */

  /**
   * The signature component.
   *
   * Reading order is deliberate: risk rail → what → why → blast radius →
   * consequence → action. The consequence preview and the irreversibility
   * flag are what make an approval decidable rather than merely visible.
   */
  function attentionCard(a, width) {
    const railTone = { high: 'danger', medium: 'warning', low: 'info' }[a.risk];
    const badgeTone = { high: 'danger', medium: 'warning', low: 'info' }[a.risk];

    return {
      t: 'frame',
      name: `attention/${a.title}`,
      w: width,
      bg: 'surface',
      layout: { dir: 'H', gap: 0, sizing: 'FIXED' },
      clip: true,
      children: [
        { t: 'rect', name: 'risk-rail', w: 3, h: 'fill', bg: railTone },
        {
          t: 'frame',
          name: 'body',
          grow: 1,
          layout: { dir: 'V', gap: 0, padT: 14, padB: 14, padR: 16, padL: 16, sizing: 'FIXED' },
          children: [
            /* Head: kind + title + age */
            {
              t: 'frame',
              name: 'head',
              layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'FIXED' },
              children: [
                {
                  t: 'frame',
                  name: 'kind-badge',
                  bg: `${badgeTone}-bg`,
                  stroke: { color: `${badgeTone}-border`, weight: 1, align: 'INSIDE' },
                  radius: 'sm',
                  layout: { dir: 'H', gap: 5, padX: 7, align: 'CENTER', sizing: 'HUG' },
                  h: 20,
                  children: [
                    { t: 'ellipse', w: 5, h: 5, bg: badgeTone, grow: 0 },
                    { t: 'text', text: a.kind, style: 'label/xs', color: badgeTone },
                  ],
                },
                { t: 'text', text: a.title, style: 'label/lg', color: 'text-strong' },
                { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
                {
                  t: 'text',
                  text: a.age,
                  style: a.urgent ? 'label/md' : 'body/sm',
                  color: a.urgent ? 'warning' : 'text-subtle',
                },
              ],
            },
            /* Description */
            {
              t: 'text',
              text: a.desc,
              style: 'body/sm',
              color: 'text-muted',
              w: width - 120,
            },
            { t: 'rect', name: 'gap', w: 1, h: 10, bg: 'surface' },
            /* Blast radius */
            {
              t: 'frame',
              name: 'scope',
              layout: { dir: 'H', gap: 6, align: 'CENTER', wrap: true, sizing: 'HUG' },
              children: a.scope.map((s) => ({
                t: 'frame',
                name: `chip/${s}`,
                bg: 'surface-subtle',
                stroke: { color: 'border', weight: 1, align: 'INSIDE' },
                radius: 'sm',
                layout: { dir: 'H', padX: 8, align: 'CENTER', sizing: 'HUG' },
                h: 22,
                children: [{ t: 'text', text: s, style: 'code/sm', color: 'text-muted' }],
              })),
            },
            { t: 'rect', name: 'gap', w: 1, h: 11, bg: 'surface' },
            /* Consequence preview — the decidable part */
            {
              t: 'frame',
              name: 'consequence',
              w: width - 100,
              bg: 'surface-inset',
              stroke: { color: 'border-subtle', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', gap: 10, padX: 11, padY: 9, align: 'CENTER', sizing: 'FIXED' },
              children: [
                { t: 'text', text: '后果预览', style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
                ...a.consequence.flatMap((c, i) => [
                  ...(i ? [{ t: 'text', text: '·', style: 'body/sm', color: 'border-strong' }] : []),
                  { t: 'text', text: c, style: 'body/sm', color: 'text-muted' },
                ]),
              ],
            },
            { t: 'rect', name: 'gap', w: 1, h: 12, bg: 'surface' },
            /* Actions */
            {
              t: 'frame',
              name: 'actions',
              layout: { dir: 'H', gap: 7, align: 'CENTER', sizing: 'HUG' },
              children: [
                BF_CONTROLS ? null : null,
                button(a.actions[0], 'primary'),
                button(a.actions[1], 'secondary'),
                button('查看证据', 'ghost'),
              ].filter(Boolean),
            },
          ],
        },
      ],
    };
  }

  /** Inline button spec (a component is used for the library; this is the instance spec). */
  function button(label, variant) {
    const P = {
      primary: { bg: 'accent', fg: 'accent-fg', bd: 'accent' },
      secondary: { bg: 'surface-subtle', fg: 'text', bd: 'border' },
      ghost: { bg: undefined, fg: 'text-muted', bd: undefined },
    }[variant];

    return {
      t: 'frame',
      name: `btn/${label}`,
      h: 26,
      bg: P.bg,
      stroke: P.bd ? { color: P.bd, weight: 1, align: 'INSIDE' } : undefined,
      radius: 'sm',
      layout: { dir: 'H', padX: 9, align: 'CENTER', justify: 'CENTER', sizing: 'HUG' },
      children: [{ t: 'text', text: label, style: 'label/sm', color: P.fg }],
    };
  }

  /* ================= session card ================= */

  /**
   * Session telemetry.
   * Heartbeat and budget sit side by side because they answer the same
   * operational question: is this run healthy and affordable?
   */
  function sessionCard(s, width) {
    const tone = {
      executing: 'info', awaiting_input: 'warning',
      awaiting_review: 'violet', stale: 'danger',
    }[s.state];
    const label = {
      executing: '执行中', awaiting_input: '等待输入',
      awaiting_review: '等待评审', stale: '已陈旧',
    }[s.state];

    return {
      t: 'frame',
      name: `session/${s.id}`,
      w: width,
      bg: 'surface',
      layout: { dir: 'V', gap: 0, pad: 16, sizing: 'FIXED' },
      children: [
        /* Head row */
        {
          t: 'frame',
          name: 'head',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'FIXED' },
          children: [
            { t: 'ellipse', w: 6, h: 6, bg: tone, grow: 0 },
            { t: 'text', text: s.id, style: 'code/sm', color: 'text-muted' },
            {
              t: 'frame',
              name: 'state-badge',
              bg: `${tone}-bg`,
              stroke: { color: `${tone}-border`, weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', padX: 7, align: 'CENTER', sizing: 'HUG' },
              h: 20,
              children: [{ t: 'text', text: label, style: 'label/xs', color: tone }],
            },
            { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
            { t: 'text', text: s.wi, style: 'code/sm', color: 'text-subtle' },
          ],
        },
        { t: 'rect', name: 'gap', w: 1, h: 8, bg: 'surface' },
        /* Agent + current step */
        {
          t: 'frame',
          name: 'agent-line',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
          children: [
            { t: 'icon', icon: 'robot', size: 13, color: 'text-muted' },
            { t: 'text', text: s.agent, style: 'body/sm', color: 'text' },
            { t: 'text', text: '·', style: 'body/sm', color: 'text-subtle' },
            { t: 'text', text: s.step, style: 'code/sm', color: 'text-muted' },
          ],
        },
        { t: 'rect', name: 'gap', w: 1, h: 12, bg: 'surface' },
        /* Telemetry */
        {
          t: 'frame',
          name: 'telemetry',
          layout: { dir: 'H', gap: 20, align: 'CENTER', sizing: 'FIXED' },
          children: [
            metric('心跳', s.hb, true),
            metricMeter('预算', s.budget),
            { t: 'frame', name: 'spacer', grow: 1, layout: { dir: 'H', sizing: 'FIXED' } },
            {
              t: 'frame',
              name: 'controls',
              layout: { dir: 'H', gap: 7, align: 'CENTER', sizing: 'HUG' },
              children: [
                iconButton('pause'), iconButton('stop'), button('介入', 'secondary'),
              ],
            },
          ],
        },
      ],
    };
  }

  function metric(label, value, mono) {
    return {
      t: 'frame',
      name: `metric/${label}`,
      layout: { dir: 'V', gap: 2, sizing: 'HUG' },
      children: [
        { t: 'text', text: label, style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
        { t: 'text', text: String(value), style: mono ? 'code/md' : 'label/md', color: 'text' },
      ],
    };
  }

  function metricMeter(label, value) {
    const tone = value >= 0.85 ? 'danger' : value >= 0.7 ? 'warning' : 'accent';
    return {
      t: 'frame',
      name: `metric/${label}`,
      layout: { dir: 'V', gap: 4, sizing: 'HUG' },
      children: [
        { t: 'text', text: label, style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER' },
        {
          t: 'frame',
          name: 'meter',
          layout: { dir: 'H', gap: 8, align: 'CENTER', sizing: 'HUG' },
          children: [
            {
              t: 'frame',
              name: 'track',
              w: 100, h: 4,
              bg: 'surface-active',
              radius: 'pill',
              layout: { dir: 'H', sizing: 'FIXED' },
              children: [{ t: 'rect', w: Math.round(100 * value), h: 4, radius: 'pill', bg: tone }],
            },
            { t: 'text', text: `${Math.round(value * 100)}%`, style: 'code/sm', color: 'text-muted', w: 34 },
          ],
        },
      ],
    };
  }

  function iconButton(iconName) {
    return {
      t: 'frame',
      name: `icon-btn/${iconName}`,
      w: 26, h: 26,
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'sm',
      layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
      children: [{ t: 'icon', icon: iconName, size: 13, color: 'text-muted' }],
    };
  }

  /* ================= plan diff ================= */

  /**
   * Plan version table.
   *
   * The point of this component is one invariant made visible: a plan step
   * keeps a STABLE ID across revisions. A removed step keeps its ID and is
   * marked removed rather than silently disappearing, so "the plan was
   * overwritten" is impossible to hide.
   */
  function planDiffTable(steps, width) {
    const header = {
      t: 'frame',
      name: 'plan-header',
      w: width,
      bg: 'surface-subtle',
      layout: { dir: 'H', gap: 12, padX: 14, padY: 10, align: 'CENTER', sizing: 'FIXED' },
      children: [
        { t: 'text', text: '步骤', style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER', grow: 1 },
        { t: 'text', text: '稳定 ID', style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER', w: 92 },
        { t: 'text', text: '相对 v2', style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER', w: 92 },
        { t: 'text', text: '状态', style: 'eyebrow/md', color: 'text-subtle', textCase: 'UPPER', w: 74 },
      ],
    };

    return {
      t: 'frame',
      name: 'plan-diff',
      w: width,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'md',
      clip: true,
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children: [
        header,
        ...steps.map((s, i) => planStep(s, width, i > 0)),
      ],
    };
  }

  function planStep(step, width, divided) {
    const stateTone = {
      complete: 'success', current: 'info', pending: 'neutral', removed: 'danger',
    }[step.state];
    const stateLabel = {
      complete: '完成', current: '进行中', pending: '待办', removed: '已取消',
    }[step.state];
    const diffTone = { same: 'text-subtle', add: 'success', remove: 'danger' }[step.diff];
    const diffLabel = { same: '无变化', add: '+ 新增', remove: '− 已移除' }[step.diff];

    const row = {
      t: 'frame',
      name: `plan-step/${step.n}`,
      w: width,
      layout: { dir: 'H', gap: 12, padX: 14, padY: 10, align: 'CENTER', sizing: 'FIXED' },
      children: [
        /* Ordinal — filled when the step is current or done. */
        {
          t: 'frame',
          name: 'ordinal',
          w: 22, h: 22,
          bg: `${stateTone}-bg`,
          stroke: { color: `${stateTone}-border`, weight: 1, align: 'INSIDE' },
          radius: 'pill',
          layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
          children: [{ t: 'text', text: String(step.n), style: 'code/sm', color: stateTone }],
        },
        /* Title + note */
        {
          t: 'frame',
          name: 'title',
          grow: 1,
          layout: { dir: 'V', gap: 2, sizing: 'FIXED' },
          children: [
            { t: 'text', text: step.title, style: 'label/md', color: 'text', w: width - 420 },
            { t: 'text', text: step.note, style: 'body/xs', color: 'text-subtle', w: width - 420 },
          ],
        },
        /* Stable ID — the invariant */
        {
          t: 'frame',
          name: 'stable-id',
          w: 92,
          bg: 'violet-bg',
          stroke: { color: 'violet-border', weight: 1, align: 'INSIDE' },
          radius: 4,
          layout: { dir: 'H', padX: 6, align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
          h: 20,
          children: [{ t: 'text', text: step.sid, style: 'code/sm', color: 'violet' }],
        },
        /* Diff vs previous version */
        {
          t: 'frame',
          name: 'diff',
          w: 92,
          layout: { dir: 'H', align: 'CENTER', sizing: 'FIXED' },
          children: [{ t: 'text', text: diffLabel, style: 'label/sm', color: diffTone }],
        },
        /* State */
        {
          t: 'frame',
          name: 'state',
          w: 74,
          bg: `${stateTone}-bg`,
          stroke: { color: `${stateTone}-border`, weight: 1, align: 'INSIDE' },
          radius: 'sm',
          layout: { dir: 'H', align: 'CENTER', justify: 'CENTER', sizing: 'FIXED' },
          h: 22,
          children: [{ t: 'text', text: stateLabel, style: 'label/xs', color: stateTone }],
        },
      ],
    };

    if (!divided) return row;

    return {
      t: 'frame',
      name: `plan-step-group/${step.n}`,
      w: width,
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children: [
        { t: 'rect', name: 'divider', w: width, h: 1, bg: 'border-subtle' },
        row,
      ],
    };
  }

  /* ================= causal timeline ================= */

  /**
   * Activity timeline with run-phase colouring.
   * Phase colours (validation / completion / failure / human-input) were
   * hardcoded hex in styles.css; here they come from the run-phase ramp.
   */
  function timeline(entries, width) {
    return {
      t: 'frame',
      name: 'timeline',
      w: width,
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children: entries.map((e, i) => timelineEntry(e, width, i === entries.length - 1)),
    };
  }

  function timelineEntry(entry, width, isLast) {
    const nodeTone = { info: 'info', success: 'success', warning: 'warning', danger: 'danger', violet: 'violet' }[entry.tone];

    return {
      t: 'frame',
      name: `tl/${entry.title}`,
      w: width,
      layout: { dir: 'H', gap: 0, sizing: 'FIXED' },
      children: [
        /* Timestamp gutter, right-aligned so digits line up. */
        {
          t: 'frame',
          name: 'time',
          w: 62,
          padR: 8,
          layout: { dir: 'H', justify: 'END', sizing: 'FIXED' },
          children: [{ t: 'text', text: entry.t, style: 'code/sm', color: 'text-subtle' }],
        },
        /* Spine + node */
        {
          t: 'frame',
          name: 'spine',
          w: 21,
          layout: { dir: 'V', gap: 0, align: 'CENTER', sizing: 'FIXED' },
          children: [
            { t: 'rect', name: 'spine-line', w: 1, h: 8, bg: 'border' },
            {
              t: 'frame',
              name: 'node',
              w: 9, h: 9,
              bg: `${nodeTone}-bg`,
              stroke: { color: nodeTone, weight: 2, align: 'INSIDE' },
              radius: 'pill',
              layout: { dir: 'H', sizing: 'FIXED' },
              children: [],
            },
            ...(isLast ? [] : [{ t: 'rect', name: 'spine-line', w: 1, h: 48, bg: 'border' }]),
          ],
        },
        /* Body */
        {
          t: 'frame',
          name: 'body',
          grow: 1,
          padL: 12, padB: 16,
          layout: { dir: 'V', gap: 2, sizing: 'FIXED' },
          children: [
            { t: 'text', text: entry.title, style: 'label/md', color: 'text' },
            { t: 'text', text: entry.body, style: 'body/sm', color: 'text-muted', w: width - 140 },
            ...(entry.tool ? [{
              t: 'frame',
              name: 'tool',
              bg: 'surface-inset',
              stroke: { color: 'border-subtle', weight: 1, align: 'INSIDE' },
              radius: 'sm',
              layout: { dir: 'H', gap: 6, padX: 8, padY: 4, align: 'CENTER', sizing: 'HUG' },
              children: [
                { t: 'icon', icon: 'activity', size: 12, color: 'text-muted' },
                { t: 'text', text: entry.tool, style: 'code/sm', color: 'text-muted' },
              ],
            }] : []),
          ],
        },
      ],
    };
  }

  /* ================= data table ================= */

  /** Generic table: the shape shared by approvals, runs and members. */
  function dataTable(name, columns, rows, width) {
    return {
      t: 'frame',
      name,
      w: width,
      bg: 'surface',
      stroke: { color: 'border', weight: 1, align: 'INSIDE' },
      radius: 'md',
      clip: true,
      layout: { dir: 'V', gap: 0, sizing: 'FIXED' },
      children: [
        /* Header */
        {
          t: 'frame',
          name: 'thead',
          w: width,
          bg: 'surface-subtle',
          layout: { dir: 'H', gap: 12, padX: 12, padY: 8, align: 'CENTER', sizing: 'FIXED' },
          children: columns.map((c) => ({
            t: 'text',
            text: c.label,
            style: 'eyebrow/md',
            color: 'text-subtle',
            textCase: 'UPPER',
            w: c.width,
            grow: c.grow ? 1 : 0,
          })),
        },
        ...rows.flatMap((r, i) => {
          const row = {
            t: 'frame',
            name: `tr/${i}`,
            w: width,
            layout: { dir: 'H', gap: 12, padX: 12, padY: 9, align: 'CENTER', sizing: 'FIXED' },
            children: columns.map((c) => {
              const cell = r[c.key];
              return cell && typeof cell === 'object'
                ? cell
                : {
                    t: 'text',
                    text: cell === undefined || cell === null ? '—' : String(cell),
                    style: c.mono ? 'code/sm' : 'body/sm',
                    color: c.muted ? 'text-muted' : 'text',
                    w: c.width,
                    grow: c.grow ? 1 : 0,
                  };
            }),
          };
          return i === 0 ? [row] : [rowDivider(width), row];
        }),
      ],
    };
  }

  function rowDivider(width) {
    return { t: 'rect', name: 'divider', w: width, h: 1, bg: 'border-subtle' };
  }

  /* ================= state surfaces ================= */

  /** Empty / loading / error, unified — mirrors `WorkSurfaceState`. */
  function stateSurface(kind, title, description, width, actionLabel) {
    const isError = kind === 'error' || kind === 'forbidden' || kind === 'conflict';
    const isBusy = kind === 'loading' || kind === 'refreshing';
    const tone = isError ? 'danger' : isBusy ? 'neutral' : 'neutral';
    const iconName = isError ? 'prohibit' : kind === 'empty' ? 'inbox' : 'spinner';

    return {
      t: 'frame',
      name: `state/${kind}`,
      w: width,
      bg: 'surface',
      stroke: {
        color: isError ? 'danger-border' : 'border',
        weight: 1,
        align: 'INSIDE',
      },
      radius: 'md',
      layout: { dir: 'H', gap: 12, pad: 16, align: 'CENTER', sizing: 'FIXED' },
      children: [
        { t: 'ellipse', w: 10, h: 10, bg: tone, grow: 0 },
        {
          t: 'frame',
          name: 'text',
          grow: 1,
          layout: { dir: 'V', gap: 2, sizing: 'FIXED' },
          children: [
            { t: 'text', text: title, style: 'label/lg', color: 'text-strong' },
            { t: 'text', text: description, style: 'body/sm', color: 'text-muted', w: width - 220 },
          ],
        },
        ...(actionLabel ? [button(actionLabel, 'secondary')] : []),
      ],
    };
  }

  return {
    workItemRow, fact,
    attentionCard, button,
    sessionCard, metric, metricMeter, iconButton,
    planDiffTable, planStep,
    timeline, timelineEntry,
    dataTable, rowDivider,
    stateSurface,
  };
})();
