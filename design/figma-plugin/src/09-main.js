/**
 * WorkMesh Design System Builder — entry point.
 *
 * Builds the whole design system into the open Figma document:
 *   1. Variables (Light + Dark modes, plus a Density collection)
 *   2. Text / effect / paint styles
 *   3. The control library as real components and variant sets
 *   4. Every screen, rendered twice — once per mode
 *
 * Re-running is safe: pages are found by name and their contents replaced,
 * so the builder is idempotent rather than additive.
 */

/* ================= orchestration ================= */

const BUILD = (() => {
  const PAGES = {
    tokens:  '🎨 Tokens',
    library: '🧩 Library',
    screens: '🖥 Screens',
    compare: '🔍 Compare',
  };

  /* Every mode needs its own page-style variable binding, because Figma
     resolves variable modes per node, not per document. */
  let modeIds = { light: null, dark: null, collection: null, density: null };

  async function run() {
    const t0 = Date.now();
    BF.reset();

    figma.ui?.postMessage?.({ type: 'progress', stage: '开始构建', pct: 0 });

    try {
      await BF.resolveFontFamilies();
      await buildVariables();
      await buildStyles();
      await buildTokenPage();
      await buildLibraryPage();
      await buildScreens();
      await buildComparePage();
    } catch (err) {
      BF.fail('build', err);
    }

    report(Date.now() - t0);
  }

  /* ---------- 1. variables ---------- */

  async function buildVariables() {
    const { collection, lightModeId, darkModeId } =
      await BF_VARIABLES.build();
    modeIds = { light: lightModeId, dark: darkModeId, collection };
    figma.ui?.postMessage?.({ type: 'progress', stage: '变量已建立', pct: 15 });
  }

  /* ---------- 2. styles ---------- */

  async function buildStyles() {
    await BF_STYLES.build();
    figma.ui?.postMessage?.({ type: 'progress', stage: '样式已建立', pct: 25 });
  }

  /* ---------- 3. token sheet ---------- */

  /**
   * A visual token reference.
   *
   * Colour swatches are grouped by family. Each family is emitted as one
   * wrapper frame (label + swatch row) rather than inserting labels into
   * the parent by index, which would reverse their order.
   */
  async function buildTokenPage() {
    const page = await BF.ensurePage(PAGES.tokens);
    clearPage(page);

    page.backgrounds = [BG('#F7F7F5')];

    const rootSpec = BF.stack('Tokens', {
      gap: 32, pad: 48, bg: 'canvas', w: 1200,
    }, []);
    const root = await BF.render(rootSpec, page, 'light');
    if (!root) return;

    const FAMILIES = [
      ['语义色', WM_COLOR],
      ['工作流状态', WM_WORKFLOW],
      ['运行阶段', WM_RUN_PHASE],
      ['优先级', WM_PRIORITY],
    ];

    for (const [modeLabel, mode] of [['Light', 'light'], ['Dark', 'dark']]) {
      /* Each palette block is its own mode-bound frame, so Light and Dark
         can sit on the same page and still render correctly. */
      const block = await BF.render(
        BF.stack(`palette/${modeLabel}`, {
          gap: 20, pad: 24, bg: 'surface', radius: 'md',
          stroke: { color: 'border', weight: 1, align: 'INSIDE' }, w: 1104,
        }, []),
        root, mode,
      );
      if (!block) continue;
      bindMode(block, mode);

      await BF.render(
        BF.label(`调色板 · ${modeLabel}`, 'title/md', 'text-strong'),
        block, mode,
      );

      for (const [family, table] of FAMILIES) {
        /* One wrapper per family: label above, swatches below. */
        const group = await BF.render(
          BF.stack(`family/${family}`, { gap: 10, sizing: 'HUG' }, [
            BF.label(family, 'eyebrow/md', 'text-subtle', { textCase: 'UPPER' }),
          ]),
          block, mode,
        );
        if (!group) continue;

        const row = await BF.render(
          BF.row(`swatches/${family}`, { gap: 10, wrap: true, sizing: 'HUG' }, []),
          group, mode,
        );
        if (!row) continue;

        for (const [name, pair] of Object.entries(table)) {
          const hex = pair[mode];
          await BF.render(swatch(name, hex), row, mode);
        }
      }
    }

    figma.ui?.postMessage?.({ type: 'progress', stage: '令牌页完成', pct: 40 });
  }

  function swatch(name, hex) {
    return {
      t: 'frame',
      name: `swatch/${name}`,
      w: 128,
      layout: { dir: 'V', gap: 6, sizing: 'FIXED' },
      children: [
        {
          t: 'rect',
          w: 128, h: 44,
          bg: hex,
          radius: 'sm',
          stroke: { color: 'border', weight: 1, align: 'INSIDE' },
        },
        { t: 'text', text: name, style: 'code/sm', color: 'text-muted' },
        { t: 'text', text: hex.toUpperCase(), style: 'code/sm', color: 'text-subtle' },
      ],
    };
  }

  /* ---------- 4. library ---------- */

  async function buildLibraryPage() {
    const page = await BF.ensurePage(PAGES.library);
    clearPage(page);

    const root = BF.stack('Library', {
      gap: 40, pad: 48, bg: 'canvas', w: 1100,
    }, []);
    const container = await BF.render(root, page, 'dark');

    /* Controls, built as real components in the hero (dark) mode. */
    const controlsSection = await BF.render(
      BF.stack('section/controls', { gap: 24, sizing: 'HUG' }, []),
      container, 'dark',
    );
    await BF.render(BF.label('公共控件', 'display/md', 'text-strong'), controlsSection, 'dark');
    await BF_CONTROLS.buildAll(controlsSection, 'dark', {});

    /* Domain surfaces as reference specimens, grouped. */
    const domainSection = await BF.render(
      BF.stack('section/domain', { gap: 24, sizing: 'HUG' }, []),
      container, 'dark',
    );
    await BF.render(BF.label('领域组件', 'display/md', 'text-strong'), domainSection, 'dark');

    const CW = 1000;

    const specimens = [
      ['工作项行', () => BF_DOMAIN.workItemRow(BF_PAGES.WORK_ITEMS[0], CW, 'comfortable')],
      ['工作项行 · 紧凑', () => BF_DOMAIN.workItemRow(BF_PAGES.WORK_ITEMS[1], CW, 'compact')],
      ['审批卡片', () => BF_DOMAIN.attentionCard(BF_PAGES.ATTENTION[0], CW)],
      ['Session 遥测', () => BF_DOMAIN.sessionCard(BF_PAGES.SESSIONS[0], CW)],
      ['计划版本 diff', () => BF_DOMAIN.planDiffTable(BF_PAGES.PLAN, CW)],
      ['活动时间线', () => BF_DOMAIN.timeline(BF_PAGES.ACTIVITY.slice(0, 3), CW)],
      ['空状态', () => BF_DOMAIN.stateSurface('empty', '没有匹配的工作项',
        '调整筛选条件，或新建一个工作项。', CW, '清除筛选')],
      ['错误状态', () => BF_DOMAIN.stateSurface('error', '无法加载工作项',
        '服务暂时不可用，请重试。', CW, '重试')],
    ];

    for (const [label, fn] of specimens) {
      try {
        const group = await BF.render(
          BF.stack(`specimen/${label}`, { gap: 10, sizing: 'HUG' }, [BF.label(label, 'eyebrow/md', 'text-subtle', { textCase: 'UPPER' })]),
          domainSection, 'dark',
        );
        await BF.render(fn(), group, 'dark');
      } catch (err) {
        BF.fail(`specimen/${label}`, err);
      }
    }

    figma.ui?.postMessage?.({ type: 'progress', stage: '控件库完成', pct: 60 });
  }

  /* ---------- 5. screens ---------- */

  /**
   * Every screen is emitted twice so Light and Dark sit side by side.
   *
   * Figma resolves variable modes per node, so each frame gets an explicit
   * mode binding — without this the two would render identically.
   */
  async function buildScreens() {
    const page = await BF.ensurePage(PAGES.screens);
    clearPage(page);

    page.backgrounds = [BG('#0B0C0E')];

    const W = 1440;
    const GAP = 80;
    let y = 80;

    for (const entry of BF_PAGES.PAGES) {
      const rowLabel = await BF.render(
        BF.label(`${entry.label}  ·  ${entry.key}`, 'title/lg', 'text-muted', { w: W }),
        page, 'dark',
      );
      if (rowLabel) {
        rowLabel.x = 80;
        rowLabel.y = y;
      }

      y += 40;

      for (const mode of ['light', 'dark']) {
        try {
          const spec = entry.build(mode, W);
          spec.y = undefined;

          const node = await BF.render(spec, page, mode);
          if (!node) continue;

          node.x = mode === 'light' ? 80 : 80 + W + GAP;
          node.y = y;
          bindMode(node, mode);

          /* The heading above a dark frame has to be readable on the dark
             page background, so it stays a literal light tint. */
          if (rowLabel) rowLabel.fills = [BF.solid('#9BA1A9')];
        } catch (err) {
          BF.fail(`page/${entry.key}/${mode}`, err);
        }
      }

      y += 900 + 120;
    }

    figma.ui?.postMessage?.({ type: 'progress', stage: '页面完成', pct: 85 });
  }

  /* ---------- 6. comparison sheet ---------- */

  /**
   * A literal side-by-side of the two signature components, because a
   * dual-mode system can only be judged by putting the modes next to each
   * other on one surface.
   */
  async function buildComparePage() {
    const page = await BF.ensurePage(PAGES.compare);
    clearPage(page);

    page.backgrounds = [BG('#0B0C0E')];

    const CW = 620;

    let x = 80;
    for (const mode of ['light', 'dark']) {
      const col = await BF.render(
        BF.stack(`compare/${mode}`, { gap: 24, pad: 32, sizing: 'HUG' }, []),
        page, mode,
      );
      if (!col) continue;

      col.x = x;
      col.y = 80;
      bindMode(col, mode);

      await BF.render(
        BF.label(mode === 'light' ? '浅色 · Light' : '深色 · Dark', 'display/md', 'text-strong'),
        col, mode,
      );

      await BF.render(BF.label('审批卡片', 'eyebrow/md', 'text-subtle', { textCase: 'UPPER' }), col, mode);
      await BF.render(BF_DOMAIN.attentionCard(BF_PAGES.ATTENTION[0], CW), col, mode);

      await BF.render(BF.label('Session 遥测', 'eyebrow/md', 'text-subtle', { textCase: 'UPPER' }), col, mode);
      await BF.render(BF_DOMAIN.sessionCard(BF_PAGES.SESSIONS[2], CW), col, mode);

      x += CW + 80;
    }
  }

  /* ---------- helpers ---------- */

  /**
   * Bind a frame and all of its descendants to a variable mode.
   * This is the single most important call in the whole builder: without
   * it, a "dark" frame renders in whatever mode the page happens to use.
   */
  function bindMode(node, mode) {
    const id = modeIds[mode];
    if (!id || !modeIds.collection) return;

    const apply = (n) => {
      try {
        n.setExplicitVariableModeForCollection(modeIds.collection, id);
      } catch (err) {
        /* Older documents or non-frame nodes may reject the call. */
      }
      if (n.children) n.children.forEach(apply);
      /* Icons are vectors created detached; they carry their own fills. */
    };
    apply(node);
  }

  function BG(hex) {
    const { color } = BF.parseHex(hex);
    return { type: 'SOLID', color };
  }

  /** Remove existing content so re-runs replace rather than append. */
  function clearPage(page) {
    for (const child of page.children.slice()) child.remove();
  }

  /* ---------- report ---------- */

  function report(ms) {
    const { stats, errors, warnings } = BF;

    const lines = [
      `构建完成 · ${(ms / 1000).toFixed(1)}s`,
      ``,
      `节点      ${stats.nodes}`,
      `组件      ${stats.components}`,
      `组件变体  ${stats.variants}`,
      `变量      ${stats.variables}`,
      `样式      ${stats.styles}`,
    ];

    if (warnings.length) {
      lines.push('', `警告 ${warnings.length}`, ...warnings.slice(0, 8).map((w) => `· ${w}`));
    }
    if (errors.length) {
      lines.push('', `错误 ${errors.length}`, ...errors.slice(0, 12).map((e) => `· ${e}`));
    }

    const summary = lines.join('\n');
    console.log(summary);

    figma.ui?.postMessage?.({ type: 'done', summary, error: errors.length > 0 });
    figma.notify(
      errors.length ? `构建完成，但有 ${errors.length} 个错误` : 'WorkMesh 设计系统构建完成',
      { timeout: 4000 },
    );
  }

  return { run, bindMode };
})();

/* ================= plugin bootstrap ================= */

if (typeof figma !== 'undefined') {
  figma.showUI(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:14px;font:400 12px/1.6 Inter,system-ui,sans-serif;
           color:#E6E8EB;background:#141619}
      h1{margin:0 0 10px;font-size:13px;font-weight:600}
      #s{color:#9BA1A9}
      pre{margin:10px 0 0;max-height:320px;overflow:auto;padding:10px;
          font:400 10px/1.5 monospace;color:#9BA1A9;background:#0E1012;
          border:1px solid #24282D;border-radius:6px;white-space:pre-wrap}
      .bar{height:3px;background:#1F2226;border-radius:99px;overflow:hidden;margin-top:8px}
      .bar i{display:block;height:100%;width:0;background:#4C8DFF;transition:width .25s}
    </style></head><body>
      <h1>WorkMesh 设计系统</h1>
      <div id="s">准备中…</div>
      <div class="bar"><i id="b"></i></div>
      <pre id="o" hidden></pre>
      <script>
        const s=document.getElementById('s'),b=document.getElementById('b'),o=document.getElementById('o');
        onmessage=({data:p})=>{
          if(p.type==='progress'){s.textContent=p.stage;b.style.width=p.pct+'%';}
          if(p.type==='done'){s.textContent=p.error?'完成（有错误）':'完成';b.style.width='100%';
            o.hidden=false;o.textContent=p.summary;}
        };
      <\/script>
    </body></html>`,
    { width: 400, height: 460, themeColors: true },
  );

  BUILD.run();
}
