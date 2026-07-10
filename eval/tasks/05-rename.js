import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './_helpers.js';

const FILES = {
  'calc.js': 'export function oldTotal(items) {\n  return items.reduce((s, x) => s + x, 0);\n}\n',
  'cart.js': "import { oldTotal } from './calc.js';\nexport const cartSum = (items) => oldTotal(items);\n",
  'report.js': "import { oldTotal } from './calc.js';\nexport const report = (items) => `Total: ${oldTotal(items)}`;\n",
};

export default {
  id: '05-rename',
  name: 'rename across 3 files',
  mode: 'refactor',
  setup(dir) {
    for (const [name, body] of Object.entries(FILES)) writeFileSync(join(dir, name), body);
  },
  task: 'Rename the function oldTotal to sumItems everywhere it appears: its definition in calc.js and every import and call site in cart.js and report.js. Change nothing else.',
  check(dir) {
    const files = Object.keys(FILES);
    const bad = files.filter((f) => read(dir, f).includes('oldTotal'));
    const missing = files.filter((f) => !read(dir, f).includes('sumItems'));
    const pass = bad.length === 0 && missing.length === 0;
    return { pass, detail: `stillOld=[${bad}] missingNew=[${missing}]` };
  },
};
