const PALETTE = {
  G: [212, 175, 55],   // kuwagata horns + mouth grill — gold
  R: [139, 30, 30],    // kabuto bowl — deep crimson
  r: [192, 57, 43],    // brim highlight
  S: [75, 85, 99],     // menpō face mask — steel
  s: [107, 114, 128],  // chin guard — lighter steel
  W: [232, 220, 192],  // eye slits — bone
};

// 25 px wide, 16 px tall, '.' = transparent. Rendered 2 px per char row via ▀/▄.
export const MASK = [
  '....G...............G....',
  '...GG...............GG...',
  '...G.......RRR.......G...',
  '..GG.....RRRRRRR.....GG..',
  '..G....RRRRRRRRRRR....G..',
  '..GG..RRRRRRRRRRRRR..GG..',
  '...GGRRRRRRRRRRRRRRRGG...',
  '.....RRRrrrrrrrrrRRR.....',
  '....rrrrrrrrrrrrrrrrr....',
  '....S.WWW..SSS..WWW.S....',
  '....SS.....SSS.....SS....',
  '.....SSSSSSSSSSSSSSS.....',
  '.....SG.G.G.G.G.G.GS.....',
  '.....SG.G.G.G.G.G.GS.....',
  '......SSSSSSSSSSSSS......',
  '.........sssssss.........',
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

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function showBanner(output, { version = '', animate = true, sleep = defaultSleep, indent = '  ' } = {}) {
  output.write('\n');
  for (const row of renderMaskRows()) {
    output.write(`${indent}${row}\n`);
    if (animate) await sleep(25);
  }
  const title = 'K A K U M E I T E K I';
  const pad = ' '.repeat(Math.max(0, Math.floor((MASK[0].length - title.length) / 2)));
  output.write(`\n${indent}${pad}\x1b[1;38;2;192;57;43m${title}${RESET}\n`);
  output.write(`${indent}\x1b[2m革命的 — fully-local coding agent${version ? ` · v${version}` : ''}${RESET}\n\n`);
}
