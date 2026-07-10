import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Run `node --test` in dir, isolated from any parent test-runner context.
// A nested runner that inherits NODE_TEST_CONTEXT will not exit non-zero on failure.
export function runNodeTest(dir) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  try {
    execFileSync('node', ['--test'], { cwd: dir, stdio: 'pipe', timeout: 20000, env });
    return { pass: true, detail: 'node --test exit 0' };
  } catch (err) {
    return { pass: false, detail: `test failed: exit ${err.status ?? '?'}` };
  }
}

export function read(dir, file) {
  try {
    return readFileSync(join(dir, file), 'utf8');
  } catch {
    return '';
  }
}
