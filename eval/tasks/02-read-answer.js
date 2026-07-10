import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default {
  id: '02-read-answer',
  name: 'read and answer',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'config.js'), 'export const PORT = 8080;\nexport const HOST = "localhost";\n');
  },
  task: 'Read config.js and tell me which port number it uses. Answer with the number.',
  check(dir, { finalText }) {
    return { pass: /\b8080\b/.test(finalText), detail: `finalText=${finalText.slice(0, 80)}` };
  },
};
