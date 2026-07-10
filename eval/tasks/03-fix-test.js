import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
    // Strip the parent test-runner context so the child `node --test` reports its own
    // exit code (a nested runner inheriting NODE_TEST_CONTEXT will not fail on assertion).
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_OPTIONS;
    try {
      execFileSync('node', ['--test'], { cwd: dir, stdio: 'pipe', timeout: 20000, env });
      return { pass: true, detail: 'node --test exit 0' };
    } catch (err) {
      return { pass: false, detail: `test failed: exit ${err.status ?? '?'}` };
    }
  },
};
