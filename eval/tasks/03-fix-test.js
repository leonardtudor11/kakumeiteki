import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNodeTest } from './_helpers.js';

export default {
  id: '03-fix-test',
  name: 'fix failing test',
  mode: 'build',
  setup(dir) {
    writeFileSync(join(dir, 'sum.js'), 'export function sum(a, b) {\n  return a - b;\n}\n');
    writeFileSync(
      join(dir, 'sum.test.js'),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from './sum.js';\ntest('adds', () => { assert.equal(sum(2, 3), 5); });\n",
    );
    writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  },
  task: 'The test in sum.test.js is failing because sum.js has a bug. Fix sum.js so the test passes. Change only what is needed.',
  check(dir) {
    return runNodeTest(dir);
  },
};
