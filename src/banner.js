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
