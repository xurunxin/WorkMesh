/**
 * WorkMesh Design System — variable builder.
 *
 * Creates a Figma variable collection with Light and Dark modes and one
 * variable per token. This is the piece the MCP bridge cannot do, and the
 * reason this builder exists as a plugin.
 *
 * Variable naming follows a slash path so Figma renders them grouped:
 *   color/surface, color/text/muted, space/4, radius/md, ...
 */

const BF_VARIABLES = (() => {
  const COLLECTION_NAME = 'WorkMesh Tokens';

  /**
   * Build (or rebuild) the token collection.
   * Returns { collection, modeIds } for inspection / reporting.
   */
  async function build() {
    const existing = figma.variables.getLocalVariableCollections()
      .find((c) => c.name === COLLECTION_NAME);

    /* Start clean each run so token additions/renames are reflected. */
    if (existing) {
      for (const id of existing.variableIds.slice()) {
        const v = figma.variables.getVariableById(id);
        if (v) v.remove();
      }
      existing.remove();
    }

    const collection = figma.variables.createVariableCollection(COLLECTION_NAME);
    collection.name = COLLECTION_NAME;

    /* Mode 1 is created by default; rename it and add the second. */
    const lightModeId = collection.modes[0].modeId;
    collection.renameMode(lightModeId, 'Light');
    const darkModeId = collection.addMode('Dark');

    const context = { collection, lightModeId, darkModeId };

    buildColorVariables(context);
    buildSemanticColorVariables(context);
    buildScaleVariables(context);
    buildResponsiveVariables(context);

    return { collection, lightModeId, darkModeId };
  }

  /* ---------------- color ---------------- */

  function buildColorVariables(ctx) {
    for (const [name, pair] of Object.entries(WM_COLOR)) {
      createPair(ctx, `color/${name}`, pair, 'COLOR');
    }
    for (const [name, pair] of Object.entries(WM_WORKFLOW)) {
      createPair(ctx, `workflow/${name}`, pair, 'COLOR');
    }
    for (const [name, pair] of Object.entries(WM_RUN_PHASE)) {
      createPair(ctx, `run-phase/${name}`, pair, 'COLOR');
    }
    for (const [name, pair] of Object.entries(WM_PRIORITY)) {
      createPair(ctx, `priority/${name}`, pair, 'COLOR');
    }
  }

  /**
   * Domain semantic aliases. These are real aliases pointing at the base
   * color variables, so retuning a family updates every domain state.
   */
  function buildSemanticColorVariables(ctx) {
    for (const [state, family] of Object.entries(WM_SEMANTIC)) {
      const fg = BF.getVariable(`color/${family}`);
      const bg = BF.getVariable(`color/${family}-bg`);
      const bd = BF.getVariable(`color/${family}-border`);

      aliasPair(ctx, `semantic/${state}/fg`, fg);
      if (bg) aliasPair(ctx, `semantic/${state}/bg`, bg);
      if (bd) aliasPair(ctx, `semantic/${state}/border`, bd);
    }
  }

  /* ---------------- scale ---------------- */

  function buildScaleVariables(ctx) {
    for (const [k, v] of Object.entries(WM_SPACE)) {
      createPair(ctx, `space/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_RADIUS)) {
      createPair(ctx, `radius/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_FONT_SIZE)) {
      createPair(ctx, `font-size/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_LINE_HEIGHT)) {
      createPair(ctx, `line-height/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_FONT_WEIGHT)) {
      createPair(ctx, `font-weight/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_CONTROL_HEIGHT)) {
      createPair(ctx, `control-height/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_MOTION)) {
      createPair(ctx, `motion/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_Z)) {
      createPair(ctx, `z/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_BREAKPOINT)) {
      createPair(ctx, `breakpoint/${k}`, { light: v, dark: v }, 'FLOAT');
    }
    for (const [k, v] of Object.entries(WM_LAYOUT)) {
      createPair(ctx, `layout/${k}`, { light: v, dark: v }, 'FLOAT');
    }
  }

  /* ---------------- responsive ---------------- */

  /**
   * Density is a cross-cutting concern for a data-heavy console, so it is
   * modelled as its own collection rather than a component variant axis.
   */
  function buildResponsiveVariables(ctx) {
    const DENSITY = 'WorkMesh Density';
    const existing = figma.variables.getLocalVariableCollections()
      .find((c) => c.name === DENSITY);
    if (existing) {
      for (const id of existing.variableIds.slice()) {
        const v = figma.variables.getVariableById(id);
        if (v) v.remove();
      }
      existing.remove();
    }

    const collection = figma.variables.createVariableCollection(DENSITY);
    const comfortableId = collection.modes[0].modeId;
    collection.renameMode(comfortableId, 'Comfortable');
    const compactId = collection.addMode('Compact');

    const ROW_HEIGHTS = { comfortable: 44, compact: 34 };
    const CELL_PADDING = { comfortable: 16, compact: 10 };
    const SECTION_GAP = { comfortable: 24, compact: 16 };

    const make = (name, pair) => {
      const v = figma.variables.createVariable(name, collection, 'FLOAT');
      v.setValueForMode(comfortableId, pair.comfortable);
      v.setValueForMode(compactId, pair.compact);
      BF.stats.variables += 1;
      return v;
    };

    make('row-height/default', ROW_HEIGHTS);
    make('cell-padding/x', CELL_PADDING);
    make('cell-padding/y', { comfortable: 12, compact: 8 });
    make('section-gap', SECTION_GAP);
  }

  /* ---------------- primitives ---------------- */

  function createPair(ctx, name, pair, type) {
    const variable = figma.variables.createVariable(name, ctx.collection, type);

    if (type === 'COLOR') {
      variable.setValueForMode(ctx.lightModeId, toRgba(pair.light));
      variable.setValueForMode(ctx.darkModeId, toRgba(pair.dark));
    } else {
      variable.setValueForMode(ctx.lightModeId, pair.light);
      variable.setValueForMode(ctx.darkModeId, pair.dark);
    }

    BF.stats.variables += 1;
    /* Register under the bare token name for component binding. */
    BF.registerVariable(name.replace(/^color\//, ''), variable);
    BF.registerVariable(name, variable);
    return variable;
  }

  function aliasPair(ctx, name, target) {
    if (!target) return null;
    const variable = figma.variables.createVariable(name, ctx.collection, 'COLOR');
    try {
      variable.setValueForMode(ctx.lightModeId, {
        type: 'VARIABLE_ALIAS',
        id: target.id,
      });
      variable.setValueForMode(ctx.darkModeId, {
        type: 'VARIABLE_ALIAS',
        id: target.id,
      });
    } catch (err) {
      BF.warn('variables', `alias ${name} failed`);
      variable.remove();
      return null;
    }
    BF.stats.variables += 1;
    return variable;
  }

  /** Figma wants {r,g,b,a} in 0..1. */
  function toRgba(hex) {
    const { color, alpha } = BF.parseHex(hex);
    return { r: color.r, g: color.g, b: color.b, a: alpha };
  }

  return { build, COLLECTION_NAME };
})();
