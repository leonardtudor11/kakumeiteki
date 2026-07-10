import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './_helpers.js';

const CODE = 'export function add(a, b) {\n  return a + b;\n}\n';

export default {
  id: '10-constraint',
  name: 'instruction-following under constraint',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'math.js'), CODE);
  },
  task: 'In math.js, add a single-line comment directly above the add function describing what it does. Do NOT change any executable code — the function body and signature must stay byte-for-byte identical.',
  check(dir) {
    const after = read(dir, 'math.js');
    const codeIntact = after.includes('export function add(a, b) {\n  return a + b;\n}');
    const commentAdded = /\/\/[^\n]*\n\s*export function add/.test(after);
    const pass = codeIntact && commentAdded;
    return { pass, detail: `codeIntact=${codeIntact} commentAdded=${commentAdded}` };
  },
};
