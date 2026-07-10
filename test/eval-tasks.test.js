import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TASKS } from '../eval/tasks/index.js';

const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));

function fixture(task) {
  const dir = mkdtempSync(join(tmpdir(), `kaku-tk-${task.id}-`));
  task.setup(dir);
  return dir;
}
const write = (dir, f, body) => writeFileSync(join(dir, f), body);
const patch = (dir, f, fn) => write(dir, f, fn(readFileSync(join(dir, f), 'utf8')));

test('all 10 tasks are registered with the required shape', () => {
  assert.equal(TASKS.length, 10);
  for (const t of TASKS) {
    assert.ok(t.id && t.name && t.task && typeof t.setup === 'function' && typeof t.check === 'function');
  }
});

test('04 add-function: correct slugify passes, buggy (boundary) fails', () => {
  const good = fixture(byId['04-add-function']);
  write(good, 'slugify.js', "export function slugify(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}\n");
  assert.equal(byId['04-add-function'].check(good).pass, true);

  const bad = fixture(byId['04-add-function']);
  write(bad, 'slugify.js', "export function slugify(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,'-');}\n");
  assert.equal(byId['04-add-function'].check(bad).pass, false); // leaves boundary hyphens
});

test('05 rename: full rename passes, partial (one file missed) fails', () => {
  const good = fixture(byId['05-rename']);
  for (const f of ['calc.js', 'cart.js', 'report.js']) patch(good, f, (s) => s.replaceAll('oldTotal', 'sumItems'));
  assert.equal(byId['05-rename'].check(good).pass, true);

  const bad = fixture(byId['05-rename']);
  patch(bad, 'calc.js', (s) => s.replaceAll('oldTotal', 'sumItems'));
  patch(bad, 'cart.js', (s) => s.replaceAll('oldTotal', 'sumItems'));
  assert.equal(byId['05-rename'].check(bad).pass, false); // report.js still has oldTotal
});

test('06 find-def: naming tax.js passes, wrong file fails', () => {
  const dir = fixture(byId['06-find-def']);
  assert.equal(byId['06-find-def'].check(dir, { finalText: 'computeTax is defined in src/finance/tax.js' }).pass, true);
  assert.equal(byId['06-find-def'].check(dir, { finalText: 'It is in order.js' }).pass, false);
});

test('07 find-vuln: naming injection passes, vague answer fails', () => {
  const dir = fixture(byId['07-find-vuln']);
  assert.equal(byId['07-find-vuln'].check(dir, { finalText: 'SQL injection via string concatenation of req.query.id' }).pass, true);
  assert.equal(byId['07-find-vuln'].check(dir, { finalText: 'The code looks fine to me.' }).pass, false);
});

test('08 edit-precision: only-TIMEOUT passes, collateral change fails', () => {
  const good = fixture(byId['08-edit-precision']);
  patch(good, 'settings.js', (s) => s.replace('TIMEOUT = 30', 'TIMEOUT = 60'));
  assert.equal(byId['08-edit-precision'].check(good).pass, true);

  const bad = fixture(byId['08-edit-precision']);
  patch(bad, 'settings.js', (s) => s.replaceAll('3', '60')); // clobbers RETRIES/BACKOFF too
  assert.equal(byId['08-edit-precision'].check(bad).pass, false);
});

test('09 edit-big-file: targeted change passes, neighbor damage fails', () => {
  const good = fixture(byId['09-edit-big-file']);
  patch(good, 'big.js', (s) => s.replace('function targetFn() {\n  return 1;\n}', 'function targetFn() {\n  return 42;\n}'));
  assert.equal(byId['09-edit-big-file'].check(good).pass, true);

  const bad = fixture(byId['09-edit-big-file']);
  patch(bad, 'big.js', (s) => s.replace('  return 1;', '  return 42;').replace('export function tail0() { return 0; }', ''));
  assert.equal(byId['09-edit-big-file'].check(bad).pass, false); // deleted a neighbor
});

test('10 constraint: comment-only passes, code change fails', () => {
  const good = fixture(byId['10-constraint']);
  patch(good, 'math.js', (s) => `// adds two numbers\n${s}`);
  assert.equal(byId['10-constraint'].check(good).pass, true);

  const bad = fixture(byId['10-constraint']);
  patch(bad, 'math.js', (s) => `// adds two numbers\n${s.replace('a + b', 'a - b')}`);
  assert.equal(byId['10-constraint'].check(bad).pass, false); // changed the code
});
