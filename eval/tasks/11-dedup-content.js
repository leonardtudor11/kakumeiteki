import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Machine-assistant class: find duplicate files by CONTENT. Baseline task — solvable
// with existing tools (bash md5/shasum or read+compare); measures how much a dedicated
// dedup tool later improves it. Traps: a same-size pair and a same-name pair, neither
// of which is a duplicate.
const CONTENT_A = 'meeting notes 2024\n- ship v1\n- measure everything\n- stay honest\n';

const FILES = {
  'docs/notes-2024.txt': CONTENT_A,
  'archive/old-notes.txt': CONTENT_A,                                    // the real duplicate pair
  'data/metrics.txt': 'x'.repeat(CONTENT_A.length),                      // same size, different content
  'data/stats.txt': 'y'.repeat(CONTENT_A.length),                        // same size, different content
  'docs/readme.txt': 'this readme lives in docs and explains the docs\n',
  'archive/readme.txt': 'this readme lives in archive and is different\n', // same name, different content
  'src/app.js': 'export const app = () => "hello";\n',
};

export default {
  id: '11-dedup-content',
  name: 'find duplicate files by content',
  mode: 'build',
  setup(dir) {
    for (const [rel, body] of Object.entries(FILES)) {
      const full = join(dir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
  },
  task: 'Find all files in this project that have IDENTICAL content (true duplicates, byte-for-byte). Answer with the paths of the duplicate files. Do not delete anything.',
  check(dir, { finalText }) {
    const namesBoth = /notes-2024/.test(finalText) && /old-notes/.test(finalText);
    const noTraps = !/metrics|stats\.txt|readme/.test(finalText);
    return {
      pass: namesBoth && noTraps,
      detail: `duplicates named=${namesBoth} traps avoided=${noTraps} finalText=${finalText.slice(0, 120)}`,
    };
  },
};
