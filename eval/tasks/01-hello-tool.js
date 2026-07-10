import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default {
  id: '01-hello-tool',
  name: 'list files',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'alpha.js'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'beta.js'), 'export const b = 2;\n');
  },
  task: 'List the files in this project directory, then tell me their names.',
  check(dir, { finalText, events }) {
    const listed = events.some((e) => e.type === 'tool_call' && (e.name === 'ls' || e.name === 'glob'));
    const named = /alpha\.js/.test(finalText) && /beta\.js/.test(finalText);
    return { pass: listed || named, detail: `usedListTool=${listed} namedBoth=${named}` };
  },
};
