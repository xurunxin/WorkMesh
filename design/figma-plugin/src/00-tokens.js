/**
 * WorkMesh Design System — token source of truth.
 *
 * Base: packages/ui/src/tokens.css (the warm-neutral light system that
 * already ships in apps/web). Extended here into a full dual-mode
 * (Light / Dark) semantic system for the redesign.
 *
 * Dark is the hero mode for this redesign ("control room" workbench):
 * deep cool-neutral surfaces, restrained chrome, status colors tuned to
 * read at high information density.
 *
 * Every color token declares both modes. The variable builder turns this
 * file into a Figma variable collection with Light/Dark modes, so the
 * entire library flips with one setting.
 */

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

/**
 * Semantic color tokens.
 * `light` preserves the shipped identity; `dark` is the control-room palette.
 */
const WM_COLOR = {
  /* ---- Surfaces ---- */
  'canvas':            { light: '#F7F7F5', dark: '#0B0C0E' },
  'canvas-subtle':     { light: '#FAFAF8', dark: '#0F1113' },
  'surface':           { light: '#FFFFFF', dark: '#141619' },
  'surface-raised':    { light: '#FFFFFF', dark: '#1A1D21' },
  'surface-subtle':    { light: '#F2F2EF', dark: '#1F2226' },
  'surface-hover':     { light: '#ECECE8', dark: '#262A2F' },
  'surface-active':    { light: '#E4E4DF', dark: '#2D3238' },
  'surface-inset':     { light: '#F2F2EF', dark: '#0E1012' },
  'surface-overlay':   { light: '#FFFFFF', dark: '#1A1D21' },

  /* ---- Text ---- */
  'text':              { light: '#252522', dark: '#E6E8EB' },
  'text-strong':       { light: '#111110', dark: '#F5F6F7' },
  'text-muted':        { light: '#73736F', dark: '#9BA1A9' },
  'text-subtle':       { light: '#8E8E89', dark: '#6B7178' },
  'text-inverse':      { light: '#FFFFFF', dark: '#141619' },
  'text-link':         { light: '#2563EB', dark: '#7BA8F0' },

  /* ---- Borders ---- */
  'border':            { light: '#E3E3DF', dark: '#24282D' },
  'border-strong':     { light: '#C9C9C3', dark: '#343A41' },
  'border-subtle':     { light: '#EDEDEA', dark: '#1B1E22' },
  'border-focus':      { light: '#2563EB', dark: '#5B8DEF' },

  /* ---- Accent / primary action ---- */
  'accent':            { light: '#2563EB', dark: '#4C8DFF' },
  'accent-hover':      { light: '#1D4ED8', dark: '#6BA0FF' },
  'accent-active':     { light: '#1E40AF', dark: '#3C7CE8' },
  'accent-fg':         { light: '#FFFFFF', dark: '#0B0C0E' },
  'accent-bg':         { light: '#EFF6FF', dark: '#16233A' },
  'accent-border':     { light: '#BFDBFE', dark: '#2B4A7D' },

  /* ---- Neutral (default action / none state) ---- */
  'neutral':           { light: '#475467', dark: '#9BA1A9' },
  'neutral-bg':        { light: '#F9FAFB', dark: '#1F2226' },
  'neutral-border':    { light: '#D0D5DD', dark: '#343A41' },

  /* ---- Info ---- */
  'info':              { light: '#175CD3', dark: '#6BA0FF' },
  'info-bg':           { light: '#EFF8FF', dark: '#16233A' },
  'info-border':       { light: '#B2DDFF', dark: '#2B4A7D' },

  /* ---- Success ---- */
  'success':           { light: '#087443', dark: '#3FB950' },
  'success-bg':        { light: '#ECFDF3', dark: '#10231A' },
  'success-border':    { light: '#ABEFC6', dark: '#1F4A32' },

  /* ---- Warning ---- */
  'warning':           { light: '#8A5A00', dark: '#E3B341' },
  'warning-bg':        { light: '#FFFAEB', dark: '#2A2110' },
  'warning-border':    { light: '#FEDF89', dark: '#57431A' },

  /* ---- Danger ---- */
  'danger':            { light: '#9C2A1C', dark: '#FF6B63' },
  'danger-bg':         { light: '#FFF1F0', dark: '#2E1617' },
  'danger-border':     { light: '#F6C1BB', dark: '#5C2A2B' },

  /* ---- Violet (human-input / custom workflow) ---- */
  'violet':            { light: '#7839EE', dark: '#A78BFA' },
  'violet-bg':         { light: '#F5F3FF', dark: '#241B3A' },
  'violet-border':     { light: '#D9D6FE', dark: '#463576' },

  /* ---- Elevation scrims ---- */
  'scrim':             { light: '#11111166', dark: '#00000099' },
  'skeleton-base':     { light: '#F2F2EF', dark: '#1F2226' },
  'skeleton-sheen':    { light: '#ECECE8', dark: '#262A2F' },
};

/**
 * Domain semantic ramps — the `wm-semantic-*` grammar from tokens.css.
 * Each maps to one of the five color families so a redesign only has to
 * retune five ramps, not twenty states.
 */
const WM_SEMANTIC = {
  decision: 'info', approval: 'info', open: 'info', seen: 'info',
  healthy: 'info', fresh: 'info', ready: 'info', running: 'info',

  clarification: 'warning', applying: 'warning', soon: 'warning',
  medium: 'warning', degraded: 'warning', partial: 'warning',
  paused: 'warning', awaiting: 'warning',

  conflict: 'danger', recovery: 'danger', high: 'danger',
  critical: 'danger', urgent: 'danger', overdue: 'danger',
  stalled: 'danger', failed: 'danger', stale: 'danger',
  offline: 'danger', expired: 'danger', blocked: 'danger',

  completion_review: 'success', decided: 'success', verified: 'success',
  completed: 'success', approved: 'success', connected: 'success',

  superseded: 'neutral', unknown: 'neutral', none: 'neutral',
  low: 'neutral', normal: 'neutral', queued: 'neutral',
  canceled: 'neutral', draft: 'neutral', idle: 'neutral',
};

/**
 * Workflow status colors — user-selectable per status in /settings.
 * These must stay legible on both canvases, so each carries a mode pair.
 */
const WM_WORKFLOW = {
  neutral: { light: '#73736F', dark: '#9BA1A9' },
  blue:    { light: '#2563EB', dark: '#4C8DFF' },
  green:   { light: '#15803D', dark: '#3FB950' },
  amber:   { light: '#A16207', dark: '#E3B341' },
  red:     { light: '#B42318', dark: '#FF6B63' },
  violet:  { light: '#8B5CF6', dark: '#A78BFA' },
};

/**
 * Agent run phase colors — previously hardcoded hex in styles.css.
 * Now token-backed so Light/Dark can diverge.
 */
const WM_RUN_PHASE = {
  failure:     { light: '#D92D20', dark: '#FF6B63' },
  validation:  { light: '#175CD3', dark: '#6BA0FF' },
  completion:  { light: '#087443', dark: '#3FB950' },
  'human-input': { light: '#7F56D9', dark: '#A78BFA' },
  pending:     { light: '#C9C9C3', dark: '#343A41' },
};

/**
 * Priority ramp. Priority is ordinal and must be distinguishable at a
 * glance without relying on color alone (shape/label carry that).
 */
const WM_PRIORITY = {
  urgent: { light: '#B42318', dark: '#FF6B63' },
  high:   { light: '#B54708', dark: '#F79009' },
  medium: { light: '#A16207', dark: '#E3B341' },
  low:    { light: '#73736F', dark: '#9BA1A9' },
  none:   { light: '#A9A9A3', dark: '#5B6167' },
};

/* ------------------------------------------------------------------ */
/* Scale                                                               */
/* ------------------------------------------------------------------ */

/** 4px base spacing ramp, extended from the shipped 6 steps to 12. */
const WM_SPACE = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
  7: 32, 8: 40, 9: 48, 10: 64, 11: 80, 12: 96,
};

const WM_RADIUS = { none: 0, sm: 6, md: 10, lg: 14, xl: 20, '2xl': 28, pill: 999 };

/**
 * Type scale. The shipped system only had 4 steps (xs/sm/md/lg), which
 * forced hardcoded rem values throughout styles.css. This is the full
 * ramp a dense data application actually needs.
 */
const WM_FONT_SIZE = {
  '2xs': 11, xs: 12, sm: 13, base: 14, md: 16,
  lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36,
};

const WM_LINE_HEIGHT = {
  '2xs': 16, xs: 16, sm: 18, base: 20, md: 24,
  lg: 26, xl: 28, '2xl': 32, '3xl': 38, '4xl': 44,
};

const WM_FONT_WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 };

/** Control heights — a dense app needs an explicit, small set. */
const WM_CONTROL_HEIGHT = { xs: 24, sm: 28, md: 36, lg: 44, xl: 52 };

const WM_MOTION = { fast: 120, normal: 180, slow: 280 };
const WM_Z = { base: 0, sticky: 9, overlay: 40, popover: 140, toast: 200 };

/**
 * Named text styles. Consumed by the text-style builder and by every
 * component so type never drifts.
 * `role` maps to a Figma style name, `size`/`lh`/`weight` to the ramps.
 */
const WM_TEXT_STYLES = {
  'display/lg':   { size: '3xl',  lh: '3xl',  weight: 'bold',     family: 'sans' },
  'display/md':   { size: '2xl',  lh: '2xl',  weight: 'bold',     family: 'sans' },
  'title/lg':     { size: 'xl',   lh: 'xl',   weight: 'semibold', family: 'sans' },
  'title/md':     { size: 'lg',   lh: 'lg',   weight: 'semibold', family: 'sans' },
  'title/sm':     { size: 'md',   lh: 'md',   weight: 'semibold', family: 'sans' },
  'title/xs':     { size: 'base', lh: 'base', weight: 'semibold', family: 'sans' },
  'body/lg':      { size: 'md',   lh: 'md',   weight: 'regular',  family: 'sans' },
  'body/md':      { size: 'base', lh: 'base', weight: 'regular',  family: 'sans' },
  'body/sm':      { size: 'sm',   lh: 'sm',   weight: 'regular',  family: 'sans' },
  'body/xs':      { size: 'xs',   lh: '2xs',  weight: 'regular',  family: 'sans' },
  'label/lg':     { size: 'base', lh: 'base', weight: 'semibold', family: 'sans' },
  'label/md':     { size: 'sm',   lh: 'sm',   weight: 'semibold', family: 'sans' },
  'label/sm':     { size: 'xs',   lh: '2xs',  weight: 'semibold', family: 'sans' },
  'label/xs':     { size: '2xs',  lh: '2xs',  weight: 'semibold', family: 'sans' },
  'code/md':      { size: 'sm',   lh: 'sm',   weight: 'regular',  family: 'mono' },
  'code/sm':      { size: 'xs',   lh: '2xs',  weight: 'regular',  family: 'mono' },
  /* Eyebrow: the uppercase section label used across every surface header. */
  'eyebrow/md':   { size: '2xs',  lh: '2xs',  weight: 'bold',     family: 'sans' },
};

/**
 * Effect styles. Figma effect styles cannot be mode-switched, so dark
 * elevation is a separate named set: dark UI reads depth from borders and
 * surface steps far more than from shadow.
 */
const WM_EFFECTS = {
  'elevation/sm':      [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2,  spread: 0, color: '#111111', opacity: 0.04 }],
  'elevation/md':      [{ type: 'DROP_SHADOW', x: 0, y: 12, blur: 36, spread: 0, color: '#111111', opacity: 0.12 }],
  'elevation/lg':      [{ type: 'DROP_SHADOW', x: 0, y: 24, blur: 80, spread: 0, color: '#111111', opacity: 0.20 }],
  'elevation/dark/sm': [{ type: 'DROP_SHADOW', x: 0, y: 1, blur: 2,  spread: 0, color: '#000000', opacity: 0.40 }],
  'elevation/dark/md': [{ type: 'DROP_SHADOW', x: 0, y: 12, blur: 32, spread: 0, color: '#000000', opacity: 0.50 }],
  'elevation/dark/lg': [{ type: 'DROP_SHADOW', x: 0, y: 24, blur: 72, spread: 0, color: '#000000', opacity: 0.60 }],
  'focus/ring':        [{ type: 'DROP_SHADOW', x: 0, y: 0, blur: 0,  spread: 3, color: '#2563EB', opacity: 0.32 }],
  'focus/ring-dark':   [{ type: 'DROP_SHADOW', x: 0, y: 0, blur: 0,  spread: 3, color: '#5B8DEF', opacity: 0.40 }],
};

/** Responsive breakpoints carried from the shipped CSS. */
const WM_BREAKPOINT = { sm: 390, md: 560, lg: 760, xl: 900, '2xl': 1280 };

/* ------------------------------------------------------------------ */
/* Canvas layout constants                                             */
/* ------------------------------------------------------------------ */

const WM_LAYOUT = {
  sidebarWidth: 240,
  sidebarCollapsed: 64,
  headerHeight: 52,
  contentMax: 1440,
  pagePadding: 24,
  columnGutter: 24,
  gridUnit: 8,
};
