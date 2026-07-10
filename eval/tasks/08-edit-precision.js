import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read } from './_helpers.js';

const BEFORE = 'export const RETRIES = 3;\nexport const TIMEOUT = 30;\nexport const BACKOFF = 3;\n';
const AFTER = 'export const RETRIES = 3;\nexport const TIMEOUT = 60;\nexport const BACKOFF = 3;\n';

export default {
  id: '08-edit-precision',
  name: 'edit precision',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'settings.js'), BEFORE);
  },
  task: 'In settings.js, change TIMEOUT to 60. Leave RETRIES and BACKOFF exactly as they are (both are also 3 — do not touch them).',
  check(dir) {
    const after = read(dir, 'settings.js');
    return { pass: after === AFTER, detail: after === AFTER ? 'byte-exact' : `got: ${JSON.stringify(after)}` };
  },
};
