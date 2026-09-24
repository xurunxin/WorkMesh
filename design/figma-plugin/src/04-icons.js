/**
 * WorkMesh Design System — icon set.
 *
 * Authored as minimal stroke geometry on a 16×16 grid so icons stay
 * crisp, editable and consistent. The frontend uses Phosphor; these are
 * the visual equivalents for design review, all on one weight and grid.
 *
 * Stroke conventions: 1.5px, round caps, round joins, currentColor.
 */

const BF_ICONS = (() => {
  const SIZE = 16;

  /**
   * Path data authored on a 16×16 viewBox.
   * `M`/`L`/`C` are normalised to the 0..1 space Figma expects.
   */
  const PATHS = {
    /* --- navigation & chrome --- */
    search: 'M7 2.5 A4.5 4.5 0 1 0 7 11.5 A4.5 4.5 0 1 0 7 2.5 Z M10.4 10.4 L13.5 13.5',
    close: 'M4 4 L12 12 M12 4 L4 12',
    'caret-down': 'M4.5 6.5 L8 10 L11.5 6.5',
    'caret-right': 'M6.5 4.5 L10 8 L6.5 11.5',
    'caret-up': 'M4.5 9.5 L8 6 L11.5 9.5',
    'arrow-left': 'M13 8 L3 8 M7 4 L3 8 L7 12',
    'arrow-right': 'M3 8 L13 8 M9 4 L13 8 L9 12',
    'arrow-up-right': 'M5 11 L11 5 M5.5 5 L11 5 L11 10.5',
    'dots-three': 'M3.5 8 A0.9 0.9 0 1 0 3.5 8.01 M8 8 A0.9 0.9 0 1 0 8 8.01 M12.5 8 A0.9 0.9 0 1 0 12.5 8.01',
    'dots-three-vertical': 'M8 3.5 A0.9 0.9 0 1 0 8 3.51 M8 8 A0.9 0.9 0 1 0 8 8.01 M8 12.5 A0.9 0.9 0 1 0 8 12.51',
    'sidebar-simple': 'M2.5 3.5 L13.5 3.5 L13.5 12.5 L2.5 12.5 Z M6.5 3.5 L6.5 12.5',
    expand: 'M6 3.5 L2.5 3.5 L2.5 7 M10 12.5 L13.5 12.5 L13.5 9 M2.5 3.5 L7 8 M13.5 12.5 L9 8',

    /* --- actions --- */
    plus: 'M8 3 L8 13 M3 8 L13 8',
    minus: 'M3 8 L13 8',
    check: 'M3.5 8.5 L6.5 11.5 L12.5 5',
    'check-circle': 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M5.5 8.2 L7.3 10 L10.7 6.4',
    trash: 'M3 4.5 L13 4.5 M6.5 4.5 L6.5 3 L9.5 3 L9.5 4.5 M4.5 4.5 L5.2 13 L10.8 13 L11.5 4.5 M6.8 7 L6.8 11 M9.2 7 L9.2 11',
    copy: 'M5.5 5.5 L5.5 2.5 L13.5 2.5 L13.5 10.5 L10.5 10.5 M2.5 5.5 L10.5 5.5 L10.5 13.5 L2.5 13.5 Z',
    download: 'M8 2 L8 10 M4.5 7 L8 10.5 L11.5 7 M3 13 L13 13',
    upload: 'M8 10.5 L8 2.5 M4.5 6 L8 2.5 L11.5 6 M3 13 L13 13',
    refresh: 'M13 8 A5 5 0 1 1 11.2 4.3 M13 2.5 L13 5.2 L10.3 5.2',
    filter: 'M2.5 3.5 L13.5 3.5 L9.2 8.6 L9.2 12.8 L6.8 11.4 L6.8 8.6 Z',
    'filter-clear': 'M2.5 3.5 L9.5 3.5 L6.6 7 L5.5 8.6 L5.5 12 L2.5 3.5 M11 8 L14 11 M14 8 L11 11',
    floppy: 'M2.5 2.5 L11 2.5 L13.5 5 L13.5 13.5 L2.5 13.5 Z M5 2.5 L5 6.5 L10 6.5 L10 2.5 M5 13.5 L5 9.5 L11 9.5 L11 13.5',
    pencil: 'M11.2 2.4 L13.6 4.8 L5.4 13 L2.6 13.4 L3 10.6 Z M9.8 3.8 L12.2 6.2',
    send: 'M13.5 2.5 L7 9 M13.5 2.5 L9.4 13.5 L7 9 L2.5 6.6 Z',
    'paper-plane': 'M13.5 2.5 L7 9 M13.5 2.5 L9.4 13.5 L7 9 L2.5 6.6 Z',
    link: 'M6.6 9.4 A2.6 2.6 0 0 0 10.3 9.4 L12 7.7 A2.6 2.6 0 0 0 8.3 4 L7.5 4.8 M9.4 6.6 A2.6 2.6 0 0 0 5.7 6.6 L4 8.3 A2.6 2.6 0 0 0 7.7 12 L8.5 11.2',
    'external-link': 'M9 2.5 L13.5 2.5 L13.5 7 M13.5 2.5 L7.5 8.5 M11 9.5 L11 13.5 L2.5 13.5 L2.5 5 L6.5 5',
    eye: 'M1.5 8 C3.5 5 5.7 3.5 8 3.5 C10.3 3.5 12.5 5 14.5 8 C12.5 11 10.3 12.5 8 12.5 C5.7 12.5 3.5 11 1.5 8 Z M8 6 A2 2 0 1 0 8 10 A2 2 0 1 0 8 6 Z',
    'eye-slash': 'M6.3 6.4 A2 2 0 0 0 9.6 9.7 M4.2 4.4 C2.9 5.4 1.9 6.6 1.5 8 C3.5 11 5.7 12.5 8 12.5 C8.9 12.5 9.8 12.3 10.6 11.9 M13 10.2 C13.8 9.4 14.3 8.7 14.5 8 C12.5 5 10.3 3.5 8 3.5 C7.5 3.5 7.1 3.5 6.7 3.6 M2.5 2.5 L13.5 13.5',
    lock: 'M4 7 L4 4.8 A4 4 0 0 1 12 4.8 L12 7 M3 7 L13 7 L13 13.5 L3 13.5 Z M8 9.6 L8 11.4',
    'lock-open': 'M4 7 L4 4.8 A4 4 0 0 1 12 4.8 M3 7 L13 7 L13 13.5 L3 13.5 Z M8 9.6 L8 11.4',
    key: 'M9.5 6.5 A3.2 3.2 0 1 0 9.5 6.51 M11 8 L13.5 10.5 M12 9.5 L10.6 10.9',
    gear: 'M8 5.9 A2.1 2.1 0 1 0 8 10.1 A2.1 2.1 0 1 0 8 5.9 Z M8 1.6 L8.7 3.3 L10.5 3.1 L10.8 4.9 L12.4 5.7 L12 7.5 L13.2 8.9 L12.4 10.3 L12.8 11.9 L11.2 12.6 L11 13.4 L9.2 13.4 L8 14.4 L6.8 13.4 L5 13.4 L4.8 12.6 L3.2 11.9 L3.6 10.3 L2.8 8.9 L4 7.5 L3.6 5.7 L5.2 4.9 L5.5 3.1 L7.3 3.3 Z',
    sliders: 'M2.5 5 L13.5 5 M2.5 11 L13.5 11 M5.5 5 A1.4 1.4 0 1 0 5.5 5.01 M10.5 11 A1.4 1.4 0 1 0 10.5 11.01',

    /* --- objects & domain --- */
    robot: 'M4.5 6 L11.5 6 L11.5 12 L4.5 12 Z M8 3 L8 6 M6.5 8.4 A0.6 0.6 0 1 0 6.5 8.41 M9.5 8.4 A0.6 0.6 0 1 0 9.5 8.41 M6.5 10.3 L9.5 10.3 M2.5 8 L2.5 10.5 M13.5 8 L13.5 10.5',
    user: 'M8 7.5 A2.6 2.6 0 1 0 8 2.3 A2.6 2.6 0 1 0 8 7.5 Z M2.8 13.7 C3.4 11.3 5.5 9.7 8 9.7 C10.5 9.7 12.6 11.3 13.2 13.7',
    'user-circle': 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M8 7.6 A2.2 2.2 0 1 0 8 3.2 A2.2 2.2 0 1 0 8 7.6 Z M3.6 12.9 C4.3 11 6 9.8 8 9.8 C10 9.8 11.7 11 12.4 12.9',
    users: 'M6 7 A2.4 2.4 0 1 0 6 2.2 A2.4 2.4 0 1 0 6 7 Z M1.5 13.5 C2.1 11.2 3.9 9.7 6 9.7 C8.1 9.7 9.9 11.2 10.5 13.5 M10.5 7.2 A2.4 2.4 0 0 0 10.5 2.3 M12 9.9 C13.3 10.5 14.2 11.8 14.5 13.5',
    'users-three': 'M8 6.8 A2.2 2.2 0 1 0 8 2.4 A2.2 2.2 0 1 0 8 6.8 Z M4 13.6 C4.5 11.5 6.1 10.2 8 10.2 C9.9 10.2 11.5 11.5 12 13.6 M3.4 6.6 A1.9 1.9 0 1 0 3.4 2.9 A1.9 1.9 0 1 0 3.4 6.6 Z M1.2 12.6 C1.5 11 2.3 10 3.4 9.6 M12.6 6.6 A1.9 1.9 0 1 0 12.6 2.9 A1.9 1.9 0 1 0 12.6 6.6 Z M14.8 12.6 C14.5 11 13.7 10 12.6 9.6',
    folder: 'M1.8 4 L6 4 L7.4 5.8 L14.2 5.8 L14.2 12.4 L1.8 12.4 Z',
    'folder-open': 'M1.8 4 L6 4 L7.4 5.8 L13 5.8 L13 7.4 M1.8 12.4 L1.8 4 M1.8 12.4 L3.8 7.4 L15 7.4 L13 12.4 Z',
    'git-branch': 'M4.6 2.6 A1.6 1.6 0 1 0 4.6 5.8 A1.6 1.6 0 1 0 4.6 2.6 Z M4.6 10.2 A1.6 1.6 0 1 0 4.6 13.4 A1.6 1.6 0 1 0 4.6 10.2 Z M11.4 4.4 A1.6 1.6 0 1 0 11.4 7.6 A1.6 1.6 0 1 0 11.4 4.4 Z M4.6 5.8 L4.6 10.2 M11.4 7.6 C11.4 9.4 10.2 10.2 8.4 10.2 L4.6 10.2',
    'git-commit': 'M8 5.4 A2.6 2.6 0 1 0 8 10.6 A2.6 2.6 0 1 0 8 5.4 Z M1.5 8 L5.4 8 M10.6 8 L14.5 8',
    'git-merge': 'M4.6 2.6 A1.6 1.6 0 1 0 4.6 5.8 A1.6 1.6 0 1 0 4.6 2.6 Z M4.6 10.2 A1.6 1.6 0 1 0 4.6 13.4 A1.6 1.6 0 1 0 4.6 10.2 Z M11.4 6 A1.6 1.6 0 1 0 11.4 9.2 A1.6 1.6 0 1 0 11.4 6 Z M4.6 5.8 L4.6 10.2 M11.4 9.2 C11.4 10.4 10.6 11 9.4 11 L4.6 11',
    'file-text': 'M3.5 1.8 L9.5 1.8 L12.5 4.8 L12.5 14.2 L3.5 14.2 Z M9.5 1.8 L9.5 4.8 L12.5 4.8 M5.8 8 L10.2 8 M5.8 10.6 L10.2 10.6',
    stack: 'M8 1.6 L14.4 5 L8 8.4 L1.6 5 Z M1.6 8 L8 11.4 L14.4 8 M1.6 11 L8 14.4 L14.4 11',
    clock: 'M8 1.6 A6.4 6.4 0 1 0 8 14.4 A6.4 6.4 0 1 0 8 1.6 Z M8 4.6 L8 8 L10.6 9.6',
    calendar: 'M2.5 3.6 L13.5 3.6 L13.5 13.5 L2.5 13.5 Z M2.5 6.6 L13.5 6.6 M5.5 1.8 L5.5 4.4 M10.5 1.8 L10.5 4.4',
    database: 'M8 1.6 C11.5 1.6 14.2 2.5 14.2 3.6 C14.2 4.7 11.5 5.6 8 5.6 C4.5 5.6 1.8 4.7 1.8 3.6 C1.8 2.5 4.5 1.6 8 1.6 Z M1.8 3.6 L1.8 12.4 C1.8 13.5 4.5 14.4 8 14.4 C11.5 14.4 14.2 13.5 14.2 12.4 L14.2 3.6 M1.8 8 C1.8 9.1 4.5 10 8 10 C11.5 10 14.2 9.1 14.2 8',
    package: 'M8 1.6 L14.2 5 L14.2 11 L8 14.4 L1.8 11 L1.8 5 Z M1.8 5 L8 8.4 L14.2 5 M8 8.4 L8 14.4',
    chart: 'M2.5 13.5 L2.5 9 M6.3 13.5 L6.3 5.5 M10.1 13.5 L10.1 7.5 M13.9 13.5 L13.9 3 M1.5 13.5 L14.5 13.5',
    gauge: 'M8 13.5 A5.5 5.5 0 1 1 8 2.5 A5.5 5.5 0 1 1 8 13.5 Z M8 8 L11 5.4',
    lightning: 'M8.6 1.5 L4 8.6 L7.6 8.6 L6.8 14.5 L11.6 7.2 L8 7.2 Z',
    clock_counterclockwise: 'M8 1.6 A6.4 6.4 0 1 1 3.2 4 M2.4 1.8 L2.4 4.4 L5 4.4 M8 4.8 L8 8 L10.4 9.4',

    /* --- status & feedback --- */
    warning: 'M8 2 L14.8 13.6 L1.2 13.6 Z M8 6.4 L8 9.8 M8 11.6 L8 11.61',
    'warning-circle': 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M8 4.4 L8 8.6 M8 10.9 L8 10.91',
    info: 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M8 7.2 L8 11.2 M8 5 L8 5.01',
    prohibit: 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M3.4 3.4 L12.6 12.6',
    'question': 'M8 1.5 A6.5 6.5 0 1 0 8 14.5 A6.5 6.5 0 1 0 8 1.5 Z M6.3 6.2 A1.8 1.8 0 1 1 8 8.2 L8 9.4 M8 11.3 L8 11.31',
    shield: 'M8 1.5 L13.6 3.6 L13.6 8 C13.6 11 11.2 13.2 8 14.5 C4.8 13.2 2.4 11 2.4 8 L2.4 3.6 Z',
    'shield-check': 'M8 1.5 L13.6 3.6 L13.6 8 C13.6 11 11.2 13.2 8 14.5 C4.8 13.2 2.4 11 2.4 8 L2.4 3.6 Z M5.8 8 L7.4 9.6 L10.4 6.4',
    'shield-warning': 'M8 1.5 L13.6 3.6 L13.6 8 C13.6 11 11.2 13.2 8 14.5 C4.8 13.2 2.4 11 2.4 8 L2.4 3.6 Z M8 5.4 L8 8.8 M8 10.8 L8 10.81',
    heartbeat: 'M1.5 8 L4.4 8 L6 4.2 L8.6 12 L10.2 8 L14.5 8',
    spinner: 'M8 1.6 A6.4 6.4 0 0 1 14.4 8',
    'dots-circle': 'M2.6 8 A1 1 0 1 0 2.6 8.01 M8 8 A1 1 0 1 0 8 8.01 M13.4 8 A1 1 0 1 0 13.4 8.01',
    activity: 'M1.5 8 L4.4 8 L6 4.2 L8.6 12 L10.2 8 L14.5 8',
    bell: 'M4 6.6 A4 4 0 0 1 12 6.6 L12 10 L13.2 12 L2.8 12 L4 10 Z M6.4 12 A1.6 1.6 0 0 0 9.6 12',
    flag: 'M3.4 14.5 L3.4 1.8 M3.4 2.4 L11.8 2.4 L9.8 5.4 L11.8 8.4 L3.4 8.4',
    bookmark: 'M3.6 1.8 L12.4 1.8 L12.4 14.4 L8 11.2 L3.6 14.4 Z',
    tag: 'M1.8 7.6 L7.6 1.8 L14.2 1.8 L14.2 8.4 L8.4 14.2 Z M10.9 4.4 L10.9 4.41',
    'list-checks': 'M5.4 4 L14 4 M5.4 8 L14 8 M5.4 12 L14 12 M1.8 4 L2.6 4.8 L3.9 3.4 M1.8 8 L2.6 8.8 L3.9 7.4 M1.8 12 L2.6 12.8 L3.9 11.4',
    'kanban': 'M2 2.4 L5.6 2.4 L5.6 13.6 L2 13.6 Z M7.2 2.4 L10.8 2.4 L10.8 9.6 L7.2 9.6 Z M12.4 2.4 L16 2.4',
    'table': 'M1.8 2.6 L14.2 2.6 L14.2 13.4 L1.8 13.4 Z M1.8 6.2 L14.2 6.2 M1.8 9.8 L14.2 9.8 M6 2.6 L6 13.4',
    'rows': 'M1.8 3.4 L14.2 3.4 L14.2 6.6 L1.8 6.6 Z M1.8 9.4 L14.2 9.4 L14.2 12.6 L1.8 12.6 Z',
    play: 'M4.6 2.6 L13 8 L4.6 13.4 Z',
    pause: 'M5.4 2.8 L5.4 13.2 M10.6 2.8 L10.6 13.2',
    stop: 'M4 4 L12 4 L12 12 L4 12 Z',
    'skip-forward': 'M4.4 3 L10.4 8 L4.4 13 Z M11.6 3 L11.6 13',
    target: 'M8 1.6 A6.4 6.4 0 1 0 8 14.4 A6.4 6.4 0 1 0 8 1.6 Z M8 5.2 A2.8 2.8 0 1 0 8 10.8 A2.8 2.8 0 1 0 8 5.2 Z',
    trophy: 'M5 2.6 L11 2.6 L11 6.4 A3 3 0 0 1 5 6.4 Z M5 3.6 L2.6 3.6 L2.6 5.2 A2.4 2.4 0 0 0 5 7.4 M11 3.6 L13.4 3.6 L13.4 5.2 A2.4 2.4 0 0 1 11 7.4 M6.6 9.4 L6.6 11.6 L9.4 11.6 L9.4 9.4 M4.6 13.5 L11.4 13.5',
    'arrow-clockwise': 'M13 8 A5 5 0 1 1 11.2 4.3 M13 2.5 L13 5.2 L10.3 5.2',
  };

  /**
   * Aliases so specs can use semantic names without duplicating geometry.
   */
  const ALIASES = {
    robot_head: 'robot',
    cpu: 'robot',
    server: 'database',
    branch: 'git-branch',
    commit: 'git-commit',
    merge: 'git-merge',
    sparkle: 'lightning',
    zap: 'lightning',
    x: 'close',
    cross: 'close',
    filter_x: 'filter-clear',
    save: 'floppy',
    edit: 'pencil',
    inspect: 'eye',
    hide: 'eye-slash',
    alarm: 'clock',
    schedule: 'calendar',
    plan: 'list-checks',
    board: 'kanban',
    list: 'rows',
    archive: 'package',
    metrics: 'chart',
    usage: 'gauge',
    recover: 'clock_counterclockwise',
    retry: 'arrow-clockwise',
    approve: 'check-circle',
    reject: 'prohibit',
    escalation: 'warning-circle',
    attention: 'bell',
    evidence: 'file-text',
    artifact: 'package',
    session: 'robot',
    delegation: 'users-three',
    capability: 'key',
    lease: 'clock',
    policy: 'shield',
    approval: 'shield-check',
    risk: 'shield-warning',
    pulse: 'heartbeat',
    timeline: 'activity',
    mark: 'bookmark',
  };

  const cache = new Map();

  function has(name) {
    return !!(PATHS[name] || PATHS[ALIASES[name]]);
  }

  function pathFor(name) {
    return PATHS[name] || PATHS[ALIASES[name]] || PATHS.info;
  }

  /**
   * Create an icon node.
   * Rendered as a vector with a single stroke, tinted by `color`.
   */
  function create(name, opts = {}) {
    const size = opts.size || SIZE;
    const color = opts.color || 'text-muted';
    const mode = opts.mode || 'dark';
    const fill = opts.fill || false;

    const vector = figma.createVector();
    vector.name = `icon/${name}`;

    try {
      vector.vectorPaths = [{
        windingRule: 'NONZERO',
        data: pathFor(name),
      }];
    } catch (err) {
      BF.warn('icon', `path parse failed for ${name}`);
    }

    /* Figma derives the bbox from the path; resize normalises it to `size`. */
    try {
      vector.resize(size, size);
    } catch (err) {
      BF.warn('icon', `resize failed for ${name}`);
    }
    vector.x = 0;
    vector.y = 0;

    const hex = BF.resolveColor(color, mode);
    if (fill) {
      BF.paintWithBinding(vector, hex, color, 'fills');
      vector.strokes = [];
    } else {
      vector.fills = [];
      BF.paintWithBinding(vector, hex, color, 'strokes');
      vector.strokeWeight = opts.weight || 1.5;
      vector.strokeCap = 'ROUND';
      vector.strokeJoin = 'ROUND';
      vector.strokeAlign = 'CENTER';
    }

    return vector;
  }

  return { PATHS, ALIASES, has, create, SIZE };
})();
