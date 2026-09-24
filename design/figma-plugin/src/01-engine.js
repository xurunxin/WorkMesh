/**
 * WorkMesh Design System — rendering engine.
 *
 * A small declarative renderer: components and screens are described as
 * plain spec objects and materialized into Figma nodes with auto-layout.
 *
 * Two rules keep this robust:
 *   1. A literal value is always applied first, then variable binding is
 *      attempted on top. If binding fails the design is still correct.
 *   2. Every node build is wrapped; failures are collected and reported
 *      rather than aborting the whole run.
 */

const BF = (() => {
  const errors = [];
  const warnings = [];
  const stats = { nodes: 0, components: 0, variants: 0, variables: 0, styles: 0 };

  /* ---------------- diagnostics ---------------- */

  function fail(scope, err) {
    const message = err && err.message ? err.message : String(err);
    errors.push(`${scope}: ${message}`);
    console.error(`[BF] ${scope}:`, err);
  }

  function warn(scope, message) {
    warnings.push(`${scope}: ${message}`);
  }

  function reset() {
    errors.length = 0;
    warnings.length = 0;
    stats.nodes = 0;
    stats.components = 0;
    stats.variants = 0;
    stats.variables = 0;
    stats.styles = 0;
  }

  /* ---------------- color ---------------- */

  /** Parse #RGB / #RRGGBB / #RRGGBBAA into a Figma color + alpha. */
  function parseHex(hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 6) h += 'FF';
    if (h.length !== 8) throw new Error(`Invalid hex: ${hex}`);
    const to = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return {
      color: { r: to(0), g: to(2), b: to(4) },
      alpha: to(6),
    };
  }

  /** Build a SOLID paint from a hex string. */
  function solid(hex) {
    const { color, alpha } = parseHex(hex);
    return { type: 'SOLID', color, opacity: alpha, visible: true };
  }

  /* ---------------- token lookup ---------------- */

  /**
   * Resolve a token name to a literal hex for the requested mode.
   * Accepts a raw hex passthrough so specs can use either.
   */
  function resolveColor(token, mode) {
    if (!token) return null;
    if (typeof token === 'string' && token.startsWith('#')) return token;

    const key = String(token);
    const m = mode === 'light' ? 'light' : 'dark';

    const table = (() => {
      if (key in WM_COLOR) return { table: WM_COLOR, name: key };
      if (key in WM_SEMANTIC) {
        const family = WM_SEMANTIC[key];
        return { table: WM_COLOR, name: family, field: m };
      }
      if (key in WM_WORKFLOW) return { table: WM_WORKFLOW, name: key };
      if (key in WM_RUN_PHASE) return { table: WM_RUN_PHASE, name: key };
      if (key in WM_PRIORITY) return { table: WM_PRIORITY, name: key };
      return null;
    })();

    if (!table) {
      warn('color', `unknown token "${key}", falling back to #FF00FF`);
      return '#FF00FF';
    }

    const entry = table.table[table.name];
    return entry && entry.light !== undefined ? entry[m] : String(entry);
  }

  /** Resolve a spacing / radius / size token to a number. */
  function resolveNumber(token, table, fallback) {
    if (token === undefined || token === null) return fallback;
    if (typeof token === 'number') return token;
    return table[token] !== undefined ? table[token] : fallback;
  }

  const space = (t, f = 0) => resolveNumber(t, WM_SPACE, f);
  const radius = (t, f = 0) => resolveNumber(t, WM_RADIUS, f);
  const fontSize = (t, f = 13) => resolveNumber(t, WM_FONT_SIZE, f);
  const lineHeight = (t, f = 18) => resolveNumber(t, WM_LINE_HEIGHT, f);

  /* ---------------- fonts ---------------- */

  const FONT_CANDIDATES = {
    sans: [
      { family: 'Inter', style: 'Regular' },
      { family: 'Roboto', style: 'Regular' },
    ],
    mono: [
      { family: 'Roboto Mono', style: 'Regular' },
      { family: 'JetBrains Mono', style: 'Regular' },
      { family: 'SF Mono', style: 'Regular' },
      { family: 'Inter', style: 'Regular' },
    ],
  };

  const WEIGHT_STYLE = {
    regular: ['Regular', 'Regular'],
    medium: ['Medium', 'Medium'],
    semibold: ['Semi Bold', 'SemiBold'],
    bold: ['Bold', 'Bold'],
  };

  let sansFamily = 'Inter';
  let monoFamily = 'Roboto Mono';

  /** Probe which families actually exist in this Figma install. */
  async function resolveFontFamilies() {
    try {
      const sans = await figma.listAvailableFontsAsync();
      const names = new Set(sans.map((f) => f.fontName.family));

      if (names.has('Inter')) sansFamily = 'Inter';
      else if (names.has('Roboto')) sansFamily = 'Roboto';

      if (names.has('Roboto Mono')) monoFamily = 'Roboto Mono';
      else if (names.has('JetBrains Mono')) monoFamily = 'JetBrains Mono';
      else if (names.has('IBM Plex Mono')) monoFamily = 'IBM Plex Mono';
      else monoFamily = sansFamily;
    } catch (err) {
      warn('fonts', 'listAvailableFontsAsync unavailable; using defaults');
    }
  }

  /**
   * Load a font, tolerating weight-style naming differences
   * between Inter ("Semi Bold") and other families ("SemiBold").
   */
  async function loadFont(family, weight) {
    const variants = WEIGHT_STYLE[weight] || WEIGHT_STYLE.regular;
    for (const style of variants) {
      try {
        await figma.loadFontAsync({ family, style });
        return { family, style };
      } catch (err) {
        /* try the next naming convention */
      }
    }
    try {
      await figma.loadFontAsync({ family, style: 'Regular' });
      return { family, style: 'Regular' };
    } catch (err) {
      warn('fonts', `could not load ${family}/${weight}`);
      return { family: 'Inter', style: 'Regular' };
    }
  }

  function familyFor(which) {
    return which === 'mono' ? monoFamily : sansFamily;
  }

  /* ---------------- variable binding ---------------- */

  /** Registry of created variables, keyed by token name. Populated by the builder. */
  const variableIndex = new Map();

  function registerVariable(key, variable) {
    variableIndex.set(key, variable);
  }

  function getVariable(key) {
    return variableIndex.get(key) || null;
  }

  /** Attach a color paint to a node, then bind it to a variable if available. */
  function paintWithBinding(node, hex, tokenKey, field) {
    const base = solid(hex);
    const variable = tokenKey ? getVariable(tokenKey) : null;
    if (!variable) {
      node[field] = [base];
      return;
    }
    try {
      node[field] = [figma.variables.setBoundVariableForPaint(base, 'color', variable)];
    } catch (err) {
      node[field] = [base];
    }
  }

  /** Bind a scalar field (spacing, radius, size) to a variable if available. */
  function bindScalar(node, field, tokenKey) {
    const variable = tokenKey ? getVariable(tokenKey) : null;
    if (!variable) return;
    try {
      node.setBoundVariable(field, variable);
    } catch (err) {
      /* literal value already applied */
    }
  }

  /* ---------------- node construction ---------------- */

  /**
   * The spec renderer.
   *
   * Spec fields:
   *   t          'frame' | 'text' | 'rect' | 'ellipse' | 'line'
   *   name       node name
   *   w, h       fixed dimensions (omit to hug)
   *   grow       layoutGrow (main-axis fill)
   *   stretch    layoutAlign = STRETCH (cross-axis fill)
   *   bg         background color token
   *   bgToken    variable key for background binding
   *   stroke     { color, token, weight, align }
   *   radius     radius token or number
   *   effect     effect style name
   *   layout     { dir, gap, gapToken, pad, padX, padY, padT/R/B/L,
   *                align, justify, wrap, sizing }
   *   text       string (t: 'text')
   *   style      text style name (t: 'text')
   *   color      text color token (t: 'text')
   *   clip       clipsContent
   *   opacity    node opacity
   *   children   array of specs
   */
  async function render(spec, parent, mode = 'dark') {
    if (!spec) return null;

    const node = await createNode(spec, mode);
    if (!node) return null;

    if (parent) parent.appendChild(node);

    if (spec.children && spec.children.length) {
      for (const childSpec of spec.children) {
        if (!childSpec) continue;
        await render(childSpec, node, mode);
      }
    }

    return node;
  }

  async function createNode(spec, mode) {
    const type = spec.t || 'frame';

    if (type === 'text') return createTextNode(spec, mode);
    if (type === 'icon') return createIconNode(spec, mode);

    let node;
    if (type === 'rect' || type === 'ellipse') {
      node = type === 'rect' ? figma.createRectangle() : figma.createEllipse();
    } else if (type === 'line') {
      node = figma.createLine();
    } else if (type === 'component') {
      node = figma.createComponent();
      stats.components += 1;
    } else {
      node = figma.createFrame();
    }

    stats.nodes += 1;
    applyProps(node, spec, mode);

    return node;
  }

  /**
   * Apply every spec-driven property to an existing node.
   *
   * Extracted from createNode so components (which the plugin API creates
   * directly, and which must carry their own layout/paint rather than
   * nesting a wrapper frame) get identical treatment.
   */
  function applyProps(node, spec, mode) {
    if (spec.name) node.name = spec.name;

    applyLayout(node, spec);
    applySize(node, spec);
    applyPaint(node, spec, mode);
    applyStroke(node, spec, mode);
    applyRadius(node, spec);
    applyEffects(node, spec);

    if (spec.clip !== undefined) node.clipsContent = !!spec.clip;
    if (spec.opacity !== undefined) node.opacity = spec.opacity;
    if (spec.constraints) node.constraints = spec.constraints;

    applyChildLayout(node, spec);
    return node;
  }

  async function createTextNode(spec, mode) {
    const node = figma.createText();
    stats.nodes += 1;

    const styleDef = WM_TEXT_STYLES[spec.style] || WM_TEXT_STYLES['body/md'];
    const family = familyFor(styleDef.family);
    const font = await loadFont(family, styleDef.weight);

    node.fontName = font;
    node.characters = spec.text === undefined || spec.text === null ? '' : String(spec.text);
    node.fontSize = fontSize(styleDef.size);
    node.lineHeight = { unit: 'PIXELS', value: lineHeight(styleDef.lh) };

    if (spec.letterSpacing !== undefined) {
      node.letterSpacing = { unit: 'PIXELS', value: spec.letterSpacing };
    }
    if (spec.textCase) node.textCase = spec.textCase;
    if (spec.align) node.textAlignHorizontal = spec.align;
    if (spec.valign) node.textAlignVertical = spec.valign;

    /* Sizing must be set before auto-resize so the box is respected. */
    if (spec.w) {
      node.textAutoResize = 'HEIGHT';
      node.resize(spec.w, node.height);
    } else {
      node.textAutoResize = 'WIDTH_AND_HEIGHT';
    }

    const hex = resolveColor(spec.color || 'text', mode);
    paintWithBinding(node, hex, spec.color || 'text', 'fills');

    if (spec.name) node.name = spec.name;
    applyChildLayout(node, spec);

    return node;
  }

  /**
   * Icon node. Delegates geometry to BF_ICONS and then applies the same
   * child-layout rules as any other node so icons behave inside rows.
   */
  function createIconNode(spec, mode) {
    const node = BF_ICONS.create(spec.icon || spec.name || 'info', {
      size: spec.size || 16,
      color: spec.color || 'text-muted',
      mode,
      fill: spec.fill,
      weight: spec.weight,
    });

    stats.nodes += 1;
    if (spec.name) node.name = `icon/${spec.icon || spec.name}`;
    applyChildLayout(node, spec);
    return node;
  }

  /* ---------------- property application ---------------- */

  function applyLayout(node, spec) {
    if (!spec.layout) return;
    const L = spec.layout;
    if (typeof node.layoutMode === 'undefined') return;

    node.layoutMode = L.dir === 'V' ? 'VERTICAL' : 'HORIZONTAL';

    if (L.wrap) node.layoutWrap = 'WRAP';
    if (L.gap !== undefined) {
      node.itemSpacing = space(L.gap);
      bindScalar(node, 'itemSpacing', L.gapToken);
    }
    if (L.counterspacing !== undefined) node.counterAxisSpacing = space(L.counterspacing);

    const pad = L.pad !== undefined ? space(L.pad) : undefined;
    const padX = L.padX !== undefined ? space(L.padX) : pad;
    const padY = L.padY !== undefined ? space(L.padY) : pad;

    node.paddingLeft = L.padL !== undefined ? space(L.padL) : (padX !== undefined ? padX : 0);
    node.paddingRight = L.padR !== undefined ? space(L.padR) : (padX !== undefined ? padX : 0);
    node.paddingTop = L.padT !== undefined ? space(L.padT) : (padY !== undefined ? padY : 0);
    node.paddingBottom = L.padB !== undefined ? space(L.padB) : (padY !== undefined ? padY : 0);

    if (L.align) {
      node.counterAxisAlignItems = {
        START: 'MIN', CENTER: 'CENTER', END: 'MAX', BASELINE: 'BASELINE',
      }[L.align] || 'MIN';
    }
    if (L.justify) {
      node.primaryAxisAlignItems = {
        START: 'MIN', CENTER: 'CENTER', END: 'MAX', BETWEEN: 'SPACE_BETWEEN',
      }[L.justify] || 'MIN';
    }
  }

  function applySize(node, spec) {
    if (typeof node.layoutMode === 'undefined' || !node.layoutMode || node.layoutMode === 'NONE') {
      if (spec.w || spec.h) node.resize(spec.w || node.width, spec.h || node.height);
      return;
    }

    const L = spec.layout || {};
    const horizontal = node.layoutMode === 'HORIZONTAL';

    /* Fixed size wins; otherwise hug unless explicitly told to fill. */
    if (spec.w) {
      if (horizontal) node.primaryAxisSizingMode = 'FIXED';
      else node.counterAxisSizingMode = 'FIXED';
      node.resize(spec.w, node.height);
    } else if (L.sizing === 'HUG') {
      if (horizontal) node.primaryAxisSizingMode = 'AUTO';
      else node.counterAxisSizingMode = 'AUTO';
    }

    if (spec.h) {
      if (horizontal) node.counterAxisSizingMode = 'FIXED';
      else node.primaryAxisSizingMode = 'FIXED';
    } else if (L.sizing === 'HUG') {
      if (horizontal) node.counterAxisSizingMode = 'AUTO';
      else node.primaryAxisSizingMode = 'AUTO';
    }

    /* Explicit min sizes keep dense rows from collapsing. */
    if (spec.minW) node.minWidth = spec.minW;
    if (spec.minH) node.minHeight = spec.minH;
  }

  function applyPaint(node, spec, mode) {
    if (spec.bg === undefined || spec.bg === null) {
      if (typeof node.fills !== 'undefined') node.fills = [];
      return;
    }
    const hex = resolveColor(spec.bg, mode);
    paintWithBinding(node, hex, spec.bgToken || spec.bg, 'fills');
  }

  function applyStroke(node, spec, mode) {
    if (!spec.stroke || typeof node.strokes === 'undefined') return;
    const S = spec.stroke;
    const hex = resolveColor(S.color || 'border', mode);
    paintWithBinding(node, hex, S.token || S.color || 'border', 'strokes');
    node.strokeWeight = S.weight === undefined ? 1 : S.weight;
    node.strokeAlign = S.align || 'INSIDE';
    if (S.dash) node.dashPattern = S.dash;
  }

  function applyRadius(node, spec) {
    if (spec.radius === undefined || spec.radius === null) return;
    if (typeof node.cornerRadius === 'undefined') return;

    if (Array.isArray(spec.radius)) {
      node.topLeftRadius = radius(spec.radius[0]);
      node.topRightRadius = radius(spec.radius[1]);
      node.bottomRightRadius = radius(spec.radius[2]);
      node.bottomLeftRadius = radius(spec.radius[3]);
    } else {
      node.cornerRadius = radius(spec.radius);
      bindScalar(node, 'cornerRadius', spec.radiusToken);
    }
  }

  function applyEffects(node, spec) {
    if (!spec.effect || typeof node.effects === 'undefined') return;
    const defs = WM_EFFECTS[spec.effect];
    if (!defs) return;
    node.effects = defs.map((e) => {
      const { color, alpha } = parseHex(e.color);
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
  }

  function applyChildLayout(node, spec) {
    if (spec.grow !== undefined) node.layoutGrow = spec.grow;
    if (spec.stretch) node.layoutAlign = 'STRETCH';
    if (spec.alignSelf) {
      node.layoutAlign = { START: 'INHERIT', CENTER: 'CENTER', END: 'INHERIT' }[spec.alignSelf] || 'INHERIT';
    }
  }

  /* ---------------- composite helpers ---------------- */

  /**
   * Vertical stack. The default container for page sections.
   */
  function stack(name, opts = {}, children = []) {
    return {
      t: 'frame',
      name,
      layout: {
        dir: 'V',
        gap: opts.gap === undefined ? 4 : opts.gap,
        pad: opts.pad,
        padX: opts.padX,
        padY: opts.padY,
        padT: opts.padT,
        padR: opts.padR,
        padB: opts.padB,
        padL: opts.padL,
        align: opts.align,
        justify: opts.justify,
        sizing: opts.sizing || 'HUG',
      },
      w: opts.w,
      h: opts.h,
      grow: opts.grow,
      stretch: opts.stretch,
      bg: opts.bg,
      bgToken: opts.bgToken,
      stroke: opts.stroke,
      radius: opts.radius,
      effect: opts.effect,
      clip: opts.clip,
      children,
    };
  }

  /** Horizontal row. */
  function row(name, opts = {}, children = []) {
    return stack(name, { ...opts, dir: 'H' }, children);
  }

  /**
   * Convenience: a run of text with a style and color.
   */
  function label(text, style = 'body/md', color = 'text', opts = {}) {
    return {
      t: 'text',
      name: opts.name || `text/${style}`,
      text,
      style,
      color,
      w: opts.w,
      grow: opts.grow,
      stretch: opts.stretch,
      align: opts.align,
      letterSpacing: opts.letterSpacing,
      textCase: opts.textCase,
    };
  }

  /**
   * A filled or stroked box — the base for most controls and cards.
   */
  function box(name, opts = {}, children = []) {
    return {
      t: 'frame',
      name,
      bg: opts.bg,
      bgToken: opts.bgToken,
      stroke: opts.stroke,
      radius: opts.radius,
      radiusToken: opts.radiusToken,
      effect: opts.effect,
      w: opts.w,
      h: opts.h,
      minW: opts.minW,
      minH: opts.minH,
      grow: opts.grow,
      stretch: opts.stretch,
      clip: opts.clip,
      opacity: opts.opacity,
      layout: {
        dir: opts.dir || 'H',
        gap: opts.gap,
        gapToken: opts.gapToken,
        pad: opts.pad,
        padX: opts.padX,
        padY: opts.padY,
        padT: opts.padT,
        padR: opts.padR,
        padB: opts.padB,
        padL: opts.padL,
        align: opts.align,
        justify: opts.justify,
        wrap: opts.wrap,
        sizing: opts.sizing || 'HUG',
      },
      children,
    };
  }

  /** A circle / dot indicator. */
  function dot(name, opts = {}) {
    return {
      t: 'ellipse',
      name,
      w: opts.size || 8,
      h: opts.size || 8,
      bg: opts.bg,
      grow: 0,
    };
  }

  /** A 1px divider. */
  function divider(opts = {}) {
    return {
      t: 'rect',
      name: 'divider',
      w: opts.w,
      h: opts.h || 1,
      grow: opts.grow,
      stretch: opts.stretch,
      bg: opts.color || 'border',
    };
  }

  /* ---------------- page / section scaffolding ---------------- */

  /** Find or create a top-level page by name; returns the page. */
  async function ensurePage(name) {
    let page = figma.root.children.find((p) => p.name === name);
    if (!page) {
      page = figma.createPage();
      page.name = name;
    }
    await page.loadAsync();
    return page;
  }

  /**
   * Find or create a section-like container frame on a page.
   * Re-running the builder updates in place rather than duplicating.
   */
  function ensureContainer(parent, name, opts = {}) {
    const existing = parent.children.find((c) => c.name === name);
    if (existing) return existing;

    const frame = figma.createFrame();
    frame.name = name;
    frame.layoutMode = 'VERTICAL';
    frame.primaryAxisSizingMode = 'AUTO';
    frame.counterAxisSizingMode = 'AUTO';
    frame.itemSpacing = opts.gap === undefined ? 32 : opts.gap;
    frame.paddingLeft = frame.paddingRight = 48;
    frame.paddingTop = frame.paddingBottom = 48;
    frame.fills = [];
    parent.appendChild(frame);
    return frame;
  }

  /** Move a node to a target position. */
  function place(node, x, y) {
    if (x !== undefined) node.x = x;
    if (y !== undefined) node.y = y;
    return node;
  }

  return {
    /* diagnostics */
    errors, warnings, stats, fail, warn, reset,
    /* color */
    parseHex, solid, resolveColor,
    /* tokens */
    space, radius, fontSize, lineHeight,
    /* fonts */
    resolveFontFamilies, loadFont, familyFor,
    /* variables */
    registerVariable, getVariable, paintWithBinding, bindScalar,
    /* core */
    render, createNode, createTextNode, applyProps,
    /* helpers */
    stack, row, label, box, dot, divider,
    /* scaffolding */
    ensurePage, ensureContainer, place,
  };
})();
