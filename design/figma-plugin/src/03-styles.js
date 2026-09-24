/**
 * WorkMesh Design System — text, effect and paint styles.
 *
 * Styles are the bridge between Figma and CSS: each one maps 1:1 to a
 * rule the frontend will implement, so a designer reading Figma sees the
 * same name a developer will write.
 */

const BF_STYLES = (() => {
  /**
   * Create one text style per entry in WM_TEXT_STYLES.
   * Names are prefixed `WM/` so they sort together in the Figma picker.
   */
  async function buildTextStyles() {
    for (const [name, def] of Object.entries(WM_TEXT_STYLES)) {
      try {
        const family = BF.familyFor(def.family);
        const font = await BF.loadFont(family, def.weight);

        const style = figma.createTextStyle();
        style.name = `WM/${name}`;
        style.fontName = font;
        style.fontSize = BF.fontSize(def.size);
        style.lineHeight = { unit: 'PIXELS', value: BF.lineHeight(def.lh) };

        /* Eyebrows are tracked-out uppercase labels throughout the app. */
        if (name.startsWith('eyebrow')) {
          style.letterSpacing = { unit: 'PERCENT', value: 6 };
          style.textCase = 'UPPER';
        }

        BF.stats.styles += 1;
      } catch (err) {
        BF.fail(`textStyle ${name}`, err);
      }
    }
  }

  /**
   * Effect styles. Figma effect styles are not mode-aware, so light and
   * dark elevation ship as parallel named sets.
   */
  function buildEffectStyles() {
    for (const [name, effects] of Object.entries(WM_EFFECTS)) {
      try {
        const style = figma.createEffectStyle();
        style.name = `WM/${name}`;
        style.effects = effects.map((e) => {
          const { color, alpha } = BF.parseHex(e.color);
          return {
            type: e.type,
            color: { ...color, a: alpha },
            offset: { x: e.x, y: e.y },
            radius: e.blur,
            spread: e.spread,
            visible: true,
            blendMode: 'NORMAL',
          };
        });
        BF.stats.styles += 1;
      } catch (err) {
        BF.fail(`effectStyle ${name}`, err);
      }
    }
  }

  /**
   * Paint styles — one per color token, per mode. Because paint styles
   * cannot be mode-switched either, each token yields `WM/light/...` and
   * `WM/dark/...` entries.
   */
  function buildPaintStyles() {
    const groups = [
      ['color', WM_COLOR],
      ['workflow', WM_WORKFLOW],
      ['run-phase', WM_RUN_PHASE],
      ['priority', WM_PRIORITY],
    ];

    for (const [prefix, table] of groups) {
      for (const [name, pair] of Object.entries(table)) {
        for (const mode of ['light', 'dark']) {
          try {
            const style = figma.createPaintStyle();
            style.name = `WM/${mode}/${prefix}/${name}`;
            style.paints = [BF.solid(pair[mode])];
            BF.stats.styles += 1;
          } catch (err) {
            BF.fail(`paintStyle ${mode}/${prefix}/${name}`, err);
          }
        }
      }
    }
  }

  /** Remove previously generated WM/ styles so re-runs stay clean. */
  function clearExisting() {
    for (const style of figma.getLocalTextStyles()) {
      if (style.name.startsWith('WM/')) style.remove();
    }
    for (const style of figma.getLocalEffectStyles()) {
      if (style.name.startsWith('WM/')) style.remove();
    }
    for (const style of figma.getLocalPaintStyles()) {
      if (style.name.startsWith('WM/')) style.remove();
    }
  }

  async function build() {
    clearExisting();
    await buildTextStyles();
    buildEffectStyles();
    buildPaintStyles();
  }

  return { build, clearExisting };
})();
