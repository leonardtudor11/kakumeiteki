import { SPLASH, SMALL } from './mask-data.js';
import { modeMeta } from './statusbar.js';

const PALETTE = {
  K: [26, 26, 30],     // helmet bowl + outlines — near-black
  D: [70, 70, 76],     // dark steel shading
  S: [150, 152, 158],  // menpō face — silver
  W: [235, 235, 235],  // fangs + highlights
  G: [230, 180, 60],   // kuwagata horns + eyes — gold
  O: [200, 120, 40],   // horn/ornament shading — orange
  R: [190, 45, 40],    // crest trim + mouth — red
  X: [110, 25, 25],    // brim + shikoro — maroon
};

// 44 px wide, 40 px tall, '.' = transparent. Rendered 2 px per char row via ▀/▄.
// Adapted from a retro pixel-art samurai mask reference (quantized, mirrored, recolored).
export const MASK = [
  '.......KK..........................KK.......',
  '.......KK..........................KK.......',
  '.......GK...........KKKK...........KG.......',
  '......KGG.........KKGXXGKK.........GGK......',
  '......KGGG.......KSSGXXGSSK.......GGGK......',
  '......KGGG.....KKKKKGXXGKKKKK.....GGGK......',
  '......KOGGG..KKKKKKKGXXGKKKKKKK..GGGOK......',
  '......KOOGGGGKKKKKKKGXXGKKKKKKKGGGGOOK......',
  '.......KOOGGGGKKKKKGXXXXGKKKKKGGGGOOK.......',
  '.......KOOOOKKKKKKKGXXXXGKKKKKKKOOOOK.......',
  '........OOOOKKKKKKKKXKKXKKKKKKKKOOOO........',
  '..........OKKKKKKKKGGGGGGKKKKKKKKO..........',
  '..........KKKKKKKXXGGOOGGXXKKKKKKK..........',
  '..........KKKKKKKXXOOKKOOXXKKKKKKK..........',
  '......OOOSKXXXXXXXXXXRRXXXXXXXXXXKSOOO......',
  '.......XXXXXOKKXXXXXXOOXXXXXXKKOXXXXX.......',
  '.......XXXXXGGGKKXXXXKKXXXXKKGGGXXXXX.......',
  '.........XXXXXXKKKXXXXXXXXKKKXXXXXX.........',
  '.........KXXXKKKKKXXKKKKXXKKKKKXXXK.........',
  '........KXXKKKKKKKKKKKKKKKKKKKKKKXXK........',
  '.......KKXXKKKKKGGKKKKKKKKGGKKKKKXXKK.......',
  '.......KKKXKKSKKKKKDKDDKDKKKKKSKKXKKK.......',
  '......XXXXKKKSWWWWKDKDDKDKWWWWSKKKXXXX......',
  '......XXXXKKWWWKKW.SKSSKS.WKKWWWKKXXXX......',
  '.....RXXXKKKWWWSSSSSKWWKSSSSSWWWKKKXXXR.....',
  '....RRGGKKKKSSSSSDDKKSSKKDDSSSSSKKKKGGRR....',
  '...RRRXXXKKKKKKKKDDKKSSKKDDKKKKKKKKXXXRRR...',
  '...GXXXXKKKKKSSSSKWWWKKWWWKSSSSKKKKKXXXXG...',
  '..GGGXXXKKKKXKSSKKKKKKKKKKKKSSKXKKKKXXXGGG..',
  '.OOOOODXKKKKXKKKKKKKKKKKKKKKKKKXKKKKXDOOOOO.',
  '....OOOOKKKKKXK.KRKKKKKKKKRK.KXKKKKKOOOO....',
  '......OOKKKKXXX.XRKRRRRRRKRX.XXXKKKKOO......',
  '.......KKK...XXXSKKKKKKKKKKSXXX...KKK.......',
  '.........K....XXWKKKKKKKKKKWXX....K.........',
  '...............XXSSSKKKKSSSXX...............',
  '................XKKXXOOXXKKX................',
  '.................KKXXKKXXKK.................',
  '..................KXXOOXXK..................',
  '...................XXXXXX...................',
  '....................KKKK....................',
];

const RESET = '\x1b[0m';
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const bg = ([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`;

function cell(top, bottom) {
  const t = PALETTE[top];
  const b = PALETTE[bottom];
  if (!t && !b) return ' ';
  if (t && b) return `${fg(t)}${bg(b)}▀${RESET}`;
  if (t) return `${fg(t)}▀${RESET}`;
  return `${fg(b)}▄${RESET}`;
}

export function renderMaskRows(mask = MASK) {
  const rows = [];
  for (let y = 0; y < mask.length; y += 2) {
    const top = mask[y];
    const bottom = mask[y + 1] ?? '.'.repeat(top.length);
    let line = '';
    for (let x = 0; x < top.length; x++) line += cell(top[x], bottom[x]);
    rows.push(line);
  }
  return rows;
}

// --- machine-derived grid renderer (SPLASH/SMALL/TINY from mask-data.js) ---
//
// The reference art was drawn on white; on a dark terminal its black outlines merge
// into the background, so we grade the image-true palette: deepen the darks (silhouette
// pops) and lift+saturate the mids (silver face and red armour pop). Apple_Terminal
// mangles 24-bit truecolour, so there we grade harder and map to xterm-256.
const TRUE_GRADE = { sat: 1.28, con: 1.22, dth: 45, dmul: 0.35 };
const APPLE_GRADE = { sat: 1.5, con: 1.18, dth: 45, dmul: 0.35 };

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function grade([r, gr, b], { sat, con, dth, dmul }) {
  let c = [r, gr, b];
  if ((c[0] + c[1] + c[2]) / 3 < dth) c = c.map((v) => v * dmul); // deepen darks toward black
  const m = (c[0] + c[1] + c[2]) / 3;
  c = c.map((v) => m + (v - m) * sat);                            // saturate around own luma
  c = c.map((v) => (v / 255 - 0.5) * con * 255 + 127.5);          // contrast around mid-gray
  return c.map(clamp);
}

// nearest xterm-256 (6x6x6 cube + gray ramp) for Apple_Terminal
const CUBE = [0, 95, 135, 175, 215, 255];
const nlvl = (v) => { let bi = 0, bd = Infinity; for (let i = 0; i < 6; i++) { const d = Math.abs(CUBE[i] - v); if (d < bd) { bd = d; bi = i; } } return bi; };
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function xterm256([r, g, b]) {
  const ri = nlvl(r), gi = nlvl(g), bi = nlvl(b);
  const cube = [CUBE[ri], CUBE[gi], CUBE[bi]], cubeIdx = 16 + 36 * ri + 6 * gi + bi;
  const gl = Math.max(0, Math.min(23, Math.round((r + g + b) / 3 / 10 - 0.8)));
  const gv = 8 + 10 * gl;
  return d2([r, g, b], cube) <= d2([r, g, b], [gv, gv, gv]) ? cubeIdx : 232 + gl;
}

const isAppleTerminal = (env) => env.TERM_PROGRAM === 'Apple_Terminal';

// Render a mask grid to half-block rows. Each char = 2 vertically-stacked pixels
// (▀ fg=top, bg=bottom); '.' is transparent (space / single half-block).
export function renderGrid(grid, { apple = false, indent = '  ' } = {}) {
  const g = apple ? APPLE_GRADE : TRUE_GRADE;
  const fgs = [], bgs = [];
  for (const c of grid.palette) {
    const gc = grade(c, g);
    if (apple) { const n = xterm256(gc); fgs.push(`\x1b[38;5;${n}m`); bgs.push(`\x1b[48;5;${n}m`); }
    else { fgs.push(`\x1b[38;2;${gc[0]};${gc[1]};${gc[2]}m`); bgs.push(`\x1b[48;2;${gc[0]};${gc[1]};${gc[2]}m`); }
  }
  const idx = {};
  for (let i = 0; i < grid.chars.length; i++) idx[grid.chars[i]] = i;
  const col = (ch) => (ch === '.' ? -1 : idx[ch]);
  const lines = [];
  for (let y = 0; y < grid.h; y += 2) {
    const top = grid.rows[y], bot = grid.rows[y + 1] ?? '.'.repeat(grid.w);
    let line = indent;
    for (let x = 0; x < grid.w; x++) {
      const t = col(top[x]), b = col(bot[x]);
      if (t < 0 && b < 0) line += ' ';
      else if (t >= 0 && b >= 0) line += `${fgs[t]}${bgs[b]}▀${RESET}`;
      else if (t >= 0) line += `${fgs[t]}▀${RESET}`;
      else line += `${bgs[b]}▄${RESET}`;
    }
    lines.push(line);
  }
  return lines;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function showBanner(output, { version = '', animate = true, sleep = defaultSleep, indent = '  ', env = process.env } = {}) {
  const apple = isAppleTerminal(env);
  const cols = output.columns ?? 80;
  const grid = SPLASH.w + indent.length <= cols ? SPLASH : SMALL; // fall back if terminal too narrow
  output.write('\n');
  for (const row of renderGrid(grid, { apple, indent })) {
    output.write(`${row}\n`);
    if (animate) await sleep(18);
  }
  const title = 'K A K U M E I T E K I';
  const pad = ' '.repeat(Math.max(0, Math.floor((grid.w - title.length) / 2)));
  const redTitle = apple ? '\x1b[1;38;5;160m' : '\x1b[1;38;2;192;57;43m';
  output.write(`\n${indent}${pad}${redTitle}${title}${RESET}\n`);
  output.write(`${indent}\x1b[2m革命的 — fully-local coding agent${version ? ` · v${version}` : ''}${RESET}\n\n`);
}

// Welcome card shown once after the splash: the active session (model · mode · permissions)
// and the honest capability lines (from README "What to honestly expect"). No mask here —
// a small half-block mask renders rough in a real terminal font; the splash carries the art.
export function showWelcome(output, { model = '', mode = '', permissions = '', indent = '  ' } = {}) {
  const m = modeMeta(mode);
  const DIM = '\x1b[2m';
  const session = `${model}${mode ? ` ${DIM}·${RESET} ${m.color}${m.kanji} ${mode}${RESET}` : ''}${permissions ? ` ${DIM}·${RESET} ${DIM}${permissions}${RESET}` : ''}`;
  const lines = [
    `${indent}${session}`,
    '',
    `${indent}${DIM}reliable${RESET}   read · explain · find · single precise edits`,
    `${indent}${DIM}caution${RESET}    verify every diff ${DIM}— a small model can be confidently wrong${RESET}`,
    '',
  ];
  for (const l of lines) output.write(`${l}\n`);
}
