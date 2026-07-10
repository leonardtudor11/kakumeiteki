// Status bar rendered under the input box (see src/tui.js). Not a copy of any other
// tool's bar — kakumeiteki's own state: the local model + its context window (the real
// constraint), a live token gauge, deterministic-compaction warning, and the active
// mode shown as a feudal-role kanji.
//
// Colours use xterm-256 codes (38;5;N), which render on truecolor terminals AND
// Apple_Terminal (which mangles 24-bit truecolour).

const RESET = '\x1b[0m', DIM = '\x1b[2m';
const RED = '\x1b[38;5;160m', GREEN = '\x1b[38;5;71m', YELLOW = '\x1b[38;5;178m';

// Each mode → a feudal-Japan role that matches what the mode actually does.
// build 侍 samurai (executes) · refactor 匠 takumi/craftsman (refines received material)
// audit 検 metsuke/inspector (read-only) · plan 忍 shinobi/scout (read-only).
export const MODE_META = {
  build: { kanji: '侍', color: '\x1b[38;5;71m' },   // green
  refactor: { kanji: '匠', color: '\x1b[38;5;75m' }, // blue
  audit: { kanji: '検', color: '\x1b[38;5;178m' },  // amber
  plan: { kanji: '忍', color: '\x1b[38;5;141m' },   // purple
};
export const modeMeta = (mode) => MODE_META[mode] ?? { kanji: '·', color: '' };

// compact counts: 940 -> "940", 1440 -> "1.4k", 8000 -> "8k", 32768 -> "33k"
export function short(n) {
  if (n < 1000) return `${n}`;
  const k = n / 1000;
  const s = k >= 10 ? `${Math.round(k)}` : k.toFixed(1).replace(/\.0$/, '');
  return `${s}k`;
}

export function gaugeColor(pct) {
  if (pct >= 85) return RED;
  if (pct >= 60) return YELLOW;
  return GREEN;
}

// Collapse $HOME prefix to ~ for a compact cwd.
export function tildeCwd(cwd, home) {
  if (home && cwd === home) return '~';
  if (home && cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length);
  return cwd;
}

// One status line (no rule — the input box draws the rules above/below).
export function renderStatusBar(state = {}, { width = 80 } = {}) {
  const { cwd = '', model = '', mode = '', permissions = '', numCtx = 0, used = 0, input = 0, compacting = false } = state;
  const pct = input > 0 ? Math.min(100, Math.round((used / input) * 100)) : 0;
  const g = gaugeColor(pct);
  const m = modeMeta(mode);

  const segs = [];
  if (cwd) segs.push([cwd, cwd]);
  if (model) {
    const winP = numCtx ? ` ${short(numCtx)} ctx` : '';
    const winA = numCtx ? ` ${DIM}${short(numCtx)} ctx${RESET}` : '';
    segs.push([model + winP, model + winA]);
  }
  {
    const tokP = input ? ` (${short(used)}/${short(input)} tok)` : '';
    const tokA = input ? ` ${DIM}(${short(used)}/${short(input)} tok)${RESET}` : '';
    segs.push([`ctx ${pct}%${tokP}`, `ctx ${g}${pct}%${RESET}${tokA}`]);
  }
  if (mode) segs.push([`${m.kanji} ${mode}`, `${m.color}${m.kanji} ${mode}${RESET}`]);
  if (permissions) segs.push([permissions, `${DIM}${permissions}${RESET}`, true]); // droppable

  const SEP = '  ·  ';
  const plainLen = (list) => list.reduce((n, [p]) => n + p.length, 0) + SEP.length * Math.max(0, list.length - 1);
  let list = segs;
  while (list.length > 3 && plainLen(list) > width - 1 && list[list.length - 1][2]) list = list.slice(0, -1);

  let line = ' ' + list.map(([, a]) => a).join(`${DIM}${SEP}${RESET}`);
  if (compacting) line += `  ${YELLOW}↯ compacting soon${RESET}`;
  return line;
}
