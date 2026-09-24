#!/usr/bin/env node
/**
 * Smoke-test the bundled plugin against a mock Figma API.
 *
 * Bundling proves the sources concatenate; it does NOT prove they run. The
 * plugin sandbox has no test harness of its own, so this mock exists to
 * catch the class of bug that only appears at execution time — wrong scope,
 * missing token, bad property for a node type.
 *
 * It is intentionally forgiving: unimplemented APIs are recorded rather
 * than thrown, so one gap does not mask every later failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(ROOT, 'dist', 'code.js');

const missing = new Set();
const notes = [];

function track(api) {
  missing.add(api);
}

/* ---------- mock node ---------- */

let idSeq = 0;

function makeNode(type) {
  const node = {
    id: `n${++idSeq}`,
    type,
    name: type,
    children: [],
    _fills: [],
    _strokes: [],
    parent: null,

    /* geometry */
    x: 0, y: 0, width: 100, height: 100,
    minWidth: 0, minHeight: 0,

    /* auto-layout */
    layoutMode: 'NONE',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    itemSpacing: 0,
    counterAxisSpacing: 0,
    layoutWrap: 'NO_WRAP',
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
    layoutGrow: 0,
    layoutAlign: 'INHERIT',

    /* paint */
    opacity: 1,
    visible: true,
    clipsContent: false,
    effects: [],
    dashPattern: [],
    constraints: { horizontal: 'MIN', vertical: 'MIN' },

    /* text */
    characters: '',
    fontSize: 14,
    fontName: { family: 'Inter', style: 'Regular' },
    lineHeight: { unit: 'AUTO' },
    letterSpacing: { unit: 'PERCENT', value: 0 },
    textCase: 'ORIGINAL',
    textAutoResize: 'NONE',
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',

    /* vector */
    vectorPaths: [],
    vectorNetwork: { vertices: [], segments: [], regions: [] },
    strokeWeight: 1,
    strokeAlign: 'CENTER',
    strokeCap: 'NONE',
    strokeJoin: 'MITER',

    resize(w, h) { this.width = w; this.height = h; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    insertChild(i, c) { c.parent = this; this.children.splice(i, 0, c); return c; },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
      }
      this.parent = null;
    },
    setBoundVariable() {},
    setExplicitVariableModeForCollection() {},
    findAll() { return []; },
    loadAsync() { return Promise.resolve(); },

    get fills() { return this._fills; },
    set fills(v) { this._fills = v; },
    get strokes() { return this._strokes; },
    set strokes(v) { this._strokes = v; },

    /* corner radius is only valid on rect-like nodes */
    get cornerRadius() { return this._r || 0; },
    set cornerRadius(v) {
      if (!/RECTANGLE|FRAME|COMPONENT|INSTANCE|ELLIPSE/.test(this.type)) {
        notes.push(`cornerRadius set on ${this.type} (${this.name})`);
      }
      this._r = v;
    },
    get topLeftRadius() { return this._r || 0; },
    set topLeftRadius(v) { this._r = v; },
    get topRightRadius() { return this._r || 0; },
    set topRightRadius(v) { this._r = v; },
    get bottomLeftRadius() { return this._r || 0; },
    set bottomLeftRadius(v) { this._r = v; },
    get bottomRightRadius() { return this._r || 0; },
    set bottomRightRadius(v) { this._r = v; },
  };
  return node;
}

/* ---------- mock figma ---------- */

const pages = [];

function makePage(name) {
  const page = makeNode('PAGE');
  page.name = name;
  page.backgrounds = [];
  page.children = [];
  pages.push(page);
  return page;
}

const root = makeNode('DOCUMENT');
root.children = pages;
makePage('Page 1');

const variables = [];
const collections = [];
const textStyles = [];
const effectStyles = [];
const paintStyles = [];

function makeVariableCollection(name) {
  let modeSeq = 0;
  const col = {
    id: `col${collections.length + 1}`,
    name,
    modes: [{ modeId: `m${++modeSeq}`, name: 'Mode 1' }],
    variableIds: [],
    renameMode(id, newName) {
      const m = this.modes.find((x) => x.modeId === id);
      if (m) m.name = newName;
    },
    addMode(name) {
      const modeId = `m${++modeSeq}`;
      this.modes.push({ modeId, name });
      return modeId;
    },
    remove() {
      const i = collections.indexOf(this);
      if (i >= 0) collections.splice(i, 1);
    },
  };
  collections.push(col);
  return col;
}

function makeVariable(name, collection, type) {
  const v = {
    id: `v${variables.length + 1}`,
    name, resolvedType: type, collectionId: collection.id,
    values: {},
    setValueForMode(modeId, value) {
      /* Figma rejects a malformed colour; mirror that. */
      if (type === 'COLOR') {
        const ok = value && typeof value === 'object'
          && (value.type === 'VARIABLE_ALIAS' || (
            typeof value.r === 'number' && typeof value.g === 'number'
            && typeof value.b === 'number'
            && value.r >= 0 && value.r <= 1
            && value.g >= 0 && value.g <= 1
            && value.b >= 0 && value.b <= 1));
        if (!ok) throw new Error(`invalid COLOR value for ${name}: ${JSON.stringify(value)}`);
      }
      if (type === 'FLOAT' && typeof value !== 'number') {
        throw new Error(`invalid FLOAT value for ${name}: ${JSON.stringify(value)}`);
      }
      this.values[modeId] = value;
    },
    remove() {
      const i = variables.indexOf(this);
      if (i >= 0) variables.splice(i, 1);
      const ci = collection.variableIds.indexOf(this.id);
      if (ci >= 0) collection.variableIds.splice(ci, 1);
    },
  };
  variables.push(v);
  collection.variableIds.push(v.id);
  return v;
}

const figma = {
  root,
  currentPage: pages[0],
  showUI() {},
  notify(msg) { notes.push(`notify: ${msg}`); },
  ui: { postMessage() {} },

  createPage() { return makePage('Untitled'); },

  createFrame() { return makeNode('FRAME'); },
  createComponent() { return makeNode('COMPONENT'); },
  createRectangle() { return makeNode('RECTANGLE'); },
  createEllipse() { return makeNode('ELLIPSE'); },
  createLine() { return makeNode('LINE'); },
  createVector() { return makeNode('VECTOR'); },
  createText() {
    const t = makeNode('TEXT');
    t.fontName = null; /* must be set before characters, like real Figma */
    return t;
  },

  combineAsVariants(nodes) {
    if (!nodes.length) throw new Error('combineAsVariants needs at least one node');
    const set = makeNode('COMPONENT_SET');
    for (const n of nodes) { n.parent = set; set.children.push(n); }
    return set;
  },

  loadFontAsync(font) {
    const known = ['Inter|Regular', 'Inter|Medium', 'Inter|Semi Bold', 'Inter|Bold',
                   'Roboto|Regular', 'Roboto Mono|Regular', 'JetBrains Mono|Regular'];
    const key = `${font.family}|${font.style}`;
    if (!known.includes(key)) return Promise.reject(new Error(`no font ${key}`));
    return Promise.resolve();
  },
  listAvailableFontsAsync() {
    return Promise.resolve([
      { fontName: { family: 'Inter', style: 'Regular' } },
      { fontName: { family: 'Inter', style: 'Semi Bold' } },
      { fontName: { family: 'Roboto Mono', style: 'Regular' } },
    ]);
  },

  variables: {
    getLocalVariableCollections: () => collections,
    getVariableById: (id) => variables.find((v) => v.id === id) || null,
    createVariableCollection: makeVariableCollection,
    createVariable: makeVariable,
    setBoundVariableForPaint: (paint, field, variable) => ({
      ...paint, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: variable.id } },
    }),
  },

  createTextStyle() {
    const s = { name: '', fontName: null, fontSize: 0, lineHeight: {}, letterSpacing: {}, textCase: 'ORIGINAL', remove() {} };
    textStyles.push(s);
    return s;
  },
  createEffectStyle() {
    const s = { name: '', effects: [], remove() {} };
    effectStyles.push(s);
    return s;
  },
  createPaintStyle() {
    const s = { name: '', paints: [], remove() {} };
    paintStyles.push(s);
    return s;
  },
  getLocalTextStyles: () => textStyles,
  getLocalEffectStyles: () => effectStyles,
  getLocalPaintStyles: () => paintStyles,
};

/* ---------- run ---------- */

const code = fs.readFileSync(BUNDLE, 'utf8');

/* Capture console.error so BF.fail() is visible. A builder that swallows
   its own errors would otherwise report "passed" while emitting nothing. */
const loggedErrors = [];
const loggedWarnings = [];

const sandbox = {
  figma,
  console: {
    log() {},
    error(...args) {
      loggedErrors.push(args.map(String).join(' '));
    },
    warn(...args) {
      loggedWarnings.push(args.map(String).join(' '));
    },
  },
  setTimeout,
  Promise,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error,
  Map,
  Set,
};

const context = vm.createContext(sandbox);

let fatal = null;
try {
  vm.runInContext(code, context, { filename: 'code.js' });
} catch (err) {
  fatal = err;
}

/* The bundle kicks off BUILD.run() asynchronously; give it time. */
await new Promise((r) => setTimeout(r, 400));

/* ---------- report ---------- */

function walk(node, fn, depth = 0) {
  fn(node, depth);
  for (const c of node.children || []) walk(c, fn, depth + 1);
}

let nodeCount = 0;
const typeCounts = {};
for (const p of pages) {
  walk(p, (n) => {
    nodeCount++;
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  });
}

console.log('=== mock run ===');
console.log(`pages        ${pages.length}  (${pages.map((p) => p.name).join(', ')})`);
console.log(`variables    ${variables.length}`);
console.log(`collections  ${collections.length}  (${collections.map((c) => `${c.name}[${c.modes.length}m]`).join(', ')})`);
console.log(`text styles  ${textStyles.length}`);
console.log(`effect sty.  ${effectStyles.length}`);
console.log(`paint sty.   ${paintStyles.length}`);
console.log(`nodes        ${nodeCount}`);
console.log(`  by type    ${Object.entries(typeCounts).map(([k, v]) => `${k}:${v}`).join(' ')}`);

/* Verify the text nodes never existed without a font (real Figma throws). */
let textWithoutFont = 0;
for (const p of pages) {
  walk(p, (n) => {
    if (n.type === 'TEXT' && !n.fontName) textWithoutFont++;
  });
}

if (missing.size) console.log(`\nuntracked APIs: ${[...missing].join(', ')}`);
if (notes.length) {
  console.log(`\nnotes (${notes.length}):`);
  for (const n of [...new Set(notes)].slice(0, 12)) console.log(`  · ${n}`);
}

/* Builder-reported failures are real failures. */
if (loggedErrors.length) {
  console.log(`\nbuild errors (${loggedErrors.length}):`);
  for (const e of [...new Set(loggedErrors)].slice(0, 15)) console.log(`  · ${e}`);
}
if (loggedWarnings.length) {
  console.log(`\nbuild warnings (${loggedWarnings.length}):`);
  for (const w of [...new Set(loggedWarnings)].slice(0, 10)) console.log(`  · ${w}`);
}

let failed = false;

if (fatal) {
  console.log(`\nFATAL: ${fatal.message}`);
  console.log(fatal.stack?.split('\n').slice(0, 6).join('\n'));
  failed = true;
}

if (loggedErrors.length) {
  console.log(`\nFAIL: builder reported ${loggedErrors.length} error(s)`);
  failed = true;
}

if (textWithoutFont) {
  console.log(`\nFAIL: ${textWithoutFont} text node(s) created without a font`);
  failed = true;
}

if (variables.length === 0) {
  console.log('\nFAIL: no variables were created');
  failed = true;
}

if (collections.length === 0) {
  console.log('\nFAIL: no variable collections were created');
  failed = true;
}

console.log(failed ? '\nRESULT: FAILED' : '\nRESULT: passed');
process.exit(failed ? 1 : 0);
