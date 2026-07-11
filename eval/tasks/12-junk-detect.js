import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Machine-assistant class: recognize junk/cache/OS-litter files without flagging real
// work. Baseline task — pattern knowledge lives in the model for now; a junk-rules tool
// later makes it deterministic.
const FILES = {
  '.DS_Store': 'Bud1\x00\x00junkbytes',
  'img/Thumbs.db': 'thumbnail cache junk',
  'build.tmp': 'half-written build artifact',
  'src/app.js': 'export const app = () => 42;\n',
  'data/customers.csv': 'name,email\nreal,person@example.com\n',
  'README.md': '# Real project\n',
};

export default {
  id: '12-junk-detect',
  name: 'identify junk files, spare real ones',
  mode: 'build',
  setup(dir) {
    for (const [rel, body] of Object.entries(FILES)) {
      const full = join(dir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
  },
  task: 'Which files in this project are junk that would be safe to delete (OS litter, caches, temp artifacts)? List them. Do NOT delete anything.',
  check(dir, { finalText }) {
    const junkNamed = /\.DS_Store/.test(finalText) && /Thumbs\.db/.test(finalText) && /build\.tmp/.test(finalText);
    const realSpared = !/customers\.csv|app\.js|README/.test(finalText);
    return {
      pass: junkNamed && realSpared,
      detail: `junk named=${junkNamed} real spared=${realSpared} finalText=${finalText.slice(0, 120)}`,
    };
  },
};
